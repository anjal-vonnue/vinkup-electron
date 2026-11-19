/**
 * Temporary pages shown in the system browser when the Electron OAuth leg ends.
 *
 * They are served by the loopback listener with `default-src 'none'` and inline
 * styles only, so everything is embedded here: no fonts, images or scripts are
 * fetched. The content is deliberately generic — no handoff code, OAuth error
 * code or other internal detail is ever rendered into these pages.
 */

const PAGE_STYLES = `
  :root {
    color-scheme: dark;
    --page-bg: #0a0d16;
    --card-bg: #181b28;
    --card-border: #2c3145;
    --text-primary: #f1f5f9;
    --text-secondary: #aab3c6;
    --text-muted: #8891a8;
    --purple: #a855f7;
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
    background:
      radial-gradient(circle at 50% 0%, rgba(168, 85, 247, 0.16), transparent 55%),
      var(--page-bg);
    color: var(--text-primary);
    font-family: 'Manrope', system-ui, -apple-system, 'Segoe UI', sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  .card {
    width: 100%;
    max-width: 420px;
    padding: 36px 32px 28px;
    text-align: center;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 16px;
    box-shadow: 0 24px 48px -16px rgba(0, 0, 0, 0.65);
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 28px;
    font-size: 18px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .brand-mark {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 8px;
    background: var(--purple);
    color: #ffffff;
  }

  .brand-mark svg { width: 16px; height: 16px; }
  .brand-up { color: var(--purple); }

  .state-icon {
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    margin: 0 auto 20px;
    border-radius: 50%;
  }

  .state-icon svg { width: 30px; height: 30px; }

  .success .state-icon {
    color: #34d399;
    background: rgba(16, 185, 129, 0.12);
    border: 1px solid rgba(16, 185, 129, 0.35);
  }

  .failure .state-icon {
    color: #f87171;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.35);
  }

  h1 {
    margin: 0 0 10px;
    font-size: 20px;
    font-weight: 700;
    line-height: 1.35;
    letter-spacing: -0.02em;
  }

  .message {
    margin: 0;
    font-size: 14px;
    line-height: 1.6;
    color: var(--text-secondary);
  }

  .hint {
    margin: 24px 0 0;
    padding-top: 18px;
    border-top: 1px solid var(--card-border);
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-muted);
  }

  @media (max-width: 420px) {
    body { padding: 16px; }
    .card { padding: 28px 20px 24px; }
    .brand { margin-bottom: 20px; }
  }
`;

const BRAND = `
  <div class="brand" aria-label="VinkUp">
    <span class="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
           stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 15 12 8l7 7" />
      </svg>
    </span>
    <span>Vink<span class="brand-up">Up</span></span>
  </div>`;

function renderPage(options: {
  state: 'success' | 'failure';
  title: string;
  icon: string;
  heading: string;
  message: string;
  hint: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${options.title} · Vinkup</title>
  <style>${PAGE_STYLES}</style>
</head>
<body data-auth-result="${options.state}">
  <main class="card ${options.state}">
    ${BRAND}
    <div class="state-icon" aria-hidden="true">${options.icon}</div>
    <h1>${options.heading}</h1>
    <p class="message">${options.message}</p>
    <p class="hint">${options.hint}</p>
  </main>
</body>
</html>`;
}

export const SUCCESS_HTML = renderPage({
  state: 'success',
  title: 'Sign-in complete',
  heading: 'Sign-in complete',
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
             stroke-linecap="round" stroke-linejoin="round">
           <path d="m5 12.5 4.5 4.5L19 7.5" />
         </svg>`,
  message: 'You’re all set. Return to the Vinkup desktop app to continue — you can close this tab.',
  hint: 'This browser window is safe to close.',
});

export const FAILURE_HTML = renderPage({
  state: 'failure',
  title: 'Sign-in failed',
  heading: 'Sign-in could not be completed',
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
             stroke-linecap="round" stroke-linejoin="round">
           <path d="M12 7.5v6" />
           <path d="M12 17h.01" />
         </svg>`,
  message: 'We couldn’t finish signing you in. Return to Vinkup and try again.',
  hint: 'Close this tab and retry from the desktop app.',
});
