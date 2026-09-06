(() => {
  const STORAGE_KEY = 'bodStoryMapper';
  const ONE_WAY_KEY = 'bodOneWayLinks';
  const REVERSE_KEY = 'bodReverseOneWayLinks';
  let observer = null;
  let timer = null;
  let openingTarget = false;

  function getState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
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
    const id = String(linkId || '');
    const oneWay = getSet(ONE_WAY_KEY);
    if (!oneWay.has(id)) return 'two-way';
    return getSet(REVERSE_KEY).has(id) ? 'reverse' : 'forward';
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[ch]));
  }

  function currentNode(state) {
    const numberInput = document.getElementById('nodeNumber');
    if (!numberInput) return null;
    const number = Number(numberInput.value);
    if (!Number.isFinite(number)) return null;
    return (state.nodes || []).find(n => Number(n.number) === number) || null;
  }

  function connectedRoutes(state, node) {
    if (!node) return [];
    const results = [];
    (state.links || []).forEach(link => {
      const fromHere = Number(link.from) === Number(node.id);
      const toHere = Number(link.to) === Number(node.id);
      if (!fromHere && !toHere) return;

      const direction = getDirection(link.id);
      let targetId = null;
      let permitted = true;
      let arrow = '↔';

      if (direction === 'two-way') {
        targetId = fromHere ? link.to : link.from;
      } else if (direction === 'forward') {
        targetId = fromHere ? link.to : link.from;
        permitted = fromHere;
        arrow = fromHere ? '→' : '←';
      } else {
        targetId = fromHere ? link.to : link.from;
        permitted = toHere;
        arrow = fromHere ? '←' : '→';
      }

      const target = (state.nodes || []).find(n => Number(n.id) === Number(targetId));
      if (!target) return;
      results.push({link,target,permitted,arrow,dotted:link.type === 'read'});
    });

    return results.sort((a,b) => Number(a.target.number) - Number(b.target.number));
  }

  function ensurePanel() {
    if (document.getElementById('nodeLinkedSections')) return;
    const textarea = document.getElementById('nodeText');
    if (!textarea) return;
    const label = textarea.closest('label');
    if (!label || !label.parentNode) return;

    const panel = document.createElement('div');
    panel.id = 'nodeLinkedSections';
    panel.className = 'nodeLinkedSections';
    label.insertAdjacentElement('afterend', panel);
  }

  function ensureStyles() {
    if (document.getElementById('nodeLinkedSectionsStyle')) return;
    const style = document.createElement('style');
    style.id = 'nodeLinkedSectionsStyle';
    style.textContent = `
      .nodeLinkedSections{margin-top:-4px;padding:10px 11px;border:1px solid #343b45;border-radius:7px;background:#11151a;color:#d8dee7;font:12px/1.35 Arial,sans-serif}
      .nodeLinkedSectionsHead{display:flex;align-items:center;gap:8px;margin-bottom:7px;color:#fff;font-weight:700}
      .nodeLinkedSectionsHint{font-weight:400;color:#8f98a5}
      .nodeLinkedSectionsList{display:flex;flex-direction:column;gap:6px}
      .nodeLinkedRoute{display:flex;align-items:center;gap:7px;min-width:0;padding:7px 8px;border:1px solid #313844;border-radius:6px;background:#1a1f26;color:inherit;text-align:left;cursor:pointer;font:inherit;width:100%}
      .nodeLinkedRoute:hover,.nodeLinkedRoute:focus-visible{background:#242b34;border-color:#596575;outline:none}
      .nodeLinkedRoute.isDotted{border-style:dashed}
      .nodeLinkedRoute.notPermitted{opacity:.52}
      .nodeLinkedArrow{flex:0 0 auto;width:20px;text-align:center;color:#ffd54a;font-weight:700}
      .nodeLinkedNumber{flex:0 0 auto;min-width:34px;color:#ffd54a;font-weight:700}
      .nodeLinkedTitle{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#fff}
      .nodeLinkedType{margin-left:auto;flex:0 0 auto;color:#8f98a5;font-size:10px;text-transform:uppercase;letter-spacing:.03em}
      .nodeLinkedEmpty{color:#8f98a5}
    `;
    document.head.appendChild(style);
  }

  function openTargetNode(targetId) {
    if (openingTarget) return;
    openingTarget = true;

    const apply = document.getElementById('applyNodeBtn');
    if (apply) apply.click();

    setTimeout(() => {
      const target = document.querySelector(`#nodes .node[data-id="${CSS.escape(String(targetId))}"]`);
      if (target) {
        target.dispatchEvent(new MouseEvent('dblclick', {bubbles:true, cancelable:true, view:window}));
      }
      openingTarget = false;
      setTimeout(render, 20);
    }, 50);
  }

  function render() {
    if (openingTarget) return;
    ensurePanel();
    const panel = document.getElementById('nodeLinkedSections');
    const editor = document.getElementById('editor');
    if (!panel || !editor || editor.classList.contains('hidden')) return;

    const state = getState();
    const node = currentNode(state);
    if (!node) {
      panel.innerHTML = '<div class="nodeLinkedEmpty">No connected sections found.</div>';
      return;
    }

    const routes = connectedRoutes(state, node);
    const rows = routes.map(route => `
      <button type="button" class="nodeLinkedRoute ${route.dotted ? 'isDotted' : ''} ${route.permitted ? '' : 'notPermitted'}" data-target-id="${esc(route.target.id)}" title="Save current edits and open ${esc(route.target.number)} — ${esc(route.target.title || 'Untitled')}">
        <span class="nodeLinkedArrow">${esc(route.arrow)}</span>
        <span class="nodeLinkedNumber">${esc(route.target.number)}</span>
        <span class="nodeLinkedTitle">${esc(route.target.title || 'Untitled')}</span>
        <span class="nodeLinkedType">${route.dotted ? 'dotted' : 'solid'}${route.permitted ? '' : ' • incoming only'}</span>
      </button>`).join('');

    panel.innerHTML = `
      <div class="nodeLinkedSectionsHead">Connected sections <span class="nodeLinkedSectionsHint">click to save this section and edit the linked one</span></div>
      <div class="nodeLinkedSectionsList">${rows || '<div class="nodeLinkedEmpty">No links connected to this node yet.</div>'}</div>`;

    panel.querySelectorAll('.nodeLinkedRoute[data-target-id]').forEach(button => {
      button.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        openTargetNode(button.dataset.targetId);
      });
    });
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(render, 30);
  }

  function install() {
    ensureStyles();
    ensurePanel();

    const editor = document.getElementById('editor');
    if (editor && !observer) {
      observer = new MutationObserver(mutations => {
        if (mutations.some(m => m.type === 'attributes' && m.attributeName === 'class')) schedule();
      });
      observer.observe(editor, {attributes:true, attributeFilter:['class']});
    }

    const numberInput = document.getElementById('nodeNumber');
    if (numberInput) numberInput.addEventListener('input', schedule);
    const apply = document.getElementById('applyNodeBtn');
    if (apply) apply.addEventListener('click', () => setTimeout(schedule, 30));
    document.addEventListener('dblclick', schedule);
    window.addEventListener('bod-link-direction-change', schedule);
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
