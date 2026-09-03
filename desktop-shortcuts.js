(() => {
  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  function install() {
    const applyBtn = document.getElementById('applyNodeBtn');
    const editor = document.getElementById('editor');
    const deleteLineBtn = document.getElementById('deleteLineBtn');

    if (applyBtn && editor && !applyBtn.dataset.autoCloseInstalled) {
      applyBtn.dataset.autoCloseInstalled = '1';
      applyBtn.addEventListener('click', () => {
        setTimeout(() => editor.classList.add('hidden'), 0);
      });
    }

    if (!document.documentElement.dataset.lineDeleteShortcutInstalled) {
      document.documentElement.dataset.lineDeleteShortcutInstalled = '1';
      document.addEventListener('keydown', e => {
        if (e.key !== 'Delete' && e.key !== 'Backspace') return;
        if (isTypingTarget(e.target)) return;
        if (!deleteLineBtn || deleteLineBtn.disabled) return;
        e.preventDefault();
        deleteLineBtn.click();
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
