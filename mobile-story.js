(() => {
  const mq = window.matchMedia('(max-width:700px)');
  const STORAGE_KEY = 'bodStoryMapper';
  const ONE_WAY_KEY = 'bodOneWayLinks';
  const REVERSE_KEY = 'bodReverseOneWayLinks';
  let view = null;
  let cards = null;
  let search = null;
  let mapTools = null;
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
    const id=String(linkId||''); const ow=getSet(ONE_WAY_KEY);
    if(!ow.has(id)) return 'two-way';
    return getSet(REVERSE_KEY).has(id)?'reverse':'forward';
  }
  function routesFor(state,node){
    const out=[];
    (state.links||[]).forEach(link=>{
      const from=Number(link.from)===Number(node.id), to=Number(link.to)===Number(node.id);
      if(!from&&!to) return;
      const dir=direction(link.id);
      let targetId=from?link.to:link.from;
      let permitted=true;
      if(dir==='forward') permitted=from;
      if(dir==='reverse') permitted=to;
      const target=(state.nodes||[]).find(n=>Number(n.id)===Number(targetId));
      if(!target) return;
      out.push({link,target,permitted});
    });
    return out.sort((a,b)=>Number(a.target.number)-Number(b.target.number));
  }
  function requirement(link){
    if(!link) return '';
    if(link.requirement==='ITEM') return link.requiredObject ? `ITEM: ${link.requiredObject}` : 'ITEM';
    return link.requirement || '';
  }
  function setMode(mode){
    if(!isMobile()) return;
    const list = mode !== 'map';
    document.body.classList.toggle('mobile-list-active',list);
    document.body.classList.toggle('mobile-map-active',!list);
    view?.classList.toggle('active',list);
    view?.querySelector('#mobileListTab')?.classList.toggle('active',list);
    view?.querySelector('#mobileMapTab')?.classList.toggle('active',!list);
    if(list) renderList();
  }
  function openNode(id,showMap=false){
    const el=document.querySelector(`#nodes .node[data-id="${CSS.escape(String(id))}"]`);
    if(!el) return;
    lastNodeId=Number(id);
    if(showMap){
      setMode('map');
      centerNode(el,true);
      return;
    }
    el.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true,view:window}));
  }
  function centerNode(el,highlight=true){
    const workspace=document.getElementById('workspace');
    if(!workspace||!el) return;
    const left=(parseFloat(el.style.left)||0)-workspace.clientWidth/2+el.offsetWidth/2;
    const top=(parseFloat(el.style.top)||0)-workspace.clientHeight/2+el.offsetHeight/2;
    workspace.scrollTo({left:Math.max(0,left),top:Math.max(0,top),behavior:'smooth'});
    if(highlight){
      document.querySelectorAll('.node.mobileStoryJump').forEach(n=>n.classList.remove('mobileStoryJump'));
      el.classList.add('mobileStoryJump');
      setTimeout(()=>el.classList.remove('mobileStoryJump'),2200);
    }
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
      return `<article class="mobileStoryCard" data-node-id="${esc(node.id)}"><div class="mobileStoryCardHead"><div class="mobileStoryCardTitle">${esc(node.number)} — ${esc(node.title||'Untitled')}</div><span class="mobileStoryCount">${routes.length} link${routes.length===1?'':'s'}</span></div><div class="mobileStoryExcerpt">${esc(excerpt||'No story text yet.')}</div>${links?`<div class="mobileStoryLinks">${links}</div>`:''}<div class="mobileStoryCardActions"><button type="button" class="mobileStoryEdit" data-edit-id="${esc(node.id)}">Edit section</button></div></article>`;
    }).join('');
    cards.querySelectorAll('[data-edit-id]').forEach(b=>b.addEventListener('click',()=>openNode(b.dataset.editId,false)));
    cards.querySelectorAll('.mobileStoryLink[data-target-id]').forEach(b=>b.addEventListener('click',()=>openNode(b.dataset.targetId,false)));
  }
  function scheduleRender(){ clearTimeout(renderTimer); renderTimer=setTimeout(renderList,80); }
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
    applyCurrent();
    setTimeout(()=>openNode(target.id,false),50);
  }
  function ensureUi(){
    if(view) return;
    view=document.createElement('section');
    view.id='mobileStoryView'; view.className='mobileStoryView';
    view.innerHTML=`<div class="mobileStoryHead"><div class="mobileStoryTitle"><span>Story Mapper</span><button type="button" class="mobileStorySave" id="mobileListSave">Save</button></div><div class="mobileViewTabs"><button type="button" id="mobileListTab" class="active">List</button><button type="button" id="mobileMapTab">Map</button></div><input id="mobileStorySearch" class="mobileStorySearch" type="search" placeholder="Search section, title or story…"></div><div id="mobileStoryCards" class="mobileStoryCards"></div>`;
    document.body.appendChild(view);
    cards=view.querySelector('#mobileStoryCards'); search=view.querySelector('#mobileStorySearch');
    view.querySelector('#mobileListTab').addEventListener('click',()=>setMode('list'));
    view.querySelector('#mobileMapTab').addEventListener('click',()=>setMode('map'));
    view.querySelector('#mobileListSave').addEventListener('click',()=>document.getElementById('saveBtn')?.click());
    search.addEventListener('input',renderList);

    mapTools=document.createElement('div'); mapTools.className='mobileMapTools';
    mapTools.innerHTML='<button type="button" id="mobileBackToList">☰ List</button><button type="button" id="mobileWhereAmI">◎ Where am I?</button>';
    document.body.appendChild(mapTools);
    mapTools.querySelector('#mobileBackToList').addEventListener('click',()=>setMode('list'));
    mapTools.querySelector('#mobileWhereAmI').addEventListener('click',()=>{
      const state=getState();
      let id=lastNodeId;
      const editor=document.getElementById('editor');
      if(editor&&!editor.classList.contains('hidden')) id=currentEditorNode(state)?.id||id;
      const el=id!=null?document.querySelector(`#nodes .node[data-id="${CSS.escape(String(id))}"]`):null;
      if(el) centerNode(el,true);
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
        if(open){
          setTimeout(()=>{ const s=getState(); const n=currentEditorNode(s); if(n) lastNodeId=Number(n.id); refreshEditorNav(); },30);
        }else{
          scheduleRender();
          if(document.body.classList.contains('mobile-list-active')) view.classList.add('active');
        }
      });
      obs.observe(editor,{attributes:true,attributeFilter:['class']});
    }
    document.getElementById('applyNodeBtn')?.addEventListener('click',()=>setTimeout(()=>{scheduleRender();refreshEditorNav();},40));
    window.addEventListener('bod-link-direction-change',scheduleRender);
    document.addEventListener('pointerup',e=>{ if(isMobile() && !e.target.closest('.mobileStoryView,.editor')) scheduleRender(); });
  }
  function boot(){
    ensureUi();
    if(isMobile()) setMode('list');
    else document.body.classList.remove('mobile-list-active','mobile-map-active','mobile-editor-full');
  }
  mq.addEventListener?.('change',boot);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
