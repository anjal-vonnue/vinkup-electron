import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GnomeShortcutProtection } from './gnomeShortcutProtection.js';

const schemas = [
  'org.gnome.desktop.wm.keybindings',
  'org.gnome.mutter.keybindings',
  'org.gnome.shell.extensions.tiling-assistant',
  'org.gnome.shell.extensions.custom-shortcuts',
];

const initialSettings = new Map([
  ['org.gnome.desktop.wm.keybindings.minimize', "['<Super>h']"],
  ['org.gnome.desktop.wm.keybindings.show-desktop', "['<Super>d']"],
  ['org.gnome.desktop.wm.keybindings.maximize', "['<Super>Up']"],
  ['org.gnome.desktop.wm.keybindings.unmaximize', "['<Super>Down', '<Alt>F5']"],
  ['org.gnome.shell.extensions.tiling-assistant.tile-left-half', "['<Super>Left', '<Super>KP_4']"],
  [
    'org.gnome.shell.extensions.tiling-assistant.tile-right-half',
    "['<Super>Right', '<Super>KP_6']",
  ],
  ['org.gnome.shell.extensions.tiling-assistant.tile-maximize', "['<Super>Up', '<Super>KP_5']"],
  ['org.gnome.shell.extensions.tiling-assistant.tile-topleft-quarter', "['<Super>KP_7']"],
  ['org.gnome.shell.extensions.tiling-assistant.tile-top-half', "['<Super>KP_8']"],
  ['org.gnome.shell.extensions.tiling-assistant.tile-topright-quarter', "['<Super>KP_9']"],
  ['org.gnome.shell.extensions.tiling-assistant.tile-bottomleft-quarter', "['<Super>KP_1']"],
  ['org.gnome.shell.extensions.tiling-assistant.tile-bottom-half', "['<Super>KP_2']"],
  ['org.gnome.shell.extensions.tiling-assistant.tile-bottomright-quarter', "['<Super>KP_3']"],
  ['org.gnome.shell.extensions.tiling-assistant.restore-window', "['<Super>Down']"],
  ['org.gnome.shell.extensions.custom-shortcuts.hide-windows', "['<Super>D', '<Ctrl><Alt>F12']"],
  ['org.gnome.shell.extensions.custom-shortcuts.show-desktop-binding', "'<Super>d'"],
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
  const runCommand = vi.fn((args: string[]) => {
    const [command, schema, key, value] = args;
    if (command === 'list-schemas') return Promise.resolve(schemas.join('\n'));
    if (command === 'list-recursively') {
      return Promise.resolve(
        [...settings.entries()]
          .map(([setting, current]) => {
            const settingSchema = schemas.find((candidate) => setting.startsWith(`${candidate}.`));
            if (!settingSchema) return '';
            return `${settingSchema} ${setting.slice(settingSchema.length + 1)} ${current}`;
          })
          .filter(Boolean)
          .join('\n')
      );
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
  it('removes protected shortcuts from GNOME and extension bindings, then restores originals', async () => {
    const userDataPath = await createTemporaryDirectory();
    const { runCommand, settings } = createGSettingsRunner();
    const protection = new GnomeShortcutProtection(userDataPath, runCommand, 'linux', {
      XDG_CURRENT_DESKTOP: 'ubuntu:GNOME',
    });

    await protection.restorePreviousSession();
    await protection.setTraineeActive(true);

    expect(settings.get('org.gnome.desktop.wm.keybindings.minimize')).toBe('[]');
    expect(settings.get('org.gnome.desktop.wm.keybindings.show-desktop')).toBe('[]');
    expect(settings.get('org.gnome.shell.extensions.custom-shortcuts.hide-windows')).toBe(
      "['<Ctrl><Alt>F12']"
    );
    expect(settings.get('org.gnome.shell.extensions.custom-shortcuts.show-desktop-binding')).toBe(
      "''"
    );
    expect(settings.get('org.gnome.desktop.wm.keybindings.maximize')).toBe('[]');
    expect(settings.get('org.gnome.desktop.wm.keybindings.unmaximize')).toBe("['<Alt>F5']");
    expect(settings.get('org.gnome.shell.extensions.tiling-assistant.tile-left-half')).toBe('[]');
    expect(settings.get('org.gnome.shell.extensions.tiling-assistant.tile-right-half')).toBe('[]');
    expect(settings.get('org.gnome.shell.extensions.tiling-assistant.tile-maximize')).toBe('[]');
    for (const key of [
      'tile-topleft-quarter',
      'tile-top-half',
      'tile-topright-quarter',
      'tile-bottomleft-quarter',
      'tile-bottom-half',
      'tile-bottomright-quarter',
    ]) {
      expect(settings.get(`org.gnome.shell.extensions.tiling-assistant.${key}`)).toBe('[]');
    }
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
