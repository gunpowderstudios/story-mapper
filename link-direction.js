(() => {
  const STORAGE_KEY = 'bodOneWayLinks';
  let oneWay = new Set();
  let observer = null;
  let timer = null;

  function load() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      oneWay = new Set(Array.isArray(value) ? value.map(String) : []);
    } catch (_) {
      oneWay = new Set();
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...oneWay]));
    window.dispatchEvent(new CustomEvent('bod-link-direction-change'));
  }

  function selectedLinkId() {
    const selected = document.querySelector('#links .link.selectedLink');
    return selected ? String(selected.dataset.linkId || '') : '';
  }

  function ensureMarker(svg) {
    if (!svg || svg.querySelector('#bodOneWayArrow')) return;
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'bodOneWayArrow');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '8');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '7');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('orient', 'auto-start-reverse');
    marker.setAttribute('markerUnits', 'strokeWidth');
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    arrow.setAttribute('fill', '#ffd54a');
    marker.appendChild(arrow);
    defs.appendChild(marker);
    svg.insertBefore(defs, svg.firstChild);
  }

  function updateVisuals() {
    const svg = document.getElementById('links');
    if (!svg) return;
    ensureMarker(svg);
    svg.querySelectorAll('.link[data-link-id]').forEach(path => {
      const id = String(path.dataset.linkId || '');
      if (oneWay.has(id)) {
        path.setAttribute('marker-end', 'url(#bodOneWayArrow)');
        path.classList.add('oneWayLink');
      } else {
        path.removeAttribute('marker-end');
        path.classList.remove('oneWayLink');
      }
    });
    updateButton();
  }

  function updateButton() {
    const btn = document.getElementById('directionLineBtn');
    if (!btn) return;
    const id = selectedLinkId();
    btn.disabled = !id;
    btn.textContent = id && oneWay.has(id) ? 'Make Two-way' : 'Make One-way';
    btn.title = id && oneWay.has(id)
      ? 'Allow travel in both directions on this link'
      : 'Prevent returning along this link';
    btn.style.borderColor = id && oneWay.has(id) ? '#ffd54a' : '';
    btn.style.color = id && oneWay.has(id) ? '#ffd54a' : '';
  }

  function toggleSelected() {
    const id = selectedLinkId();
    if (!id) return;
    if (oneWay.has(id)) oneWay.delete(id);
    else oneWay.add(id);
    save();
    updateVisuals();
  }

  function installButton() {
    if (document.getElementById('directionLineBtn')) return;
    const toggle = document.getElementById('toggleLineBtn');
    if (!toggle || !toggle.parentNode) return;
    const btn = document.createElement('button');
    btn.id = 'directionLineBtn';
    btn.className = 'secondary';
    btn.disabled = true;
    btn.textContent = 'Make One-way';
    btn.addEventListener('click', toggleSelected);
    toggle.parentNode.insertBefore(btn, toggle.nextSibling);
  }

  function connectObserver() {
    const svg = document.getElementById('links');
    if (!svg) return;
    if (!observer) {
      observer = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(updateVisuals, 0);
      });
    }
    observer.observe(svg, {childList:true, subtree:true, attributes:true, attributeFilter:['class']});
  }

  function install() {
    load();
    installButton();
    connectObserver();
    document.addEventListener('pointerup', () => setTimeout(updateVisuals, 0));
    document.addEventListener('click', () => setTimeout(updateButton, 0));
    updateVisuals();
    window.BODLinkDirections = {
      isOneWay(id) { return oneWay.has(String(id)); },
      getOneWayIds() { return [...oneWay]; }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
