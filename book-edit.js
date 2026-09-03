(() => {
  let modal = null;
  let editingNumber = null;
  let copyIssues = [];

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

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }

  function addIssue(list, issue) {
    if (!list.some(x => x.start === issue.start && x.end === issue.end && x.type === issue.type)) list.push(issue);
  }

  function findCopyIssues(text) {
    const issues = [];
    let m;

    const checks = [
      {
        re:/ {2,}/g,
        make:m => ({type:'Spacing', message:'More than one space.', replacement:' ', start:m.index, end:m.index + m[0].length})
      },
      {
        re:/\s+([,.;:!?])/g,
        make:m => ({type:'Punctuation', message:`Remove the space before “${m[1]}”.`, replacement:m[1], start:m.index, end:m.index + m[0].length})
      },
      {
        re:/([,.;:!?])([A-Za-z])/g,
        make:m => ({type:'Punctuation', message:`Add a space after “${m[1]}”.`, replacement:`${m[1]} ${m[2]}`, start:m.index, end:m.index + m[0].length})
      },
      {
        re:/\b([A-Za-z][A-Za-z’'-]*)\s+\1\b/gi,
        make:m => ({type:'Repeated word', message:`“${m[1]}” appears twice.`, replacement:m[1], start:m.index, end:m.index + m[0].length})
      },
      {
        re:/\bi\b/g,
        make:m => ({type:'Capitalisation', message:'The pronoun “I” should be capitalised.', replacement:'I', start:m.index, end:m.index + 1})
      },
      {
        re:/([.!?])\1{2,}/g,
        make:m => ({type:'Punctuation', message:'Repeated punctuation — check whether this is intentional.', replacement:m[1], start:m.index, end:m.index + m[0].length})
      }
    ];

    checks.forEach(check => {
      check.re.lastIndex = 0;
      while ((m = check.re.exec(text))) addIssue(issues, check.make(m));
    });

    const paraRe = /(^|\n\n)([^\n\s])/g;
    while ((m = paraRe.exec(text))) {
      const ch = m[2];
      if (/[a-z]/.test(ch)) {
        const start = m.index + m[1].length;
        addIssue(issues, {type:'Capitalisation', message:'This paragraph starts with a lower-case letter.', replacement:ch.toUpperCase(), start, end:start + 1});
      }
    }

    const sentenceRe = /[^.!?\n]+[.!?]+/g;
    while ((m = sentenceRe.exec(text))) {
      const words = m[0].trim().split(/\s+/).filter(Boolean);
      if (words.length > 45) {
        addIssue(issues, {
          type:'Readability',
          message:`Long sentence (${words.length} words). Worth checking for clarity.`,
          replacement:null,
          start:m.index,
          end:m.index + m[0].length
        });
      }
    }

    return issues.sort((a,b) => a.start - b.start || a.end - b.end);
  }

  function showIssue(issue) {
    const ta = modal && modal.querySelector('#bookEditTextarea');
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(issue.start, issue.end);
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 23;
    const before = ta.value.slice(0, issue.start);
    const line = before.split('\n').length - 1;
    ta.scrollTop = Math.max(0, line * lineHeight - ta.clientHeight * .35);
  }

  function applyIssue(index) {
    const issue = copyIssues[index];
    const ta = modal && modal.querySelector('#bookEditTextarea');
    if (!issue || !ta || issue.replacement == null) return;
    ta.value = ta.value.slice(0, issue.start) + issue.replacement + ta.value.slice(issue.end);
    ta.dispatchEvent(new Event('input', {bubbles:true}));
    runCopyCheck();
  }

  function renderCopyResults() {
    const panel = modal && modal.querySelector('#bookCopyResults');
    if (!panel) return;
    if (!copyIssues.length) {
      panel.innerHTML = '<div class="bookCopyClean"><strong>No obvious copy problems found.</strong><span>Browser spellcheck is still active for spelling. Read the prose through once for style and story logic.</span></div>';
      panel.classList.remove('hidden');
      return;
    }
    panel.innerHTML = `<div class="bookCopySummary"><strong>${copyIssues.length} item${copyIssues.length === 1 ? '' : 's'} to check</strong><span>Nothing is changed unless you press Fix.</span></div>` + copyIssues.map((issue, i) => `
      <div class="bookCopyIssue">
        <div class="bookCopyIssueText"><span class="bookCopyType">${esc(issue.type)}</span><span>${esc(issue.message)}</span></div>
        <div class="bookCopyButtons">
          <button type="button" data-show-issue="${i}">Show</button>
          ${issue.replacement == null ? '' : `<button type="button" class="bookCopyFix" data-fix-issue="${i}">Fix</button>`}
        </div>
      </div>`).join('');
    panel.classList.remove('hidden');
    panel.querySelectorAll('[data-show-issue]').forEach(btn => btn.addEventListener('click', () => showIssue(copyIssues[Number(btn.dataset.showIssue)])));
    panel.querySelectorAll('[data-fix-issue]').forEach(btn => btn.addEventListener('click', () => applyIssue(Number(btn.dataset.fixIssue))));
  }

  function runCopyCheck() {
    if (!modal) return;
    const ta = modal.querySelector('#bookEditTextarea');
    copyIssues = findCopyIssues(ta ? ta.value : '');
    renderCopyResults();
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
          <div class="bookCopyToolbar">
            <button id="bookCopyCheck" type="button">Check copy</button>
            <span>Checks punctuation, spacing, repeated words, capitalisation and very long sentences.</span>
          </div>
          <div id="bookCopyResults" class="bookCopyResults hidden"></div>
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
    modal.querySelector('#bookCopyCheck').addEventListener('click', runCopyCheck);
    modal.addEventListener('pointerdown', e => { if (e.target === modal) closeEditor(); });

    const textarea = modal.querySelector('#bookEditTextarea');
    textarea.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      insertBreak(textarea, e.shiftKey ? '\n' : '\n\n');
    });
    textarea.addEventListener('input', () => {
      const results = modal.querySelector('#bookCopyResults');
      if (results && !results.classList.contains('hidden')) results.classList.add('hidden');
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
    copyIssues = [];
    m.querySelector('#bookCopyResults').classList.add('hidden');
    m.classList.remove('bookEditHidden');
    setTimeout(() => ta.focus(), 20);
  }

  function closeEditor() {
    if (modal) modal.classList.add('bookEditHidden');
    editingNumber = null;
    copyIssues = [];
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
