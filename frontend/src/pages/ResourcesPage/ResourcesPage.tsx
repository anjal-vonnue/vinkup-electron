import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import type { ResourcesAllowlist, ResourcesBrowserState } from '@itp/types';
import Header from '../../components/Header';
import styles from './ResourcesPage.module.css';

const INITIAL_STATE: ResourcesBrowserState = {
  url: '',
  title: '',
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  isHome: true,
  isBlocked: false,
  blockedUrl: null,
  blockedHost: null,
  error: null,
};

function BackIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M12.5 4.5 7 10l5.5 5.5" />
    </svg>
  );
}

function ForwardIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7.5 4.5 13 10l-5.5 5.5" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="3" width="5.5" height="5.5" rx="1.2" />
      <rect x="11.5" y="3" width="5.5" height="5.5" rx="1.2" />
      <rect x="3" y="11.5" width="5.5" height="5.5" rx="1.2" />
      <rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1.2" />
    </svg>
  );
}

function ReloadIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M15.5 8.2A5.8 5.8 0 1 0 16 11" />
      <path d="M16 4.5v4h-4" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m6 6 8 8M14 6l-8 8" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="4.5" y="9" width="11" height="7.5" rx="1.6" />
      <path d="M7 9V6.7a3 3 0 0 1 6 0V9" />
    </svg>
  );
}

function addressFor(state: ResourcesBrowserState): string {
  if (state.isBlocked && state.blockedUrl) return state.blockedUrl;
  if (state.isHome) return '';
  return state.url;
}

export default function ResourcesPage() {
  const resources = window.desktop?.resources ?? null;
  const viewportRef = useRef<HTMLDivElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);

  const [browser, setBrowser] = useState<ResourcesBrowserState>(INITIAL_STATE);
  const [allowlist, setAllowlist] = useState<ResourcesAllowlist | null>(null);
  // Kept only while the student is editing; otherwise the address follows the
  // browser state, so link clicks and redirects update it automatically.
  const [draft, setDraft] = useState<string | null>(null);

  const address = draft ?? addressFor(browser);

  useEffect(() => {
    if (!resources) return;

    let active = true;
    void resources.getState().then((state) => {
      if (active) setBrowser(state);
    });
    void resources.getAllowlist().then((list) => {
      if (active) setAllowlist(list);
    });

    const stopListening = resources.onChange((state) => setBrowser(state));
    const stopFocus = resources.onFocusAddress(() => {
      addressRef.current?.focus();
      addressRef.current?.select();
    });

    return () => {
      active = false;
      stopListening();
      stopFocus();
    };
  }, [resources]);

  // The embedded browser is a native view layered over the page, so it needs
  // the live position of this placeholder on every layout change.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!resources || !viewport) return;

    const measure = () => {
      const rect = viewport.getBoundingClientRect();
      return {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };

    let frame = 0;
    const sync = () => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        void resources.setBounds(measure());
      });
    };

    void resources.open(measure());

    const observer = new ResizeObserver(sync);
    observer.observe(viewport);
    window.addEventListener('resize', sync);

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', sync);
      void resources.close();
    };
  }, [resources]);

  // Ctrl+L works while the renderer has focus; the main process forwards the
  // same shortcut when the embedded page has focus.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'l') return;
      event.preventDefault();
      addressRef.current?.focus();
      addressRef.current?.select();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!resources || address.trim() === '') return;
      void resources.navigate(address.trim()).then((state) => {
        setDraft(null);
        setBrowser(state);
      });
    },
    [address, resources]
  );

  const openSite = useCallback(
    (url: string) => {
      if (!resources) return;
      setDraft(null);
      void resources.navigate(url).then(setBrowser);
    },
    [resources]
  );

  const goHome = useCallback(() => {
    if (!resources) return;
    setDraft(null);
    void resources.home();
  }, [resources]);

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.body}>
        {!resources ? (
          <section className={styles.notice}>
            <span className={styles.noticeBadge} aria-hidden="true">
              <LockIcon />
            </span>
            <h1 className={styles.noticeTitle}>Resources</h1>
            <p className={styles.noticeText}>
              The approved-sites browser is only available in the VinkUp desktop app.
            </p>
            <p className={styles.noticeHint}>
              Open VinkUp on your laptop to browse the approved documentation.
            </p>
          </section>
        ) : (
          <>
            <div className={styles.toolbar}>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => {
                  setDraft(null);
                  void resources.goBack();
                }}
                disabled={!browser.canGoBack}
                aria-label="Back"
                title="Back"
              >
                <BackIcon />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => {
                  setDraft(null);
                  void resources.goForward();
                }}
                disabled={!browser.canGoForward}
                aria-label="Forward"
                title="Forward"
              >
                <ForwardIcon />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => {
                  setDraft(null);
                  if (browser.isLoading) void resources.stop();
                  else void resources.reload();
                }}
                disabled={browser.isHome}
                aria-label={browser.isLoading ? 'Stop loading' : 'Reload'}
                title={browser.isLoading ? 'Stop loading' : 'Reload'}
              >
                {browser.isLoading ? <StopIcon /> : <ReloadIcon />}
              </button>

              <form className={styles.addressForm} onSubmit={handleSubmit}>
                <span className={styles.addressIcon} aria-hidden="true">
                  <LockIcon />
                </span>
                <input
                  ref={addressRef}
                  className={styles.addressInput}
                  value={address}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Enter a web address"
                  aria-label="Enter a web address"
                  spellCheck={false}
                  autoComplete="off"
                />
                {browser.isLoading ? (
                  <span className={styles.spinner} aria-label="Loading" role="status" />
                ) : null}
              </form>

              <button
                type="button"
                className={styles.iconButton}
                onClick={goHome}
                aria-label="Approved sites"
                title="Approved sites"
              >
                <HomeIcon />
              </button>
            </div>

            <div className={styles.viewport} ref={viewportRef}>
              {browser.isBlocked ? (
                <section className={styles.notice} role="alert">
                  <span
                    className={`${styles.noticeBadge} ${styles.noticeBadgeError}`}
                    aria-hidden="true"
                  >
                    <LockIcon />
                  </span>
                  <h2 className={styles.noticeTitle}>This site is blocked</h2>
                  <p className={styles.noticeText}>
                    <strong>{browser.blockedHost ?? 'That address'}</strong> is not on the approved
                    resources list, so it was not opened.
                  </p>
                  <p className={styles.noticeHint}>
                    Ask your mentor if this site should be added to the approved list.
                  </p>
                  <div className={styles.noticeActions}>
                    <button type="button" className={styles.primaryButton} onClick={goHome}>
                      Browse approved sites
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => {
                        setDraft(null);
                        void resources.goBack();
                      }}
                      disabled={!browser.canGoBack}
                    >
                      Go back
                    </button>
                  </div>
                </section>
              ) : browser.error !== null ? (
                <section className={styles.notice} role="alert">
                  <span
                    className={`${styles.noticeBadge} ${styles.noticeBadgeError}`}
                    aria-hidden="true"
                  >
                    <LockIcon />
                  </span>
                  <h2 className={styles.noticeTitle}>This page could not load</h2>
                  <p className={styles.noticeText}>{browser.error}</p>
                  <div className={styles.noticeActions}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => {
                        setDraft(null);
                        void resources.reload();
                      }}
                    >
                      Try again
                    </button>
                    <button type="button" className={styles.secondaryButton} onClick={goHome}>
                      Approved sites
                    </button>
                  </div>
                </section>
              ) : (
                <section className={styles.start} aria-label="Approved sites">
                  <header className={styles.startHeader}>
                    <h1 className={styles.title}>Resources</h1>
                    <p className={styles.subtitle}>
                      Approved documentation and practice sites. Anything outside this list is
                      blocked.
                    </p>
                  </header>

                  {allowlist ? (
                    <ul className={styles.sites}>
                      {allowlist.domains.map((domain) => (
                        <li key={domain}>
                          <button
                            type="button"
                            className={styles.site}
                            onClick={() => openSite(domain)}
                          >
                            <span className={styles.siteName}>{domain}</span>
                            <span className={styles.siteHint} aria-hidden="true">
                              Open
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.muted}>Loading approved sites…</p>
                  )}

                  <p className={styles.footnote}>
                    Type a web address above and press Enter. Ctrl+L focuses the address bar.
                  </p>
                </section>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
