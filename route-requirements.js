(() => {
  const STATS = {
    INT: {colour:'#63c7ff', label:'INT'},
    DEX: {colour:'#ffd54a', label:'DEX'},
    CHA: {colour:'#ff6bb5', label:'CHA'},
    STR: {colour:'#ff784e', label:'STR'}
  };
  const ITEM_COLOUR = '#d9b45b';
  let observer = null;
  let timer = null;

  function readLocalState() {
    try {
      const parsed = JSON.parse(localStorage.getItem('bodStoryMapper') || 'null');
      if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.links)) return parsed;
      if (parsed && parsed.state && Array.isArray(parsed.state.nodes) && Array.isArray(parsed.state.links)) return parsed.state;
    } catch (_) {}
    return null;
  }

  function selectedLinkId() {
    const selected = document.querySelector('#links .link.selectedLink');
    return selected ? String(selected.dataset.linkId || '') : '';
  }

  async function captureCurrentState() {
    const exportBtn = document.getElementById('exportBtn');
    if (!exportBtn) return readLocalState();

    const oldCreate = URL.createObjectURL;
    const oldRevoke = URL.revokeObjectURL;
    const oldClick = HTMLAnchorElement.prototype.click;
    let captured = null;

    try {
      URL.createObjectURL = blob => {
        captured = blob;
        return 'blob:bod-route-requirement';
      };
      URL.revokeObjectURL = () => {};
      HTMLAnchorElement.prototype.click = function() {};
      exportBtn.click();
    } finally {
      URL.createObjectURL = oldCreate;
      URL.revokeObjectURL = oldRevoke;
      HTMLAnchorElement.prototype.click = oldClick;
    }

    if (!captured || typeof captured.text !== 'function') return readLocalState();
    try {
      const parsed = JSON.parse(await captured.text());
      if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.links)) return parsed;
    } catch (_) {}
    return readLocalState();
  }

  function importState(state) {
    const input = document.getElementById('importInput');
    if (!input || typeof DataTransfer === 'undefined' || typeof File === 'undefined') {
      localStorage.setItem('bodStoryMapper', JSON.stringify(state));
      location.reload();
      return;
    }
    const file = new File([JSON.stringify(state)], 'route-requirement.json', {type:'application/json'});
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', {bubbles:true}));
  }

  function requirementFor(link) {
    const req = String(link && link.requirement || '').toUpperCase();
    if (STATS[req]) return {kind:'stat', value:req, label:req, colour:STATS[req].colour};
    if (req === 'ITEM' && String(link.requiredObject || '').trim()) {
      const item = String(link.requiredObject).trim();
      return {kind:'item', value:'ITEM', label:`ITEM: ${item}`, colour:ITEM_COLOUR};
    }
    return null;
  }

  function addLegend() {
    if (document.getElementById('routeRequirementLegend')) return;
    const hint = document.getElementById('hint');
    if (!hint || !hint.parentNode) return;

    const legend = document.createElement('div');
    legend.id = 'routeRequirementLegend';
    legend.setAttribute('aria-label', 'Route requirement key');
    legend.innerHTML = `
      <strong>Route key</strong>
      <span><i style="background:${STATS.INT.colour}"></i>INT</span>
      <span><i style="background:${STATS.DEX.colour}"></i>DEX</span>
      <span><i style="background:${STATS.CHA.colour}"></i>CHA</span>
      <span><i style="background:${STATS.STR.colour}"></i>STR</span>
      <span><i style="background:${ITEM_COLOUR}"></i>ITEM needed</span>
    `;
    hint.parentNode.insertBefore(legend, hint);
  }

  function addStyles() {
    if (document.getElementById('routeRequirementStyles')) return;
    const style = document.createElement('style');
    style.id = 'routeRequirementStyles';
    style.textContent = `
      #routeRequirementLegend{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:7px 14px;background:#171a20;border-bottom:1px solid #303641;color:#cfd6df;font:12px Arial,sans-serif}
      #routeRequirementLegend strong{color:#fff;margin-right:2px}
      #routeRequirementLegend span{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
      #routeRequirementLegend i{display:inline-block;width:18px;height:4px;border-radius:4px}
      #routeRequirementSelect{max-width:145px}
      #links .routeReqLabel{pointer-events:none}
      #links .routeReqLabel rect{stroke:#101216;stroke-width:1.5}
      #links .routeReqLabel text{font:700 11px Arial,sans-serif;fill:#111;dominant-baseline:middle;text-anchor:middle}
      @media(max-width:700px){#routeRequirementLegend{gap:8px;padding:6px 8px;font-size:11px}#routeRequirementLegend i{width:14px}}
      @media print{#routeRequirementLegend{display:none!important}}
    `;
    document.head.appendChild(style);
  }

  function addControl() {
    if (document.getElementById('routeRequirementSelect')) return;
    const toggle = document.getElementById('toggleLineBtn');
    if (!toggle || !toggle.parentNode) return;

    const select = document.createElement('select');
    select.id = 'routeRequirementSelect';
    select.className = 'secondary';
    select.disabled = true;
    select.title = 'Requirement for the selected route';
    select.setAttribute('aria-label', 'Route requirement');
    select.innerHTML = `
      <option value="">No requirement</option>
      <option value="INT">INT roll</option>
      <option value="DEX">DEX roll</option>
      <option value="CHA">Charisma roll</option>
      <option value="STR">Strength roll</option>
      <option value="ITEM">Item needed…</option>
    `;
    select.addEventListener('change', onRequirementChange);
    toggle.parentNode.insertBefore(select, toggle.nextSibling);
  }

  function updateControl() {
    const select = document.getElementById('routeRequirementSelect');
    if (!select) return;
    const id = selectedLinkId();
    select.disabled = !id;
    if (!id) {
      select.value = '';
      select.title = 'Select a route first';
      return;
    }
    const state = readLocalState();
    const link = state && state.links.find(l => String(l.id) === id);
    const req = requirementFor(link);
    select.value = req ? req.value : '';
    select.title = req && req.kind === 'item' ? req.label : 'Requirement for the selected route';
  }

  async function onRequirementChange(e) {
    const select = e.currentTarget;
    const id = selectedLinkId();
    if (!id) return;
    const value = String(select.value || '').toUpperCase();
    const state = await captureCurrentState();
    if (!state) return;
    const link = state.links.find(l => String(l.id) === id);
    if (!link) return;

    if (!value) {
      delete link.requirement;
      delete link.requiredObject;
    } else if (STATS[value]) {
      link.requirement = value;
      delete link.requiredObject;
    } else if (value === 'ITEM') {
      const previous = String(link.requiredObject || '').trim();
      const item = prompt('What item is needed for this route?', previous || 'Iron Key');
      if (item === null) {
        updateControl();
        return;
      }
      const cleaned = item.trim();
      if (!cleaned) {
        delete link.requirement;
        delete link.requiredObject;
      } else {
        link.requirement = 'ITEM';
        link.requiredObject = cleaned;
      }
    }

    importState(state);
    setTimeout(() => {
      schedule();
      updateControl();
    }, 120);
  }

  function makeLabel(svg, path, req, id) {
    let length = 0;
    try { length = path.getTotalLength(); } catch (_) { return; }
    if (!length) return;
    let point;
    try { point = path.getPointAtLength(length * 0.5); } catch (_) { return; }

    const display = req.kind === 'item' && req.label.length > 22 ? req.label.slice(0, 21) + '…' : req.label;
    const width = Math.max(34, Math.min(150, display.length * 7 + 16));
    const height = 20;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'routeReqLabel');
    g.dataset.linkId = id;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', point.x - width / 2);
    rect.setAttribute('y', point.y - height / 2);
    rect.setAttribute('width', width);
    rect.setAttribute('height', height);
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', req.colour);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', point.x);
    text.setAttribute('y', point.y + 0.5);
    text.textContent = display;

    g.appendChild(rect);
    g.appendChild(text);
    svg.appendChild(g);
  }

  function applyVisuals() {
    const svg = document.getElementById('links');
    if (!svg) return;
    svg.querySelectorAll('.routeReqLabel').forEach(el => el.remove());

    const state = readLocalState();
    if (!state) return;
    state.links.forEach(link => {
      const id = String(link.id);
      const req = requirementFor(link);
      const path = svg.querySelector(`.link[data-link-id="${CSS.escape(id)}"]`);
      if (!path) return;

      path.style.removeProperty('stroke');
      if (!req) return;

      if (req.kind === 'stat' && !path.classList.contains('selectedLink')) {
        path.style.setProperty('stroke', req.colour, 'important');
      }
      makeLabel(svg, path, req, id);
    });
    updateControl();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(applyVisuals, 45);
  }

  function installObserver() {
    const svg = document.getElementById('links');
    if (!svg || observer) return;
    observer = new MutationObserver(mutations => {
      if (mutations.some(m => m.type === 'childList')) schedule();
    });
    observer.observe(svg, {childList:true, subtree:true});
  }

  function install() {
    addStyles();
    addLegend();
    addControl();
    installObserver();
    document.addEventListener('pointerup', () => {
      setTimeout(updateControl, 0);
      schedule();
    });
    document.addEventListener('click', () => setTimeout(updateControl, 0));
    window.addEventListener('resize', schedule);
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
