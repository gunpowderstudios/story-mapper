(() => {
  const DIVERGE = 64;
  const SPACING = 35;
  const EDGE_MARGIN = 20;
  const STUB = 22;
  const SAMPLE = 10;
  const MERGE_DISTANCE = 14;
  const SHIFT = 18;
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
    const d = {left:Math.abs(p.x-r.left),right:Math.abs(p.x-r.right),top:Math.abs(p.y-r.top),bottom:Math.abs(p.y-r.bottom)};
    return Object.keys(d).sort((a,b) => d[a]-d[b])[0];
  }

  function spreadPoint(r, side, offset) {
    if (side === 'left' || side === 'right') {
      const min = r.top + EDGE_MARGIN, max = r.bottom - EDGE_MARGIN;
      return {x:side === 'left' ? r.left : r.right, y:Math.max(min, Math.min(max, r.cy + offset))};
    }
    const min = r.left + EDGE_MARGIN, max = r.right - EDGE_MARGIN;
    return {x:Math.max(min, Math.min(max, r.cx + offset)), y:side === 'top' ? r.top : r.bottom};
  }

  function stubPoint(p, side) {
    if (side === 'left') return {x:p.x-STUB,y:p.y};
    if (side === 'right') return {x:p.x+STUB,y:p.y};
    if (side === 'top') return {x:p.x,y:p.y-STUB};
    return {x:p.x,y:p.y+STUB};
  }

  function pointAt(path, len) {
    const p = path.getPointAtLength(Math.max(0, Math.min(path.getTotalLength(), len)));
    return {x:p.x,y:p.y};
  }

  function lineD(points) {
    return points.length ? `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}` + points.slice(1).map(p => ` L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join('') : '';
  }

  function distance(a,b) { return Math.hypot(a.x-b.x,a.y-b.y); }

  function sampleSegments(points) {
    const out=[];
    for (let i=0;i<points.length-1;i++) {
      const a=points[i], b=points[i+1];
      const len=distance(a,b);
      const steps=Math.max(1,Math.ceil(len/SAMPLE));
      for (let s=0;s<steps;s++) {
        const t=s/steps;
        out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
      }
    }
    if (points.length) out.push(points[points.length-1]);
    return out;
  }

  function nearestOccupied(p, occupied) {
    let best=null, bestD=Infinity;
    for (const q of occupied) {
      const d=distance(p,q);
      if (d<bestD) { bestD=d; best=q; }
    }
    return best ? {point:best,distance:bestD} : null;
  }

  function separateSharedRun(points, occupied, routeIndex) {
    if (!occupied.length || points.length < 7) return points;
    const out=points.map(p=>({...p}));
    const hit=out.map((p,i) => {
      if (i<2 || i>out.length-3) return false;
      const n=nearestOccupied(p,occupied);
      return !!n && n.distance < MERGE_DISTANCE;
    });

    let i=2;
    while (i<hit.length-2) {
      if (!hit[i]) { i++; continue; }
      let j=i;
      while (j+1<hit.length-2 && hit[j+1]) j++;

      // A real crossing is brief. Only separate when routes run together for a while.
      if (j-i+1 >= 3) {
        const before=out[Math.max(0,i-1)], after=out[Math.min(out.length-1,j+1)];
        let vx=after.x-before.x, vy=after.y-before.y;
        let mag=Math.hypot(vx,vy) || 1;
        let nx=-vy/mag, ny=vx/mag;
        if (routeIndex % 2) { nx=-nx; ny=-ny; }
        const from=Math.max(2,i-1), to=Math.min(out.length-3,j+1);
        for (let k=from;k<=to;k++) {
          const taper=(k===from||k===to)?0.5:1;
          out[k].x += nx*SHIFT*taper;
          out[k].y += ny*SHIFT*taper;
        }
      }
      i=j+1;
    }
    return out;
  }

  function process() {
    if (busy) return;
    const svg=document.getElementById('links');
    const canvas=document.getElementById('canvas');
    if (!svg||!canvas) return;
    const visible=[...svg.querySelectorAll('.link[data-link-id]')];
    if (!visible.length) return;

    busy=true;
    try {
      const state=getState();
      const linkById=new Map((state.links||[]).map(l=>[String(l.id),l]));
      const canvasRect=canvas.getBoundingClientRect();
      const records=[];
      const groups=new Map();

      visible.forEach(path=>{
        const id=String(path.dataset.linkId||'');
        const link=linkById.get(id);
        if (!link) return;
        let total=0;
        try { total=path.getTotalLength(); } catch (_) { return; }
        if (!total) return;
        const fromRect=nodeRect(link.from,canvasRect), toRect=nodeRect(link.to,canvasRect);
        if (!fromRect||!toRect) return;
        const fromSide=nearestSide(pointAt(path,0),fromRect);
        const toSide=nearestSide(pointAt(path,total),toRect);
        const rec={id,path,link,total,fromRect,toRect,fromSide,toSide};
        records.push(rec);
        [[link.from,fromSide,'from'],[link.to,toSide,'to']].forEach(([nodeId,side,endName])=>{
          const key=`${nodeId}|${side}`;
          if (!groups.has(key)) groups.set(key,[]);
          groups.get(key).push({rec,endName});
        });
      });

      const offsets=new Map();
      groups.forEach(items=>{
        items.sort((a,b)=>String(a.rec.id).localeCompare(String(b.rec.id),undefined,{numeric:true}));
        const mid=(items.length-1)/2;
        items.forEach((item,i)=>offsets.set(`${item.rec.id}|${item.endName}`,(i-mid)*SPACING));
      });

      const occupied=[];
      records.forEach((rec,index)=>{
        const start=spreadPoint(rec.fromRect,rec.fromSide,offsets.get(`${rec.id}|from`)||0);
        const end=spreadPoint(rec.toRect,rec.toSide,offsets.get(`${rec.id}|to`)||0);
        const startStub=stubPoint(start,rec.fromSide);
        const endStub=stubPoint(end,rec.toSide);
        const cut=Math.min(DIVERGE,Math.max(STUB+8,rec.total*0.28));
        const startKeep=cut;
        const endKeep=Math.max(startKeep,rec.total-cut);

        let points=[start,startStub,pointAt(rec.path,startKeep)];
        for (let l=startKeep+10;l<endKeep;l+=10) points.push(pointAt(rec.path,l));
        if (endKeep>startKeep+1) points.push(pointAt(rec.path,endKeep));
        points.push(endStub,end);

        points=separateSharedRun(points,occupied,index);
        const d=lineD(points);
        rec.path.setAttribute('d',d);
        const hitPath=svg.querySelector(`.linkHit[data-link-id="${CSS.escape(rec.id)}"]`);
        if (hitPath) hitPath.setAttribute('d',d);
        occupied.push(...sampleSegments(points));
      });
    } finally { busy=false; }
  }

  function schedule() { clearTimeout(timer); timer=setTimeout(process,18); }

  function install() {
    const svg=document.getElementById('links');
    if (!svg) return;
    const observer=new MutationObserver(mutations=>{
      if (busy) return;
      if (mutations.some(m=>m.type==='childList')) schedule();
    });
    observer.observe(svg,{childList:true,subtree:true});
    window.addEventListener('resize',schedule);
    document.addEventListener('pointerup',schedule);
    schedule();
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',install);
  else install();
})();
