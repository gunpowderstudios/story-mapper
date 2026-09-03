(() => {
  let modal = null;
  let editingNumber = null;

  function getState() {
    try {
      const raw = localStorage.getItem('bodStoryMapper');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed.nodes)) return parsed;
      if (parsed && parsed.state && Array.isArray(parsed.state.nodes)) return parsed.state;
    } catch (_) {}
    return null;
  }

  function findNodeByNumber(number) {
    const state = getState();
    return state && state.nodes ? state.nodes.find(n => Number(n.number) === Number(number)) : null;
  }

  function insertBreak(textarea, value) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    textarea.value = before + value + after;
    const next = start + value.length;
    textarea.selectionStart = textarea.selectionEnd = next;
    textarea.dispatchEvent(new Event('input', {bubbles:true}));
  }

  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('section');
    modal.id = 'bookTextEditor';
    modal.className = 'bookEditHidden';
    modal.innerHTML = `
      <div class="bookEditCard">
        <div class="bookEditHead">
          <strong id="bookEditTitle">Edit section</strong>
          <span class="spacer"></span>
          <button id="bookEditClose" type="button">Close</button>
        </div>
        <div class="bookEditBody">
          <label>Story text</label>
          <div class="bookEditBreakHint">Return = new paragraph &nbsp;•&nbsp; Shift + Return = new line</div>
          <textarea id="bookEditTextarea" spellcheck="true"></textarea>
        </div>
        <div class="bookEditActions">
          <button id="bookEditCancel" type="button">Cancel</button>
          <button id="bookEditSave" class="saveText" type="button">Save changes</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#bookEditClose').addEventListener('click', closeEditor);
    modal.querySelector('#bookEditCancel').addEventListener('click', closeEditor);
    modal.querySelector('#bookEditSave').addEventListener('click', saveChanges);
    modal.addEventListener('pointerdown', e => { if (e.target === modal) closeEditor(); });

    const textarea = modal.querySelector('#bookEditTextarea');
    textarea.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      insertBreak(textarea, e.shiftKey ? '\n' : '\n\n');
    });

    document.addEventListener('keydown', e => {
      if (!modal || modal.classList.contains('bookEditHidden')) return;
      if (e.key === 'Escape') closeEditor();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveChanges();
      }
    });
    return modal;
  }

  function openEditor(number) {
    const node = findNodeByNumber(number);
    if (!node) return;
    editingNumber = Number(number);
    const m = ensureModal();
    m.querySelector('#bookEditTitle').textContent = `Edit section ${number}`;
    const ta = m.querySelector('#bookEditTextarea');
    ta.value = node.text || '';
    m.classList.remove('bookEditHidden');
    setTimeout(() => ta.focus(), 20);
  }

  function closeEditor() {
    if (modal) modal.classList.add('bookEditHidden');
    editingNumber = null;
  }

  function applyThroughMapper(number, text) {
    const state = getState();
    const node = state && state.nodes ? state.nodes.find(n => Number(n.number) === Number(number)) : null;
    if (!node) return false;
    const box = document.querySelector(`#nodes .node[data-id="${node.id}"]`);
    if (!box) return false;
    box.dispatchEvent(new MouseEvent('dblclick', {bubbles:true, cancelable:true, view:window}));
    const textarea = document.getElementById('nodeText');
    const apply = document.getElementById('applyNodeBtn');
    const editor = document.getElementById('editor');
    if (!textarea || !apply) return false;
    textarea.value = text;
    apply.click();
    if (editor) editor.classList.add('hidden');
    return true;
  }

  function saveChanges() {
    if (editingNumber == null || !modal) return;
    const text = modal.querySelector('#bookEditTextarea').value;
    if (!applyThroughMapper(editingNumber, text)) {
      alert('Could not update this section in the mapper.');
      return;
    }
    const number = editingNumber;
    closeEditor();
    const refresh = document.getElementById('bookRefresh');
    if (refresh) refresh.click();
    setTimeout(() => {
      const target = document.querySelector(`.bookPage[data-section="${CSS.escape(String(number))}"]`);
      if (target) target.scrollIntoView({behavior:'smooth', block:'center'});
    }, 180);
  }

  function attachEditButtons() {
    const overlay = document.getElementById('bookPreviewOverlay');
    if (!overlay) return;
    const tools = overlay.querySelectorAll('.bookSectionTools');
    tools.forEach(tool => {
      if (tool.querySelector('.editStoryText')) return;
      let prev = tool.previousElementSibling;
      while (prev && !prev.classList.contains('bookPage')) prev = prev.previousElementSibling;
      if (!prev) return;
      const number = prev.dataset.section;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'editStoryText';
      btn.textContent = 'Edit text';
      btn.addEventListener('click', () => openEditor(number));
      tool.insertBefore(btn, tool.firstChild);
    });
  }

  const observer = new MutationObserver(attachEditButtons);
  function install() {
    attachEditButtons();
    observer.observe(document.body, {childList:true, subtree:true});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
