/** Own committed pagination separately from pending refreshes; late tokens never replace newer state. */
export function createDateNavigationState() {
  let epoch = 0;
  let scope = '';
  let committedScope = null;
  let items = [];
  let nextCursor = null;
  let refreshing = false;
  let failed = false;
  let request = null;
  return {
    beginRefresh(nextScope) {
      epoch++;
      scope = nextScope;
      refreshing = true;
      request = null;
      return epoch;
    },
    commitRefresh(token, page) {
      if (token !== epoch || !refreshing) return false;
      committedScope = scope;
      items = [...page.items];
      nextCursor = page.nextCursor;
      refreshing = false;
      failed = false;
      return true;
    },
    failRefresh(token) {
      if (token !== epoch || !refreshing) return false;
      refreshing = false;
      if (committedScope !== scope) {
        items = [];
        nextCursor = null;
        failed = false;
        committedScope = scope;
      }
      return true;
    },
    beginLoad(automatic = false) {
      if (refreshing || request || !nextCursor || committedScope !== scope || (automatic && failed))
        return null;
      request = { epoch, scope, cursor: nextCursor };
      return request;
    },
    completeLoad(token, page) {
      if (!request || token !== request || token.epoch !== epoch) return false;
      if (page.nextCursor && (page.nextCursor === token.cursor || !page.items.length))
        throw new Error('Date pagination made no progress');
      items = [...items, ...page.items];
      nextCursor = page.nextCursor;
      request = null;
      failed = false;
      return true;
    },
    failLoad(token) {
      if (!request || token !== request || token.epoch !== epoch) return false;
      request = null;
      failed = true;
      return true;
    },
    snapshot: () => ({
      scope,
      items: [...items],
      nextCursor,
      refreshing,
      loading: Boolean(request),
      failed,
    }),
    invalidate() {
      epoch++;
      request = null;
      refreshing = false;
    },
  };
}

/** Create an independent date scroller; data transport, URL policy and reading content stay in the caller. */
export function createDateNavigation({
  elements,
  loadPage,
  onSelect,
  hrefForDate = (date) => `?date=${encodeURIComponent(date)}`,
  formatMeta = () => '',
  labels = {},
  desktopQuery = '(min-width: 761px)',
}) {
  const {
    sidebar,
    scroller,
    list,
    moreButton,
    status,
    selectedDate: selectedLabel,
    header,
    readingHeading,
  } = elements;
  const words = {
    more: 'Earlier dates',
    retry: 'Retry dates',
    loading: 'Loading earlier dates…',
    end: 'All dates shown',
    empty: 'No published dates',
    failed: (error) => `Could not load dates: ${error.message}. Retry manually.`,
    refreshFailed: 'Date navigation refresh failed; existing dates remain available.',
    selected: (date) => `Reading: ${date}`,
    ...labels,
  };
  const owner = sidebar.ownerDocument;
  const view = owner.defaultView;
  const listeners = new view.AbortController();
  const listen = (node, event, handler, options = {}) =>
    node.addEventListener(event, handler, { ...options, signal: listeners.signal });
  const state = createDateNavigationState();
  let selected = '';
  let intent = false;
  let frame = 0;
  let destroyed = false;
  let transport = null;
  sidebar.dataset.dailyUiNavigation = '';
  scroller.dataset.dailyUiDateScroll = '';
  list.dataset.dailyUiDateList = '';
  selectedLabel.dataset.dailyUiSelectedDate = '';
  const desktop = () => view.matchMedia(desktopQuery).matches;
  const measure = () => {
    if (destroyed) return;
    const top = header.getBoundingClientRect().bottom + 16;
    const sidebarTop = Math.max(top, sidebar.getBoundingClientRect().top);
    sidebar.style.setProperty('--daily-ui-sticky-top', `${top}px`);
    sidebar.style.setProperty(
      '--daily-ui-sidebar-height',
      `${Math.max(160, view.innerHeight - sidebarTop - 20)}px`,
    );
  };
  const scheduleMeasure = () => {
    if (destroyed || frame) return;
    frame = view.requestAnimationFrame(() => {
      frame = 0;
      measure();
    });
  };
  const revealReading = () => {
    const offset = header.getBoundingClientRect().bottom + 16;
    const top = readingHeading.getBoundingClientRect().top;
    if (top < offset) view.scrollBy({ top: top - offset, behavior: 'instant' });
  };
  const markSelected = () => {
    for (const link of list.children) {
      if (link.dataset.date === selected) link.setAttribute('aria-current', 'date');
      else link.removeAttribute('aria-current');
    }
    const outside = selected && ![...list.children].some((link) => link.dataset.date === selected);
    selectedLabel.hidden = !outside;
    selectedLabel.textContent = outside ? words.selected(selected) : '';
  };
  const renderLinks = () => {
    const snapshot = state.snapshot();
    const existing = new Map([...list.children].map((link) => [link.dataset.date, link]));
    const retained = new Set();
    for (const [index, day] of snapshot.items.entries()) {
      let link = existing.get(day.date);
      if (!link) {
        link = owner.createElement('a');
        link.append(owner.createTextNode(day.date), owner.createElement('small'));
        link.dataset.date = day.date;
        link.addEventListener('click', (event) => {
          if (
            destroyed ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          selected = day.date;
          markSelected();
          revealReading();
          onSelect(day.date);
        });
      }
      link.href = hrefForDate(day.date, snapshot.scope);
      link.querySelector('small').textContent = formatMeta(day);
      if (list.children[index] !== link) list.insertBefore(link, list.children[index] ?? null);
      retained.add(link);
    }
    for (const link of [...list.children]) if (!retained.has(link)) link.remove();
    markSelected();
  };
  const renderStatus = () => {
    const snapshot = state.snapshot();
    moreButton.disabled = snapshot.loading || snapshot.refreshing;
    moreButton.hidden = !snapshot.nextCursor;
    moreButton.textContent = snapshot.failed ? words.retry : words.more;
    scroller.setAttribute('aria-busy', String(snapshot.loading || snapshot.refreshing));
    if (snapshot.loading) status.textContent = words.loading;
    else if (!snapshot.failed)
      status.textContent = snapshot.nextCursor
        ? ''
        : snapshot.items.length
          ? words.end
          : words.empty;
  };
  async function loadOlder(automatic = false) {
    if (destroyed) return false;
    const token = state.beginLoad(automatic);
    if (!token) return false;
    transport = new view.AbortController();
    renderStatus();
    try {
      const page = await loadPage({
        scope: token.scope,
        cursor: token.cursor,
        signal: transport.signal,
      });
      if (destroyed || !state.completeLoad(token, page)) return false;
      const scrollTop = scroller.scrollTop;
      renderLinks();
      scroller.scrollTop = scrollTop;
      renderStatus();
      return true;
    } catch (error) {
      if (!destroyed && state.failLoad(token)) {
        renderStatus();
        status.textContent = words.failed(error);
      }
      return false;
    }
  }
  async function fill() {
    while (
      !destroyed &&
      desktop() &&
      state.snapshot().nextCursor &&
      scroller.scrollHeight <= scroller.clientHeight + 1
    ) {
      if (!(await loadOlder(true))) break;
    }
  }
  const nearBottom = () => scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 100;
  listen(moreButton, 'click', () => {
    void loadOlder(false).then((loaded) => {
      if (loaded) void fill();
    });
  });
  listen(
    scroller,
    'scroll',
    () => {
      if (!intent) return;
      intent = false;
      if (desktop() && nearBottom()) void loadOlder(true);
    },
    { passive: true },
  );
  listen(
    scroller,
    'wheel',
    (event) => {
      intent = true;
      if (desktop() && event.deltaY > 0 && nearBottom()) void loadOlder(true);
    },
    { passive: true },
  );
  listen(scroller, 'keydown', (event) => {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key))
      intent = true;
  });
  listen(scroller, 'pointerdown', () => {
    intent = true;
  });
  listen(scroller, 'pointermove', (event) => {
    if (event.buttons) intent = true;
  });
  listen(view, 'resize', () => {
    intent = false;
    scheduleMeasure();
  });
  const observer = new view.ResizeObserver(scheduleMeasure);
  observer.observe(header);
  measure();
  return {
    beginRefresh(scope) {
      if (destroyed) return null;
      transport?.abort();
      intent = false;
      const token = state.beginRefresh(scope);
      renderStatus();
      return token;
    },
    commitRefresh(token, page, date = selected) {
      if (destroyed || !state.commitRefresh(token, page)) return false;
      selected = date;
      intent = false;
      renderLinks();
      scroller.scrollTop = 0;
      renderStatus();
      view.queueMicrotask(() => {
        if (!destroyed) {
          measure();
          void fill();
        }
      });
      return true;
    },
    failRefresh(token) {
      if (destroyed || !state.failRefresh(token)) return false;
      renderLinks();
      renderStatus();
      status.textContent = words.refreshFailed;
      return true;
    },
    setSelectedDate(date) {
      if (destroyed) return;
      selected = date;
      markSelected();
    },
    revealReading,
    getState: () => state.snapshot(),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      state.invalidate();
      transport?.abort();
      listeners.abort();
      observer.disconnect();
      if (frame) view.cancelAnimationFrame(frame);
    },
  };
}
