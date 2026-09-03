(() => {
  const COLOURS = ['#63c7ff','#ffd54a','#ff6bb5'];
  let timer = null;

  function getState() {
    try {
      const raw = localStorage.getItem('bodStoryMapper');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.links)) return parsed;
      if (parsed && parsed.state && Array.isArray(parsed.state.nodes) && Array.isArray(parsed.state.links)) return parsed.state;
    } catch (_) {}
    return {nodes:[],links:[]};
  }

  function applyColours() {
    const svg = document.getElementById('links');
    if (!svg) return;
    const state = getState();

    (state.links || []).forEach((link,index) => {
      const path = svg.querySelector(`.link[data-link-id="${CSS.escape(String(link.id))}"]`);
      if (!path) return;

      if (path.classList.contains('selectedLink')) {
        path.style.setProperty('stroke', '#ffffff', 'important');
      } else {
        path.style.setProperty('stroke', COLOURS[index % COLOURS.length], 'important');
      }
    });
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(applyColours, 20);
  }

  function install() {
    const svg = document.getElementById('links');
    if (!svg) return;

    const observer = new MutationObserver(mutations => {
      if (mutations.some(m => m.type === 'childList' || (m.type === 'attributes' && m.attributeName === 'class'))) {
        schedule();
      }
    });
    observer.observe(svg,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});

    document.addEventListener('pointerup',schedule);
    window.addEventListener('resize',schedule);
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install);
  else install();
})();
