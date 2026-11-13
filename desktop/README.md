# Desktop (Electron)

Electron shell for Vinkup. Linux is the only supported target for now, and the
desktop build ships the **student** experience first.

The renderer is the existing Vite app, served over `http://127.0.0.1:43110`
instead of `file://` so that cookies, `localStorage`, IndexedDB, and
`Cross-Origin-Isolation` (needed by WebContainer) keep working.

## Layout

```
desktop/
  src/main/config.ts    App name, API URL, desktop port, frontend directory
  src/main/server.ts    Local static server + /api proxy (COOP/COEP headers)
  src/main/index.ts     Window, menu, IPC handlers, security defaults
  src/preload/index.ts  contextBridge surface (window.desktop)
  scripts/build.mjs     esbuild bundle for main + preload
  scripts/run-electron.mjs  dev/production launcher (XWayland on Wayland)
  scripts/after-pack.mjs    packaged launcher wrapper (XWayland on Wayland)
```

## Development

```bash
npm run dev:desktop
```

This starts Vite on port `5173` and then launches Electron. Closing either one
stops both. Electron loads `http://localhost:5173` so frontend changes hot-reload.
On multi-display setups, other displays are covered while the app is running.
Press `Ctrl+Alt+Shift+M` to move the fullscreen app to the next display;
moving the app away from focus opens a return-or-exit alert on every display.
Display covers and focus alerts are paused while Google sign-in is active in the
system browser, then restored when sign-in completes or fails.
The certificate page's **Print / Save as PDF** button temporarily suppresses
focus alerts while the native print dialog is open; overlays on other displays
remain in place. Protection resumes when printing ends, the student leaves the
certificate page, or a two-minute watchdog expires.

To temporarily disable the entire screen-protection feature for a developer
build, change `DISABLE_SCREEN_PROTECTION` in `desktop/src/main/index.ts` to
`false` and rebuild. This source-only flag is not exposed to the renderer or as
an application setting.

If you want to run them separately (for example, to restart only the shell):

```bash
npm run dev:frontend
npm run dev -w desktop
```

In development, Electron loads Vite directly. In production it loads the local
server that serves `frontend/dist` — that is why the frontend must be built
before `npm run start:desktop` or `npm run dist:desktop`.

Authentication uses the system browser and the backend's Google OAuth client. The
main process creates a PKCE transaction, opens Google in the system browser,
receives a one-time handoff code on a loopback listener, and exchanges it for a
short-lived access cookie plus an OS-encrypted refresh token. The renderer never
sees a token. See [docs/authentication.md](../docs/authentication.md) for the
flow, Google Cloud setup and security model.

For frontend-only UI work you can still use mock mode in
`frontend/.env.local`:

```bash
VITE_USE_MOCKS=true
```

## Production-like run

```bash
npm run build -w frontend
npm run start:desktop
```

This serves `frontend/dist` from the local server and loads it in Electron.

## Checks

```bash
npm run typecheck -w desktop
npm run lint
```

## Packaging (Linux)

```bash
npm run dist:desktop
```

This builds the frontend first, then produces an AppImage and a `.deb` in
`desktop/release/`. Add `desktop/build/icon.png` (512×512) before publishing a
release.

## Environment variables

| Variable                | Default                               | Purpose                                                                                                            |
| ----------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `VINKUP_API_URL`        | `https://vinkup-backend.onrender.com` | Backend the `/api` proxy and desktop sign-in use. Defaults to `http://localhost:3000` when `NODE_ENV=development`. |
| `VINKUP_DESKTOP_PORT`   | `43110`                               | Local renderer port. Changing it changes the renderer origin, which clears stored state.                           |
| `NODE_ENV`              | unset                                 | `development` loads the Vite dev server and enables DevTools.                                                      |
| `VINKUP_OZONE_PLATFORM` | unset                                 | Set to `wayland` to use native Wayland instead of XWayland on Linux.                                               |

## Linux troubleshooting

### Missing close/minimize buttons on Wayland

Electron on GNOME Wayland (Ubuntu 24.04+) can open a window without native
decorations. The dev launcher and the packaged launcher pass
`--ozone-platform=x11` on Wayland sessions, so the window gets normal title-bar
controls. Set `VINKUP_OZONE_PLATFORM=wayland` to opt out.

This must be a real command-line switch. `app.commandLine.appendSwitch` is too
late for the browser process to choose a different Ozone platform.

### `SUID sandbox helper binary ... is not configured correctly`

Ubuntu 24.04 restricts unprivileged user namespaces, so Electron cannot start
its sandbox when running from `node_modules`. Either:

- install the `.deb` (its post-install script configures the sandbox and an
  AppArmor profile), or
- run this once after each `npm install`:

```bash
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
```

Do **not** add `--no-sandbox` to the real app: the renderer runs WebContainer
code and needs Chromium's sandbox.

The AppImage cannot configure the setuid helper without root, so its `AppRun`
falls back to `--no-sandbox` when unprivileged user namespaces are blocked. The
`.deb` is the recommended install for that reason.

### AppImage says `libfuse.so.2` is missing

Ubuntu 24.04 ships FUSE 3. Either install FUSE 2:

```bash
sudo apt install libfuse2t64
```

or run the AppImage with `--appimage-extract-and-run`.

## Current limitations

- Persistent desktop sessions need an OS keyring. On Linux, Chromium's
  `basic_text` backend is rejected, so the session stays in memory and does not
  survive a restart (`persistent: false`).
- Fullscreen tracking still uses the web implementation
  (`document.fullscreenElement`). `window.desktop.window` exposes native
  fullscreen events for the follow-up change.
- Activity time is not flushed on quit yet (see the `TODO` in
  `src/main/index.ts`).
- Mentor/admin routes are not gated yet. They will be hidden or disabled for the
  student-only desktop build.
- `node-pty` and system filesystem access are intentionally out of scope for
  v1. The WebContainer/PGlite runtime is unchanged.
