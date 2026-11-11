import { spawn } from 'node:child_process';
import electronPath from 'electron';

// Electron 38+ defaults to Wayland on Wayland sessions. On GNOME the resulting
// window can be missing its close/minimize/maximize controls, so use XWayland
// instead. This must be a real command-line switch: app.commandLine.appendSwitch
// runs too late for the browser process to pick a different Ozone platform.
// Set VINKUP_OZONE_PLATFORM=wayland to keep native Wayland.
function ozoneArgs() {
  if (process.platform !== 'linux') return [];
  if (process.env.VINKUP_OZONE_PLATFORM === 'wayland') return [];

  const isWayland =
    process.env.XDG_SESSION_TYPE === 'wayland' || Boolean(process.env.WAYLAND_DISPLAY);
  if (!isWayland) return [];

  return ['--ozone-platform=x11'];
}

const child = spawn(electronPath, [...ozoneArgs(), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

let stopping = false;

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    child.kill(signal);
  });
}

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
