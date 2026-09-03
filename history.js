(() => {
  const OWNER = 'gunpowderstudios';
  const REPO = 'BOD3D-TEST';
  const BRANCH = 'main';
  const PATH = 'story-mapper/story-map.json';
  const API = `https://api.github.com/repos/${OWNER}/${REPO}`;

  let historyPanel = null;
  let historyList = null;
  let historyStatus = null;

  function githubHeaders() {
    return {
      'Accept':'application/vnd.github+json',
      'X-GitHub-Api-Version':'2026-03-10'
    };
  }

  function injectUi() {
    const tools = document.querySelector('.tools');
    const loadBtn = document.getElementById('loadGithubBtn');
    if (tools && !document.getElementById('historyBtn')) {
      const btn = document.createElement('button');
      btn.id = 'historyBtn';
      btn.className = 'secondary';
      btn.textContent = 'Version History';
      btn.addEventListener('click', openHistory);
      if (loadBtn && loadBtn.parentNode === tools) loadBtn.insertAdjacentElement('afterend', btn);
      else tools.appendChild(btn);
    }

    const githubPanel = document.getElementById('githubPanel');
    if (githubPanel && !document.getElementById('historyFromGithubBtn')) {
      const btn = document.createElement('button');
      btn.id = 'historyFromGithubBtn';
      btn.className = 'secondary historyGithubButton';
      btn.textContent = 'Version History';
      btn.addEventListener('click', openHistory);
      const security = githubPanel.querySelector('.securityNote');
      if (security) githubPanel.insertBefore(btn, security);
      else githubPanel.appendChild(btn);
    }

    historyPanel = document.createElement('aside');
    historyPanel.id = 'historyPanel';
    historyPanel.className = 'historyPanel hidden';
    historyPanel.setAttribute('aria-live','polite');
    historyPanel.innerHTML = `
      <div class="editorTop">
        <strong>Version History</strong>
        <button id="closeHistoryBtn" aria-label="Close version history">×</button>
      </div>
      <p class="smallCopy historyIntro">Each GitHub save is kept as a version. Restore loads that version into the mapper; GitHub is not changed until you press Save.</p>
      <p id="historyStatus" class="panelStatus">Loading…</p>
      <div id="historyList" class="historyList"></div>`;
    document.body.appendChild(historyPanel);
    historyList = document.getElementById('historyList');
    historyStatus = document.getElementById('historyStatus');
    document.getElementById('closeHistoryBtn').addEventListener('click', closeHistory);
  }

  function closeOtherPanels() {
    document.getElementById('editor')?.classList.add('hidden');
    document.getElementById('githubPanel')?.classList.add('hidden');
  }

  async function openHistory() {
    if (!historyPanel) return;
    closeOtherPanels();
    historyPanel.classList.remove('hidden');
    await loadHistory();
  }

  function closeHistory() {
    historyPanel?.classList.add('hidden');
  }

  function setStatus(text, type='') {
    if (!historyStatus) return;
    historyStatus.textContent = text;
    historyStatus.className = 'panelStatus' + (type ? ` ${type}` : '');
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || '';
    return new Intl.DateTimeFormat([], {
      weekday:'short', day:'numeric', month:'short', year:'numeric',
      hour:'2-digit', minute:'2-digit'
    }).format(date);
  }

  function shortSha(sha) {
    return String(sha || '').slice(0,7);
  }

  async function loadHistory() {
    historyList.innerHTML = '';
    setStatus('Loading GitHub saves…');
    try {
      const url = `${API}/commits?path=${encodeURIComponent(PATH)}&sha=${encodeURIComponent(BRANCH)}&per_page=40&t=${Date.now()}`;
      const response = await fetch(url, {headers:githubHeaders(), cache:'no-store'});
      if (!response.ok) throw new Error(await apiError(response));
      const commits = await response.json();
      if (!Array.isArray(commits) || commits.length === 0) {
        setStatus('No GitHub saves found yet. Press Save to create the first one.');
        return;
      }
      setStatus(`${commits.length} saved version${commits.length === 1 ? '' : 's'} found.`, 'ok');
      commits.forEach((commit, index) => addHistoryRow(commit, index));
    } catch (err) {
      setStatus(`Could not load history: ${err.message}`, 'error');
    }
  }

  function addHistoryRow(commit, index) {
    const row = document.createElement('div');
    row.className = 'historyRow';
    const when = commit?.commit?.committer?.date || commit?.commit?.author?.date || '';
    const message = commit?.commit?.message || 'Story Mapper save';
    const sha = commit?.sha || '';
    row.innerHTML = `
      <div class="historyInfo">
        <strong>${index === 0 ? 'Current GitHub save' : escapeHtml(formatDate(when))}</strong>
        <span>${index === 0 ? escapeHtml(formatDate(when)) + ' · ' : ''}${escapeHtml(message)}</span>
        <small>${escapeHtml(shortSha(sha))}</small>
      </div>
      <button class="historyRestore secondary" ${index === 0 ? 'disabled' : ''}>${index === 0 ? 'Current' : 'Restore'}</button>`;
    const btn = row.querySelector('.historyRestore');
    if (index !== 0) btn.addEventListener('click', () => restoreCommit(sha, when, btn));
    historyList.appendChild(row);
  }

  async function restoreCommit(sha, when, button) {
    const label = formatDate(when);
    const ok = confirm(`Restore the Story Mapper version from ${label}?\n\nThis loads it into the mapper and keeps your current map as an Undo step. GitHub will not change until you press Save.`);
    if (!ok) return;

    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = 'Loading…';
    setStatus(`Loading ${label}…`);
    try {
      const url = `${API}/contents/${PATH}?ref=${encodeURIComponent(sha)}&t=${Date.now()}`;
      const response = await fetch(url, {headers:githubHeaders(), cache:'no-store'});
      if (!response.ok) throw new Error(await apiError(response));
      const file = await response.json();
      const decoded = base64ToUtf8(file.content || '');
      const obj = JSON.parse(decoded);
      const state = extractState(obj);
      if (!state) throw new Error('That version is not a valid Story Mapper save.');

      const importInput = document.getElementById('importInput');
      const backup = new File([JSON.stringify(state)], `story-map-${shortSha(sha)}.json`, {type:'application/json'});
      const dt = new DataTransfer();
      dt.items.add(backup);
      importInput.files = dt.files;
      importInput.dispatchEvent(new Event('change', {bubbles:true}));

      closeHistory();
      const saveStatus = document.getElementById('saveStatus');
      if (saveStatus) {
        saveStatus.textContent = `Restored ${formatDate(when)} — press Save to keep`;
        saveStatus.className = 'cloudBusy';
      }
      const hint = document.getElementById('hint');
      if (hint) hint.textContent = `Restored version from ${label}. Press Save when you're happy with it.`;
    } catch (err) {
      setStatus(`Restore failed: ${err.message}`, 'error');
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  function extractState(obj) {
    if (obj && Array.isArray(obj.nodes) && Array.isArray(obj.links)) return obj;
    if (obj && obj.state && Array.isArray(obj.state.nodes) && Array.isArray(obj.state.links)) return obj.state;
    return null;
  }

  function base64ToUtf8(base64) {
    const clean = String(base64).replace(/\s/g,'');
    const binary = atob(clean);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  async function apiError(response) {
    try {
      const data = await response.json();
      return `${response.status}: ${data.message || response.statusText}`;
    } catch (_) {
      return `${response.status}: ${response.statusText}`;
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
  }

  injectUi();
})();
