import assert from 'node:assert/strict';
import test from 'node:test';

import { matchAuthors } from '../packages/daily-ui/src/author-search.js';
import { createDateNavigationState } from '../packages/daily-ui/src/date-navigation.js';

test('local search normalizes handles and ranks exact, prefix, contains and ordered characters', () => {
  const values = ['a_l_p', 'xalp', 'alpine', 'alp', 'unrelated'];
  assert.deepEqual(matchAuthors(values, ' @ALP '), ['alp', 'alpine', 'xalp', 'a_l_p']);
  assert.deepEqual(values, ['a_l_p', 'xalp', 'alpine', 'alp', 'unrelated']);
  assert.deepEqual(matchAuthors(values, 'zzzz'), []);
  assert.deepEqual(matchAuthors(values, ''), values);
  assert.deepEqual(matchAuthors(['a_b_c', 'c_b_a', 'ab'], 'abc'), ['a_b_c']);
});

const firstPage = { items: [{ date: '2030-01-02' }], nextCursor: 'page-two' };

test('overlapping failed refreshes keep the last committed cursor without clearing it', () => {
  const state = createDateNavigationState();
  state.commitRefresh(state.beginRefresh('alice'), firstPage);
  const old = state.beginRefresh('alice');
  const latest = state.beginRefresh('alice');
  assert.equal(state.beginLoad(), null);
  assert.equal(state.failRefresh(latest), true);
  assert.equal(state.commitRefresh(old, { items: [], nextCursor: null }), false);
  assert.equal(state.snapshot().nextCursor, 'page-two');
  assert.equal(state.beginLoad().scope, 'alice');
});

test('a changed scope rejects old history and does not restore the previous scope on failure', () => {
  const state = createDateNavigationState();
  state.commitRefresh(state.beginRefresh('alice'), firstPage);
  const request = state.beginLoad();
  const token = state.beginRefresh('bob');
  assert.equal(
    state.completeLoad(request, { items: [{ date: '1999-01-01' }], nextCursor: null }),
    false,
  );
  state.failRefresh(token);
  assert.deepEqual(state.snapshot().items, []);
  assert.equal(state.snapshot().nextCursor, null);
  assert.equal(state.snapshot().scope, 'bob');
});

test('history is single-flight, stops auto retries after errors and allows explicit retry', () => {
  const state = createDateNavigationState();
  state.commitRefresh(state.beginRefresh(''), firstPage);
  const first = state.beginLoad();
  assert.equal(state.beginLoad(), null);
  assert.equal(state.failLoad(first), true);
  assert.equal(state.beginLoad(true), null);
  const retry = state.beginLoad(false);
  assert.ok(retry);
  assert.equal(
    state.completeLoad(retry, { items: [{ date: '2030-01-01' }], nextCursor: null }),
    true,
  );
  assert.equal(state.snapshot().items.length, 2);
  assert.equal(state.completeLoad(retry, firstPage), false);
  assert.equal(state.beginLoad(), null);
});

test('non-progressing history fails before replacing committed observations', () => {
  const state = createDateNavigationState();
  state.commitRefresh(state.beginRefresh(''), firstPage);
  const request = state.beginLoad();
  assert.throws(
    () => state.completeLoad(request, { items: [], nextCursor: 'page-two' }),
    /progress/i,
  );
  assert.equal(state.snapshot().items.length, 1);
  assert.equal(state.snapshot().nextCursor, 'page-two');
  state.failLoad(request);
});

test('snapshots cannot mutate the owned date array and invalidation rejects outstanding requests', () => {
  const state = createDateNavigationState();
  state.commitRefresh(state.beginRefresh(''), firstPage);
  state.snapshot().items.length = 0;
  assert.equal(state.snapshot().items.length, 1);
  const request = state.beginLoad();
  state.invalidate();
  assert.equal(state.completeLoad(request, { items: [], nextCursor: null }), false);
});
