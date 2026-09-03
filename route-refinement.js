(() => {
  const CLEARANCE = 14;
  const STUB = 22;
  const CORNER = 10;
  let busy = false;
  let timer = null;

  function getState() {
    try {
      const raw = localStorage.getItem('bodStoryMapper');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.links)) return parsed;
      if (parsed && parsed.state && Array.isArray(parsed.state.nodes) && Array.isArray(parsed.state.links)) return parsed.state;
    } catch (_) {}
    return {nodes:[], links:[]};
  }

  function rectForNode(id, canvasRect, inflate = 0) {
    const el = document.querySelector(`#nodes .node[data-id="${CSS.escape(String(id))}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      left:r.left-canvasRect.left-inflate,
      right:r.right-canvasRect.left+inflate,
      top:r.top-canvasRect.top-inflate,
      bottom:r.bottom-canvasRect.top+inflate,
      cx:r.left-canvasRect.left+r.width/2,
      cy:r.top-canvasRect.top+r.height/2,
      nodeId:Number(id)
    };
  }

  function edgePoint(r, side) {
    if (side === 'top') return {x:r.cx,y:r.top};
    if (side === 'bottom') return {x:r.cx,y:r.bottom};
    if (side === 'left') return {x:r.left,y:r.cy};
    return {x:r.right,y:r.cy};
  }

  function stubPoint(p, side) {
    if (side === 'top') return {x:p.x,y:p.y-STUB};
    if (side === 'bottom') return {x:p.x,y:p.y+STUB};
    if (side === 'left') return {x:p.x-STUB,y:p.y};
    return {x:p.x+STUB,y:p.y};
  }

  function pointInside(p,r) {
    return p.x>r.left && p.x<r.right && p.y>r.top && p.y<r.bottom;
  }

  function segmentHitsRect(a,b,r) {
    const steps=Math.max(2,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/8));
    for(let i=1;i<steps;i++) {
      const t=i/steps;
      const p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
      if(pointInside(p,r)) return true;
    }
    return false;
  }

  function pathClear(points, obstacles) {
    if(points.some(p=>obstacles.some(r=>pointInside(p,r)))) return false;
    for(let i=0;i<points.length-1;i++) {
      if(obstacles.some(r=>segmentHitsRect(points[i],points[i+1],r))) return false;
    }
    return true;
  }

  function simplify(points) {
    const out=[];
    points.forEach(p=>{
      const last=out[out.length-1];
      if(!last || Math.abs(last.x-p.x)>.5 || Math.abs(last.y-p.y)>.5) out.push({x:p.x,y:p.y});
    });
    let changed=true;
    while(changed && out.length>2) {
      changed=false;
      for(let i=1;i<out.length-1;i++) {
        const a=out[i-1],b=out[i],c=out[i+1];
        const vertical=Math.abs(a.x-b.x)<.5 && Math.abs(b.x-c.x)<.5;
        const horizontal=Math.abs(a.y-b.y)<.5 && Math.abs(b.y-c.y)<.5;
        if(vertical||horizontal) { out.splice(i,1); changed=true; break; }
      }
    }
    return out;
  }

  function length(points) {
    let n=0;
    for(let i=0;i<points.length-1;i++) n+=Math.hypot(points[i+1].x-points[i].x,points[i+1].y-points[i].y);
    return n;
  }

  function routeMiddle(start,end,obstacles,canvas) {
    const candidates=[];
    const add=pts=>{
      const p=simplify(pts);
      if(pathClear(p,obstacles)) candidates.push({p,cost:length(p)+(p.length-2)*18});
    };

    add([start,end]);
    add([start,{x:end.x,y:start.y},end]);
    add([start,{x:start.x,y:end.y},end]);

    const xs=[8,canvas.clientWidth-8];
    const ys=[8,canvas.clientHeight-8];
    obstacles.forEach(r=>{
      xs.push(r.left-8,r.right+8);
      ys.push(r.top-8,r.bottom+8);
    });
    const mx=(start.x+end.x)/2,my=(start.y+end.y)/2;
    const ux=[...new Set(xs.map(Math.round))].sort((a,b)=>Math.abs(a-mx)-Math.abs(b-mx)).slice(0,18);
    const uy=[...new Set(ys.map(Math.round))].sort((a,b)=>Math.abs(a-my)-Math.abs(b-my)).slice(0,18);
    ux.forEach(x=>add([start,{x,y:start.y},{x,y:end.y},end]));
    uy.forEach(y=>add([start,{x:start.x,y},{x:end.x,y},end]));

    if(!candidates.length) return null;
    candidates.sort((a,b)=>a.cost-b.cost);
    return candidates[0].p;
  }

  function roundedPath(points) {
    const pts=simplify(points);
    if(pts.length<2) return '';
    let d=`M ${pts[0].x} ${pts[0].y}`;
    for(let i=1;i<pts.length-1;i++) {
      const prev=pts[i-1],cur=pts[i],next=pts[i+1];
      const l1=Math.hypot(cur.x-prev.x,cur.y-prev.y),l2=Math.hypot(next.x-cur.x,next.y-cur.y);
      const r=Math.min(CORNER,l1/3,l2/3);
      if(r<1) { d+=` L ${cur.x} ${cur.y}`; continue; }
      const a={x:cur.x+(prev.x-cur.x)*r/l1,y:cur.y+(prev.y-cur.y)*r/l1};
      const b={x:cur.x+(next.x-cur.x)*r/l2,y:cur.y+(next.y-cur.y)*r/l2};
      d+=` L ${a.x} ${a.y} Q ${cur.x} ${cur.y} ${b.x} ${b.y}`;
    }
    const last=pts[pts.length-1];
    return d+` L ${last.x} ${last.y}`;
  }

  function refine() {
    if(busy) return;
    const svg=document.getElementById('links');
    const canvas=document.getElementById('canvas');
    if(!svg||!canvas) return;
    busy=true;
    try {
      const state=getState();
      const canvasRect=canvas.getBoundingClientRect();
      const allRects=(state.nodes||[]).map(n=>rectForNode(n.id,canvasRect,CLEARANCE)).filter(Boolean);

      (state.links||[]).forEach(link=>{
        if(link.type!=='read') return;
        const a=rectForNode(link.from,canvasRect,0), b=rectForNode(link.to,canvasRect,0);
        if(!a||!b) return;
        const dx=b.cx-a.cx,dy=b.cy-a.cy;
        const ax=Math.abs(dx),ay=Math.abs(dy);

        // Only touch diagonal dotted links where a top/bottom approach is visually cleaner.
        if(ay < ax*0.55) return;

        const fromSide=dy>=0?'bottom':'top';
        const toSide=dy>=0?'top':'bottom';
        const start=edgePoint(a,fromSide),end=edgePoint(b,toSide);
        const startStub=stubPoint(start,fromSide),endStub=stubPoint(end,toSide);
        const obstacles=allRects.filter(r=>r.nodeId!==Number(link.from)&&r.nodeId!==Number(link.to));
        const middle=routeMiddle(startStub,endStub,obstacles,canvas);
        if(!middle) return;
        const points=simplify([start,startStub,...middle.slice(1,-1),endStub,end]);
        const d=roundedPath(points);
        const path=svg.querySelector(`.link[data-link-id="${CSS.escape(String(link.id))}"]`);
        const hit=svg.querySelector(`.linkHit[data-link-id="${CSS.escape(String(link.id))}"]`);
        if(path) path.setAttribute('d',d);
        if(hit) hit.setAttribute('d',d);
      });
    } finally {
      busy=false;
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer=setTimeout(refine,20);
  }

  function install() {
    const svg=document.getElementById('links');
    if(!svg) return;
    const observer=new MutationObserver(m=>{
      if(!busy && m.some(x=>x.type==='childList')) schedule();
    });
    observer.observe(svg,{childList:true,subtree:true});
    window.addEventListener('resize',schedule);
    document.addEventListener('pointerup',schedule);
    schedule();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install);
  else install();
})();
