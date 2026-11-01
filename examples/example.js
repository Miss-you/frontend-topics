import { createSearchableSelect } from '../packages/daily-ui/src/searchable-select.js';
import { createDateNavigation } from '../packages/daily-ui/src/date-navigation.js';

const get = (id) => document.getElementById(id);
const days = Array.from({ length: 35 }, (_, index) => ({
  date: new Date(Date.UTC(2030, 0, 31 - index)).toISOString().slice(0, 10),
  count: 12,
}));
let selected = days[0].date;
let author = '';
let requests = 0;
let failure = false;
const nav = createDateNavigation({
  elements: {
    sidebar: document.querySelector('aside'),
    scroller: get('dates-scroll'),
    list: get('dates'),
    moreButton: get('more'),
    status: get('date-status'),
    selectedDate: get('selected'),
    header: document.querySelector('header'),
    readingHeading: get('heading'),
  },
  loadPage: async ({ cursor, signal }) => {
    requests++;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, 25);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timeout);
          reject(new Error('Aborted'));
        },
        { once: true },
      );
    });
    if (failure) throw new Error('Synthetic history failure');
    const start = Number(cursor);
    return {
      items: days.slice(start, start + 7),
      nextCursor: start + 7 < days.length ? String(start + 7) : null,
    };
  },
  onSelect(date) {
    selected = date;
    get('heading').textContent = date;
  },
  formatMeta: (day) => `${day.count} synthetic observations`,
});
const picker = createSearchableSelect({
  elements: {
    root: get('picker'),
    input: get('author'),
    popup: get('popup'),
    list: get('options'),
    results: get('results'),
    clearButton: get('clear'),
  },
  formatOption: (value) => `@${value}`,
  disableWhenEmpty: true,
  onSelect(value) {
    author = value;
    get('current-author').textContent = value || 'All authors';
    nav.revealReading();
    refresh(value);
  },
});
picker.setOptions(Array.from({ length: 100 }, (_, index) => `author_${index}`));
function refresh(scope = author, initialCount = 7) {
  const token = nav.beginRefresh(scope);
  nav.commitRefresh(
    token,
    {
      items: days.slice(0, initialCount),
      nextCursor: initialCount < days.length ? String(initialCount) : null,
    },
    selected,
  );
}
get('refresh').addEventListener('click', () => refresh());
for (let index = 0; index < 50; index++) {
  const paragraph = document.createElement('p');
  paragraph.textContent = `Synthetic paragraph ${index + 1}. This example demonstrates independent scrolling and local search without connecting to any data source.`;
  document.querySelector('.copy').append(paragraph);
}
refresh();
window.example = {
  nav,
  picker,
  refresh,
  get requests() {
    return requests;
  },
  set failure(value) {
    failure = value;
  },
};
