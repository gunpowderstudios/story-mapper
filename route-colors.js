(() => {
  const COLOURS = ['routeBlue','routeYellow','routePink'];
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

  function installStyle() {
    if (document.getElementById('routeColourStyle')) return;
    const style = document.createElement('style');
    style.id = 'routeColourStyle';
    style.textContent = `
      #links .link.routeBlue { stroke:#63c7ff; }
      #links .link.routeYellow { stroke:#ffd54a; }
      #links .link.routePink { stroke:#ff6bb5; }
      #links .link.selectedLink { stroke:#fff !important; }
    `;
    document.head.appendChild(style);
  }

  function applyColours() {
    const svg = document.getElementById('links');
    if (!svg) return;
    const state = getState();
    (state.links || []).forEach((link,index) => {
      const path = svg.querySelector(`.link[data-link-id="${CSS.escape(String(link.id))}"]`);
      if (!path) return;
      path.classList.remove(...COLOURS);
      path.classList.add(COLOURS[index % COLOURS.length]);
    });
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(applyColours, 10);
  }

  function install() {
    installStyle();
    const svg = document.getElementById('links');
    if (!svg) return;
    const observer = new MutationObserver(schedule);
    observer.observe(svg,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    document.addEventListener('pointerup',schedule);
    window.addEventListener('resize',schedule);
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install);
  else install();
})();
