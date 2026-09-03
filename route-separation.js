(() => {
  const SPACING = 35;
  const EDGE_MARGIN = 20;
  const STUB = 22;
  const SAMPLE_COUNT = 7;
  const CURVE_TENSION = 0.72;
  const MID_BIAS = 12;
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

  function pointAt(path, len) {
    const p = path.getPointAtLength(Math.max(0, Math.min(path.getTotalLength(), len)));
    return {x:p.x,y:p.y};
  }

  function nearestSide(p,r) {
    const d = {
      left:Math.abs(p.x-r.left),
      right:Math.abs(p.x-r.right),
      top:Math.abs(p.y-r.top),
      bottom:Math.abs(p.y-r.bottom)
    };
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

  function samePoint(a,b) {
    return Math.abs(a.x-b.x)<0.5 && Math.abs(a.y-b.y)<0.5;
  }

  function simplify(points) {
    const out=[];
    points.forEach(p=>{
      const q={x:Number(p.x),y:Number(p.y)};
      if (!out.length || !samePoint(out[out.length-1],q)) out.push(q);
    });
    return out;
  }

  // Catmull-Rom style smoothing converted to cubic Beziers.
  // The short straight node stubs remain literal line segments, then the route
  // behaves like a loose cable/string between those stubs.
  function smoothD(points) {
    const p=simplify(points);
    if (p.length<2) return '';
    if (p.length===2) return `M ${p[0].x} ${p[0].y} L ${p[1].x} ${p[1].y}`;

    let d=`M ${p[0].x.toFixed(2)} ${p[0].y.toFixed(2)}`;
    d+=` L ${p[1].x.toFixed(2)} ${p[1].y.toFixed(2)}`;

    const body=p.slice(1,-1);
    const final=p[p.length-1];
    if (body.length===1) {
      d+=` L ${final.x.toFixed(2)} ${final.y.toFixed(2)}`;
      return d;
    }

    for (let i=0;i<body.length-1;i++) {
      const p0=body[Math.max(0,i-1)];
      const p1=body[i];
      const p2=body[i+1];
      const p3=body[Math.min(body.length-1,i+2)];
      const t=CURVE_TENSION/6;
      const c1={x:p1.x+(p2.x-p0.x)*t,y:p1.y+(p2.y-p0.y)*t};
      const c2={x:p2.x-(p3.x-p1.x)*t,y:p2.y-(p3.y-p1.y)*t};
      d+=` C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)}, ${c2.x.toFixed(2)} ${c2.y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    }
    d+=` L ${final.x.toFixed(2)} ${final.y.toFixed(2)}`;
    return d;
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
        const fromRect=nodeRect(link.from,canvasRect),toRect=nodeRect(link.to,canvasRect);
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

      records.sort((a,b)=>String(a.id).localeCompare(String(b.id),undefined,{numeric:true}));
      records.forEach((rec,index)=>{
        const start=spreadPoint(rec.fromRect,rec.fromSide,offsets.get(`${rec.id}|from`)||0);
        const end=spreadPoint(rec.toRect,rec.toSide,offsets.get(`${rec.id}|to`)||0);
        const startStub=stubPoint(start,rec.fromSide);
        const endStub=stubPoint(end,rec.toSide);

        const body=[];
        for (let i=1;i<SAMPLE_COUNT;i++) {
          const q=pointAt(rec.path,rec.total*(i/SAMPLE_COUNT));
          body.push(q);
        }

        // Give neighbouring routes a tiny alternating bow so two links that
        // happen to follow the same core corridor separate instead of looking joined.
        if (body.length) {
          const a=startStub,b=endStub;
          const dx=b.x-a.x,dy=b.y-a.y,mag=Math.hypot(dx,dy)||1;
          const nx=-dy/mag,ny=dx/mag;
          const sign=index%2===0?1:-1;
          body.forEach((q,i)=>{
            const centre=1-Math.abs((i/(Math.max(1,body.length-1)))*2-1);
            q.x+=nx*MID_BIAS*centre*sign;
            q.y+=ny*MID_BIAS*centre*sign;
          });
        }

        const points=[start,startStub,...body,endStub,end];
        const d=smoothD(points);
        rec.path.setAttribute('d',d);
        const hit=svg.querySelector(`.linkHit[data-link-id="${CSS.escape(rec.id)}"]`);
        if (hit) hit.setAttribute('d',d);
      });
    } finally { busy=false; }
  }

  function schedule(){clearTimeout(timer);timer=setTimeout(process,20);}
  function install(){
    const svg=document.getElementById('links');
    if (!svg) return;
    const observer=new MutationObserver(m=>{if(!busy&&m.some(x=>x.type==='childList')) schedule();});
    observer.observe(svg,{childList:true,subtree:true});
    window.addEventListener('resize',schedule);
    document.addEventListener('pointerup',schedule);
    schedule();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install); else install();
})();
