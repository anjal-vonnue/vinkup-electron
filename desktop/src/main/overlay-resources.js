(() => {
  const api = window.vinkupDisplay?.resources;
  const resourcesTab = document.getElementById('resources-tab');
  const referencesTab = document.getElementById('references-tab');
  const addressForm = document.getElementById('browser-address-form');
  const addressInput = document.getElementById('browser-address');
  const viewport = document.getElementById('browser-viewport');
  const homeView = document.getElementById('browser-home-view');
  const siteList = document.getElementById('browser-site-list');
  const errorView = document.getElementById('browser-error');
  const status = document.getElementById('browser-status');
  const findBar = document.getElementById('browser-findbar');
  const findInput = document.getElementById('browser-find');
  const findResult = document.getElementById('browser-find-result');
  let browserState = null;
  let active = false;
  let authenticated = document.body.classList.contains('is-authenticated');
  let checkpointActive = false;
  let boundsFrame = 0;
  let findOpen = false;
  let addressDirty = false;

  if (!api) return;

  function run(action, message) {
    void action().catch((error) => {
      setStatus(message, true);
      console.error('[display] Resources browser action failed', error);
    });
  }

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.dataset.error = String(isError);
  }

  function isLocalHost(host) {
    if (!host) return false;
    const name = host
      .trim()
      .toLowerCase()
      .replace(/:\d+$/, '')
      .replace(/^\[|\]$/g, '');
    return name === 'localhost' || name === '127.0.0.1' || name === '::1';
  }

  function renderAllowlist(allowlist) {
    siteList.replaceChildren();
    for (const category of allowlist.categories) {
      const section = document.createElement('section');
      section.className = 'resource-category';
      const heading = document.createElement('h2');
      heading.textContent = category.label;
      const sites = document.createElement('div');
      sites.className = 'resource-sites';

      for (const domain of category.domains) {
        const button = document.createElement('button');
        button.className = 'resource-site';
        button.type = 'button';
        const text = document.createElement('span');
        text.className = 'resource-site-text';
        const label = document.createElement('span');
        label.className = 'resource-site-name';
        label.textContent = domain;
        const description = document.createElement('small');
        description.textContent = allowlist.descriptions[domain] ?? 'Approved learning resource';
        const hint = document.createElement('span');
        hint.className = 'resource-site-hint';
        hint.textContent = 'Open';
        text.append(label, description);
        button.append(text, hint);
        button.addEventListener('click', () => {
          addressDirty = false;
          run(() => api.navigate(`https://${domain}`), `Could not open ${domain}.`);
        });
        sites.append(button);
      }

      section.append(heading, sites);
      siteList.append(section);
    }
  }

  function renderState(state) {
    browserState = state;
    if (!addressDirty) {
      if (state.isHome) addressInput.value = '';
      else if (state.url !== '' && !state.isBlocked) addressInput.value = state.url;
      else if (state.blockedUrl) addressInput.value = state.blockedUrl;
    }
    document.getElementById('browser-back').disabled = !state.canGoBack;
    document.getElementById('browser-forward').disabled = !state.canGoForward;
    document.getElementById('browser-reload').disabled = state.isHome;
    document.getElementById('browser-reload').textContent = state.isLoading ? '×' : '↻';
    document.getElementById('browser-reload').title = state.isLoading ? 'Stop loading' : 'Reload';
    document.getElementById('browser-reload').setAttribute(
      'aria-label',
      state.isLoading ? 'Stop loading' : 'Reload'
    );
    document.getElementById('browser-zoom-group').hidden =
      state.isHome || state.isBlocked || state.error !== null;
    document.getElementById('browser-zoom-reset').textContent = `${state.zoom}%`;
    document.getElementById('browser-spinner').hidden = !state.isLoading;
    document.getElementById('browser-progress').hidden = !state.isLoading;
    document.getElementById('browser-page-title').textContent = state.isLoading
      ? 'Loading…'
      : state.title || state.url;

    homeView.hidden = !state.isHome || state.error !== null || state.isBlocked;
    errorView.hidden = !state.isBlocked && state.error === null;
    status.hidden = !state.isHome || state.error !== null || state.isBlocked;
    if (state.isBlocked) {
      const host = state.blockedHost ?? 'This address';
      errorView.textContent = isLocalHost(host)
        ? `${host} is not available. Start the backend, React app or Prisma Studio, then try again.`
        : `${host} is not an approved learning resource.`;
      setStatus('This site is blocked by the learning resources policy.', true);
    } else if (state.error) {
      errorView.textContent = state.error;
      setStatus('The page could not be loaded.', true);
    } else {
      errorView.hidden = true;
      setStatus('Only approved learning sites can be opened.');
    }
  }

  function measure() {
    const rect = viewport.getBoundingClientRect();
    return {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }

  function syncBounds() {
    if (!active || boundsFrame !== 0) return;
    boundsFrame = requestAnimationFrame(() => {
      boundsFrame = 0;
      run(() => api.setBounds(measure()), 'Could not resize the Resources browser.');
    });
  }

  async function activate() {
    if (active) return;
    active = true;
    window.vinkupDisplay?.setResourcesActive(true);
    try {
      renderState(await api.open(measure()));
    } catch (error) {
      active = false;
      setStatus('The Resources browser could not be opened.', true);
      console.error('[display] Could not open the Resources browser', error);
    }
  }

  function deactivate() {
    active = false;
    if (boundsFrame !== 0) cancelAnimationFrame(boundsFrame);
    boundsFrame = 0;
    void api.close().catch((error) => {
      console.error('[display] Could not close the Resources browser', error);
    });
  }

  function openFind() {
    if (!browserState || browserState.isHome || browserState.isBlocked) return;
    findOpen = true;
    findBar.hidden = false;
    findInput.focus();
    findInput.select();
  }

  function closeFind() {
    findOpen = false;
    findBar.hidden = true;
    findInput.value = '';
    findResult.textContent = '';
    void api.stopFind();
  }

  addressForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const address = addressInput.value.trim();
    if (address === '') return;
    addressDirty = true;
    void api.navigate(address)
      .then((state) => {
        addressDirty = false;
        renderState(state);
      })
      .catch((error) => {
        setStatus('Could not open that address.', true);
        console.error('[display] Could not navigate the Resources browser', error);
      });
  });
  addressInput.addEventListener('input', () => {
    addressDirty = true;
  });
  document.getElementById('browser-back').addEventListener('click', () => {
    addressDirty = false;
    run(() => api.goBack(), 'Could not go back.');
  });
  document.getElementById('browser-forward').addEventListener('click', () => {
    addressDirty = false;
    run(() => api.goForward(), 'Could not go forward.');
  });
  document.getElementById('browser-home').addEventListener('click', () => {
    addressDirty = false;
    run(() => api.home(), 'Could not return to approved sites.');
  });
  document.getElementById('browser-reload').addEventListener('click', () => {
    addressDirty = false;
    if (browserState?.isLoading) run(() => api.stop(), 'Could not stop loading.');
    else run(() => api.reload(), 'Could not reload the page.');
  });
  document.getElementById('browser-zoom-out').addEventListener('click', () =>
    run(() => api.zoomOut(), 'Could not zoom out.')
  );
  document.getElementById('browser-zoom-in').addEventListener('click', () =>
    run(() => api.zoomIn(), 'Could not zoom in.')
  );
  document.getElementById('browser-zoom-reset').addEventListener('click', () =>
    run(() => api.zoomReset(), 'Could not reset zoom.')
  );
  document.getElementById('browser-find-previous').addEventListener('click', () => {
    run(() => api.findNext(false), 'Could not find the previous match.');
  });
  document.getElementById('browser-find-next').addEventListener('click', () => {
    run(() => api.findNext(true), 'Could not find the next match.');
  });
  document.getElementById('browser-find-close').addEventListener('click', closeFind);
  findInput.addEventListener('input', () =>
    run(() => api.find(findInput.value), 'Could not search this page.')
  );
  findInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeFind();
    if (event.key === 'Enter') run(() => api.findNext(!event.shiftKey), 'Could not search this page.');
  });
  resourcesTab.addEventListener('click', () => void activate());
  referencesTab.addEventListener('click', deactivate);
  window.addEventListener('resize', syncBounds);
  new ResizeObserver(syncBounds).observe(viewport);
  window.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      openFind();
    } else if (event.key.toLowerCase() === 'l') {
      event.preventDefault();
      addressInput.focus();
      addressInput.select();
    }
  });

  api.onChange(renderState);
  api.onFindResult((result) => {
    findResult.textContent = result.matches
      ? `${result.activeMatchOrdinal} of ${result.matches}`
      : 'No matches';
  });
  api.onFocusAddress(() => {
    addressInput.focus();
    addressInput.select();
  });
  api.onOpenFind(openFind);
  api.onEscape(() => {
    if (findOpen) closeFind();
    else if (browserState?.isLoading) run(() => api.stop(), 'Could not stop loading.');
  });
  window.vinkupDisplay?.onAuthenticationChange((isAuthenticated) => {
    authenticated = isAuthenticated;
    if (
      authenticated &&
      !checkpointActive &&
      resourcesTab.getAttribute('aria-selected') === 'true'
    ) {
      void activate();
    } else {
      deactivate();
    }
  });

  window.vinkupDisplay?.onCheckpointChange((state) => {
    checkpointActive = Boolean(state?.active);
    if (checkpointActive) {
      deactivate();
    } else if (authenticated && resourcesTab.getAttribute('aria-selected') === 'true') {
      void activate();
    }
  });

  void Promise.all([api.getAllowlist(), api.getState()])
    .then(([allowlist, state]) => {
      renderAllowlist(allowlist);
      renderState(state);
      const checkpointPromise = window.vinkupDisplay?.getCheckpointState
        ? window.vinkupDisplay.getCheckpointState().catch(() => null)
        : Promise.resolve(null);
      return checkpointPromise.then((checkpoint) => {
        checkpointActive = Boolean(checkpoint?.active);
      });
    })
    .then(() => {
      if (
        authenticated &&
        !checkpointActive &&
        resourcesTab.getAttribute('aria-selected') === 'true'
      ) {
        void activate();
      }
    })
    .catch((error) => {
      setStatus('Approved learning sites could not be loaded.', true);
      console.error('[display] Could not initialize the Resources browser', error);
    });
})();
