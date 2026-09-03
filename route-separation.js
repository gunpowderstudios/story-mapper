(() => {
  const GRID = 24;
  const SPACING = 35;
  const EDGE_MARGIN = 20;
  const STUB = 22;
  const NODE_CLEARANCE = 10;
  const OVERLAP_PENALTY = 2500;
  const BEND_PENALTY = 16;
  let timer = null;
  let busy = false;

  function getState() {
    try {
      const raw = localStorage.getItem('bodStoryMapper');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.links)) return parsed;
      if (parsed && parsed.state && Array.isArray(parsed.state.nodes) && Array.isArray(parsed.state.links)) return parsed.state;
    } catch (_) {}
    return {nodes:[],links:[]};
  }

  function snap(v) { return Math.round(v / GRID) * GRID; }
  function dist(a,b) { return Math.hypot(b.x-a.x,b.y-a.y); }

  function nodeRect(id, canvasRect, inflate = 0) {
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
      width:r.width+inflate*2,
      height:r.height+inflate*2,
      nodeId:Number(id)
    };
  }

  function nearestSide(p,r) {
    const d={left:Math.abs(p.x-r.left),right:Math.abs(p.x-r.right),top:Math.abs(p.y-r.top),bottom:Math.abs(p.y-r.bottom)};
    return Object.keys(d).sort((a,b)=>d[a]-d[b])[0];
  }

  function spreadPoint(r,side,offset) {
    if (side==='left'||side==='right') {
      const min=r.top+EDGE_MARGIN,max=r.bottom-EDGE_MARGIN;
      return {x:side==='left'?r.left:r.right,y:Math.max(min,Math.min(max,r.cy+offset))};
    }
    const min=r.left+EDGE_MARGIN,max=r.right-EDGE_MARGIN;
    return {x:Math.max(min,Math.min(max,r.cx+offset)),y:side==='top'?r.top:r.bottom};
  }

  function stubPoint(p,side) {
    if (side==='left') return {x:p.x-STUB,y:p.y};
    if (side==='right') return {x:p.x+STUB,y:p.y};
    if (side==='top') return {x:p.x,y:p.y-STUB};
    return {x:p.x,y:p.y+STUB};
  }

  function pointAt(path,len) {
    const p=path.getPointAtLength(Math.max(0,Math.min(path.getTotalLength(),len)));
    return {x:p.x,y:p.y};
  }

  function simplify(points) {
    const out=[];
    points.forEach(p=>{
      const q={x:Number(p.x),y:Number(p.y)};
      const last=out[out.length-1];
      if (!last||Math.abs(last.x-q.x)>.2||Math.abs(last.y-q.y)>.2) out.push(q);
    });
    let changed=true;
    while(changed&&out.length>2) {
      changed=false;
      for(let i=1;i<out.length-1;i++) {
        const a=out[i-1],b=out[i],c=out[i+1];
        const cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
        if(Math.abs(cross)<.5) { out.splice(i,1); changed=true; break; }
      }
    }
    return out;
  }

  function lineD(points) {
    const p=simplify(points);
    if(!p.length) return '';
    return `M ${p[0].x.toFixed(2)} ${p[0].y.toFixed(2)}`+p.slice(1).map(q=>` L ${q.x.toFixed(2)} ${q.y.toFixed(2)}`).join('');
  }

  function segHitsRect(a,b,r) {
    const steps=Math.max(2,Math.ceil(dist(a,b)/8));
    for(let i=1;i<steps;i++) {
      const t=i/steps;
      const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
      if(x>r.left&&x<r.right&&y>r.top&&y<r.bottom) return true;
    }
    return false;
  }

  function segmentKey(a,b) {
    const ax=Math.round(a.x/4)*4, ay=Math.round(a.y/4)*4;
    const bx=Math.round(b.x/4)*4, by=Math.round(b.y/4)*4;
    const first=(ax<bx||(ax===bx&&ay<=by));
    return first?`${ax},${ay}|${bx},${by}`:`${bx},${by}|${ax},${ay}`;
  }

  function sampleKeys(a,b) {
    const keys=[];
    const length=dist(a,b);
    const steps=Math.max(1,Math.ceil(length/GRID));
    for(let i=0;i<steps;i++) {
      const t1=i/steps,t2=(i+1)/steps;
      keys.push(segmentKey(
        {x:a.x+(b.x-a.x)*t1,y:a.y+(b.y-a.y)*t1},
        {x:a.x+(b.x-a.x)*t2,y:a.y+(b.y-a.y)*t2}
      ));
    }
    return keys;
  }

  function candidateCost(points, obstacles, used) {
    const p=simplify(points);
    let cost=0;
    for(let i=0;i<p.length-1;i++) {
      const a=p[i],b=p[i+1];
      cost+=dist(a,b);
      if(obstacles.some(r=>segHitsRect(a,b,r))) cost+=100000;
      sampleKeys(a,b).forEach(k=>{ if(used.has(k)) cost+=OVERLAP_PENALTY; });
    }
    cost+=Math.max(0,p.length-2)*BEND_PENALTY;
    return cost;
  }

  function gridRoute(start,end,obstacles,used,seed) {
    const sx=snap(start.x), sy=snap(start.y), ex=snap(end.x), ey=snap(end.y);
    const s={x:sx,y:sy}, e={x:ex,y:ey};
    const candidates=[];
    const add=pts=>candidates.push(simplify([start,s,...pts,e,end]));

    // Clean underground-map style orthogonal routes.
    add([{x:s.x,y:e.y}]);
    add([{x:e.x,y:s.y}]);

    // Try several parallel grid lanes so routes do not share the same run.
    const midX=snap((s.x+e.x)/2), midY=snap((s.y+e.y)/2);
    const laneOrder=[0,1,-1,2,-2,3,-3];
    laneOrder.forEach(n=>{
      const x=midX+n*GRID;
      const y=midY+n*GRID;
      add([{x,y:s.y},{x,y:e.y}]);
      add([{x:s.x,y},{x:e.x,y}]);
    });

    // 45-degree schematic options where useful.
    const dx=e.x-s.x, dy=e.y-s.y;
    const diag=Math.min(Math.abs(dx),Math.abs(dy));
    if(diag>=GRID) {
      const px=s.x+Math.sign(dx)*diag, py=s.y+Math.sign(dy)*diag;
      add([{x:px,y:py},{x:e.x,y:py}]);
      add([{x:px,y:py},{x:px,y:e.y}]);
      const qx=e.x-Math.sign(dx)*diag, qy=e.y-Math.sign(dy)*diag;
      add([{x:qx,y:s.y},{x:e.x,y:e.y}]);
      add([{x:s.x,y:qy},{x:e.x,y:e.y}]);
    }

    candidates.sort((a,b)=>candidateCost(a,obstacles,used)-candidateCost(b,obstacles,used));
    return candidates[0]||[start,end];
  }

  function process() {
    if(busy) return;
    const svg=document.getElementById('links');
    const canvas=document.getElementById('canvas');
    if(!svg||!canvas) return;
    const visible=[...svg.querySelectorAll('.link[data-link-id]')];
    if(!visible.length) return;

    busy=true;
    try {
      const state=getState();
      const linkById=new Map((state.links||[]).map(l=>[String(l.id),l]));
      const canvasRect=canvas.getBoundingClientRect();
      const records=[];
      const groups=new Map();
      const allObstacles=(state.nodes||[]).map(n=>nodeRect(n.id,canvasRect,NODE_CLEARANCE)).filter(Boolean);

      visible.forEach(path=>{
        const id=String(path.dataset.linkId||'');
        const link=linkById.get(id);
        if(!link) return;
        let total=0; try{total=path.getTotalLength();}catch(_){return;}
        if(!total) return;
        const fromRect=nodeRect(link.from,canvasRect),toRect=nodeRect(link.to,canvasRect);
        if(!fromRect||!toRect) return;
        const fromSide=nearestSide(pointAt(path,0),fromRect);
        const toSide=nearestSide(pointAt(path,total),toRect);
        const rec={id,path,link,fromRect,toRect,fromSide,toSide};
        records.push(rec);
        [[link.from,fromSide,'from'],[link.to,toSide,'to']].forEach(([nodeId,side,endName])=>{
          const key=`${nodeId}|${side}`;
          if(!groups.has(key)) groups.set(key,[]);
          groups.get(key).push({rec,endName});
        });
      });

      const offsets=new Map();
      groups.forEach(items=>{
        items.sort((a,b)=>String(a.rec.id).localeCompare(String(b.rec.id),undefined,{numeric:true}));
        const mid=(items.length-1)/2;
        items.forEach((item,i)=>offsets.set(`${item.rec.id}|${item.endName}`,(i-mid)*SPACING));
      });

      const used=new Set();
      records.sort((a,b)=>String(a.id).localeCompare(String(b.id),undefined,{numeric:true}));
      records.forEach((rec,index)=>{
        const start=spreadPoint(rec.fromRect,rec.fromSide,offsets.get(`${rec.id}|from`)||0);
        const end=spreadPoint(rec.toRect,rec.toSide,offsets.get(`${rec.id}|to`)||0);
        const startStub=stubPoint(start,rec.fromSide);
        const endStub=stubPoint(end,rec.toSide);
        const obstacles=allObstacles.filter(r=>r.nodeId!==Number(rec.link.from)&&r.nodeId!==Number(rec.link.to));
        const middle=gridRoute(startStub,endStub,obstacles,used,index);
        const points=simplify([start,startStub,...middle.slice(1,-1),endStub,end]);
        const d=lineD(points);
        rec.path.setAttribute('d',d);
        const hit=svg.querySelector(`.linkHit[data-link-id="${CSS.escape(rec.id)}"]`);
        if(hit) hit.setAttribute('d',d);
        for(let i=1;i<points.length-2;i++) sampleKeys(points[i],points[i+1]).forEach(k=>used.add(k));
      });
    } finally { busy=false; }
  }

  function schedule(){clearTimeout(timer);timer=setTimeout(process,20);}
  function install(){
    const svg=document.getElementById('links');
    if(!svg) return;
    const observer=new MutationObserver(m=>{if(!busy&&m.some(x=>x.type==='childList')) schedule();});
    observer.observe(svg,{childList:true,subtree:true});
    window.addEventListener('resize',schedule);
    document.addEventListener('pointerup',schedule);
    schedule();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install); else install();
})();
