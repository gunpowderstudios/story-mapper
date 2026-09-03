(() => {
  const mobile = window.matchMedia('(max-width: 700px)');
  const workspace = document.getElementById('workspace');
  const canvas = document.getElementById('canvas');
  if (!workspace || !canvas) return;

  const MIN_ZOOM = 0.35;
  const MAX_ZOOM = 2.0;
  const GROW_BY = 1400;
  const EDGE_TRIGGER = 420;

  let zoom = Number(sessionStorage.getItem('bodMapperZoom')) || 1;
  let pinch = null;
  let virtualWidth = Math.max(3200, parseFloat(canvas.style.width) || canvas.offsetWidth || 3200);
  let virtualHeight = Math.max(2400, parseFloat(canvas.style.height) || canvas.offsetHeight || 2400);
  let badgeTimer = null;

  const badge = document.createElement('div');
  badge.id = 'zoomBadge';
  Object.assign(badge.style, {
    position:'absolute',
    right:'10px',
    top:'70px',
    zIndex:'58',
    padding:'5px 8px',
    borderRadius:'8px',
    background:'rgba(16,18,20,.9)',
    border:'1px solid #444a50',
    color:'#f2eee6',
    fontSize:'12px',
    pointerEvents:'none',
    opacity:'0',
    transition:'opacity .18s ease'
  });
  document.body.appendChild(badge);

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function distance(a, b) {
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  }

  function midpoint(a, b) {
    return {x:(a.clientX+b.clientX)/2, y:(a.clientY+b.clientY)/2};
  }

  function showBadge() {
    badge.textContent = `${Math.round(zoom * 100)}%`;
    badge.style.opacity = '1';
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => badge.style.opacity = '0', 900);
  }

  function applyZoom(nextZoom, focusClientX = null, focusClientY = null) {
    nextZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    if (Math.abs(nextZoom - zoom) < 0.001) return;

    const wr = workspace.getBoundingClientRect();
    const fx = focusClientX == null ? wr.left + workspace.clientWidth / 2 : focusClientX;
    const fy = focusClientY == null ? wr.top + workspace.clientHeight / 2 : focusClientY;
    const viewX = fx - wr.left;
    const viewY = fy - wr.top;
    const logicalX = (workspace.scrollLeft + viewX) / zoom;
    const logicalY = (workspace.scrollTop + viewY) / zoom;

    zoom = nextZoom;
    canvas.style.zoom = String(zoom);
    sessionStorage.setItem('bodMapperZoom', String(zoom));

    requestAnimationFrame(() => {
      workspace.scrollLeft = Math.max(0, logicalX * zoom - viewX);
      workspace.scrollTop = Math.max(0, logicalY * zoom - viewY);
      showBadge();
      growIfNeeded();
    });
  }

  function syncVirtualSize() {
    const currentWidth = parseFloat(canvas.style.width) || 0;
    const currentHeight = parseFloat(canvas.style.height) || 0;
    virtualWidth = Math.max(virtualWidth, currentWidth, 3200);
    virtualHeight = Math.max(virtualHeight, currentHeight, 2400);
    if (currentWidth < virtualWidth) canvas.style.width = `${virtualWidth}px`;
    if (currentHeight < virtualHeight) canvas.style.height = `${virtualHeight}px`;
  }

  function growIfNeeded() {
    if (!mobile.matches) return;
    syncVirtualSize();

    const logicalRight = (workspace.scrollLeft + workspace.clientWidth) / zoom;
    const logicalBottom = (workspace.scrollTop + workspace.clientHeight) / zoom;
    let changed = false;

    if (virtualWidth - logicalRight < EDGE_TRIGGER) {
      virtualWidth += GROW_BY;
      changed = true;
    }
    if (virtualHeight - logicalBottom < EDGE_TRIGGER) {
      virtualHeight += GROW_BY;
      changed = true;
    }

    if (changed) {
      canvas.style.width = `${virtualWidth}px`;
      canvas.style.height = `${virtualHeight}px`;
    }
  }

  workspace.addEventListener('touchstart', e => {
    if (!mobile.matches || e.touches.length !== 2) return;
    const a = e.touches[0];
    const b = e.touches[1];
    pinch = {
      startDistance:Math.max(1, distance(a,b)),
      startZoom:zoom
    };
    document.body.classList.add('mapper-pinching');
  }, {passive:true});

  workspace.addEventListener('touchmove', e => {
    if (!mobile.matches || !pinch || e.touches.length !== 2) return;
    e.preventDefault();
    const a = e.touches[0];
    const b = e.touches[1];
    const mid = midpoint(a,b);
    const ratio = distance(a,b) / pinch.startDistance;
    applyZoom(pinch.startZoom * ratio, mid.x, mid.y);
  }, {passive:false});

  function endPinch(e) {
    if (!pinch) return;
    if (e.touches && e.touches.length >= 2) return;
    pinch = null;
    document.body.classList.remove('mapper-pinching');
    growIfNeeded();
  }

  workspace.addEventListener('touchend', endPinch, {passive:true});
  workspace.addEventListener('touchcancel', endPinch, {passive:true});
  workspace.addEventListener('scroll', growIfNeeded, {passive:true});

  const observer = new MutationObserver(() => {
    syncVirtualSize();
    growIfNeeded();
  });
  observer.observe(document.getElementById('nodes'), {childList:true});

  window.addEventListener('resize', growIfNeeded, {passive:true});

  canvas.style.zoom = String(clamp(zoom, MIN_ZOOM, MAX_ZOOM));
  zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  syncVirtualSize();
  growIfNeeded();

  window.BODMapperZoom = {
    get:() => zoom,
    set:value => applyZoom(Number(value) || 1),
    reset:() => applyZoom(1)
  };
})();
