(() => {
  const TOKEN_KEY = 'bodStoryMapperGithubToken';
  const AUTOSAVE_MS = 10 * 60 * 1000;
  let dirty = false;
  let connected = false;
  let initialising = true;
  let autosaveTimer = null;

  function el(id) { return document.getElementById(id); }

  function setDirty() {
    if (!initialising) dirty = true;
  }

  function installRememberControls() {
    const panel = el('githubPanel');
    const tokenInput = el('githubToken');
    const actions = panel && panel.querySelector('.githubActions');
    if (!panel || !tokenInput || !actions) return false;

    if (!el('rememberGithubToken')) {
      const label = document.createElement('label');
      label.className = 'check';
      label.innerHTML = '<input id="rememberGithubToken" type="checkbox" checked> Remember GitHub token on this device';
      tokenInput.closest('label').insertAdjacentElement('afterend', label);
    }

    if (!el('forgetGithubTokenBtn')) {
      const btn = document.createElement('button');
      btn.id = 'forgetGithubTokenBtn';
      btn.type = 'button';
      btn.className = 'secondary danger';
      btn.textContent = 'Forget token';
      actions.appendChild(btn);
      btn.addEventListener('click', () => {
        localStorage.removeItem(TOKEN_KEY);
        const remember = el('rememberGithubToken');
        if (remember) remember.checked = false;
        tokenInput.value = '';
        const disconnect = el('disconnectGithubBtn');
        if (disconnect) disconnect.click();
        const status = el('githubPanelStatus');
        if (status) status.textContent = 'Saved token removed from this device.';
      });
    }

    const connect = el('connectGithubBtn');
    if (connect && !connect.dataset.rememberInstalled) {
      connect.dataset.rememberInstalled = '1';
      connect.addEventListener('click', () => {
        const token = tokenInput.value.trim();
        const remember = el('rememberGithubToken');
        if (token && remember && remember.checked) localStorage.setItem(TOKEN_KEY, token);
        else if (remember && !remember.checked) localStorage.removeItem(TOKEN_KEY);
      }, true);
    }

    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) {
      const remember = el('rememberGithubToken');
      if (remember) remember.checked = true;
      if (!tokenInput.value) tokenInput.value = saved;
      setTimeout(() => {
        const btn = el('connectGithubBtn');
        if (btn && !btn.disabled && tokenInput.value) btn.click();
      }, 180);
    }
    return true;
  }

  function watchConnectionStatus() {
    const status = el('saveStatus');
    if (!status) return;
    const read = () => {
      const text = status.textContent || '';
      connected = /GitHub connected|Saved to GitHub/i.test(text);
      if (/Saved to GitHub/i.test(text)) dirty = false;
    };
    read();
    new MutationObserver(read).observe(status, {childList:true, characterData:true, subtree:true, attributes:true});
  }

  function watchMapChanges() {
    const nodes = el('nodes');
    const links = el('links');
    const config = {childList:true, subtree:true, attributes:true, characterData:true};
    const observer = new MutationObserver(setDirty);
    if (nodes) observer.observe(nodes, config);
    if (links) observer.observe(links, config);

    ['applyNodeBtn','addNodeBtn','undoBtn','toggleLineBtn','deleteLineBtn','clearBtn'].forEach(id => {
      const button = el(id);
      if (button) button.addEventListener('click', setDirty, true);
    });

    document.addEventListener('pointerup', e => {
      if (e.target && (e.target.closest?.('.node') || e.target.closest?.('#links'))) setDirty();
    }, true);
  }

  function runAutosave() {
    if (!dirty || !connected) return;
    const save = el('saveBtn');
    if (!save || save.disabled) return;
    save.click();
  }

  function installAutosave() {
    watchConnectionStatus();
    watchMapChanges();
    autosaveTimer = setInterval(runAutosave, AUTOSAVE_MS);
    window.addEventListener('beforeunload', () => { if (autosaveTimer) clearInterval(autosaveTimer); });
    setTimeout(() => { initialising = false; dirty = false; }, 1200);
  }

  function install() {
    installRememberControls();
    installAutosave();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
