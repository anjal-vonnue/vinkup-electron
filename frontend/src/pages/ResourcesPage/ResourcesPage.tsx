import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type {
  ResourcesAllowlist,
  ResourcesBrowserErrorKind,
  ResourcesBrowserState,
  ResourcesFindResult,
} from '@itp/types';
import Header from '../../components/Header';
import styles from './ResourcesPage.module.css';

const LAST_PAGE_KEY = 'vinkup.resources.lastPage';

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
  errorKind: null,
  zoom: 100,
};

const EMPTY_FIND: ResourcesFindResult = {
  activeMatchOrdinal: 0,
  matches: 0,
  finalUpdate: true,
};

const ERROR_COPY: Record<ResourcesBrowserErrorKind, { title: string; hint: string }> = {
  offline: {
    title: 'You appear to be offline',
    hint: 'Check your internet connection, then try again.',
  },
  unreachable: {
    title: 'This site cannot be reached',
    hint: 'The site may be down or its address may have changed.',
  },
  refused: {
    title: 'The site refused the connection',
    hint: 'It may be busy or blocking the request. Try again in a moment.',
  },
  unknown: {
    title: 'This page could not load',
    hint: 'Something went wrong while loading the page.',
  },
};

interface LastPage {
  url: string;
  title: string;
}

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

function hostFor(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function isApprovedPage(url: string, allowlist: ResourcesAllowlist | null): boolean {
  if (!allowlist) return false;

  try {
    const host = new URL(url).hostname.toLowerCase();
    return allowlist.domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function readLastPage(): LastPage | null {
  try {
    const raw = localStorage.getItem(LAST_PAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;

    const record = parsed as Record<string, unknown>;
    if (typeof record.url !== 'string' || record.url === '') return null;

    return {
      url: record.url,
      title: typeof record.title === 'string' ? record.title : '',
    };
  } catch {
    return null;
  }
}

export default function ResourcesPage() {
  const resources = window.desktop?.resources ?? null;
  const viewportRef = useRef<HTMLDivElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const noticeHeadingRef = useRef<HTMLHeadingElement>(null);
  const browserRef = useRef<ResourcesBrowserState>(INITIAL_STATE);
  const findOpenRef = useRef(false);
  const copyTimerRef = useRef<number | null>(null);

  const [browser, setBrowser] = useState<ResourcesBrowserState>(INITIAL_STATE);
  const [allowlist, setAllowlist] = useState<ResourcesAllowlist | null>(null);
  // Kept only while the student is editing; otherwise the address follows the
  // browser state, so link clicks and redirects update it automatically.
  const [draft, setDraft] = useState<string | null>(null);
  const [resume, setResume] = useState<LastPage | null>(() => readLastPage());
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findResult, setFindResult] = useState<ResourcesFindResult>(EMPTY_FIND);
  const [copyStatus, setCopyStatus] = useState<'address' | 'request' | null>(null);

  const address = draft ?? addressFor(browser);

  useEffect(() => {
    browserRef.current = browser;
  }, [browser]);

  useEffect(() => {
    findOpenRef.current = findOpen;
  }, [findOpen]);

  // The resume card reflects the last page that actually opened, not a blocked
  // or failed one. Keeping the write here avoids a second effect pass.
  const applyBrowserState = useCallback(
    (state: ResourcesBrowserState) => {
      setBrowser(state);

      if (state.isHome || state.isBlocked || state.error !== null) {
        if (findOpenRef.current) void resources?.stopFind();
        setFindOpen(false);
        setFindQuery('');
        setFindResult(EMPTY_FIND);
      }

      if (state.isHome || state.isBlocked || state.error !== null || state.url === '') return;

      const page: LastPage = { url: state.url, title: state.title };
      setResume(page);
      try {
        localStorage.setItem(LAST_PAGE_KEY, JSON.stringify(page));
      } catch {
        // Storage can be unavailable; resuming is a convenience, not a requirement.
      }
    },
    [resources]
  );

  const closeFind = useCallback(() => {
    setFindOpen(false);
    setFindQuery('');
    setFindResult(EMPTY_FIND);
    void resources?.stopFind();
  }, [resources]);

  const openFind = useCallback(() => {
    const state = browserRef.current;
    if (state.isHome || state.isBlocked || state.error !== null) return;

    setFindOpen(true);
    requestAnimationFrame(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    });
  }, []);

  const handleEscape = useCallback(() => {
    if (findOpenRef.current) {
      closeFind();
      return;
    }

    if (browserRef.current.isLoading) void resources?.stop();
  }, [closeFind, resources]);

  useEffect(() => {
    if (!resources) return;

    let active = true;
    void resources.getState().then((state) => {
      if (active) applyBrowserState(state);
    });
    void resources.getAllowlist().then((list) => {
      if (active) setAllowlist(list);
    });

    const stopListening = resources.onChange(applyBrowserState);
    const stopFocus = resources.onFocusAddress(() => {
      addressRef.current?.focus();
      addressRef.current?.select();
    });
    const stopFindResult = resources.onFindResult(setFindResult);
    const stopOpenFind = resources.onOpenFind(openFind);
    const stopEscape = resources.onEscape(handleEscape);

    return () => {
      active = false;
      stopListening();
      stopFocus();
      stopFindResult();
      stopOpenFind();
      stopEscape();
    };
  }, [applyBrowserState, handleEscape, openFind, resources]);

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

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  // Shortcuts work while the renderer has focus; the main process forwards the
  // same keys when the embedded page has focus.
  useEffect(() => {
    if (!resources) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (command && key === 'l') {
        event.preventDefault();
        addressRef.current?.focus();
        addressRef.current?.select();
        return;
      }

      if (command && key === 'f') {
        event.preventDefault();
        openFind();
        return;
      }

      if (key === 'escape') {
        if (findOpenRef.current) {
          event.preventDefault();
          closeFind();
        } else if (browserRef.current.isLoading) {
          event.preventDefault();
          void resources.stop();
        }
        return;
      }

      if (key === 'f5' || (command && key === 'r')) {
        event.preventDefault();
        void resources.reload();
        return;
      }

      if (event.altKey && key === 'arrowleft') {
        event.preventDefault();
        void resources.goBack();
        return;
      }

      if (event.altKey && key === 'arrowright') {
        event.preventDefault();
        void resources.goForward();
        return;
      }

      if (command && (key === '+' || key === '=')) {
        event.preventDefault();
        void resources.zoomIn();
        return;
      }

      if (command && key === '-') {
        event.preventDefault();
        void resources.zoomOut();
        return;
      }

      if (command && key === '0') {
        event.preventDefault();
        void resources.zoomReset();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeFind, openFind, resources]);

  // Move focus to the panel heading when a navigation is rejected or fails so
  // keyboard and screen-reader users are not left on the address bar.
  useEffect(() => {
    if (browser.isBlocked || browser.error !== null) noticeHeadingRef.current?.focus();
  }, [browser.isBlocked, browser.error]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!resources || address.trim() === '') return;
      void resources.navigate(address.trim()).then((state) => {
        setDraft(null);
        applyBrowserState(state);
      });
    },
    [address, applyBrowserState, resources]
  );

  const openSite = useCallback(
    (url: string) => {
      if (!resources) return;
      setDraft(null);
      void resources.navigate(url).then(applyBrowserState);
    },
    [applyBrowserState, resources]
  );

  const goHome = useCallback(() => {
    if (!resources) return;
    setDraft(null);
    closeFind();
    void resources.home();
  }, [closeFind, resources]);

  const dismissResume = useCallback(() => {
    setResume(null);
    try {
      localStorage.removeItem(LAST_PAGE_KEY);
    } catch {
      // Ignore unavailable storage.
    }
  }, []);

  const handleFindChange = useCallback(
    (value: string) => {
      setFindQuery(value);
      setFindResult(EMPTY_FIND);
      if (!resources) return;
      if (value.trim() === '') void resources.stopFind();
      else void resources.find(value);
    },
    [resources]
  );

  const handleFindKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void resources?.findNext(!event.shiftKey);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeFind();
      }
    },
    [closeFind, resources]
  );

  const copyText = useCallback(async (text: string, kind: 'address' | 'request') => {
    if (!navigator.clipboard) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(kind);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopyStatus(null), 2000);
    } catch {
      setCopyStatus(null);
    }
  }, []);

  const showResume = resume !== null && isApprovedPage(resume.url, allowlist);
  const errorCopy = ERROR_COPY[browser.errorKind ?? 'unknown'];
  const pageTitle = browser.title || hostFor(browser.url) || 'Loading…';

  const announcement = browser.isBlocked
    ? `Blocked ${browser.blockedHost ?? 'that address'}. It is not on the approved resources list.`
    : browser.error !== null
      ? `${errorCopy.title}. ${browser.error}`
      : browser.isLoading
        ? 'Loading page…'
        : !browser.isHome && browser.url !== ''
          ? `Loaded ${browser.title || hostFor(browser.url)}.`
          : '';

  const requestAccessText = `Hi mentor, could you add ${browser.blockedHost ?? 'this site'} to the approved Resources list? I tried to open ${browser.blockedUrl ?? 'the address'}.`;

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
            <p className={styles.srOnly} role="status" aria-live="polite">
              {announcement}
            </p>

            <div className={styles.toolbar}>
              <div className={styles.toolbarRow}>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => {
                    setDraft(null);
                    void resources.goBack();
                  }}
                  disabled={!browser.canGoBack}
                  aria-label="Back"
                  title="Back (Alt+Left)"
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
                  title="Forward (Alt+Right)"
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
                  title={browser.isLoading ? 'Stop loading (Esc)' : 'Reload (Ctrl+R)'}
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

                {!browser.isHome && !browser.isBlocked && browser.error === null ? (
                  <div className={styles.zoomGroup} role="group" aria-label="Page zoom">
                    <button
                      type="button"
                      className={styles.zoomButton}
                      onClick={() => void resources.zoomOut()}
                      aria-label="Zoom out"
                      title="Zoom out (Ctrl+-)"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      className={styles.zoomValue}
                      onClick={() => void resources.zoomReset()}
                      aria-label={`Reset zoom, currently ${browser.zoom}%`}
                      title="Reset zoom (Ctrl+0)"
                    >
                      {browser.zoom}%
                    </button>
                    <button
                      type="button"
                      className={styles.zoomButton}
                      onClick={() => void resources.zoomIn()}
                      aria-label="Zoom in"
                      title="Zoom in (Ctrl++)"
                    >
                      +
                    </button>
                  </div>
                ) : null}

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

              {!browser.isHome && !browser.isBlocked && browser.error === null ? (
                <div className={styles.pageStatus}>
                  <span className={styles.pageTitle} title={browser.title || browser.url}>
                    {pageTitle}
                  </span>
                  {browser.zoom !== 100 ? (
                    <span className={styles.zoomBadge}>{browser.zoom}%</span>
                  ) : null}
                </div>
              ) : null}

              {browser.isLoading && !browser.isHome ? (
                <div
                  className={styles.progress}
                  role="progressbar"
                  aria-label="Loading page"
                  aria-valuetext="Loading"
                />
              ) : null}
            </div>

            {findOpen && !browser.isHome && !browser.isBlocked && browser.error === null ? (
              <div className={styles.findBar} role="search" aria-label="Find in page bar">
                <input
                  ref={findInputRef}
                  className={styles.findInput}
                  value={findQuery}
                  onChange={(event) => handleFindChange(event.target.value)}
                  onKeyDown={handleFindKeyDown}
                  placeholder="Find in page"
                  aria-label="Find in page"
                  spellCheck={false}
                />
                <span className={styles.findCount} aria-live="polite">
                  {findQuery.trim() === ''
                    ? ''
                    : findResult.matches === 0
                      ? 'No matches'
                      : `${findResult.activeMatchOrdinal} / ${findResult.matches}`}
                </span>
                <button
                  type="button"
                  className={styles.findButton}
                  onClick={() => void resources.findNext(false)}
                  disabled={findResult.matches === 0}
                  aria-label="Previous match"
                  title="Previous match (Shift+Enter)"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.findButton}
                  onClick={() => void resources.findNext(true)}
                  disabled={findResult.matches === 0}
                  aria-label="Next match"
                  title="Next match (Enter)"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={styles.findButton}
                  onClick={closeFind}
                  aria-label="Close find bar"
                  title="Close (Esc)"
                >
                  ×
                </button>
              </div>
            ) : null}

            <div className={styles.viewport} ref={viewportRef} aria-busy={browser.isLoading}>
              {browser.isBlocked ? (
                <section className={styles.notice} role="alert">
                  <span
                    className={`${styles.noticeBadge} ${styles.noticeBadgeError}`}
                    aria-hidden="true"
                  >
                    <LockIcon />
                  </span>
                  <h2 ref={noticeHeadingRef} tabIndex={-1} className={styles.noticeTitle}>
                    This site is blocked
                  </h2>
                  <p className={styles.noticeText}>
                    <strong>{browser.blockedHost ?? 'That address'}</strong> is not on the approved
                    resources list, so it was not opened.
                  </p>
                  {browser.blockedUrl ? (
                    <code className={styles.urlCode}>{browser.blockedUrl}</code>
                  ) : null}
                  <div className={styles.noticeActions}>
                    <button type="button" className={styles.primaryButton} onClick={goHome}>
                      Browse approved sites
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => void copyText(browser.blockedUrl ?? '', 'address')}
                      disabled={!browser.blockedUrl}
                    >
                      {copyStatus === 'address' ? 'Address copied' : 'Copy address'}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => void copyText(requestAccessText, 'request')}
                    >
                      {copyStatus === 'request' ? 'Request copied' : 'Copy access request'}
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
                  <p className={styles.noticeHint}>
                    Ask your mentor to add this site to the approved list.
                  </p>
                </section>
              ) : browser.error !== null ? (
                <section className={styles.notice} role="alert">
                  <span
                    className={`${styles.noticeBadge} ${styles.noticeBadgeError}`}
                    aria-hidden="true"
                  >
                    <LockIcon />
                  </span>
                  <h2 ref={noticeHeadingRef} tabIndex={-1} className={styles.noticeTitle}>
                    {errorCopy.title}
                  </h2>
                  <p className={styles.noticeText}>{errorCopy.hint}</p>
                  <p className={styles.noticeHint}>{browser.error}</p>
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

                  {showResume && resume ? (
                    <section className={styles.resumeCard} aria-labelledby="resources-resume-title">
                      <div className={styles.resumeText}>
                        <p className={styles.resumeLabel}>Continue where you left off</p>
                        <h2 id="resources-resume-title" className={styles.resumeTitle}>
                          {resume.title || hostFor(resume.url)}
                        </h2>
                        <p className={styles.resumeUrl}>{resume.url}</p>
                      </div>
                      <div className={styles.resumeActions}>
                        <button
                          type="button"
                          className={styles.primaryButton}
                          onClick={() => openSite(resume.url)}
                        >
                          Continue reading
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={dismissResume}
                        >
                          Dismiss
                        </button>
                      </div>
                    </section>
                  ) : null}

                  {allowlist ? (
                    <div className={styles.categories}>
                      {allowlist.categories.map((category) => (
                        <section
                          key={category.id}
                          className={styles.category}
                          aria-labelledby={`resources-category-${category.id}`}
                        >
                          <h2
                            id={`resources-category-${category.id}`}
                            className={styles.categoryTitle}
                          >
                            {category.label}
                          </h2>
                          <ul className={styles.sites}>
                            {category.domains.map((domain) => {
                              const description = allowlist.descriptions[domain];
                              return (
                                <li key={domain}>
                                  <button
                                    type="button"
                                    className={styles.site}
                                    onClick={() => openSite(domain)}
                                  >
                                    <span className={styles.siteText}>
                                      <span className={styles.siteName}>{domain}</span>
                                      {description ? (
                                        <span className={styles.siteDescription}>
                                          {description}
                                        </span>
                                      ) : null}
                                    </span>
                                    <span className={styles.siteHint} aria-hidden="true">
                                      Open
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <p className={styles.muted}>Loading approved sites…</p>
                  )}

                  <p className={styles.footnote}>
                    Type a web address above and press Enter. Ctrl+L focuses the address bar, Ctrl+F
                    finds text on a page.
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
