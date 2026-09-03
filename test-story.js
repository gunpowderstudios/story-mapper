(() => {
  let overlay = null;
  let currentId = null;
  let chain = [];

  function getState() {
    try {
      const raw = localStorage.getItem('bodStoryMapper');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed.nodes)) return parsed;
      if (parsed && parsed.state && Array.isArray(parsed.state.nodes)) return parsed.state;
    } catch (_) {}
    return {nodes:[], links:[]};
  }

  function getOneWayIds() {
    try {
      const value = JSON.parse(localStorage.getItem('bodOneWayLinks') || '[]');
      return new Set(Array.isArray(value) ? value.map(String) : []);
    } catch (_) {
      return new Set();
    }
  }

  function syncMap() {
    const save = document.getElementById('saveBtn');
    if (save) save.click();
    const panel = document.getElementById('githubPanel');
    if (panel) setTimeout(() => panel.classList.add('hidden'), 0);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>'\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','\"':'&quot;'}[c]));
  }

  function nodeById(state, id) {
    return (state.nodes || []).find(n => Number(n.id) === Number(id));
  }

  function sortedNodes(state) {
    return [...(state.nodes || [])].sort((a,b) => Number(a.number) - Number(b.number));
  }

  function outgoing(state, id) {
    const oneWay = getOneWayIds();
    const result = [];
    const seen = new Set();
    (state.links || []).forEach(link => {
      let target = null;
      let reverse = false;
      if (Number(link.from) === Number(id)) target = Number(link.to);
      else if (Number(link.to) === Number(id) && !oneWay.has(String(link.id))) {
        target = Number(link.from);
        reverse = true;
      }
      if (target == null) return;
      const key = `${target}|${link.type}`;
      if (seen.has(key)) return;
      seen.add(key);
      result.push({...link, to:target, reverse});
    });
    return result;
  }

  function chainNumbers(state) {
    return chain.map(id => {
      const n = nodeById(state, id);
      return n ? n.number : '?';
    });
  }

  function renderStartOptions(state) {
    const select = overlay.querySelector('#testStartSelect');
    const old = select.value;
    select.innerHTML = sortedNodes(state).map(n => `<option value="${n.id}">${esc(n.number)} — ${esc(n.title || 'Untitled')}</option>`).join('');
    if (old && [...select.options].some(o => o.value === old)) select.value = old;
  }

  function renderCurrent() {
    const state = getState();
    renderStartOptions(state);
    const body = overlay.querySelector('#testStoryBody');
    const trail = overlay.querySelector('#testTrail');
    const status = overlay.querySelector('#testStatus');
    trail.textContent = chain.length ? `Path: ${chainNumbers(state).join(' → ')}` : 'Choose a starting section.';

    if (currentId == null) {
      body.innerHTML = '<div class="testEmpty">Choose a starting section above, then press Start.</div>';
      status.textContent = `${state.nodes.length} sections • ${(state.links || []).length} drawn links`;
      return;
    }

    const node = nodeById(state, currentId);
    if (!node) {
      body.innerHTML = '<div class="testWarning">This link points to a section that no longer exists.</div>';
      status.textContent = 'Broken destination';
      return;
    }

    const links = outgoing(state, currentId);
    const buttons = links.map(l => {
      const target = nodeById(state, l.to);
      const dotted = l.type === 'read';
      if (!target) {
        return `<button class="testBroken" disabled>${dotted ? 'Dotted' : 'Solid'} → missing node ${esc(l.to)}</button>`;
      }
      const direction = l.reverse ? 'Return route' : (getOneWayIds().has(String(l.id)) ? 'One-way' : 'Two-way');
      return `<button class="testLink ${dotted ? 'testDotted' : 'testSolid'}" data-target="${target.id}" data-type="${esc(l.type)}">
        <span>${dotted ? 'Dotted / automatic' : 'Solid / choice'} • ${direction}</span>
        <strong>Go to ${esc(target.number)}</strong>
        <small>${esc(target.title || 'Untitled')}</small>
      </button>`;
    }).join('');

    body.innerHTML = `
      <article class="testSectionCard">
        <div class="testSectionNo">${esc(node.number)}</div>
        <h2>${esc(node.title || 'Untitled')}</h2>
        <div class="testStoryText">${esc(node.text || '').replace(/\n/g,'<br>')}</div>
      </article>
      <div class="testDestinations">
        <h3>${links.length ? 'Linked sections' : 'No available links'}</h3>
        ${buttons || '<div class="testDeadEnd">Dead end — this section has no link leading onwards or back.</div>'}
      </div>`;

    body.querySelectorAll('.testLink').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = Number(btn.dataset.target);
        currentId = target;
        chain.push(target);
        renderCurrent();
      });
    });

    const broken = links.filter(l => !nodeById(state, l.to)).length;
    status.textContent = `${links.length} available route${links.length === 1 ? '' : 's'}${broken ? ` • ${broken} broken` : ''}`;
  }

  function startTest() {
    syncMap();
    setTimeout(() => {
      const state = getState();
      renderStartOptions(state);
      const id = Number(overlay.querySelector('#testStartSelect').value);
      if (!id) return;
      currentId = id;
      chain = [id];
      renderCurrent();
    }, 30);
  }

  function backOne() {
    if (chain.length <= 1) return;
    chain.pop();
    currentId = chain[chain.length - 1];
    renderCurrent();
  }

  function resetTest() {
    currentId = null;
    chain = [];
    renderCurrent();
  }

  function previewChain() {
    const state = getState();
    if (!chain.length) return;
    const modal = document.createElement('div');
    modal.className = 'testChainPreview';
    const pages = chain.map((id, i) => {
      const n = nodeById(state, id);
      if (!n) return '';
      const outs = outgoing(state, id).map(l => {
        const t = nodeById(state, l.to);
        return t ? `${l.type === 'read' ? 'Dotted' : 'Solid'} → ${t.number}` : `Broken → ${l.to}`;
      }).join(' • ');
      return `<article class="testBookPage">
        <div class="testBookSection">${esc(n.number)}</div>
        <div class="testBookText">${esc(n.text || '').replace(/\n/g,'<br>')}</div>
        <div class="testBookLinks">${esc(outs || 'No available links')}</div>
        <div class="testBookPageNo">${i + 1}</div>
      </article>`;
    }).join('');
    modal.innerHTML = `<div class="testChainTop"><strong>Test Path: ${esc(chainNumbers(state).join(' → '))}</strong><button type="button">Back to Test</button></div><div class="testChainPages">${pages}</div>`;
    modal.querySelector('button').addEventListener('click', () => modal.remove());
    overlay.appendChild(modal);
  }

  function createOverlay() {
    overlay = document.createElement('section');
    overlay.id = 'testStoryOverlay';
    overlay.className = 'testStoryHidden';
    overlay.innerHTML = `
      <div class="testStoryTop">
        <strong>Test Story</strong>
        <span id="testStatus">Links are two-way unless marked One-way in the mapper.</span>
        <span class="testSpacer"></span>
        <select id="testStartSelect" aria-label="Starting section"></select>
        <button id="testStartBtn">Start</button>
        <button id="testBackBtn">← Back one</button>
        <button id="testPreviewChainBtn">Preview path</button>
        <button id="testResetBtn">Reset</button>
        <button id="testCloseBtn" class="primary">Back to Mapper</button>
      </div>
      <div id="testTrail" class="testTrail">Choose a starting section.</div>
      <div id="testStoryBody" class="testStoryBody"></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#testStartBtn').addEventListener('click', startTest);
    overlay.querySelector('#testBackBtn').addEventListener('click', backOne);
    overlay.querySelector('#testResetBtn').addEventListener('click', resetTest);
    overlay.querySelector('#testPreviewChainBtn').addEventListener('click', previewChain);
    overlay.querySelector('#testCloseBtn').addEventListener('click', () => overlay.classList.add('testStoryHidden'));
  }

  function openTest() {
    if (!overlay) createOverlay();
    syncMap();
    setTimeout(() => {
      overlay.classList.remove('testStoryHidden');
      renderCurrent();
    }, 30);
  }

  function install() {
    const tools = document.querySelector('.tools');
    if (!tools || document.getElementById('testStoryBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'testStoryBtn';
    btn.className = 'secondary';
    btn.textContent = 'Test Story';
    const preview = document.getElementById('bookPreviewBtn');
    if (preview && preview.nextSibling) tools.insertBefore(btn, preview.nextSibling);
    else {
      const save = document.getElementById('saveBtn');
      tools.insertBefore(btn, save || null);
    }
    btn.addEventListener('click', openTest);
  }

  window.addEventListener('bod-link-direction-change', () => {
    if (overlay && !overlay.classList.contains('testStoryHidden')) renderCurrent();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
