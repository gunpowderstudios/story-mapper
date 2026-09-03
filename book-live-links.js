(() => {
  let observer = null;
  let timer = null;
  let enabled = true;

  function getState() {
    try {
      const raw = localStorage.getItem('bodStoryMapper');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.links)) return parsed;
      if (parsed && parsed.state && Array.isArray(parsed.state.nodes) && Array.isArray(parsed.state.links)) return parsed.state;
    } catch (_) {}
    return {nodes:[], links:[]};
  }

  function getSet(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return new Set(Array.isArray(value) ? value.map(String) : []);
    } catch (_) {
      return new Set();
    }
  }

  function getDirection(linkId) {
    const id = String(linkId);
    const oneWay = getSet('bodOneWayLinks');
    if (!oneWay.has(id)) return 'two-way';
    const reverse = getSet('bodReverseOneWayLinks');
    return reverse.has(id) ? 'reverse' : 'forward';
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[<>"'&]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }

  function jumpTo(number) {
    const target = document.querySelector(`#bookPages .bookPage[data-section="${CSS.escape(String(number))}"]`);
    if (!target) return;
    target.scrollIntoView({behavior:'smooth', block:'center'});
    target.classList.add('bookJumpHighlight');
    setTimeout(() => target.classList.remove('bookJumpHighlight'), 1400);
  }

  function navigableLinks(state, nodeId) {
    const out = [];
    const seen = new Set();
    (state.links || []).forEach(link => {
      const direction = getDirection(link.id);
      let target = null;
      let reverse = false;

      if (Number(link.from) === Number(nodeId) && direction !== 'reverse') {
        target = Number(link.to);
      } else if (Number(link.to) === Number(nodeId) && direction !== 'forward') {
        target = Number(link.from);
        reverse = true;
      }

      if (target == null) return;
      const key = `${target}|${link.type}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({...link, to:target, reverse});
    });
    return out;
  }

  function makeGroup(title, links, nodeById, kind) {
    if (!links.length) return '';
    const buttons = links.map(link => {
      const dest = nodeById.get(Number(link.to));
      if (!dest) return `<span class="bookLiveBroken">Missing node (ID ${esc(link.to)})</span>`;
      const label = `${esc(dest.number)}${dest.title ? ` — ${esc(dest.title)}` : ''}`;
      return `<button type="button" class="bookLiveJump ${kind}" data-jump-section="${esc(dest.number)}">${label}</button>`;
    }).join('');
    return `<div class="bookLiveGroup"><span class="bookLiveLabel">${title}</span>${buttons}</div>`;
  }

  function injectLinks() {
    const pages = document.getElementById('bookPages');
    if (!pages) return;

    if (observer) observer.disconnect();
    pages.querySelectorAll('.bookLiveLinks').forEach(el => el.remove());

    const state = getState();
    const nodes = Array.isArray(state.nodes) ? state.nodes : [];
    const nodeById = new Map(nodes.map(n => [Number(n.id), n]));

    nodes.forEach(node => {
      const sectionPages = [...pages.querySelectorAll(`.bookPage[data-section="${CSS.escape(String(node.number))}"]`)];
      if (!sectionPages.length) return;
      const lastPage = sectionPages[sectionPages.length - 1];
      const outgoing = navigableLinks(state, node.id);
      if (!outgoing.length) return;

      const solid = outgoing.filter(l => l.type === 'choice');
      const dotted = outgoing.filter(l => l.type === 'read');
      const nav = document.createElement('div');
      nav.className = 'bookLiveLinks';
      nav.innerHTML = makeGroup('Choices', solid, nodeById, 'solid') + makeGroup('Automatic', dotted, nodeById, 'dotted');
      lastPage.appendChild(nav);
    });

    pages.querySelectorAll('[data-jump-section]').forEach(btn => {
      btn.addEventListener('click', () => jumpTo(btn.dataset.jumpSection));
    });

    const overlay = document.getElementById('bookPreviewOverlay');
    if (overlay) overlay.classList.toggle('bookLiveLinksOff', !enabled);
    connectObserver();
  }

  function scheduleInject() {
    clearTimeout(timer);
    timer = setTimeout(injectLinks, 220);
  }

  function connectObserver() {
    const pages = document.getElementById('bookPages');
    if (!pages) return;
    if (!observer) observer = new MutationObserver(scheduleInject);
    observer.observe(pages, {childList:true,subtree:true});
  }

  function installToggle() {
    const overlay = document.getElementById('bookPreviewOverlay');
    if (!overlay) return false;
    const top = overlay.querySelector('.bookPreviewTop');
    if (!top) return false;

    if (!document.getElementById('bookLiveLinksToggle')) {
      const btn = document.createElement('button');
      btn.id = 'bookLiveLinksToggle';
      btn.type = 'button';
      btn.textContent = 'Live links: ON';
      const close = document.getElementById('bookClose');
      top.insertBefore(btn, close || null);
      btn.addEventListener('click', () => {
        enabled = !enabled;
        overlay.classList.toggle('bookLiveLinksOff', !enabled);
        btn.textContent = `Live links: ${enabled ? 'ON' : 'OFF'}`;
      });
    }
    connectObserver();
    scheduleInject();
    return true;
  }

  window.addEventListener('bod-link-direction-change', scheduleInject);

  const bodyObserver = new MutationObserver(() => {
    if (installToggle()) bodyObserver.disconnect();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (!installToggle()) bodyObserver.observe(document.body, {childList:true,subtree:true});
    });
  } else if (!installToggle()) {
    bodyObserver.observe(document.body, {childList:true,subtree:true});
  }
})();
