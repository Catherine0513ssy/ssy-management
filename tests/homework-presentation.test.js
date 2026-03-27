const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createPresentationState,
  reducePresentationState,
  canExitPresentation,
} = require('../services/homework-presentation');

test('presentation mode can enter and exit when unlocked', () => {
  let state = createPresentationState();

  state = reducePresentationState(state, { type: 'ENTER' });
  assert.deepEqual(state, { active: true, locked: false });
  assert.equal(canExitPresentation(state), true);

  state = reducePresentationState(state, { type: 'EXIT' });
  assert.deepEqual(state, { active: false, locked: false });
});

test('locked presentation mode blocks exit until unlocked', () => {
  let state = createPresentationState();

  state = reducePresentationState(state, { type: 'ENTER' });
  state = reducePresentationState(state, { type: 'TOGGLE_LOCK' });
  assert.deepEqual(state, { active: true, locked: true });
  assert.equal(canExitPresentation(state), false);

  state = reducePresentationState(state, { type: 'EXIT' });
  assert.deepEqual(state, { active: true, locked: true });

  state = reducePresentationState(state, { type: 'TOGGLE_LOCK' });
  assert.deepEqual(state, { active: true, locked: false });

  state = reducePresentationState(state, { type: 'EXIT' });
  assert.deepEqual(state, { active: false, locked: false });
});
