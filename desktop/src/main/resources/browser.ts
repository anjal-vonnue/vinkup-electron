import { app, session, WebContentsView, type BrowserWindow } from 'electron';
import type { ResourcesAllowlist, ResourcesBrowserBounds, ResourcesBrowserState } from '@itp/types';
import { hostFromUrl, isAllowedNavigationUrl, resolveNavigationInput } from './allowlist';

const PARTITION = 'persist:vinkup-resources';

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
};

export interface ResourcesBrowserEvents {
  onState: (state: ResourcesBrowserState) => void;
  onFocusAddress: () => void;
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
  private state: ResourcesBrowserState = { ...EMPTY_BROWSER_STATE };
  private lastBounds: ResourcesBrowserBounds | null = null;
  private attached = false;
  private downloadHandler: ((event: Electron.Event) => void) | null = null;

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

  open(bounds: ResourcesBrowserBounds): ResourcesBrowserState {
    this.attached = true;
    this.setBounds(bounds);
    this.applyVisibility();
    this.emit();
    return this.getState();
  }

  close(): void {
    this.attached = false;
    this.view?.setVisible(false);
  }

  setBounds(bounds: ResourcesBrowserBounds): void {
    this.lastBounds = this.clampBounds(bounds);
    this.applyBounds();

    if (this.lastBounds.width <= 0 || this.lastBounds.height <= 0) {
      this.view?.setVisible(false);
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
    this.view?.webContents.stop();
    this.update({
      isHome: true,
      isBlocked: false,
      blockedUrl: null,
      blockedHost: null,
      error: null,
      isLoading: false,
    });
  }

  navigate(input: string): ResourcesBrowserState {
    const target = resolveNavigationInput(input, this.allowlist);

    if (target.kind === 'invalid') {
      this.update({
        isBlocked: false,
        blockedUrl: null,
        blockedHost: null,
        error: target.message,
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
    this.update({
      url: target.url,
      title: '',
      isHome: false,
      isBlocked: false,
      blockedUrl: null,
      blockedHost: null,
      error: null,
      isLoading: true,
    });
    this.applyVisibility();
    void view.webContents.loadURL(target.url).catch(() => undefined);
    return this.getState();
  }

  goBack(): void {
    const history = this.view?.webContents.navigationHistory;
    if (!history?.canGoBack()) return;

    this.update({
      isHome: false,
      isBlocked: false,
      blockedUrl: null,
      blockedHost: null,
      error: null,
    });
    this.applyVisibility();
    history.goBack();
  }

  goForward(): void {
    const history = this.view?.webContents.navigationHistory;
    if (!history?.canGoForward()) return;

    this.update({
      isHome: false,
      isBlocked: false,
      blockedUrl: null,
      blockedHost: null,
      error: null,
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

  dispose(): void {
    if (!this.view) return;

    this.attached = false;
    this.window.contentView.removeChildView(this.view);
    this.view.setVisible(false);
    this.view.webContents.close();
    this.view = null;

    if (this.downloadHandler) {
      session.fromPartition(PARTITION).removeListener('will-download', this.downloadHandler);
      this.downloadHandler = null;
    }
  }

  private configureSession(): void {
    const resourcesSession = session.fromPartition(PARTITION);

    // The approved sites do not need camera, microphone, location, notifications,
    // clipboard access or anything else. Deny everything by default.
    resourcesSession.setPermissionRequestHandler((_contents, _permission, callback) => {
      callback(false);
    });
    resourcesSession.setPermissionCheckHandler(() => false);

    // DuckDuckGo and GitHub render better without the Electron token in the UA.
    resourcesSession.setUserAgent(
      app.userAgentFallback.replace(/\s(?:Electron|Vinkup|vinkup)\/\S+/g, '')
    );

    this.downloadHandler = (event) => {
      event.preventDefault();
      this.update({
        error: 'Downloads are disabled in the Resources browser.',
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

    contents.setWindowOpenHandler(({ url }) => {
      // Treat `target="_blank"` as a normal navigation so it still hits the
      // allowlist and never opens an unmanaged window.
      if (isAllowedNavigationUrl(url, this.allowlist)) {
        this.loadInPlace(url);
      } else {
        this.block(url);
      }
      return { action: 'deny' };
    });

    contents.on('will-navigate', (event, url) => {
      if (isAllowedNavigationUrl(url, this.allowlist)) return;
      event.preventDefault();
      this.block(url);
    });

    contents.on('will-redirect', (event, url) => {
      if (isAllowedNavigationUrl(url, this.allowlist)) return;
      event.preventDefault();
      this.block(url);
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
      this.update({
        url,
        title: contents.getTitle(),
        isHome: false,
        isBlocked: false,
        blockedUrl: null,
        blockedHost: null,
        error: null,
        ...this.historyFlags(),
      });
    });

    contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (!isMainFrame) return;
      this.update({ url, ...this.historyFlags() });
    });

    contents.on('page-title-updated', (_event, title) => {
      this.update({ title });
    });

    contents.on('did-fail-load', (_event, errorCode, description, validatedUrl, isMainFrame) => {
      // -3 is ERR_ABORTED: a newer navigation replaced this one.
      if (!isMainFrame || errorCode === -3) return;
      const host = hostFromUrl(validatedUrl) ?? hostFromUrl(this.state.url) ?? 'the page';
      this.update({
        isLoading: false,
        error: `Could not load ${host}. ${description}`,
        ...this.historyFlags(),
      });
    });

    contents.on('render-process-gone', () => {
      this.update({
        isLoading: false,
        error: 'The page closed unexpectedly. Reload to try again.',
      });
    });

    contents.on('before-input-event', (event, input) => {
      if (!(input.control || input.meta) || input.key.toLowerCase() !== 'l') return;
      event.preventDefault();
      this.events.onFocusAddress();
    });
  }

  private loadInPlace(url: string): void {
    this.attached = true;
    const view = this.ensureView();
    this.update({
      url,
      title: '',
      isHome: false,
      isBlocked: false,
      blockedUrl: null,
      blockedHost: null,
      error: null,
      isLoading: true,
    });
    this.applyVisibility();
    void view.webContents.loadURL(url).catch(() => undefined);
  }

  private block(rawUrl: string, host = hostFromUrl(rawUrl) ?? rawUrl): void {
    if (this.state.isBlocked && this.state.blockedUrl === rawUrl) return;

    this.update({
      isBlocked: true,
      blockedUrl: rawUrl,
      blockedHost: host,
      error: null,
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
