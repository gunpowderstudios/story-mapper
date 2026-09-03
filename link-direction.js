(() => {
  const STORAGE_KEY = 'bodOneWayLinks';
  const REVERSE_KEY = 'bodReverseOneWayLinks';
  let oneWay = new Set();
  let reverseOneWay = new Set();
  let observer = null;
  let timer = null;

  function loadSet(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return new Set(Array.isArray(value) ? value.map(String) : []);
    } catch (_) {
      return new Set();
    }
  }

  function load() {
    oneWay = loadSet(STORAGE_KEY);
    reverseOneWay = loadSet(REVERSE_KEY);
    [...reverseOneWay].forEach(id => {
      if (!oneWay.has(id)) reverseOneWay.delete(id);
    });
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...oneWay]));
    localStorage.setItem(REVERSE_KEY, JSON.stringify([...reverseOneWay]));
    window.dispatchEvent(new CustomEvent('bod-link-direction-change'));
  }

  function selectedLinkId() {
    const selected = document.querySelector('#links .link.selectedLink');
    return selected ? String(selected.dataset.linkId || '') : '';
  }

  function ensureMarker(svg) {
    if (!svg) return;
    let marker = svg.querySelector('#bodOneWayArrow');
    if (!marker) {
      let defs = svg.querySelector('defs');
      if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svg.insertBefore(defs, svg.firstChild);
      }
      marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', 'bodOneWayArrow');
      const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arrow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
      arrow.setAttribute('fill', '#ffd54a');
      marker.appendChild(arrow);
      defs.appendChild(marker);
    }
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '8');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '4.5');
    marker.setAttribute('markerHeight', '4.5');
    marker.setAttribute('orient', 'auto-start-reverse');
    marker.setAttribute('markerUnits', 'strokeWidth');
  }

  function getDirection(id) {
    id = String(id || '');
    if (!oneWay.has(id)) return 'two-way';
    return reverseOneWay.has(id) ? 'reverse' : 'forward';
  }

  function updateVisuals() {
    const svg = document.getElementById('links');
    if (!svg) return;
    ensureMarker(svg);
    svg.querySelectorAll('.link[data-link-id]').forEach(path => {
      const id = String(path.dataset.linkId || '');
      const direction = getDirection(id);
      path.removeAttribute('marker-start');
      path.removeAttribute('marker-end');
      if (direction === 'forward') {
        path.setAttribute('marker-end', 'url(#bodOneWayArrow)');
        path.classList.add('oneWayLink');
      } else if (direction === 'reverse') {
        path.setAttribute('marker-start', 'url(#bodOneWayArrow)');
        path.classList.add('oneWayLink');
      } else {
        path.classList.remove('oneWayLink');
      }
    });
    updateButton();
  }

  function updateButton() {
    const btn = document.getElementById('directionLineBtn');
    if (!btn) return;
    const id = selectedLinkId();
    const direction = getDirection(id);
    btn.disabled = !id;
    if (!id || direction === 'two-way') {
      btn.textContent = 'Make One-way';
      btn.title = 'Make this link one-way in the drawn direction';
    } else if (direction === 'forward') {
      btn.textContent = 'Reverse One-way';
      btn.title = 'Reverse the permitted direction on this link';
    } else {
      btn.textContent = 'Make Two-way';
      btn.title = 'Allow travel in both directions on this link';
    }
    const active = id && direction !== 'two-way';
    btn.style.borderColor = active ? '#ffd54a' : '';
    btn.style.color = active ? '#ffd54a' : '';
  }

  function cycleSelected() {
    const id = selectedLinkId();
    if (!id) return;
    const direction = getDirection(id);
    if (direction === 'two-way') {
      oneWay.add(id);
      reverseOneWay.delete(id);
    } else if (direction === 'forward') {
      oneWay.add(id);
      reverseOneWay.add(id);
    } else {
      oneWay.delete(id);
      reverseOneWay.delete(id);
    }
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
    btn.addEventListener('click', cycleSelected);
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
      isReverse(id) { return reverseOneWay.has(String(id)); },
      getDirection(id) { return getDirection(id); },
      getOneWayIds() { return [...oneWay]; },
      getReverseIds() { return [...reverseOneWay]; }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
