import { execFile, execFileSync } from 'node:child_process';
import { readFileSync, unlinkSync } from 'node:fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SHORTCUTS = new Set(['<Super>Left', '<Super>Right', '<Super>Up', '<Super>Down']);
const BINDING_KEYS: Record<string, readonly string[]> = {
  'org.gnome.desktop.wm.keybindings': [
    'maximize',
    'unmaximize',
    'toggle-maximized',
    'tile-left',
    'tile-right',
    'move-to-side-w',
    'move-to-side-e',
  ],
  'org.gnome.mutter.keybindings': ['toggle-tiled-left', 'toggle-tiled-right'],
  'org.gnome.shell.extensions.tiling-assistant': [
    'tile-left-half',
    'tile-right-half',
    'tile-maximize',
    'restore-window',
  ],
};

interface SavedBinding {
  schema: string;
  key: string;
  original: string;
}

interface SavedBindings {
  version: 1;
  bindings: SavedBinding[];
}

type CommandRunner = (args: string[]) => Promise<string>;

const runGSettings: CommandRunner = async (args) => {
  const { stdout } = await execFileAsync('gsettings', args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
};

export class GnomeShortcutProtection {
  private readonly snapshotPath: string;
  private readonly supported: boolean;
  private readonly linux: boolean;
  private ready = false;
  private operation = Promise.resolve();

  constructor(
    userDataPath: string,
    private readonly runCommand: CommandRunner = runGSettings,
    platform = process.platform,
    environment: NodeJS.ProcessEnv = process.env
  ) {
    this.snapshotPath = path.join(userDataPath, 'gnome-shortcuts.json');
    this.linux = platform === 'linux';
    this.supported =
      this.linux &&
      [environment.XDG_CURRENT_DESKTOP, environment.XDG_SESSION_DESKTOP, environment.GDMSESSION]
        .filter((desktop): desktop is string => Boolean(desktop))
        .some((desktop) => desktop.toLowerCase().includes('gnome'));
    process.on('exit', this.restoreOnProcessExit);
  }

  async restorePreviousSession(): Promise<void> {
    try {
      const saved = await this.readSnapshot();
      if (saved) await this.restore(saved);
      this.ready = true;
    } catch (error) {
      this.ready = false;
      throw error;
    }
  }

  setTraineeActive(active: boolean): Promise<void> {
    const operation = this.operation.then(async () => {
      if (!this.ready) return;
      if (active && this.supported) {
        await this.disableShortcuts();
      } else {
        const saved = await this.readSnapshot();
        if (saved) await this.restore(saved);
      }
    });
    this.operation = operation.catch(() => undefined);
    return operation;
  }

  private async disableShortcuts(): Promise<void> {
    if (await this.readSnapshot()) return;

    const schemas = new Set((await this.runCommand(['list-schemas'])).split(/\s+/));
    const saved: SavedBindings = { version: 1, bindings: [] };
    const updates: Array<{ binding: SavedBinding; replacement: string }> = [];

    for (const [schema, keys] of Object.entries(BINDING_KEYS)) {
      if (!schemas.has(schema)) continue;
      const availableKeys = new Set((await this.runCommand(['list-keys', schema])).split(/\s+/));
      for (const key of keys) {
        if (!availableKeys.has(key)) continue;
        const original = await this.runCommand(['get', schema, key]);
        const bindings = parseStringArray(original);
        const remaining = bindings.filter((binding) => !SHORTCUTS.has(binding));
        if (remaining.length === bindings.length) continue;

        const binding = { schema, key, original };
        saved.bindings.push(binding);
        updates.push({ binding, replacement: serializeStringArray(remaining) });
      }
    }

    if (saved.bindings.length === 0) return;
    await this.writeSnapshot(saved);
    try {
      for (const { binding, replacement } of updates) {
        await this.runCommand(['set', binding.schema, binding.key, replacement]);
      }
    } catch (error) {
      try {
        await this.restore(saved);
      } catch (restoreError) {
        throw new Error(
          `Could not disable GNOME shortcuts and could not restore their original values: ${String(restoreError)}`,
          { cause: error }
        );
      }
      throw error;
    }
  }

  private async restore(saved: SavedBindings): Promise<void> {
    const failures: string[] = [];
    for (const binding of saved.bindings) {
      try {
        await this.runCommand(['set', binding.schema, binding.key, binding.original]);
      } catch (error) {
        failures.push(`${binding.schema}.${binding.key}: ${String(error)}`);
      }
    }
    if (failures.length > 0) {
      throw new Error(`Failed to restore GNOME shortcuts: ${failures.join('; ')}`);
    }
    await unlink(this.snapshotPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }

  private async readSnapshot(): Promise<SavedBindings | null> {
    let contents: string;
    try {
      contents = await readFile(this.snapshotPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }

    return parseSnapshot(contents);
  }

  private readonly restoreOnProcessExit = (): void => {
    if (!this.linux) return;
    try {
      const saved = parseSnapshot(readFileSync(this.snapshotPath, 'utf8'));
      for (const binding of saved.bindings) {
        execFileSync('gsettings', ['set', binding.schema, binding.key, binding.original], {
          stdio: 'ignore',
        });
      }
      unlinkSync(this.snapshotPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      process.stderr.write(
        `[desktop] Failed to restore GNOME shortcuts while exiting: ${String(error)}\n`
      );
    }
  };

  private async writeSnapshot(saved: SavedBindings): Promise<void> {
    await mkdir(path.dirname(this.snapshotPath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.snapshotPath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(saved), { mode: 0o600 });
    await rename(temporaryPath, this.snapshotPath);
  }
}

function parseSnapshot(contents: string): SavedBindings {
  const parsed: unknown = JSON.parse(contents);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    parsed.version !== 1 ||
    !('bindings' in parsed) ||
    !Array.isArray(parsed.bindings)
  ) {
    throw new Error('The saved GNOME shortcut state is invalid.');
  }

  const bindings = parsed.bindings.map((value): SavedBinding => {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('schema' in value) ||
      typeof value.schema !== 'string' ||
      !('key' in value) ||
      typeof value.key !== 'string' ||
      !('original' in value) ||
      typeof value.original !== 'string' ||
      !BINDING_KEYS[value.schema]?.includes(value.key)
    ) {
      throw new Error('The saved GNOME shortcut state contains an invalid binding.');
    }
    parseStringArray(value.original);
    return { schema: value.schema, key: value.key, original: value.original };
  });

  return { version: 1, bindings };
}

function parseStringArray(value: string): string[] {
  const input = value.trim();
  if (input === '@as []' || input === '[]') return [];
  let index = 0;
  const skipWhitespace = (): void => {
    while (/\s/.test(input[index] ?? '')) index += 1;
  };

  skipWhitespace();
  if (input[index] !== '[') throw new Error(`Unsupported GNOME shortcut value: ${value}`);
  index += 1;
  const values: string[] = [];

  while (true) {
    skipWhitespace();
    if (input[index] === ']') {
      index += 1;
      skipWhitespace();
      if (index !== input.length) {
        throw new Error(`Unexpected data in GNOME shortcut value: ${value}`);
      }
      return values;
    }
    if (input[index] !== "'") throw new Error(`Unsupported GNOME shortcut value: ${value}`);
    index += 1;
    let item = '';
    let closed = false;
    while (index < input.length) {
      const character = input[index++];
      if (character === "'") {
        closed = true;
        break;
      }
      if (character === '\\') {
        const escaped = input[index++];
        if (!escaped) throw new Error(`Invalid escape in GNOME shortcut value: ${value}`);
        item += escaped === 'n' ? '\n' : escaped === 'r' ? '\r' : escaped === 't' ? '\t' : escaped;
      } else {
        item += character;
      }
    }
    if (!closed) throw new Error(`Unterminated GNOME shortcut value: ${value}`);
    values.push(item);
    skipWhitespace();
    if (input[index] === ',') {
      index += 1;
      continue;
    }
    if (input[index] !== ']') throw new Error(`Invalid GNOME shortcut value: ${value}`);
  }
}

function serializeStringArray(values: string[]): string {
  if (values.length === 0) return '[]';
  return `[${values
    .map(
      (value) =>
        `'${value
          .replaceAll('\\', '\\\\')
          .replaceAll("'", "\\'")
          .replaceAll('\n', '\\n')
          .replaceAll('\r', '\\r')
          .replaceAll('\t', '\\t')}'`
    )
    .join(', ')}]`;
}
