function createPresentationState() {
  return { active: false, locked: false };
}

function canExitPresentation(state) {
  return Boolean(state && state.active && !state.locked);
}

function reducePresentationState(state, action) {
  const current = state || createPresentationState();

  switch (action.type) {
    case 'ENTER':
      return { active: true, locked: false };
    case 'EXIT':
      return canExitPresentation(current) ? createPresentationState() : current;
    case 'TOGGLE_LOCK':
      return current.active ? { ...current, locked: !current.locked } : current;
    case 'RESET':
      return createPresentationState();
    default:
      return current;
  }
}

module.exports = {
  createPresentationState,
  canExitPresentation,
  reducePresentationState,
};
