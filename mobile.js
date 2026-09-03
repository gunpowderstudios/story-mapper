(() => {
  const mobile = window.matchMedia('(max-width: 700px)');
  const workspace = document.getElementById('workspace');
  const canvas = document.getElementById('canvas');
  const nodesLayer = document.getElementById('nodes');
  const quick = document.getElementById('mobileQuick');
  const quickTitle = document.getElementById('mobileQuickTitle');
  const lineMenu = document.getElementById('mobileLineMenu');

  let selectedNode = null;
  let armedNode = null;
  let nodeTapStart = null;
  let blankTapStart = null;
  let lastBlankTap = null;
  let linkingTaps = 0;
  let mobileDrag = null;
  let syntheticGesture = false;

  const DOUBLE_TAP_MS = 420;
  const TAP_MOVE_LIMIT = 14;

  function isMobile() { return mobile.matches; }

  function clearSelection() {
    if (selectedNode) selectedNode.classList.remove('mobileSelected');
    selectedNode = null;
    quick.classList.add('hidden');
  }

  function clearArmed() {
    if (armedNode) armedNode.classList.remove('mobileMoveArmed');
    armedNode = null;
    document.body.classList.remove('mobile-drag-mode');
  }

  function selectNode(el) {
    clearSelection();
    selectedNode = el;
    el.classList.add('mobileSelected');
    const title = el.querySelector('.title')?.textContent || 'Story';
    const number = el.querySelector('.bubble')?.textContent || '';
    quickTitle.textContent = `${number} ${title}`.trim();
    quick.classList.remove('hidden');
  }

  function armSelectedNode() {
    if (!selectedNode) return;
    clearArmed();
    armedNode = selectedNode;
    armedNode.classList.remove('mobileSelected');
    armedNode.classList.add('mobileMoveArmed');
    selectedNode = null;
    quick.classList.add('hidden');
    lineMenu.classList.add('hidden');
    document.body.classList.add('mobile-drag-mode');
    const hint = document.getElementById('hint');
    if (hint) hint.textContent = 'Move ready — drag the glowing box.';
  }

  function firePointerDown(el) {
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles:true, cancelable:true, pointerId:77, pointerType:'touch', button:0,
      clientX:r.left + r.width / 2, clientY:r.top + r.height / 2
    }));
  }

  function beginConnection(type) {
    if (!selectedNode) return;
    clearArmed();
    linkingTaps = 0;
    document.body.classList.add('mobile-linking');
    document.getElementById(type === 'choice' ? 'choiceModeBtn' : 'readModeBtn').click();
    firePointerDown(selectedNode);
    quick.classList.add('hidden');
    lineMenu.classList.add('hidden');
  }

  function isBlankTarget(target) {
    if (!target || !target.closest) return false;
    if (target.closest('.node, .linkHit, .mobileBar, .mobileQuick, .mobileLineMenu, .editor, .githubPanel')) return false;
    return target === workspace || target === canvas || target === nodesLayer || target === document.getElementById('links');
  }

  function newestNodeElement() {
    const nodes = [...nodesLayer.querySelectorAll('.node')];
    return nodes.sort((a,b) => Number(b.dataset.id || 0) - Number(a.dataset.id || 0))[0] || null;
  }

  function addNoteAt(clientX, clientY) {
    clearArmed();
    document.getElementById('addNodeBtn').click();
    const el = newestNodeElement();
    if (!el) return;
    const r = el.getBoundingClientRect();
    syntheticGesture = true;
    try {
      el.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true,cancelable:true,pointerId:991,pointerType:'touch',button:0,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));
      el.dispatchEvent(new PointerEvent('pointermove', {bubbles:true,cancelable:true,pointerId:991,pointerType:'touch',button:0,clientX,clientY}));
      el.dispatchEvent(new PointerEvent('pointerup', {bubbles:true,cancelable:true,pointerId:991,pointerType:'touch',button:0,clientX,clientY}));
    } finally {
      syntheticGesture = false;
    }
    clearSelection();
  }

  function startMobileDrag(e, node) {
    e.preventDefault();
    e.stopPropagation();
    const nodeRect = node.getBoundingClientRect();
    mobileDrag = {
      node,
      id:Number(node.dataset.id),
      pointerId:e.pointerId,
      offsetX:e.clientX - nodeRect.left,
      offsetY:e.clientY - nodeRect.top,
      x:parseFloat(node.style.left) || 0,
      y:parseFloat(node.style.top) || 0,
      moved:false
    };
    node.classList.add('dragging');
    try { node.setPointerCapture(e.pointerId); } catch (_) {}
  }

  function moveMobileDrag(e) {
    if (!mobileDrag || e.pointerId !== mobileDrag.pointerId) return;
    e.preventDefault();
    const canvasRect = canvas.getBoundingClientRect();
    const x = Math.max(0, e.clientX - canvasRect.left - mobileDrag.offsetX);
    const y = Math.max(0, e.clientY - canvasRect.top - mobileDrag.offsetY);
    if (Math.abs(x - mobileDrag.x) > 0.5 || Math.abs(y - mobileDrag.y) > 0.5) mobileDrag.moved = true;
    mobileDrag.x = x;
    mobileDrag.y = y;
    mobileDrag.node.style.left = `${x}px`;
    mobileDrag.node.style.top = `${y}px`;
  }

  function commitMobileDrag() {
    if (!mobileDrag) return;
    const finished = mobileDrag;
    mobileDrag = null;
    finished.node.classList.remove('dragging');
    clearArmed();

    if (!finished.moved) return;

    try {
      const raw = localStorage.getItem('bodStoryMapper');
      if (!raw) throw new Error('No local map');
      const state = JSON.parse(raw);
      const node = Array.isArray(state.nodes) ? state.nodes.find(n => Number(n.id) === finished.id) : null;
      if (!node) throw new Error('Story node not found');
      node.x = finished.x;
      node.y = finished.y;

      const file = new File([JSON.stringify(state)], 'mobile-move.json', {type:'application/json'});
      const input = document.getElementById('importInput');
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', {bubbles:true}));

      const hint = document.getElementById('hint');
      if (hint) hint.textContent = 'Box moved.';
    } catch (err) {
      console.error('Could not save mobile move', err);
      const hint = document.getElementById('hint');
      if (hint) hint.textContent = 'Could not save that move — try again.';
    }
  }

  document.addEventListener('pointerdown', e => {
    if (!isMobile() || syntheticGesture) return;
    const node = e.target.closest && e.target.closest('.node');

    if (node) {
      if (document.body.classList.contains('mobile-linking')) {
        linkingTaps += 1;
        return;
      }
      if (armedNode === node) {
        startMobileDrag(e, node);
        return;
      }
      e.stopPropagation();
      nodeTapStart = {el:node, x:e.clientX, y:e.clientY, t:Date.now()};
      blankTapStart = null;
      return;
    }

    if (isBlankTarget(e.target)) {
      blankTapStart = {x:e.clientX, y:e.clientY, t:Date.now()};
      nodeTapStart = null;
    }
  }, true);

  document.addEventListener('pointermove', e => {
    if (!isMobile() || syntheticGesture) return;
    moveMobileDrag(e);
  }, {capture:true, passive:false});

  document.addEventListener('pointerup', e => {
    if (!isMobile() || syntheticGesture) return;

    if (mobileDrag && e.pointerId === mobileDrag.pointerId) {
      e.preventDefault();
      e.stopPropagation();
      commitMobileDrag();
      return;
    }

    if (nodeTapStart) {
      const dx = e.clientX - nodeTapStart.x;
      const dy = e.clientY - nodeTapStart.y;
      const wasTap = Math.hypot(dx,dy) < TAP_MOVE_LIMIT && Date.now() - nodeTapStart.t < 500;
      const start = nodeTapStart;
      nodeTapStart = null;
      if (wasTap) {
        e.preventDefault();
        clearArmed();
        selectNode(start.el);
      }
      return;
    }

    if (blankTapStart) {
      const dx = e.clientX - blankTapStart.x;
      const dy = e.clientY - blankTapStart.y;
      const wasTap = Math.hypot(dx,dy) < TAP_MOVE_LIMIT && Date.now() - blankTapStart.t < 500;
      const start = blankTapStart;
      blankTapStart = null;
      if (!wasTap) {
        lastBlankTap = null;
        return;
      }
      const now = Date.now();
      const isDouble = lastBlankTap && now - lastBlankTap.t <= DOUBLE_TAP_MS && Math.hypot(e.clientX-lastBlankTap.x, e.clientY-lastBlankTap.y) < 42;
      if (isDouble) {
        e.preventDefault();
        lastBlankTap = null;
        addNoteAt(e.clientX, e.clientY);
      } else {
        lastBlankTap = {x:start.x, y:start.y, t:now};
        clearSelection();
        clearArmed();
      }
    }
  }, {capture:true, passive:false});

  document.addEventListener('pointercancel', e => {
    nodeTapStart = null;
    blankTapStart = null;
    if (mobileDrag && e.pointerId === mobileDrag.pointerId) commitMobileDrag();
  }, true);

  document.addEventListener('dblclick', e => {
    if (!isMobile() || syntheticGesture) return;
    if (e.target.closest && e.target.closest('.node')) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  workspace.addEventListener('pointerup', () => {
    if (document.body.classList.contains('mobile-linking') && linkingTaps >= 2) {
      setTimeout(() => {
        document.body.classList.remove('mobile-linking');
        linkingTaps = 0;
      }, 120);
    }
  }, true);

  document.getElementById('mobileAddBtn').addEventListener('click', () => document.getElementById('addNodeBtn').click());
  document.getElementById('mobileSaveBtn').addEventListener('click', () => document.getElementById('saveBtn').click());
  document.getElementById('mobileMoveBtn').addEventListener('click', () => {
    clearSelection();
    clearArmed();
    const hint = document.getElementById('hint');
    if (hint) hint.textContent = 'Tap a box first, then use Move from its menu.';
  });
  document.getElementById('mobileLineBtn').addEventListener('click', () => lineMenu.classList.toggle('hidden'));
  document.getElementById('mobileMoreBtn').addEventListener('click', () => document.getElementById('githubBtn').click());

  document.getElementById('mobileEditBtn').addEventListener('click', () => {
    if (!selectedNode) return;
    const node = selectedNode;
    syntheticGesture = true;
    try { node.dispatchEvent(new MouseEvent('dblclick', {bubbles:true, cancelable:true})); }
    finally { syntheticGesture = false; }
    quick.classList.add('hidden');
  });
  document.getElementById('mobileMoveNodeBtn').addEventListener('click', armSelectedNode);
  document.getElementById('mobileSolidBtn').addEventListener('click', () => beginConnection('choice'));
  document.getElementById('mobileDottedBtn').addEventListener('click', () => beginConnection('read'));
  document.getElementById('mobileDeleteBtn').addEventListener('click', () => {
    if (!selectedNode) return;
    if (!confirm('Delete this story box and its connections?')) return;
    clearArmed();
    document.body.classList.add('mobile-linking');
    linkingTaps = 0;
    document.getElementById('deleteModeBtn').click();
    firePointerDown(selectedNode);
    document.getElementById('resetModeBtn').click();
    document.body.classList.remove('mobile-linking');
    linkingTaps = 0;
    clearSelection();
  });
  document.getElementById('mobileCloseQuick').addEventListener('click', clearSelection);

  document.getElementById('mobileSolidNew').addEventListener('click', () => {
    clearArmed(); lineMenu.classList.add('hidden'); linkingTaps = 0;
    document.body.classList.add('mobile-linking');
    document.getElementById('choiceModeBtn').click();
  });
  document.getElementById('mobileDottedNew').addEventListener('click', () => {
    clearArmed(); lineMenu.classList.add('hidden'); linkingTaps = 0;
    document.body.classList.add('mobile-linking');
    document.getElementById('readModeBtn').click();
  });
})();
