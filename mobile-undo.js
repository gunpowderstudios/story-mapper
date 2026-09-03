(() => {
  const mobileUndoBtn = document.getElementById('mobileMoveBtn');
  const mobileUndoLabel = document.getElementById('mobileUndoLabel');
  const undoBtn = document.getElementById('undoBtn');

  if (!mobileUndoBtn || !mobileUndoLabel || !undoBtn) return;

  function syncUndo() {
    mobileUndoBtn.disabled = undoBtn.disabled;
    const match = undoBtn.textContent.match(/\((\d+)\)/);
    mobileUndoLabel.textContent = match ? `Undo ${match[1]}` : 'Undo';
  }

  mobileUndoBtn.addEventListener('click', e => {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!undoBtn.disabled) undoBtn.click();
    syncUndo();
  }, true);

  const observer = new MutationObserver(syncUndo);
  observer.observe(undoBtn, {attributes:true, childList:true, characterData:true, subtree:true});
  syncUndo();
})();
