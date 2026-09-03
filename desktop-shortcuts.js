(() => {
  let selectedNode = null;

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  function clearNodeSelection() {
    if (selectedNode) selectedNode.classList.remove('desktopKeyboardSelected');
    selectedNode = null;
  }

  function selectNode(node) {
    if (selectedNode && selectedNode !== node) selectedNode.classList.remove('desktopKeyboardSelected');
    selectedNode = node;
    if (selectedNode) selectedNode.classList.add('desktopKeyboardSelected');
  }

  function installStyle() {
    if (document.getElementById('desktopShortcutStyle')) return;
    const style = document.createElement('style');
    style.id = 'desktopShortcutStyle';
    style.textContent = '@media (min-width:701px){.node.desktopKeyboardSelected{outline:3px solid #ffd54a;outline-offset:2px}}';
    document.head.appendChild(style);
  }

  function install() {
    installStyle();

    const applyBtn = document.getElementById('applyNodeBtn');
    const editor = document.getElementById('editor');
    const deleteLineBtn = document.getElementById('deleteLineBtn');
    const deleteModeBtn = document.getElementById('deleteModeBtn');

    if (applyBtn && editor && !applyBtn.dataset.autoCloseInstalled) {
      applyBtn.dataset.autoCloseInstalled = '1';
      applyBtn.addEventListener('click', () => {
        setTimeout(() => editor.classList.add('hidden'), 0);
      });
    }

    if (!document.documentElement.dataset.desktopSelectionInstalled) {
      document.documentElement.dataset.desktopSelectionInstalled = '1';
      document.addEventListener('pointerdown', e => {
        if (window.matchMedia('(max-width:700px)').matches) return;
        const node = e.target.closest && e.target.closest('#nodes .node');
        if (node) {
          selectNode(node);
          return;
        }
        if (e.target.closest && e.target.closest('.linkHit')) {
          clearNodeSelection();
          return;
        }
        if (e.target.closest && e.target.closest('#workspace')) clearNodeSelection();
      }, true);
    }

    if (!document.documentElement.dataset.lineDeleteShortcutInstalled) {
      document.documentElement.dataset.lineDeleteShortcutInstalled = '1';
      document.addEventListener('keydown', e => {
        if (e.key !== 'Delete' && e.key !== 'Backspace') return;
        if (isTypingTarget(e.target)) return;
        if (window.matchMedia('(max-width:700px)').matches) return;

        if (deleteLineBtn && !deleteLineBtn.disabled) {
          e.preventDefault();
          deleteLineBtn.click();
          clearNodeSelection();
          return;
        }

        if (selectedNode && document.body.contains(selectedNode) && deleteModeBtn) {
          e.preventDefault();
          const node = selectedNode;
          clearNodeSelection();
          deleteModeBtn.click();
          node.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, cancelable:true, button:0, pointerId:1, pointerType:'mouse'}));
        }
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
