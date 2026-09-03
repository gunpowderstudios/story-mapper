(() => {
  const SPACING = 35;
  const EDGE_PADDING = 20;
  const FAN_LENGTH = 34;
  let observer = null;
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

  function canvasPointForNode(nodeEl) {
    const canvas = document.getElementById('canvas');
    const cr = canvas.getBoundingClientRect();
    const r = nodeEl.getBoundingClientRect();
    return {
      left:r.left-cr.left,
      right:r.right-cr.left,
      top:r.top-cr.top,
      bottom:r.bottom-cr.top,
      width:r.width,
      height:r.height,
      cx:r.left-cr.left+r.width/2,
      cy:r.top-cr.top+r.height/2
    };
  }

  function closestSide(p, r) {
    const distances = [
      ['left', Math.abs(p.x-r.left)],
      ['right', Math.abs(p.x-r.right)],
      ['top', Math.abs(p.y-r.top)],
      ['bottom', Math.abs(p.y-r.bottom)]
    ];
    distances.sort((a,b)=>a[1]-b[1]);
    return distances[0][0];
  }

  function pointOnSide(r, side, offset) {
    if (side === 'left' || side === 'right') {
      const half = Math.max(0, r.height/2-EDGE_PADDING);
      const y = r.cy + Math.max(-half, Math.min(half, offset));
      return {x:side === 'left' ? r.left : r.right, y};
    }
    const half = Math.max(0, r.width/2-EDGE_PADDING);
    const x = r.cx + Math.max(-half, Math.min(half, offset));
    return {x, y:side === 'top' ? r.top : r.bottom};
  }

  function endpointInfo(path, atEnd) {
    const len = path.getTotalLength();
    const pos = atEnd ? len : 0;
    const fan = atEnd ? Math.max(0, len-FAN_LENGTH) : Math.min(len, FAN_LENGTH);
    return {len, edge:path.getPointAtLength(pos), fan:path.getPointAtLength(fan)};
  }

  function sampledPath(path, startPoint, endPoint) {
    const len = path.getTotalLength();
    if (!Number.isFinite(len) || len < 1) return path.getAttribute('d') || '';
    const pts = [startPoint];
    const startAt = Math.min(FAN_LENGTH, len/3);
    const endAt = Math.max(startAt, len-Math.min(FAN_LENGTH, len/3));
    pts.push({x:path.getPointAtLength(startAt).x, y:path.getPointAtLength(startAt).y});
    for (let d=startAt+10; d<endAt; d+=10) {
      const p = path.getPointAtLength(d);
      pts.push({x:p.x,y:p.y});
    }
    const nearEnd = path.getPointAtLength(endAt);
    pts.push({x:nearEnd.x,y:nearEnd.y});
    pts.push(endPoint);
    return pts.map((p,i)=>`${i?'L':'M'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  }

  function spreadRoutes() {
    if (busy) return;
    const svg = document.getElementById('links');
    const nodesLayer = document.getElementById('nodes');
    if (!svg || !nodesLayer) return;
    busy = true;
    try {
      const state = getState();
      const groups = new Map();
      const records = [];

      (state.links || []).forEach(link => {
        const path = svg.querySelector(`.link[data-link-id="${CSS.escape(String(link.id))}"]`);
        if (!path) return;
        if (!path.dataset.routeSpacingBase) path.dataset.routeSpacingBase = path.getAttribute('d') || '';
        else path.setAttribute('d', path.dataset.routeSpacingBase);

        const fromEl = nodesLayer.querySelector(`.node[data-id="${CSS.escape(String(link.from))}"]`);
        const toEl = nodesLayer.querySelector(`.node[data-id="${CSS.escape(String(link.to))}"]`);
        if (!fromEl || !toEl) return;
        const fromRect = canvasPointForNode(fromEl);
        const toRect = canvasPointForNode(toEl);
        const start = endpointInfo(path, false);
        const end = endpointInfo(path, true);
        const fromSide = closestSide(start.edge, fromRect);
        const toSide = closestSide(end.edge, toRect);
        const rec = {link,path,fromRect,toRect,fromSide,toSide,start,end};
        records.push(rec);
        for (const [nodeId,side,which,counter] of [
          [link.from,fromSide,'from',toRect],
          [link.to,toSide,'to',fromRect]
        ]) {
          const key = `${nodeId}|${side}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push({rec,which,counter});
        }
      });

      groups.forEach(items => {
        if (items.length < 2) {
          items[0] && (items[0].offset = 0);
          return;
        }
        const side = items[0].which === 'from' ? items[0].rec.fromSide : items[0].rec.toSide;
        items.sort((a,b) => {
          if (side === 'left' || side === 'right') return a.counter.cy-b.counter.cy;
          return a.counter.cx-b.counter.cx;
        });
        const middle = (items.length-1)/2;
        items.forEach((item,i) => { item.offset = (i-middle)*SPACING; });
      });

      records.forEach(rec => {
        let fromOffset = 0, toOffset = 0;
        const fg = groups.get(`${rec.link.from}|${rec.fromSide}`) || [];
        const tg = groups.get(`${rec.link.to}|${rec.toSide}`) || [];
        const fi = fg.find(x=>x.rec===rec && x.which==='from');
        const ti = tg.find(x=>x.rec===rec && x.which==='to');
        if (fi) fromOffset = fi.offset || 0;
        if (ti) toOffset = ti.offset || 0;
        const startPoint = pointOnSide(rec.fromRect, rec.fromSide, fromOffset);
        const endPoint = pointOnSide(rec.toRect, rec.toSide, toOffset);
        const d = sampledPath(rec.path, startPoint, endPoint);
        rec.path.setAttribute('d', d);
        const hit = svg.querySelector(`.linkHit[data-link-id="${CSS.escape(String(rec.link.id))}"]`);
        if (hit) hit.setAttribute('d', d);
      });
    } catch (_) {
    } finally {
      busy = false;
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(spreadRoutes, 20);
  }

  function install() {
    const svg = document.getElementById('links');
    if (!svg) return;
    observer = new MutationObserver(schedule);
    observer.observe(svg,{childList:true,subtree:true,attributes:true,attributeFilter:['d','class']});
    window.addEventListener('resize', schedule);
    document.addEventListener('pointerup', schedule);
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
