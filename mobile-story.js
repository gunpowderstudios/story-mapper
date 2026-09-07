(() => {
  const mq = window.matchMedia('(max-width:700px)');
  const STORAGE_KEY = 'bodStoryMapper';
  const ONE_WAY_KEY = 'bodOneWayLinks';
  const REVERSE_KEY = 'bodReverseOneWayLinks';
  let view = null;
  let cards = null;
  let mapStack = null;
  let search = null;
  let editorNav = null;
  let lastNodeId = null;
  let renderTimer = null;

  function isMobile(){ return mq.matches; }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
  function getState(){
    try{
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if(parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.links)) return parsed;
      if(parsed && parsed.state && Array.isArray(parsed.state.nodes) && Array.isArray(parsed.state.links)) return parsed.state;
    }catch(_){}
    return {nodes:[],links:[]};
  }
  function getSet(key){
    try{ const v=JSON.parse(localStorage.getItem(key)||'[]'); return new Set(Array.isArray(v)?v.map(String):[]); }catch(_){ return new Set(); }
  }
  function direction(linkId){
    const id=String(linkId||'');
    const oneWay=getSet(ONE_WAY_KEY);
    if(!oneWay.has(id)) return 'two-way';
    return getSet(REVERSE_KEY).has(id)?'reverse':'forward';
  }
  function requirement(link){
    if(!link) return '';
    if(link.requirement==='ITEM') return link.requiredObject ? `ITEM: ${link.requiredObject}` : 'ITEM';
    return link.requirement || '';
  }
  function routesFor(state,node){
    const out=[];
    (state.links||[]).forEach(link=>{
      const from=Number(link.from)===Number(node.id), to=Number(link.to)===Number(node.id);
      if(!from&&!to) return;
      const dir=direction(link.id);
      const targetId=from?link.to:link.from;
      let permitted=true;
      if(dir==='forward') permitted=from;
      if(dir==='reverse') permitted=to;
      const target=(state.nodes||[]).find(n=>Number(n.id)===Number(targetId));
      if(target) out.push({link,target,permitted});
    });
    return out.sort((a,b)=>Number(a.target.number)-Number(b.target.number));
  }
  function flowFor(state,node){
    const incoming=[], outgoing=[];
    (state.links||[]).forEach(link=>{
      const from=Number(link.from)===Number(node.id), to=Number(link.to)===Number(node.id);
      if(!from&&!to) return;
      const dir=direction(link.id);
      let targetId=from?link.to:link.from;
      let bucket;
      if(dir==='reverse') bucket=from?'incoming':'outgoing';
      else bucket=from?'outgoing':'incoming';
      const target=(state.nodes||[]).find(n=>Number(n.id)===Number(targetId));
      if(!target) return;
      (bucket==='incoming'?incoming:outgoing).push({link,target});
    });
    const sort=(a,b)=>Number(a.target.number)-Number(b.target.number);
    incoming.sort(sort); outgoing.sort(sort);
    return {incoming,outgoing};
  }
  function openNode(id){
    const el=document.querySelector(`#nodes .node[data-id="${CSS.escape(String(id))}"]`);
    if(!el) return;
    lastNodeId=Number(id);
    el.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true,view:window}));
  }
  function setMapFocus(id){
    lastNodeId=Number(id);
    renderMap();
    mapStack?.scrollTo({top:0,behavior:'smooth'});
  }
  function setMode(mode){
    if(!isMobile()) return;
    const list=mode!=='map';
    document.body.classList.toggle('mobile-list-active',list);
    document.body.classList.toggle('mobile-map-active',!list);
    view?.classList.add('active');
    view?.classList.toggle('showMap',!list);
    view?.querySelector('#mobileListTab')?.classList.toggle('active',list);
    view?.querySelector('#mobileMapTab')?.classList.toggle('active',!list);
    if(list) renderList(); else renderMap();
  }
  function renderList(){
    if(!cards||!isMobile()) return;
    const state=getState();
    const q=(search?.value||'').trim().toLowerCase();
    const nodes=[...(state.nodes||[])].sort((a,b)=>Number(a.number)-Number(b.number));
    const filtered=nodes.filter(n=>!q || String(n.number).includes(q) || String(n.title||'').toLowerCase().includes(q) || String(n.text||'').toLowerCase().includes(q));
    if(!filtered.length){ cards.innerHTML='<div class="mobileStoryEmpty">No matching sections found.</div>'; return; }
    cards.innerHTML=filtered.map(node=>{
      const routes=routesFor(state,node);
      const excerpt=String(node.text||'').replace(/\s+/g,' ').trim();
      const links=routes.map(r=>{
        const req=requirement(r.link);
        return `<button type="button" class="mobileStoryLink ${r.permitted?'':'incoming'}" data-target-id="${esc(r.target.id)}"><span class="mobileStoryLinkArrow">${r.permitted?'→':'←'}</span><span class="mobileStoryLinkNum">${esc(r.target.number)}</span><span class="mobileStoryLinkTitle">${esc(r.target.title||'Untitled')}</span>${req?`<span class="mobileStoryReq">${esc(req)}</span>`:''}</button>`;
      }).join('');
      return `<article class="mobileStoryCard"><div class="mobileStoryCardHead"><button type="button" class="mobileStoryCardTitle" data-edit-id="${esc(node.id)}">${esc(node.number)} <span>${esc(node.title||'Untitled')}</span></button><span class="mobileStoryCount">${routes.length} link${routes.length===1?'':'s'}</span></div><div class="mobileStoryExcerpt">${esc(excerpt||'No story text yet.')}</div>${links?`<div class="mobileStoryLinks">${links}</div>`:''}<div class="mobileStoryCardActions"><button type="button" class="mobileStoryLocate" data-map-id="${esc(node.id)}">Map</button><button type="button" class="mobileStoryEdit" data-edit-id="${esc(node.id)}">Edit</button></div></article>`;
    }).join('');
  }
  function mapRow(route,kind){
    const req=requirement(route.link);
    const excerpt=String(route.target.text||'').replace(/\s+/g,' ').trim();
    return `<button type="button" class="mobileFlowRow" data-focus-id="${esc(route.target.id)}"><span class="mobileFlowNum">${esc(route.target.number)}</span><span class="mobileFlowText"><strong>${esc(route.target.title||'Untitled')}</strong><small>${esc(excerpt||'No story text yet.')}</small></span>${req?`<span class="mobileStoryReq">${esc(req)}</span>`:''}<span class="mobileFlowChevron">›</span></button>`;
  }
  function renderMap(){
    if(!mapStack||!isMobile()) return;
    const state=getState();
    const nodes=[...(state.nodes||[])].sort((a,b)=>Number(a.number)-Number(b.number));
    if(!nodes.length){ mapStack.innerHTML='<div class="mobileStoryEmpty">No story sections yet.</div>'; return; }
    let current=nodes.find(n=>Number(n.id)===Number(lastNodeId));
    if(!current){ current=nodes[0]; lastNodeId=Number(current.id); }
    const flow=flowFor(state,current);
    const excerpt=String(current.text||'').replace(/\s+/g,' ').trim();
    mapStack.innerHTML=`
      <section class="mobileFlowGroup"><h3>⌄ Incoming Links</h3>${flow.incoming.length?flow.incoming.map(r=>mapRow(r,'incoming')).join(''):'<div class="mobileFlowEmpty">No incoming links</div>'}</section>
      <div class="mobileFlowArrow">↓</div>
      <article class="mobileFlowCurrent"><div class="mobileFlowCurrentTop"><span class="mobileFlowCurrentNum">${esc(current.number)}</span><strong>${esc(current.title||'Untitled')}</strong></div><p>${esc(excerpt||'No story text yet.')}</p><div class="mobileFlowCurrentActions"><span>◎ Current Section</span><button type="button" data-edit-id="${esc(current.id)}">Edit</button></div></article>
      <div class="mobileFlowArrow">↓</div>
      <section class="mobileFlowGroup"><h3>⌄ Outgoing Links</h3>${flow.outgoing.length?flow.outgoing.map(r=>mapRow(r,'outgoing')).join(''):'<div class="mobileFlowEmpty">No outgoing links</div>'}</section>`;
  }
  function scheduleRender(){ clearTimeout(renderTimer); renderTimer=setTimeout(()=>{renderList();renderMap();},80); }
  function currentEditorNode(state){
    const num=Number(document.getElementById('nodeNumber')?.value);
    return (state.nodes||[]).find(n=>Number(n.number)===num)||null;
  }
  function editorRoutes(){ const state=getState(); const node=currentEditorNode(state); return node?routesFor(state,node).filter(r=>r.permitted):[]; }
  function refreshEditorNav(){
    if(!editorNav||!isMobile()) return;
    const routes=editorRoutes();
    const prev=editorNav.querySelector('#mobileEditorPrev'), next=editorNav.querySelector('#mobileEditorNext');
    prev.disabled=!routes.length; next.disabled=!routes.length;
    prev.textContent=routes.length?`← ${routes[0].target.number}`:'Previous';
    next.textContent=routes.length?`${routes[routes.length-1].target.number} →`:'Next';
  }
  function applyCurrent(){ document.getElementById('applyNodeBtn')?.click(); }
  function saveCurrent(){ applyCurrent(); setTimeout(()=>document.getElementById('saveBtn')?.click(),30); }
  function jumpEditor(which){
    const routes=editorRoutes(); if(!routes.length) return;
    const target=which==='prev'?routes[0].target:routes[routes.length-1].target;
    applyCurrent(); setTimeout(()=>openNode(target.id),50);
  }
  function openBookPreview(){
    const open=()=>{ const btn=document.getElementById('bookPreviewBtn'); if(!btn) return false; btn.click(); return true; };
    if(!open()) setTimeout(open,120);
  }
  function ensureUi(){
    if(view) return;
    view=document.createElement('section');
    view.id='mobileStoryView'; view.className='mobileStoryView';
    view.innerHTML=`<div class="mobileStoryHead"><div class="mobileStoryTitle"><span>Book of Dungeon Story Mapper</span><div class="mobileStoryTitleActions"><button type="button" class="mobileStoryBook" id="mobileBookPreview">Book</button><button type="button" class="mobileStorySave" id="mobileListSave">Save</button></div></div><div class="mobileViewTabs"><button type="button" id="mobileListTab" class="active">List</button><button type="button" id="mobileMapTab">Map</button></div><input id="mobileStorySearch" class="mobileStorySearch" type="search" placeholder="Search sections, titles, or text…"></div><div id="mobileStoryCards" class="mobileStoryCards"></div><div id="mobileMapStack" class="mobileMapStack"></div>`;
    document.body.appendChild(view);
    cards=view.querySelector('#mobileStoryCards'); mapStack=view.querySelector('#mobileMapStack'); search=view.querySelector('#mobileStorySearch');
    view.querySelector('#mobileListTab').addEventListener('click',()=>setMode('list'));
    view.querySelector('#mobileMapTab').addEventListener('click',()=>setMode('map'));
    view.querySelector('#mobileBookPreview').addEventListener('click',openBookPreview);
    view.querySelector('#mobileListSave').addEventListener('click',()=>document.getElementById('saveBtn')?.click());
    search.addEventListener('input',renderList);
    view.addEventListener('click',e=>{
      const link=e.target.closest('.mobileStoryLink[data-target-id]');
      if(link){ e.preventDefault(); openNode(link.dataset.targetId); return; }
      const edit=e.target.closest('[data-edit-id]');
      if(edit){ e.preventDefault(); openNode(edit.dataset.editId); return; }
      const locate=e.target.closest('[data-map-id]');
      if(locate){ e.preventDefault(); lastNodeId=Number(locate.dataset.mapId); setMode('map'); return; }
      const focus=e.target.closest('[data-focus-id]');
      if(focus){ e.preventDefault(); setMapFocus(focus.dataset.focusId); }
    });

    editorNav=document.createElement('div'); editorNav.className='mobileEditorNav';
    editorNav.innerHTML='<button type="button" id="mobileEditorPrev">Previous</button><button type="button" id="mobileEditorSave" class="save">Save</button><button type="button" id="mobileEditorNext">Next</button>';
    document.body.appendChild(editorNav);
    editorNav.querySelector('#mobileEditorPrev').addEventListener('click',()=>jumpEditor('prev'));
    editorNav.querySelector('#mobileEditorNext').addEventListener('click',()=>jumpEditor('next'));
    editorNav.querySelector('#mobileEditorSave').addEventListener('click',saveCurrent);

    const editor=document.getElementById('editor');
    if(editor){
      const obs=new MutationObserver(()=>{
        if(!isMobile()) return;
        const open=!editor.classList.contains('hidden');
        document.body.classList.toggle('mobile-editor-full',open);
        if(open){ setTimeout(()=>{ const s=getState(); const n=currentEditorNode(s); if(n) lastNodeId=Number(n.id); refreshEditorNav(); },30); }
        else scheduleRender();
      });
      obs.observe(editor,{attributes:true,attributeFilter:['class']});
    }
    document.getElementById('applyNodeBtn')?.addEventListener('click',()=>setTimeout(()=>{scheduleRender();refreshEditorNav();},40));
    window.addEventListener('bod-link-direction-change',scheduleRender);
  }
  function boot(){
    ensureUi();
    if(isMobile()) setMode('list');
    else document.body.classList.remove('mobile-list-active','mobile-map-active','mobile-editor-full');
  }
  mq.addEventListener?.('change',boot);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
