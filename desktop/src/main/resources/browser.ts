import { app, session, WebContentsView, type BrowserWindow } from 'electron';
import type {
  ResourcesAllowlist,
  ResourcesBrowserBounds,
  ResourcesBrowserErrorKind,
  ResourcesBrowserState,
  ResourcesFindResult,
} from '@itp/types';
import { hostFromUrl, isAllowedNavigationUrl, resolveNavigationInput } from './allowlist';
import path from 'node:path';

const PARTITION = 'persist:vinkup-resources';

/** Matches Chromium's zoom steps; three steps either side of 100%. */
const MIN_ZOOM_LEVEL = -3;
const MAX_ZOOM_LEVEL = 3;

export const EMPTY_BROWSER_STATE: ResourcesBrowserState = {
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

export interface ResourcesBrowserEvents {
  onState: (state: ResourcesBrowserState) => void;
  onFocusChange: (focused: boolean) => void;
  onFocusAddress: () => void;
  onOpenFind: () => void;
  onFindResult: (result: ResourcesFindResult) => void;
  onEscape: () => void;
  onActivity?: () => void;
  /** Any key, click, scroll or mouse move in the page, focused or not. */
  onInput?: () => void;
}

/**
 * Hosts the approved-sites browser as a `WebContentsView` layered over the
 * renderer. Every navigation — address bar, link, redirect or popup — is checked
 * here, in the main process, against the active allowlist.
 *
 * The view is hidden rather than destroyed when the student leaves the page, so
 * a long article keeps its scroll position and form state when they come back.
 */
export class ResourcesBrowser {
  private view: WebContentsView | null = null;
  private allowlist: ResourcesAllowlist;
  /** Loopback ports the app currently serves; everything else local is refused. */
  private localPorts: ReadonlySet<number> = new Set();
  private state: ResourcesBrowserState = { ...EMPTY_BROWSER_STATE };
  private lastBounds: ResourcesBrowserBounds | null = null;
  private attached = false;
  private viewFocused = false;
  private downloadHandler:
    | ((event: Electron.Event, item: Electron.DownloadItem, contents: Electron.WebContents) => void)
    | null = null;
  private lastFindQuery = '';

  constructor(
    private readonly window: BrowserWindow,
    allowlist: ResourcesAllowlist,
    private readonly events: ResourcesBrowserEvents
  ) {
    this.allowlist = allowlist;
    this.configureSession();
  }

  getState(): ResourcesBrowserState {
    return { ...this.state };
  }

  getAllowlist(): ResourcesAllowlist {
    return this.allowlist;
  }

  setAllowlist(allowlist: ResourcesAllowlist): void {
    this.allowlist = allowlist;
  }

  /** Updates which loopback ports the browser may open (see `LocalServicePorts`). */
  setLocalPorts(ports: ReadonlySet<number>): void {
    this.localPorts = ports;
  }

  open(bounds: ResourcesBrowserBounds): ResourcesBrowserState {
    this.attached = true;
    this.setBounds(bounds);
    this.applyVisibility();
    this.emit();
    return this.getState();
  }

  close(): void {
    this.attached = false;
    this.setViewFocused(false);
    this.view?.setVisible(false);
  }

  setBounds(bounds: ResourcesBrowserBounds): void {
    const zoomFactor = this.window.webContents.getZoomFactor();
    this.lastBounds = this.clampBounds({
      x: bounds.x * zoomFactor,
      y: bounds.y * zoomFactor,
      width: bounds.width * zoomFactor,
      height: bounds.height * zoomFactor,
    });
    this.applyBounds();

    if (this.lastBounds.width <= 0 || this.lastBounds.height <= 0) {
      this.view?.setVisible(false);
      this.setViewFocused(false);
      return;
    }
    this.applyVisibility();
  }

  /** Re-clamps after a window resize, before the renderer reports new bounds. */
  handleWindowResize(): void {
    if (!this.lastBounds) return;
    this.lastBounds = this.clampBounds(this.lastBounds);
    this.applyBounds();
  }

  home(): void {
    this.stopFind();
    this.view?.webContents.stop();
    this.update({
      isHome: true,
      isBlocked: false,
      blockedUrl: null,
      blockedHost: null,
      error: null,
      errorKind: null,
      isLoading: false,
    });
  }

  navigate(input: string): ResourcesBrowserState {
    const target = resolveNavigationInput(input, this.allowlist, this.localPorts);

    if (target.kind === 'invalid') {
      this.update({
        isBlocked: false,
        blockedUrl: null,
        blockedHost: null,
        error: target.message,
        errorKind: 'unknown',
        isLoading: false,
      });
      return this.getState();
    }

    if (target.kind === 'blocked') {
      this.block(target.url, target.host);
      return this.getState();
    }

    this.attached = true;
    const view = this.ensureView();
    this.stopFind();
    this.update({
      url: target.url,
      title: '',
      isHome: false,
      isBlocked: false,
      blockedUrl: null,
      blockedHost: null,
      error: null,
      errorKind: null,
      isLoading: true,
    });
    this.applyVisibility();
    void view.webContents.loadURL(target.url).catch(() => undefined);
    return this.getState();
  }

  goBack(): void {
    const history = this.view?.webContents.navigationHistory;
    if (!history?.canGoBack()) return;

    this.stopFind();
    this.update({
      isHome: false,
      isBlocked: false,
      blockedUrl: null,
      blockedHost: null,
      error: null,
      errorKind: null,
    });
    this.applyVisibility();
    history.goBack();
  }

  goForward(): void {
    const history = this.view?.webContents.navigationHistory;
    if (!history?.canGoForward()) return;

    this.stopFind();
    this.update({
      isHome: false,
      isBlocked: false,
      blockedUrl: null,
      blockedHost: null,
      error: null,
      errorKind: null,
    });
    this.applyVisibility();
    history.goForward();
  }

  reload(): void {
    if (this.view && !this.state.isBlocked && this.state.error === null && !this.state.isHome) {
      this.view.webContents.reload();
      return;
    }

    const url = this.state.blockedUrl ?? this.state.url;
    if (url !== '' && !this.state.isHome) void this.navigate(url);
  }

  stop(): void {
    this.view?.webContents.stop();
  }

  /** Starts (or restarts) an in-page search. Empty input clears highlights. */
  find(query: string): void {
    const contents = this.view?.webContents;
    const trimmed = query.trim();
    if (!contents || trimmed === '') {
      this.stopFind();
      return;
    }

    this.lastFindQuery = trimmed;
    contents.findInPage(trimmed, { findNext: false, forward: true });
  }

  /** Moves to the next or previous match of the current query. */
  findNext(forward: boolean): void {
    const contents = this.view?.webContents;
    if (!contents || this.lastFindQuery === '') return;
    contents.findInPage(this.lastFindQuery, { findNext: true, forward });
  }

  stopFind(): void {
    if (this.lastFindQuery === '') return;
    this.lastFindQuery = '';
    this.view?.webContents.stopFindInPage('clearSelection');
    this.events.onFindResult({ activeMatchOrdinal: 0, matches: 0, finalUpdate: true });
  }

  zoomIn(): void {
    this.changeZoom(1);
  }

  zoomOut(): void {
    this.changeZoom(-1);
  }

  zoomReset(): void {
    const contents = this.view?.webContents;
    if (!contents) return;
    contents.setZoomLevel(0);
    this.updateZoom();
  }

  dispose(): void {
    if (!this.view) return;

    this.attached = false;
    this.setViewFocused(false);
    if (!this.window.isDestroyed()) {
      this.window.contentView.removeChildView(this.view);
      this.view.setVisible(false);
    }
    if (!this.view.webContents.isDestroyed()) this.view.webContents.close();
    this.view = null;

    if (this.downloadHandler) {
      session.fromPartition(PARTITION).removeListener('will-download', this.downloadHandler);
      this.downloadHandler = null;
    }
  }

  private changeZoom(direction: 1 | -1): void {
    const contents = this.view?.webContents;
    if (!contents) return;

    const level = contents.getZoomLevel();
    const next = Math.min(MAX_ZOOM_LEVEL, Math.max(MIN_ZOOM_LEVEL, level + direction));
    if (next === level) return;

    contents.setZoomLevel(next);
    this.updateZoom();
  }

  private updateZoom(): void {
    const contents = this.view?.webContents;
    if (!contents) return;
    this.update({ zoom: Math.round(contents.getZoomFactor() * 100) });
  }

  private configureSession(): void {
    const resourcesSession = session.fromPartition(PARTITION);

    resourcesSession.setPermissionRequestHandler((_contents, _permission, callback) => {
      callback(false);
    });
    resourcesSession.setPermissionCheckHandler(() => false);

    resourcesSession.setUserAgent(
      app.userAgentFallback.replace(/\s(?:Electron|Vinkup|vinkup)\/\S+/g, '')
    );

    this.downloadHandler = (event, _item, contents) => {
      if (contents !== this.view?.webContents) return;
      event.preventDefault();
      this.update({
        error: 'Downloads are disabled in the Resources browser.',
        errorKind: 'unknown',
        isLoading: false,
      });
    };
    resourcesSession.on('will-download', this.downloadHandler);
  }

  private ensureView(): WebContentsView {
    if (this.view) return this.view;

    const view = new WebContentsView({
      webPreferences: {
        partition: PARTITION,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        webviewTag: false,
        spellcheck: false,
        preload: path.join(__dirname, '../../preload/resources-activity.js'),
      },
    });

    view.setBackgroundColor('#ffffff');
    view.setVisible(false);
    this.window.contentView.addChildView(view);
    this.view = view;
    this.wire(view);
    this.applyBounds();

    return view;
  }

  private wire(view: WebContentsView): void {
    const contents = view.webContents;

    contents.on('before-input-event', (event, input) => {
      // Any key press = still working.
      this.events.onActivity?.();
      if (this.handleShortcut(input)) event.preventDefault();
    });

    contents.on('focus', () => {
      this.setViewFocused(true);
      this.events.onActivity?.(); // click-into-page = still working
    });

    contents.on('blur', () => {
      this.setViewFocused(false);
    });

    contents.setWindowOpenHandler(({ url }) => {
      if (isAllowedNavigationUrl(url, this.allowlist, this.localPorts)) {
        this.loadInPlace(url);
      } else {
        this.block(url);
      }
      return { action: 'deny' };
    });

    contents.on('will-navigate', (event, url) => {
      if (isAllowedNavigationUrl(url, this.allowlist, this.localPorts)) return;
      event.preventDefault();
    });

    contents.on('will-redirect', (event, url) => {
      if (isAllowedNavigationUrl(url, this.allowlist, this.localPorts)) return;
      event.preventDefault();
    });

    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });

    contents.on('did-start-loading', () => {
      this.update({ isLoading: true });
    });

    contents.on('did-stop-loading', () => {
      this.update({ isLoading: false, ...this.historyFlags() });
    });

    contents.on('did-navigate', (_event, url) => {
      this.stopFind();
      this.update({
        url,
        title: contents.getTitle(),
        isHome: false,
        isBlocked: false,
        blockedUrl: null,
        blockedHost: null,
        error: null,
        errorKind: null,
        ...this.historyFlags(),
      });
      this.updateZoom();
    });

    contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (!isMainFrame) return;
      this.update({ url, ...this.historyFlags() });
    });

    contents.on('page-title-updated', (_event, title) => {
      this.update({ title });
    });

    contents.on('focus', () => {
      this.setViewFocused(true);
    });

    contents.on('blur', () => {
      this.setViewFocused(false);
    });

    contents.on('input-event', () => {
      this.events.onInput?.();
    });

    contents.on('found-in-page', (_event, result) => {
      this.events.onFindResult({
        activeMatchOrdinal: result.activeMatchOrdinal,
        matches: result.matches,
        finalUpdate: result.finalUpdate,
      });
    });

    contents.on('did-fail-load', (_event, errorCode, description, validatedUrl, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return;
      const host = hostFromUrl(validatedUrl) ?? hostFromUrl(this.state.url) ?? 'the page';
      this.update({
        isLoading: false,
        error: `Could not load ${host}. ${description}`,
        errorKind: errorKindForCode(errorCode),
        ...this.historyFlags(),
      });
    });

    contents.on('render-process-gone', () => {
      this.update({
        isLoading: false,
        error: 'The page closed unexpectedly. Reload to try again.',
        errorKind: 'unknown',
      });
    });

    // Inject a scroll/activity listener directly into the page after every
    // (same-document or full) load. This works even if the preload did not load
    // or its listeners got torn down by the page, and it *does* fire on
    // GitHub / MDN / most doc sites because `executeJavaScript` bypasses CSP
    // for the injected code itself.
    contents.on('did-finish-load', () => {
      void contents
        .executeJavaScript(
          `(() => {
            if (window.__vinkupScrollHooked) return;
            window.__vinkupScrollHooked = true;
            const THROTTLE = 1000;
            let last = 0;
            const report = () => {
              const now = Date.now();
              if (now - last < THROTTLE) return;
              last = now;
              console.log('__vinkup_activity__');
            };
            ['scroll','wheel','mousemove','keydown','pointerdown','touchstart'].forEach((e) =>
              window.addEventListener(e, report, { passive: true, capture: true })
            );
          })();`,
          true // userGesture
        )
        .catch(() => undefined);
    });

    contents.on('console-message', (...args: unknown[]) => {
      // Electron 29: (event, level, message, line, sourceId)
      // Electron 30+: (event, details: { message, level, lineNumber, sourceId, ... })
      const SENTINEL = '__vinkup_activity__';

      const legacyMessage = args[2];
      if (legacyMessage === SENTINEL) {
        this.events.onActivity?.();
        return;
      }

      const details = args[1];
      if (details !== null && typeof details === 'object') {
        const detailsMessage = (details as { message?: unknown }).message;
        if (detailsMessage === SENTINEL) {
          this.events.onActivity?.();
        }
      }
    });
  }

  /** Returns true when the shortcut was consumed. */
  private handleShortcut(input: Electron.Input): boolean {
    const key = input.key.toLowerCase();
    const command = input.control || input.meta;
    const isF5 = key === 'f5';

    if (input.alt && (key === 'left' || key === 'right')) {
      if (key === 'left') this.goBack();
      else this.goForward();
      return true;
    }

    if (isF5 || (command && key === 'r')) {
      this.reload();
      return true;
    }

    if (key === 'escape') {
      this.events.onEscape();
      return true;
    }

    if (!command) return false;

    if (key === 'l') {
      this.events.onFocusAddress();
      return true;
    }

    if (key === 'f') {
      this.events.onOpenFind();
      return true;
    }

    if (key === '+' || key === '=') {
      this.zoomIn();
      return true;
    }

    if (key === '-') {
      this.zoomOut();
      return true;
    }

    if (key === '0') {
      this.zoomReset();
      return true;
    }

    return false;
  }

  private loadInPlace(url: string): void {
    this.attached = true;
    const view = this.ensureView();
    this.stopFind();
    this.update({
      url,
      title: '',
      isHome: false,
      isBlocked: false,
      blockedUrl: null,
      blockedHost: null,
      error: null,
      errorKind: null,
      isLoading: true,
    });
    this.applyVisibility();
    void view.webContents.loadURL(url).catch(() => undefined);
  }

  private block(rawUrl: string, host = hostFromUrl(rawUrl) ?? rawUrl): void {
    if (this.state.isBlocked && this.state.blockedUrl === rawUrl) return;

    this.stopFind();
    this.update({
      isBlocked: true,
      blockedUrl: rawUrl,
      blockedHost: host,
      error: null,
      errorKind: null,
      isHome: false,
      isLoading: false,
    });
  }

  private update(patch: Partial<ResourcesBrowserState>): void {
    this.state = { ...this.state, ...patch };
    this.applyVisibility();
    this.emit();
  }

  private emit(): void {
    if (this.window.isDestroyed()) return;
    this.events.onState(this.getState());
  }

  private applyVisibility(): void {
    if (!this.view) return;

    const visible =
      this.attached &&
      !this.state.isHome &&
      !this.state.isBlocked &&
      this.state.error === null &&
      this.state.url !== '' &&
      this.lastBounds !== null &&
      this.lastBounds.width > 0 &&
      this.lastBounds.height > 0;

    this.view.setVisible(visible);
    if (!visible) this.setViewFocused(false);
  }

  private setViewFocused(focused: boolean): void {
    if (this.viewFocused === focused) return;
    this.viewFocused = focused;
    this.events.onFocusChange(focused);
  }

  private applyBounds(): void {
    if (!this.view || !this.lastBounds) return;
    this.view.setBounds(this.lastBounds);
  }

  private clampBounds(bounds: ResourcesBrowserBounds): ResourcesBrowserBounds {
    const [contentWidth, contentHeight] = this.window.getContentSize();
    const x = Math.min(Math.max(Math.round(bounds.x), 0), contentWidth);
    const y = Math.min(Math.max(Math.round(bounds.y), 0), contentHeight);
    const width = Math.min(Math.max(Math.round(bounds.width), 0), contentWidth - x);
    const height = Math.min(Math.max(Math.round(bounds.height), 0), contentHeight - y);
    return { x, y, width, height };
  }

  private historyFlags(): Pick<ResourcesBrowserState, 'canGoBack' | 'canGoForward'> {
    const history = this.view?.webContents.navigationHistory;
    return {
      canGoBack: history?.canGoBack() ?? false,
      canGoForward: history?.canGoForward() ?? false,
    };
  }
}

function errorKindForCode(code: number): ResourcesBrowserErrorKind {
  if (code === -106) return 'offline';
  if (code === -105 || code === -109) return 'unreachable';
  if (code === -102 || code === -118 || code === -7) return 'refused';
  return 'unknown';
}
