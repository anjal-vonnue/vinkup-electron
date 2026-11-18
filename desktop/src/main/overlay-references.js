(() => {
  const DISPLAY_STATE_KEY = 'vinkup.secondary-display.state';
  const references = window.SecondaryDisplayReferenceData?.secondaryDisplayReferences;
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const panels = [...document.querySelectorAll('[role="tabpanel"]')];
  const main = document.querySelector('main');
  const listView = document.getElementById('reference-list-view');
  const readerView = document.getElementById('reference-reader-view');
  const listElement = document.getElementById('reference-list');
  const searchInput = document.getElementById('reference-search');
  const readerTitle = document.getElementById('reference-title');
  const readerContent = document.getElementById('reference-content');
  const readerToolbar = document.getElementById('reader-toolbar');
  const backButton = document.getElementById('reference-back');
  const previousButton = document.getElementById('reference-previous');
  const nextButton = document.getElementById('reference-next');
  const footerPreviousButton = document.getElementById('reference-footer-previous');
  const footerNextButton = document.getElementById('reference-footer-next');
  const savedState = readDisplayState();
  let selectedIndex = -1;
  let selectedReferenceId = null;
  let activeTab = 'resources';

  function readDisplayState() {
    try {
      const state = JSON.parse(localStorage.getItem(DISPLAY_STATE_KEY) || '{}');
      return {
        activeTab: state.activeTab === 'references' ? 'references' : 'resources',
        referenceId: typeof state.referenceId === 'string' ? state.referenceId : null,
        search: typeof state.search === 'string' ? state.search : '',
      };
    } catch (error) {
      console.warn('[display] Could not restore the reference view', error);
      return { activeTab: 'resources', referenceId: null, search: '' };
    }
  }

  function persistDisplayState() {
    try {
      localStorage.setItem(
        DISPLAY_STATE_KEY,
        JSON.stringify({
          activeTab,
          referenceId: selectedReferenceId,
          search: searchInput.value,
        })
      );
    } catch (error) {
      console.warn('[display] Could not save the reference view', error);
    }
  }

  function setReferencesActive(active) {
    window.vinkupDisplay?.setReferencesActive(active);
  }

  function element(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function inlineElement(tagName, className, text) {
    const node = element(tagName, className);
    const pattern = /`([^`]+)`/g;
    let offset = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > offset) {
        node.append(document.createTextNode(text.slice(offset, match.index)));
      }
      const code = element('code', 'inline-code', match[1]);
      node.append(code);
      offset = pattern.lastIndex;
    }
    if (offset < text.length) node.append(document.createTextNode(text.slice(offset)));
    return node;
  }

  function selectTab(selectedTab, moveFocus = false) {
    for (const tab of tabs) {
      const selected = tab === selectedTab;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }

    for (const panel of panels) {
      panel.hidden = panel.id !== selectedTab.getAttribute('aria-controls');
    }

    activeTab = selectedTab.id === 'references-tab' ? 'references' : 'resources';
    setReferencesActive(activeTab === 'references');
    if (activeTab === 'references') showList();
    else selectedReferenceId = null;
    persistDisplayState();
    if (moveFocus) selectedTab.focus();
  }

  function groupReferences(items) {
    const groups = new Map();
    for (const reference of items) {
      const group = groups.get(reference.courseId) ?? {
        label: reference.courseLabel,
        references: [],
      };
      group.references.push(reference);
      groups.set(reference.courseId, group);
    }
    return groups;
  }

  function renderList() {
    listElement.replaceChildren();
    if (!Array.isArray(references)) {
      listElement.append(element('p', 'empty-state', 'Reference content could not be loaded.'));
      return;
    }

    const query = searchInput.value.trim().toLocaleLowerCase();
    const matching = references.filter((reference) =>
      `${reference.title} ${reference.courseLabel} ${reference.id}`
        .toLocaleLowerCase()
        .includes(query)
    );

    if (matching.length === 0) {
      listElement.append(element('p', 'empty-state', 'No references match your search.'));
      return;
    }

    for (const [courseId, group] of groupReferences(matching)) {
      const section = element('section', 'reference-group');
      section.setAttribute('aria-labelledby', `course-${courseId}`);
      const heading = inlineElement('h2', 'group-title', group.label);
      heading.id = `course-${courseId}`;
      const items = element('div', 'reference-group-items');
      for (const reference of group.references) {
        const index = references.indexOf(reference);
        const button = element('button', 'reference-card');
        button.type = 'button';
        button.dataset.referenceIndex = String(index);
        button.append(
          inlineElement('span', 'reference-card-title', reference.title),
          element('span', 'reference-card-day', `Day ${reference.dayNumber}`),
          element(
            'span',
            'reference-card-meta',
            `${reference.sections.length} ${reference.sections.length === 1 ? 'topic' : 'topics'}`
          )
        );
        items.append(button);
      }
      section.append(heading, items);
      listElement.append(section);
    }
  }

  function renderBlocks(blocks) {
    const fragment = document.createDocumentFragment();
    blocks.forEach((block) => {
      let node;
      switch (block.type) {
        case 'paragraph':
          node = inlineElement('p', 'paragraph', block.text);
          break;
        case 'subheading':
          node = inlineElement(`h${block.level}`, 'subheading', block.text);
          break;
        case 'image': {
          node = element('figure', 'image-figure');
          const image = element('img', 'content-image');
          image.src = block.src;
          image.alt = block.alt;
          image.loading = 'lazy';
          node.append(image);
          if (block.alt) node.append(inlineElement('figcaption', 'image-caption', block.alt));
          break;
        }
        case 'code': {
          node = element('div', 'code-block');
          const header = element('div', 'code-header');
          header.append(
            element('span', 'code-filename', block.code.filename || 'code'),
            element('span', 'code-language', block.code.language || 'CODE')
          );
          const pre = element('pre', 'code-pre');
          pre.append(element('code', '', block.code.code));
          node.append(header, pre);
          break;
        }
        case 'list': {
          node = element(block.ordered ? 'ol' : 'ul', 'content-list');
          if (block.ordered && block.start !== undefined) node.start = block.start;
          for (const item of block.items) node.append(inlineElement('li', '', item));
          break;
        }
        case 'definitions': {
          node = element('dl', 'definitions');
          for (const item of block.items) {
            const wrapper = element('div', 'definition-item');
            wrapper.append(
              inlineElement('dt', 'definition-term', item.term),
              inlineElement('dd', 'definition-description', item.description)
            );
            node.append(wrapper);
          }
          break;
        }
        case 'table': {
          const wrapper = element('div', 'table-wrapper');
          const table = element('table', 'content-table');
          const head = element('thead');
          const headerRow = element('tr');
          for (const header of block.headers) headerRow.append(inlineElement('th', '', header));
          head.append(headerRow);
          const body = element('tbody');
          for (const row of block.rows) {
            const tableRow = element('tr');
            for (const cell of row) tableRow.append(inlineElement('td', '', cell));
            body.append(tableRow);
          }
          table.append(head, body);
          wrapper.append(table);
          node = wrapper;
          break;
        }
        case 'htmlTable':
          node = element('div', 'html-table');
          node.innerHTML = block.html;
          break;
        case 'callout':
          node = element('aside', `callout ${block.callout.variant}`);
          node.append(
            inlineElement('strong', 'callout-title', block.callout.title),
            inlineElement('p', 'paragraph', block.callout.body)
          );
          break;
        default:
          return;
      }
      fragment.append(node);
    });
    return fragment;
  }

  function groupBySubheading(blocks) {
    const levels = blocks
      .filter((block) => block.type === 'subheading')
      .map((block) => block.level);
    if (levels.length === 0) return { intro: blocks, groups: [] };

    const groupLevel = Math.min(...levels);
    const intro = [];
    const groups = [];
    for (const block of blocks) {
      if (block.type === 'subheading' && block.level === groupLevel) {
        groups.push({ title: block.text, blocks: [] });
      } else if (groups.length === 0) {
        intro.push(block);
      } else {
        groups[groups.length - 1].blocks.push(block);
      }
    }
    return { intro, groups };
  }

  function renderTopic(section) {
    const article = element('article', 'reference-section');
    article.append(inlineElement('h2', 'section-title', `${section.number}. ${section.heading}`));
    if (
      ![
        'nodefspromises',
        'nodehttpclientrequest',
        'nodehttpserver',
        'nodehttpserverresponse',
      ].includes(section.id)
    ) {
      article.append(renderBlocks(section.blocks));
      return article;
    }

    const grouped = groupBySubheading(section.blocks);
    article.append(renderBlocks(grouped.intro));
    for (const group of grouped.groups) {
      const details = element('details', 'topic-accordion');
      details.append(inlineElement('summary', 'accordion-summary', group.title));
      details.append(renderBlocks(group.blocks));
      article.append(details);
    }
    return article;
  }

  function renderVideos(videos) {
    const section = element('section', 'video-section');
    section.append(element('h2', 'section-title', 'Video'));
    for (const video of videos) {
      const card = element('div', 'video-card');
      card.append(inlineElement('h3', 'video-title', video.title));
      const frame = element('iframe', 'video-frame');
      const embedUrl = new URL(video.embedUrl);
      if (embedUrl.hostname === 'www.youtube.com' && window.location.origin !== 'null') {
        embedUrl.searchParams.set('origin', window.location.origin);
      }
      frame.src = embedUrl.toString();
      frame.title = video.title;
      frame.allow =
        'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      frame.referrerPolicy = 'origin';
      frame.allowFullscreen = true;
      frame.loading = 'lazy';
      card.append(frame);
      section.append(card);
    }
    return section;
  }

  function addPrerequisites(content) {
    if (!content.prerequisiteLinks?.length) return null;
    const section = element('section', 'prerequisites');
    section.append(
      element('p', 'paragraph', "These references cover concepts required for this day's task.")
    );
    const list = element('div', 'prerequisite-list');
    for (const prerequisite of content.prerequisiteLinks) {
      const button = inlineElement('button', 'prerequisite-button', prerequisite.label);
      button.type = 'button';
      button.dataset.referenceId = prerequisite.dayId;
      list.append(button);
    }
    section.append(list);
    return section;
  }

  function setNavigationDisabled() {
    previousButton.disabled = selectedIndex <= 0;
    footerPreviousButton.disabled = selectedIndex <= 0;
    nextButton.disabled = selectedIndex < 0 || selectedIndex >= references.length - 1;
    footerNextButton.disabled = selectedIndex < 0 || selectedIndex >= references.length - 1;
  }

  function openReference(index, focusTitle = true) {
    if (!Array.isArray(references) || index < 0 || index >= references.length) return;
    selectedIndex = index;
    const reference = references[index];
    selectedReferenceId = reference.id;
    readerContent.replaceChildren();
    readerTitle.replaceChildren(
      element('span', 'reader-day-indicator', `Day ${reference.dayNumber}`),
      inlineElement('span', 'reader-reference-title', reference.title)
    );

    if (reference.instruction) {
      readerContent.append(inlineElement('aside', 'instruction', reference.instruction));
    }
    const prerequisites = addPrerequisites(reference);
    if (prerequisites) readerContent.append(prerequisites);
    if (reference.videoAtStart && reference.videos?.length) {
      readerContent.append(renderVideos(reference.videos));
    }

    for (const section of reference.sections) {
      readerContent.append(renderTopic(section));
      if (reference.videoAfterTopicId === section.id && reference.videos?.length) {
        readerContent.append(renderVideos(reference.videos));
      }
    }
    if (!reference.sections.length && !prerequisites && !reference.instruction) {
      readerContent.append(
        element('p', 'empty-state', 'No reference content is available for this day.')
      );
    }

    readerView.hidden = false;
    listView.hidden = true;
    setNavigationDisabled();
    main.scrollTop = 0;
    readerToolbar.scrollTop = 0;
    if (focusTitle) readerTitle.focus({ preventScroll: true });
    persistDisplayState();
  }

  function showList() {
    selectedIndex = -1;
    selectedReferenceId = null;
    listView.hidden = false;
    readerView.hidden = true;
    renderList();
    main.scrollTop = 0;
    persistDisplayState();
  }

  function navigateBy(offset) {
    openReference(selectedIndex + offset);
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const currentIndex = tabs.indexOf(tab);
      const step = event.key === 'ArrowRight' ? 1 : -1;
      const nextTab = tabs[(currentIndex + step + tabs.length) % tabs.length];
      if (nextTab) selectTab(nextTab, true);
    });
  }

  document.getElementById('resources-tab').addEventListener('click', () => {
    listView.hidden = false;
    readerView.hidden = true;
  });
  listElement.addEventListener('click', (event) => {
    const button = event.target.closest('[data-reference-index]');
    if (button) openReference(Number(button.dataset.referenceIndex));
    const prerequisite = event.target.closest('[data-reference-id]');
    if (prerequisite) {
      const index = references.findIndex(
        (reference) => reference.id === prerequisite.dataset.referenceId
      );
      if (index >= 0) openReference(index);
    }
  });
  readerContent.addEventListener('click', (event) => {
    const button = event.target.closest('[data-reference-id]');
    if (!button) return;
    const index = references.findIndex((reference) => reference.id === button.dataset.referenceId);
    if (index >= 0) openReference(index);
  });
  searchInput.addEventListener('input', () => {
    renderList();
    persistDisplayState();
  });
  backButton.addEventListener('click', showList);
  previousButton.addEventListener('click', () => navigateBy(-1));
  nextButton.addEventListener('click', () => navigateBy(1));
  footerPreviousButton.addEventListener('click', () => navigateBy(-1));
  footerNextButton.addEventListener('click', () => navigateBy(1));

  searchInput.value = savedState.search;
  renderList();
  if (savedState.activeTab === 'references') {
    selectTab(document.getElementById('references-tab'));
    const savedIndex = references?.findIndex(({ id }) => id === savedState.referenceId) ?? -1;
    if (savedIndex >= 0) openReference(savedIndex, false);
  } else {
    setReferencesActive(false);
    persistDisplayState();
  }
})();
