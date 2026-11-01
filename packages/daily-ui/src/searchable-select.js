import { matchAuthors } from './author-search.js';

/** Create a local searchable selector; only real-option confirmation or clearing emits onSelect. */
export function createSearchableSelect({
  elements,
  onSelect,
  labels = {},
  formatOption = (value) => value,
  disableWhenEmpty = false,
}) {
  const { root, input, popup, list, results, clearButton } = elements;
  const words = {
    all: 'All authors',
    empty: 'No published authors',
    noResults: 'No matching authors',
    count: (count) => `${count} matching authors`,
    unavailable: '',
    ...labels,
  };
  const owner = root.ownerDocument;
  const view = owner.defaultView;
  const listeners = new view.AbortController();
  const listen = (node, event, handler, options = {}) =>
    node.addEventListener(event, handler, { ...options, signal: listeners.signal });
  root.dataset.dailyUiPicker = '';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  list.setAttribute('role', 'listbox');
  const instanceId = list.id;
  let values = [];
  let selected = '';
  let matches = [];
  let active = -1;
  let composing = false;
  let destroyed = false;

  const close = () => {
    popup.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    input.value = selected ? formatOption(selected) : values.length ? words.all : words.empty;
  };
  const position = () => {
    const rect = root.getBoundingClientRect();
    const viewport = view.visualViewport;
    const bottom = viewport ? viewport.offsetTop + viewport.height : view.innerHeight;
    const above = rect.top - (viewport?.offsetTop ?? 0);
    const below = bottom - rect.bottom;
    const opensAbove = below < 240 && above > below;
    popup.dataset.placement = opensAbove ? 'above' : 'below';
    popup.style.setProperty(
      '--daily-ui-option-space',
      `${Math.max(44, (opensAbove ? above : below) - 90)}px`,
    );
  };
  const activate = (index) => {
    active = index;
    for (const [i, option] of [...list.children].entries())
      option.dataset.active = String(i === active);
    const option = list.children[active];
    if (!option) {
      input.removeAttribute('aria-activedescendant');
      return;
    }
    input.setAttribute('aria-activedescendant', option.id);
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
  };
  const confirm = (value) => {
    if (destroyed) return;
    const changed = selected !== value;
    selected = value;
    close();
    if (changed) onSelect(value);
  };
  const render = (query = '') => {
    matches = matchAuthors(values, query);
    list.replaceChildren(
      ...matches.map((value, index) => {
        const option = owner.createElement('div');
        option.id = `${instanceId}-option-${index}`;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(value === selected));
        option.textContent = formatOption(value);
        option.addEventListener('pointerdown', (event) => event.preventDefault());
        option.addEventListener('click', () => confirm(value));
        return option;
      }),
    );
    results.textContent = matches.length ? words.count(matches.length) : words.noResults;
    list.scrollTop = 0;
    activate(query ? (matches.length ? 0 : -1) : Math.max(0, matches.indexOf(selected)));
  };
  const open = () => {
    if (destroyed || input.disabled || !popup.hidden) return;
    popup.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    input.value = selected ? formatOption(selected) : '';
    position();
    render();
    input.select();
  };
  listen(input, 'focus', open);
  listen(input, 'click', open);
  listen(input, 'input', () => {
    const draft = input.value;
    if (popup.hidden) open();
    input.value = draft;
    render(draft);
  });
  listen(input, 'compositionstart', () => {
    composing = true;
  });
  listen(input, 'compositionend', () => {
    composing = false;
  });
  listen(input, 'keydown', (event) => {
    if (composing || event.isComposing) return;
    if (event.key === 'Escape') {
      if (!popup.hidden) event.preventDefault();
      close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (popup.hidden) open();
      else if (matches.length)
        activate((active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
    } else if (event.key === 'Enter' && !popup.hidden) {
      event.preventDefault();
      if (matches[active]) confirm(matches[active]);
    }
  });
  listen(root, 'focusout', (event) => {
    if (!root.contains(event.relatedTarget)) close();
  });
  listen(owner, 'pointerdown', (event) => {
    if (!root.contains(event.target)) close();
  });
  listen(clearButton, 'click', () => confirm(''));
  const reposition = () => {
    if (!popup.hidden) position();
  };
  listen(view, 'resize', reposition);
  if (view.visualViewport) listen(view.visualViewport, 'resize', reposition);
  listen(view, 'scroll', reposition, { passive: true });
  close();
  return {
    setOptions(nextValues, value = '') {
      if (destroyed) return;
      values = [...nextValues];
      selected = value;
      input.disabled = disableWhenEmpty && !values.length && !selected;
      input.title = selected && !values.includes(selected) ? words.unavailable : '';
      close();
    },
    getValue: () => selected,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      close();
      listeners.abort();
    },
  };
}
