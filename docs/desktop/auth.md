# Authentication — How It Works (and Why It Changed)

> A friendly walkthrough of Vinkup's authentication: how it worked as a plain web
> app, why that broke when we moved into Electron, and how the new desktop flow
> works end-to-end.
>
> - **Old (web browser) flow**: see commit `4194b9d`
> - **New (Electron desktop) flow**: see the code on `main`

---

## 1. The old way — plain browser + cookie (the `4194b9d` world)

Back when Vinkup ran in a regular browser tab, authentication was the classic
"redirect to Google, come back with a cookie" flow.

### How a user signed in

```text
Browser tab                      Backend                             Google
     │                              │                                  │
     │  click "Sign in with Google" │                                  │
     │  (window.location.href =     │                                  │
     │   /api/auth/google)          │                                  │
     ├─────────────────────────────►│  Passport google strategy        │
     │◄──── 302 redirect ───────────┤─────────────────────────────────►│  consent screen
     │                              │◄──── callback ?code=… ───────────┤
     │                              │  verifyGoogleProfile():          │
     │                              │   - email must end in the        │
     │                              │     allowed domain               │
     │                              │   - admin? → role "admin"        │
     │                              │   - trainee provisioned?         │
     │                              │  sign JWT                        │
     │◄──── 302 + Set-Cookie ───────┤                                  │
     │  auth_token = <JWT>          │                                  │
     │  (httpOnly, 7 days)          │                                  │
```

After that, every API call simply carried the cookie:

- `frontend/src/api/client.ts` created an axios instance with
  `withCredentials: true`, so the browser attached `auth_token` automatically.
- `backend/src/middleware/authMiddleware.ts` (`requireAuth`) read that cookie,
  verified the JWT, and put the user on `request.user`.
- The renderer had no token at all — the cookie was **httpOnly**, so even
  JavaScript in the page couldn't touch it. The cookie _was_ the session.

### How the app knew who was logged in

`AuthProvider` (`frontend/src/context/AuthProvider.tsx`) was the single source
of truth in the UI:

1. **On load / refresh** it called `GET /auth/me`. If the cookie was still
   valid, the user came back and the app rendered; if not, `status` became
   `'unauthenticated'` and `ProtectedRoute` sent them to `/login`.
2. **On any 401** from a protected API call, an axios response interceptor
   called a registered "unauthorized handler", which cleared local state —
   the user was silently bounced back to the login page.
3. **Login** just did `window.location.href = .../api/auth/google` (a full page
   navigation — that's fine in a browser).
4. **Logout** posted to `/auth/logout`, which cleared the cookie.

### Why this was great (in a browser)

- Zero tokens in JS-land → XSS can't steal the session.
- No refresh logic to write — the browser keeps sending the cookie for 7 days.
- Session restore across page reloads is free: just call `/auth/me` again.

---

## 2. The problem — why this broke inside Electron

When the same React app was wrapped in an Electron shell, this flow stopped
making sense. Several things went wrong at once:

### a) Google blocks OAuth inside embedded webviews

You can't just show Google's consent screen inside an Electron `BrowserWindow`.
Google explicitly blocks OAuth in embedded browsers/webviews (to prevent
credential phishing — an app that controls the window could read your Google
password). So the "redirect inside the page" trick dies immediately.

### b) There is no `window.location.href = google` escape hatch

An Electron window isn't a normal browser tab. Navigating the shell away from
the app (or pointing it at Google) would either break the app or embed a
webview that Google refuses — see (a). The login has to happen in the **user's
own system browser**, and then somehow _come back_ into the desktop app.

### c) "Coming back" is the hard part

In the web flow, Google redirects back to the backend, the backend sets a
cookie, and the browser just carries on. In Electron:

- The system browser is a completely separate process from the app.
- The backend redirect can't "set a cookie for the app" — there is no shared
  cookie jar between Chrome and the Electron session.
- We need a mechanism to hand the login result from the system browser back to
  the running desktop app.

### d) Cookies alone no longer cut it for a desktop app

Desktop apps run for days. A 7-day JWT cookie is clunky: you either force
re-login every week or ship a long-lived token around. A proper desktop session
wants a **short-lived access token + a long-lived rotating refresh token**,
with the refresh token stored safely by the OS.

### e) Where do tokens live now?

This is the big security question. The Electron **renderer** (where React runs)
is still effectively a browser context — anything in it can be read by
compromised web content. So the answer is: the renderer should _never_ hold
tokens. But the renderer still needs to call the same `/api` endpoints as the
web app, which expect the `auth_token` cookie…

### TL;DR of the problem

> The old flow assumed a real browser: Google redirects work, cookies persist,
> full-page navigations are fine. None of those assumptions hold in Electron.

---

## 3. The solution — system browser + loopback + PKCE + rotating refresh tokens

The new implementation (`desktop/src/main/auth/*`, backend
`desktop-auth.*`) follows the standard OAuth pattern for native/desktop apps:

1. **Open the user's system browser** for the Google consent screen.
2. **Catch the redirect on a local loopback URL** (`http://127.0.0.1:<random
port>/callback`) with a tiny HTTP server spun up inside the Electron main
   process.
3. **Exchange a one-time code for tokens** — but never in the browser, only in
   the main process, proven with PKCE.

And one clever glue detail: because the backend already owns the Google
_Web_ client (and we don't want to ship a client secret inside the desktop
app), the desktop flow **reuses the backend's Google client**. The browser leg
ends at the backend, and the backend hands the app an **opaque one-time
handoff code** — not a token.

### The cast of characters

| Piece                            | File                                                     | Job                                                                                                                                           |
| -------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `DesktopAuthManager`             | `desktop/src/main/auth/manager.ts`                       | The brain. Owns all tokens, runs login/refresh/logout, keeps session state                                                                    |
| `HttpDesktopAuthApi`             | `desktop/src/main/auth/api.ts`                           | Talks to the backend **directly from main** (never through the renderer)                                                                      |
| Loopback listener                | `desktop/src/main/auth/loopback.ts`                      | One-shot local HTTP server that catches the browser redirect                                                                                  |
| `SecureDesktopCredentialStorage` | `desktop/src/main/auth/storage.ts`                       | Persists the refresh token, encrypted by the OS via `safeStorage`                                                                             |
| Backend `DesktopAuthService`     | `backend/src/module/auth-module/desktop-auth.service.ts` | Transactions, handoff codes, PKCE check, session/refresh rotation                                                                             |
| Preload bridge                   | `desktop/src/preload/index.ts`                           | Exposes the `auth` namespace `{ getState, login, cancel, refresh, logout, onChange }` via IPC; other namespaces expose unrelated desktop APIs |
| Renderer `AuthProvider`          | `frontend/src/context/AuthProvider.tsx`                  | If `window.desktop.auth` exists → desktop flow; else → old cookie flow                                                                        |

---

## 4. The full desktop login workflow, step by step

```text
Electron main                    Backend                          System browser
     │                              │                                │
     │ 1. POST /api/auth/desktop/transactions                         │
     │    { redirectUri: http://127.0.0.1:<port>/callback,            │
     │      codeChallenge (PKCE S256) }                               │
     ├─────────────────────────────►│                                 │
     │                              │ saves a pending "transaction":  │
     │                              │  state, code_challenge,         │
     │                              │  loopback URI (5-min TTL)       │
     │◄─────────────────────────────┤ transactionId, state,           │
     │                              │ authorizationUrl, expiresAt     │
     │                              │                                 │
     │ 2. shell.openExternal(authorizationUrl) ──────────────────────►│
     │                              │◄── GET /google?transaction=… ───┤
     │                              │ Passport "google-desktop"       │
     │                              │ strategy → Google consent ─────►│
     │                              │◄── Google redirects to backend  │
     │                              │     /callback?code&state        │
     │                              │                                 │
     │                              │ - state matches the transaction │
     │                              │ - transaction claimed once      │
     │                              │ - Google profile verified       │
     │                              │   (domain, provisioning, roles) │
     │                              │ - generate one-time handoff     │
     │                              │   code, store only its SHA-256  │
     │                              │                                 │
     │ 3. browser is 302-redirected to http://127.0.0.1:<port>/callback
     │    ?code=<handoff>&state=<state>                               │
     │    → user sees "Sign-in complete, you can close this tab"      │
     │                              │                                 │
     │  loopback server:            │                                 │
     │  - only GET /callback        │                                 │
     │  - Host header must be       │                                 │
     │    exactly 127.0.0.1:<port>  │                                 │
     │    (anti DNS-rebinding)      │                                 │
     │  - accepts exactly ONE call  │                                 │
     │                              │                                 │
     │  main (manager.ts):          │                                 │
     │  - error callback → fail;    │                                 │
     │    state check skipped       │                                 │
     │  - otherwise compare state   │                                 │
     │    in constant time          │                                 │
     │                              │                                 │
     │ 4. POST /api/auth/desktop/exchange                             │
     │    { code: <handoff>, codeVerifier: <PKCE verifier> }          │
     ├─────────────────────────────►│                                 │
     │                              │ - hash(code) matches stored     │
     │                              │   hash, not yet consumed,       │
     │                              │   not expired (60 s TTL)        │
     │                              │ - sha256(verifier) == stored    │
     │                              │   code_challenge (PKCE proof)   │
     │                              │ - consume the code              │
     │                              │ - create desktop_session row,   │
     │                              │   store sha256(refreshToken)    │
     │◄─────────────────────────────┤                                 │
     │  { accessToken,              │                                 │
     │    accessTokenExpiresAt,     │                                 │
     │    refreshToken,             │                                 │
     │    refreshTokenExpiresAt,    │                                 │
     │    user }                    │                                 │
     │                              │                                 │
     │ 5. main process finishes:    │                                 │
     │  - refresh token → memory +  │                                 │
     │    OS-encrypted file         │                                 │
     │    (userData/auth/session.json, mode 0600)                     │
     │  - access token → memory +   │                                 │
     │    httpOnly auth_token cookie│                                 │
     │    set on the Electron       │                                 │
     │    session (so the existing  │                                 │
     │    API middleware keeps      │                                 │
     │    working!)                 │                                 │
     │  - schedule a refresh timer  │                                 │
     │    just before expiry        │                                 │
     │  - broadcast auth state      │                                 │
     │    { status: 'authenticated', user } over IPC                  │
     │                              │                                 │
     │ 6. renderer: React UI shows  │                                 │
     │    the app. It still knows   │                                 │
     │    nothing about any token.  │                                 │
```

### Why PKCE?

The one-time handoff code travels through the system browser's URL bar. Anyone
(or any other app on the machine) who somehow sees that code must **also**
prove possession of the `code_verifier`, which lives only in the main process
memory. So the code in the URL is worthless on its own. It's also single-use,
60-second TTL, and only its SHA-256 hash is stored server-side.

### Why the loopback listener is paranoid

The `loopback.ts` listener and the `manager.ts` callback handler check:

- **Host header** must be exactly `127.0.0.1:<port>` — blocks DNS-rebinding
  pages from faking a callback.
- **Exact path** `/callback`, **GET only**.
- **State equality** is checked later by `manager.ts` with a constant-time compare — but only when the
  callback carried no error. Error callbacks fail immediately and skip that check.
- **Exactly one** callback — a second one is ignored.
- Binds to a **random port** for every login, with a 5-minute timeout.
- Serves a locked-down HTML page (CSP `default-src 'none'`, `no-store`).

---

## 5. Session lifetime — restore, refresh, revoke

### On app launch (`restore`)

1. Clear any stale `auth_token` cookie from the Electron session.
2. Load the refresh token from `userData/auth/session.json` and decrypt it with
   Electron's `safeStorage`.
3. If there's a token → `POST /api/auth/desktop/refresh`.
   - **Works?** New access token + new refresh token; user is signed in.
   - **Terminal error** (`SESSION_EXPIRED`, `SESSION_REVOKED`, `INVALID_CODE`,
     `EXPIRED`)? → wipe storage, show the login screen.
   - **Temporary error** (backend unreachable)? → **keep the refresh token**,
     show `BACKEND_UNAVAILABLE`. A flaky Wi-Fi moment must not log you out
     forever; the next launch can still recover.

### Refresh rotation

- The access token is short-lived (JWT). The manager schedules a refresh
  **1 minute before expiry** (`REFRESH_SKEW_MS`), with a 60-second retry if
  the backend is down.
- Every refresh **rotates** the refresh token: the old one is invalidated
  server-side and a new one is stored. Replaying the superseded token is
  rejected with `SESSION_REVOKED`, but the active session is **not** revoked —
  its current refresh token still works. There is no reuse detection that
  revokes the whole session; explicit revocation happens on logout or token
  expiry. (This is the "sliding" 30-day session — it keeps extending as long as
  you actually use the app.)
- Refresh tokens are never stored in plaintext: on disk only
  `safeStorage`-encrypted (and on Linux with the weak `basic_text` backend the
  app refuses to persist at all and keeps the session memory-only —
  `persistent: false`).

### Logout

- Main process calls `POST /api/auth/desktop/logout` with both tokens → the
  backend revokes the session row.
- Even if the backend is unreachable, the local side (cookie + storage +
  memory) is always cleared — **you can always sign out**.

### The 401 safety net in the renderer

The renderer's axios interceptor still catches 401s, but instead of "sign out"
it now asks main to **refresh first** (`desktopAuth.refresh()`). If the access
cookie simply expired, the user never sees a login screen. Only if refresh
itself fails do we clear the UI state.

---

## 6. What the renderer is allowed to see

The `auth` namespace of the preload bridge (`desktop/src/preload/index.ts`)
exposes exactly five functions and one event — no token ever crosses that
boundary:

```ts
auth: {
  getState(): Promise<DesktopAuthState>;
  login(): Promise<DesktopAuthState>;
  cancel(): Promise<void>;
  refresh(): Promise<DesktopAuthState>;
  logout(): Promise<void>;
  onChange(listener: (state: DesktopAuthState) => void): () => void;
}
```

`DesktopAuthState` = `{ status: 'loading' | 'pending' | 'authenticated' |
'unauthenticated', user, error, persistent }`.

So the React app's `AuthProvider` behaves almost identically to the web
version — same `user`, `status`, `login()`, `logout()`, `refresh()` — it just
gets its state over IPC instead of from `/auth/me`. The web flow remains fully
intact for the browser build; the desktop path activates only when
`window.desktop?.auth` exists.

---

## 7. Old vs new at a glance

|                             | Old (browser)                 | New (Electron)                                                                                                  |
| --------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Consent screen              | Same tab, full-page redirect  | System browser via `openExternal`                                                                               |
| Who holds tokens            | Nobody — httpOnly cookie only | **Main process only** (renderer still gets just an httpOnly cookie)                                             |
| Session secret              | 7-day JWT cookie              | Short-lived access JWT + 30-day sliding rotating refresh token                                                  |
| Session restore             | `GET /auth/me` with cookie    | Decrypt stored refresh token → `POST /refresh`                                                                  |
| Expiry handling             | 401 → back to `/login`        | 401 → silent refresh → only then show login                                                                     |
| Persistent storage          | Browser cookie jar            | `safeStorage`-encrypted file, atomic write, `0600`                                                              |
| Anti-theft measures         | httpOnly + SameSite cookie    | PKCE S256, one-time hashed handoff code, refresh rotation, loopback Host check, state compare, transaction TTLs |
| Where auth API calls happen | Renderer (axios)              | Main process (`HttpDesktopAuthApi`); renderer calls only go through IPC                                         |

---

## 8. Quick file map

```text
desktop/
  src/main/auth/
    manager.ts        DesktopAuthManager — state machine, PKCE, refresh timer
    loopback.ts       One-shot 127.0.0.1 listener for the OAuth redirect
    api.ts            HTTP calls to the backend from main + error-code mapping
    storage.ts        Encrypted, atomic refresh-token persistence
  src/preload/index.ts  The renderer-facing bridge; its auth namespace is the auth surface used here

backend/src/module/auth-module/
  desktop-auth.service.ts    Transactions, handoff codes, PKCE verify, rotation
  desktop-auth.controller.ts Browser leg (startGoogle, handleGoogleCallback)
  desktop-auth.routes.ts     /transactions /google /callback /exchange /session /refresh /logout
  desktop-auth.repository.ts Prisma persistence (transactions, sessions)
  desktop-auth.constants.ts  TTLs: transaction 5 min, handoff 60 s, session 30 days
  passport.ts                "google-desktop" strategy (reuses the Google client)

frontend/src/context/AuthProvider.tsx   One provider, two runtimes (web cookie ↔ desktop IPC)
```

---

## 9. One-paragraph summary

The web app's auth was simple because the browser did everything: Google
redirected back into the same tab, the backend set an httpOnly JWT cookie, and
the renderer never needed to know anything about tokens. Electron broke every
one of those assumptions — no in-app Google consent, no way for the system
browser to hand results back, no shared cookie jar, and an untrusted renderer
where tokens must never live. The fix moves all token ownership into the
Electron **main process**: it opens the user's system browser for the Google
consent, catches the redirect on a hardened local loopback server, proves
itself with PKCE, and exchanges a one-time hashed handoff code for a
short-lived access token plus a rotating refresh token that is encrypted by
the OS. The renderer gets an httpOnly cookie (so all existing API middleware
works unchanged) and a tiny IPC surface that only ever reports
`{ status, user, error, persistent }`. The result: desktop-grade security, silent session
renewal, offline-tolerant restore — and the plain web flow still works exactly
as before.
