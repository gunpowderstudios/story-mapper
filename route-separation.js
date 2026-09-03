(() => {
  const DIVERGE = 64;
  const SPACING = 18;
  const EDGE_MARGIN = 20;
  let timer = null;
  let busy = false;

  function getState() {
    try {
      const raw = localStorage.getItem('bodStoryMapper');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.links)) return parsed;
      if (parsed && parsed.state && Array.isArray(parsed.state.nodes) && Array.isArray(parsed.state.links)) return parsed.state;
    } catch (_) {}
    return {nodes:[], links:[]};
  }

  function nodeRect(id, canvasRect) {
    const el = document.querySelector(`#nodes .node[data-id="${CSS.escape(String(id))}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      left:r.left-canvasRect.left,
      right:r.right-canvasRect.left,
      top:r.top-canvasRect.top,
      bottom:r.bottom-canvasRect.top,
      cx:r.left-canvasRect.left+r.width/2,
      cy:r.top-canvasRect.top+r.height/2,
      width:r.width,
      height:r.height
    };
  }

  function nearestSide(p, r) {
    const d = {
      left:Math.abs(p.x-r.left),
      right:Math.abs(p.x-r.right),
      top:Math.abs(p.y-r.top),
      bottom:Math.abs(p.y-r.bottom)
    };
    return Object.keys(d).sort((a,b) => d[a]-d[b])[0];
  }

  function spreadPoint(r, side, offset) {
    if (side === 'left' || side === 'right') {
      const min = r.top + EDGE_MARGIN, max = r.bottom - EDGE_MARGIN;
      const y = Math.max(min, Math.min(max, r.cy + offset));
      return {x:side === 'left' ? r.left : r.right, y};
    }
    const min = r.left + EDGE_MARGIN, max = r.right - EDGE_MARGIN;
    const x = Math.max(min, Math.min(max, r.cx + offset));
    return {x, y:side === 'top' ? r.top : r.bottom};
  }

  function pointAt(path, len) {
    const p = path.getPointAtLength(Math.max(0, Math.min(path.getTotalLength(), len)));
    return {x:p.x,y:p.y};
  }

  function lineD(points) {
    if (!points.length) return '';
    return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}` + points.slice(1).map(p => ` L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join('');
  }

  function process() {
    if (busy) return;
    const svg = document.getElementById('links');
    const canvas = document.getElementById('canvas');
    if (!svg || !canvas) return;
    const visible = [...svg.querySelectorAll('.link[data-link-id]')];
    if (!visible.length) return;

    busy = true;
    try {
      const state = getState();
      const linkById = new Map((state.links || []).map(l => [String(l.id), l]));
      const canvasRect = canvas.getBoundingClientRect();
      const records = [];
      const groups = new Map();

      visible.forEach(path => {
        const id = String(path.dataset.linkId || '');
        const link = linkById.get(id);
        if (!link || path.dataset.routeSeparated === '1') return;
        let total = 0;
        try { total = path.getTotalLength(); } catch (_) { return; }
        if (!total) return;
        const fromRect = nodeRect(link.from, canvasRect);
        const toRect = nodeRect(link.to, canvasRect);
        if (!fromRect || !toRect) return;
        const start = pointAt(path, 0);
        const end = pointAt(path, total);
        const fromSide = nearestSide(start, fromRect);
        const toSide = nearestSide(end, toRect);
        const rec = {id,path,link,total,fromRect,toRect,fromSide,toSide};
        records.push(rec);
        [[link.from,fromSide,'from'],[link.to,toSide,'to']].forEach(([nodeId,side,endName]) => {
          const key = `${nodeId}|${side}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push({rec,endName});
        });
      });

      const offsets = new Map();
      groups.forEach(items => {
        items.sort((a,b) => String(a.rec.id).localeCompare(String(b.rec.id), undefined, {numeric:true}));
        const mid = (items.length - 1) / 2;
        items.forEach((item,i) => offsets.set(`${item.rec.id}|${item.endName}`, (i-mid)*SPACING));
      });

      records.forEach(rec => {
        const start = spreadPoint(rec.fromRect, rec.fromSide, offsets.get(`${rec.id}|from`) || 0);
        const end = spreadPoint(rec.toRect, rec.toSide, offsets.get(`${rec.id}|to`) || 0);
        const total = rec.total;
        const cut = Math.min(DIVERGE, Math.max(18,total*0.28));
        const points = [start];
        const startKeep = cut;
        const endKeep = Math.max(startKeep, total-cut);
        points.push(pointAt(rec.path,startKeep));
        for (let l=startKeep+10; l<endKeep; l+=10) points.push(pointAt(rec.path,l));
        if (endKeep > startKeep+1) points.push(pointAt(rec.path,endKeep));
        points.push(end);
        const d = lineD(points);
        rec.path.setAttribute('d',d);
        rec.path.dataset.routeSeparated = '1';
        const hit = svg.querySelector(`.linkHit[data-link-id="${CSS.escape(rec.id)}"]`);
        if (hit) {
          hit.setAttribute('d',d);
          hit.dataset.routeSeparated = '1';
        }
      });
    } finally {
      busy = false;
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(process, 18);
  }

  function install() {
    const svg = document.getElementById('links');
    if (!svg) return;
    const observer = new MutationObserver(mutations => {
      if (busy) return;
      if (mutations.some(m => m.type === 'childList')) schedule();
    });
    observer.observe(svg,{childList:true,subtree:true});
    window.addEventListener('resize',schedule);
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install);
  else install();
})();
