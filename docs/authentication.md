# Authentication

Vinkup has two sign-in paths that share one Google OAuth client:

- **Web**: the existing Passport Google flow at `/api/auth/google`, which sets the
  `auth_token` JWT cookie. Nothing about it changes.
- **Desktop (Electron)**: the system browser performs the Google consent, the
  backend hands a one-time code to a loopback listener in the app, and the main
  process exchanges that code for a short-lived access token and a rotating
  refresh token.

The renderer never receives an access token, refresh token or JWT. It only sees
`{ status, user, error, persistent }` over a restricted preload API.

## Why this design

The Electron shell cannot use an embedded Google login window: Google blocks
embedded webviews for OAuth, and doing so would expose the app to credential
phishing. The standard desktop pattern is:

1. open the system browser;
2. catch the redirect on a loopback URL;
3. exchange the authorization result for app credentials.

Because the backend already owns the confidential Google **Web** client, the
desktop flow reuses it instead of shipping a client secret in the app. The
browser leg ends with an **opaque one-time handoff code**, not a token. Only a
process that can prove the PKCE `code_verifier` can turn that code into a session.

## Flow

```text
Electron main                     Backend                         System browser / Google
     │                               │                                      │
     │ 1. POST /transactions        │                                      │
     │    redirectUri + PKCE S256   │                                      │
     ├─────────────────────────────►│  create pending transaction (5 min)  │
     │◄─────────────────────────────┤  transactionId, state, URL           │
     │                               │                                      │
     │ 2. openExternal(backend/api/auth/desktop/google?transaction=…)      │
     ├─────────────────────────────────────────────────────────────────────►│
     │                               │◄──── GET /google?transaction=… ──────┤
     │                               │  Passport google-desktop strategy    │
     │                               │  ───────────────────────────────────►│ Google consent
     │                               │◄──── GET /callback?code&state ───────┤
     │                               │  verify state, claim transaction     │
     │                               │  store code_hash + user snapshot      │
     │                               │  302 → http://127.0.0.1:<port>/callback
     │                               │        ?code=<handoff>&state=…       │
     │ 3. loopback receives code     │                                      │
     │    (127.0.0.1, random port,   │                                      │
     │     Host/path/state checked)  │                                      │
     │                               │                                      │
     │ 4. POST /exchange { code, codeVerifier }                            │
     ├─────────────────────────────►│  hash code, verify PKCE, consume once │
     │◄─────────────────────────────┤  200 { accessToken, refreshToken, … }│
     │                               │                                      │
     │ 5. store refresh token with safeStorage,                            │
     │    set httpOnly auth_token cookie for the renderer origin,          │
     │    broadcast { status: authenticated, user } over IPC               │
```

Step 5 keeps the existing backend middleware working: the renderer's `/api`
calls go through its local proxy and carry the short-lived `auth_token` cookie,
so `requireAuth`/`requireTrainee`/`requireAdmin` are unchanged.

## Endpoints

All paths are prefixed with `/api/auth/desktop`.

| Method | Path            | Caller         | Purpose                                                          |
| ------ | --------------- | -------------- | ---------------------------------------------------------------- |
| POST   | `/transactions` | Electron main  | Create a pending login transaction; returns `state` and URL      |
| GET    | `/google`       | System browser | Start Google via the `google-desktop` Passport strategy          |
| GET    | `/callback`     | Google         | Verify OAuth state, store the user, redirect to the loopback     |
| POST   | `/exchange`     | Electron main  | Redeem the one-time code with the PKCE verifier; returns session |
| GET    | `/session`      | Electron main  | Read the current user from a Bearer access token                 |
| POST   | `/refresh`      | Electron main  | Rotate the refresh token and issue a new access token            |
| POST   | `/logout`       | Electron main  | Revoke the session by access and/or refresh token                |

The web endpoints `GET /api/auth/google`, `GET /api/auth/google/callback`,
`GET /api/auth/me` and `POST /api/auth/logout` are untouched.

### Transaction rules

- `redirectUri` must be `http://127.0.0.1:<port>/...` with no credentials,
  query or fragment.
- `codeChallengeMethod` must be `S256`; the challenge is 43–128 base64url
  characters.
- A transaction expires after 5 minutes. A handoff code expires after 60
  seconds and can be consumed once.
- The OAuth `state` is generated by the backend (32 random bytes, base64url)
  and bound to the transaction.

### Session rules

- The access token is a JWT with `typ: "desktop"` and a `sid` claim, signed with
  `JWT_SECRET`. Its lifetime is `DESKTOP_ACCESS_TOKEN_TTL` (default `15m`).
- The refresh token is 48 random bytes, stored **hashed** (SHA-256) in
  `desktop_session`. The plain token exists only in the app.
- Refreshing rotates the token atomically, so an old token cannot be reused.
- The refresh session slides for 30 days from the last rotation.
- `desktop_session.revoked_at` is checked on every session read and refresh.
- An admin or trainee that no longer exists (or is inactive) revokes the session.

## Security model

| Requirement                         | Implementation                                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| No embedded Google login            | `shell.openExternal` opens the system browser                                                                          |
| No client secret in the desktop app | The backend owns the Google Web client; the app only receives opaque app credentials after the handoff                 |
| No tokens in browser redirects      | The loopback receives only a one-time handoff code; tokens are fetched by the main process                             |
| No tokens in the renderer           | Preload exposes `window.desktop.auth` with state only; IPC handlers return `DesktopAuthState`, never tokens            |
| Restricted IPC                      | Every `auth:*` handler calls `assertTrustedSender` and checks the sender origin                                        |
| Safe external navigation            | The authorization URL must keep the configured backend origin and an `/api/auth/desktop/` path                         |
| Secure renderer settings            | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` (see `desktop/src/main/index.ts`)                  |
| Loopback hardening                  | Bind `127.0.0.1`, random port, only `GET /callback`, exact `Host` header, state equality, 5-minute timeout, single use |
| Code replay resistance              | One-time transaction claim, one-time handoff consumption, hashed codes, PKCE `S256`                                    |
| Persistent session protection       | Refresh token encrypted with Electron `safeStorage`; `basic_text` on Linux is treated as unavailable                   |
| Logout                              | Revokes the DB session, clears the renderer cookie and deletes the encrypted credential file                           |

The scope of the system-browser consent is still `profile email`, and the
backend keeps enforcing `ALLOWED_EMAIL_DOMAIN` and the provisioned
trainee/admin check. A Google account that is not provisioned can complete the
Google leg but gets `DOMAIN_NOT_PERMITTED` or `NOT_PROVISIONED` back through the
loopback.

### What the renderer receives

`DesktopAuthState`:

```ts
type DesktopAuthState = {
  status: 'loading' | 'pending' | 'authenticated' | 'unauthenticated';
  user: { id: string; email: string; name: string; role: 'trainee' | 'admin' } | null;
  error: DesktopAuthErrorCode | null;
  persistent: boolean;
};
```

`persistent` is `true` only when the refresh token was written with an OS
encryption key. When the OS backend is unavailable, the session works for the
current run but does not survive a restart.

### Desktop error codes

`CANCELLED`, `TIMEOUT`, `INVALID_STATE`, `INVALID_PKCE`, `INVALID_CODE`,
`EXPIRED`, `CODE_USED`, `AUTH_FAILED`, `DOMAIN_NOT_PERMITTED`,
`NOT_PROVISIONED`, `BACKEND_UNAVAILABLE`, `PORT_UNAVAILABLE`,
`SECURE_STORAGE_UNAVAILABLE`, `SESSION_EXPIRED`, `SESSION_REVOKED`.

Backend codes are translated by `desktop/src/main/auth/api.ts`; unknown codes
become `AUTH_FAILED` so internals do not leak into the UI.

## Google Cloud setup

Use the **same Web application OAuth client** as the web app. There is no
separate Desktop client and no client secret in the Electron build.

1. Open **Google Cloud Console → APIs & Services → Credentials**.
2. Edit the existing **OAuth 2.0 Client ID** of type **Web application**.
3. Under **Authorized redirect URIs**, add the desktop callback for every
   backend the app talks to:
   - local: `http://localhost:3000/api/auth/desktop/callback`
   - production: `https://vinkup-backend.onrender.com/api/auth/desktop/callback`
     (replace with the real API host if it differs)
4. Keep the existing web callback
   (`/api/auth/google/callback`) registered. Removing it breaks the web app.
5. Save. Google can take a few minutes to apply redirect URI changes.
6. If the OAuth consent screen is still in **Testing**, add every Google
   account used for manual verification as a test user.

The backend derives the desktop callback from `GOOGLE_CALLBACK_URL` when
`GOOGLE_DESKTOP_CALLBACK_URL` is unset: it replaces the path with
`/api/auth/desktop/callback`. Set `GOOGLE_DESKTOP_CALLBACK_URL` explicitly when
the API is behind a proxy and the derived URL would not match.

## Environment variables

Backend (`backend/.env`):

| Variable                      | Required | Default          | Purpose                                                            |
| ----------------------------- | -------- | ---------------- | ------------------------------------------------------------------ |
| `GOOGLE_DESKTOP_CALLBACK_URL` | No       | derived from web | Exact redirect URI registered in Google Cloud for the desktop flow |
| `DESKTOP_ACCESS_TOKEN_TTL`    | No       | `15m`            | Lifetime of the access JWT set as the renderer `auth_token` cookie |

Existing variables (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_CALLBACK_URL`, `ALLOWED_EMAIL_DOMAIN`, `FRONTEND_URL`, `JWT_SECRET`,
`JWT_EXPIRES_IN`, `DATABASE_URL`) are unchanged. The new tables are created by
the `20261111090000_add_desktop_auth` migration, so run the normal migration
step (`migrate deploy`, or `migrate dev` locally).

Desktop (environment of the Electron process):

| Variable              | Default                        | Purpose                                                                              |
| --------------------- | ------------------------------ | ------------------------------------------------------------------------------------ |
| `VINKUP_API_URL`      | `http://localhost:3000` in dev | Backend the app authenticates against; the Google redirect must be registered for it |
| `VINKUP_DESKTOP_PORT` | `43110`                        | Renderer origin; the `auth_token` cookie is set for this origin                      |

In development the app uses `http://localhost:3000`; production defaults to
`https://vinkup-backend.onrender.com`.

## Persistence

The refresh token is saved to
`<Electron userData>/auth/session.json` as a versioned, base64 `safeStorage`
ciphertext, written atomically with mode `0600` in a `0700` directory.

`safeStorage` uses the OS keychain (libsecret/gnome-keyring, Keychain, DPAPI).
On Linux, Chromium's `basic_text` backend only obfuscates the value, so the app
treats it as unavailable: the token stays in memory and `persistent` is
`false`. Install and unlock a keyring (for example `gnome-keyring` or
`kwallet`) to get persistent sessions.

The web app continues to use its 7-day `auth_token` JWT cookie; no desktop
session data affects it.

## Troubleshooting

| Symptom                                    | Likely cause / fix                                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Google shows `redirect_uri_mismatch`       | The exact `<backend>/api/auth/desktop/callback` URL is not registered on the Web client, or it uses a different host/scheme |
| `DOMAIN_NOT_PERMITTED` / `NOT_PROVISIONED` | The Google account is outside `ALLOWED_EMAIL_DOMAIN`, or is not in `admin`/`trainee`; seed or add the account               |
| Browser tab says sign-in failed            | The transaction expired (5 min), was already claimed, or the state did not match. Start again from the app                  |
| `PORT_UNAVAILABLE`                         | The loopback listener could not bind; retry, or check a firewall/security tool blocking loopback sockets                    |
| `BACKEND_UNAVAILABLE`                      | The app cannot reach `VINKUP_API_URL`; check the backend and proxy                                                          |
| Signed out after every restart             | `persistent` is `false`; unlock a supported OS keyring (Linux `basic_text` is intentionally rejected)                       |
| Signed out on every request                | The renderer origin changed (`VINKUP_DESKTOP_PORT`), so the cookie no longer matches; sign in again                         |
| Web login broke after a desktop change     | Confirm the desktop callback is a **second** redirect URI; the web callback and Passport `google` strategy must remain      |

## Verification status

Automated tests cover the desktop flow without contacting Google:

- backend integration tests exercise the transaction, state, PKCE, exchange,
  replay/expiry, session, refresh rotation and logout behaviour with a mocked
  Google strategy and an in-memory repository;
- desktop tests cover the manager lifecycle, loopback listener, secure storage
  and IPC sender guards;
- frontend tests cover `AuthProvider` in Electron mode.

**A real end-to-end Google sign-in from the packaged or development Electron
app was not performed as part of this change.** To verify manually:

1. Register the desktop callback URL in Google Cloud (see above), apply the
   migration, and start the backend (`npm run dev:backend`).
2. Restart the backend after changing `.env`.
3. Run `npm run dev:desktop`. Sign in, confirm the system browser (not an
   embedded window) opens, complete consent, and check the app shows the
   dashboard.
4. Restart the app: the session should restore if the OS keyring is available.
5. Sign out, and confirm `/api/auth/desktop/session` and `/refresh` reject the
   old credentials.
6. Repeat with a non-company Google account to see the domain error, and with
   the web app (`npm run dev:frontend`) to confirm web login still works.
