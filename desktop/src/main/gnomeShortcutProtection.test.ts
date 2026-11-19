import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GnomeShortcutProtection } from './gnomeShortcutProtection.js';

const schemas = [
  'org.gnome.desktop.wm.keybindings',
  'org.gnome.mutter.keybindings',
  'org.gnome.shell.extensions.tiling-assistant',
];

const initialSettings = new Map([
  ['org.gnome.desktop.wm.keybindings.maximize', "['<Super>Up']"],
  ['org.gnome.desktop.wm.keybindings.unmaximize', "['<Super>Down', '<Alt>F5']"],
  ['org.gnome.shell.extensions.tiling-assistant.tile-left-half', "['<Super>Left', '<Super>KP_4']"],
  [
    'org.gnome.shell.extensions.tiling-assistant.tile-right-half',
    "['<Super>Right', '<Super>KP_6']",
  ],
  ['org.gnome.shell.extensions.tiling-assistant.tile-maximize', "['<Super>Up', '<Super>KP_5']"],
  ['org.gnome.shell.extensions.tiling-assistant.restore-window', "['<Super>Down']"],
]);

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true }))
  );
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vinkup-gnome-shortcuts-'));
  temporaryDirectories.push(directory);
  return directory;
}

function createGSettingsRunner(settings = new Map(initialSettings)) {
  const keysBySchema = new Map<string, string[]>();
  for (const setting of settings.keys()) {
    const schema = schemas.find((candidate) => setting.startsWith(`${candidate}.`));
    if (!schema) continue;
    const key = setting.slice(schema.length + 1);
    keysBySchema.set(schema, [...(keysBySchema.get(schema) ?? []), key]);
  }

  const runCommand = vi.fn((args: string[]) => {
    const [command, schema, key, value] = args;
    if (command === 'list-schemas') return Promise.resolve(schemas.join('\n'));
    if (command === 'list-keys' && schema) {
      return Promise.resolve((keysBySchema.get(schema) ?? []).join('\n'));
    }
    if (command === 'get' && schema && key) {
      const current = settings.get(`${schema}.${key}`);
      if (current === undefined) throw new Error(`Unknown setting ${schema}.${key}`);
      return Promise.resolve(current);
    }
    if (command === 'set' && schema && key && value !== undefined) {
      settings.set(`${schema}.${key}`, value);
      return Promise.resolve('');
    }
    throw new Error(`Unexpected gsettings call: ${args.join(' ')}`);
  });

  return { runCommand, settings };
}

describe('GnomeShortcutProtection', () => {
  it('temporarily removes only Super+Arrow bindings and restores original values', async () => {
    const userDataPath = await createTemporaryDirectory();
    const { runCommand, settings } = createGSettingsRunner();
    const protection = new GnomeShortcutProtection(userDataPath, runCommand, 'linux', {
      XDG_CURRENT_DESKTOP: 'ubuntu:GNOME',
    });

    await protection.restorePreviousSession();
    await protection.setTraineeActive(true);

    expect(settings.get('org.gnome.desktop.wm.keybindings.maximize')).toBe('[]');
    expect(settings.get('org.gnome.desktop.wm.keybindings.unmaximize')).toBe("['<Alt>F5']");
    expect(settings.get('org.gnome.shell.extensions.tiling-assistant.tile-left-half')).toBe(
      "['<Super>KP_4']"
    );
    expect(settings.get('org.gnome.shell.extensions.tiling-assistant.tile-right-half')).toBe(
      "['<Super>KP_6']"
    );
    expect(settings.get('org.gnome.shell.extensions.tiling-assistant.tile-maximize')).toBe(
      "['<Super>KP_5']"
    );
    expect(await readFile(path.join(userDataPath, 'gnome-shortcuts.json'), 'utf8')).toContain(
      '<Super>Left'
    );

    await protection.setTraineeActive(false);

    expect(settings).toEqual(new Map(initialSettings));
    await expect(
      readFile(path.join(userDataPath, 'gnome-shortcuts.json'), 'utf8')
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('restores saved bindings left by an interrupted app session', async () => {
    const userDataPath = await createTemporaryDirectory();
    const { runCommand, settings } = createGSettingsRunner();
    const firstRun = new GnomeShortcutProtection(userDataPath, runCommand, 'linux', {
      XDG_CURRENT_DESKTOP: 'ubuntu:GNOME',
    });

    await firstRun.restorePreviousSession();
    await firstRun.setTraineeActive(true);
    const restartedApp = new GnomeShortcutProtection(userDataPath, runCommand, 'linux', {
      XDG_CURRENT_DESKTOP: 'ubuntu:GNOME',
    });

    await restartedApp.restorePreviousSession();

    expect(settings).toEqual(new Map(initialSettings));
    await expect(
      readFile(path.join(userDataPath, 'gnome-shortcuts.json'), 'utf8')
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not modify desktop shortcuts outside a GNOME Linux session', async () => {
    const userDataPath = await createTemporaryDirectory();
    const { runCommand } = createGSettingsRunner();
    const protection = new GnomeShortcutProtection(userDataPath, runCommand, 'linux', {
      XDG_CURRENT_DESKTOP: 'KDE',
    });

    await protection.restorePreviousSession();
    await protection.setTraineeActive(true);

    expect(runCommand).not.toHaveBeenCalled();
  });
});
