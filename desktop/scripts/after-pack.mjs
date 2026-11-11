import { chmod, open, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Electron 38+ defaults to Wayland on Wayland sessions, where GNOME can show a
// window without close/minimize/maximize controls. Force XWayland with a real
// command-line switch by replacing the packaged binary with a small wrapper.
// The wrapper honors VINKUP_OZONE_PLATFORM=wayland for users who want Wayland.
function wrapperScript(realBinaryName) {
  return `#!/bin/sh
set -e

DIR=$(dirname "$(readlink -f "$0")")

if [ "\${VINKUP_OZONE_PLATFORM:-}" = "wayland" ]; then
  exec "$DIR/${realBinaryName}" "$@"
fi

if [ "\${XDG_SESSION_TYPE:-}" = "wayland" ] || [ -n "\${WAYLAND_DISPLAY:-}" ]; then
  exec "$DIR/${realBinaryName}" --ozone-platform=x11 "$@"
fi

exec "$DIR/${realBinaryName}" "$@"
`;
}

async function isElf(filePath) {
  const handle = await open(filePath, 'r');
  try {
    const header = Buffer.alloc(4);
    await handle.read(header, 0, 4, 0);
    return header.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
  } finally {
    await handle.close();
  }
}

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') return;

  const executableName = context.packager.executableName;
  const binaryPath = path.join(context.appOutDir, executableName);
  const realBinaryName = `${executableName}-bin`;
  const realBinaryPath = path.join(context.appOutDir, realBinaryName);

  // Rebuilding without cleaning release/linux-unpacked must not wrap the wrapper.
  if (!(await isElf(binaryPath))) return;

  await rm(realBinaryPath, { force: true });
  await rename(binaryPath, realBinaryPath);
  await writeFile(binaryPath, wrapperScript(realBinaryName), { mode: 0o755 });
  await chmod(binaryPath, 0o755);
}
