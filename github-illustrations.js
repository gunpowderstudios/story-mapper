(() => {
  const OWNER = 'gunpowderstudios';
  const REPO = 'story-mapper';
  const BRANCH = 'main';
  let token = '';

  function headers(extra = {}) {
    const h = {
      'Accept':'application/vnd.github+json',
      'X-GitHub-Api-Version':'2026-03-10',
      ...extra
    };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }

  function apiPath(number) {
    return `https://api.github.com/repos/${OWNER}/${REPO}/contents/illustrations/${encodeURIComponent(number)}.png`;
  }

  function setStatus(tools, text, type = '') {
    if (!tools) return;
    let el = tools.querySelector('.cloudIllustrationStatus');
    if (!el) {
      el = document.createElement('span');
      el.className = 'cloudIllustrationStatus';
      tools.insertBefore(el, tools.firstChild);
    }
    el.textContent = text;
    el.dataset.type = type;
  }

  function fileToPngBlob(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(blob => {
            URL.revokeObjectURL(url);
            blob ? resolve(blob) : reject(new Error('Could not convert image to PNG.'));
          }, 'image/png');
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read that image.'));
      };
      img.src = url;
    });
  }

  async function blobToBase64(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  async function upload(number, file, tools) {
    if (!token) {
      setStatus(tools, 'Local only — connect GitHub to upload', 'warn');
      return false;
    }

    setStatus(tools, `Uploading ${number}.png…`, 'busy');
    try {
      const png = await fileToPngBlob(file);
      const content = await blobToBase64(png);
      const url = apiPath(number);
      let sha = null;
      const get = await fetch(`${url}?ref=${encodeURIComponent(BRANCH)}&t=${Date.now()}`, {
        headers: headers(),
        cache: 'no-store'
      });
      if (get.ok) {
        const existing = await get.json();
        sha = existing.sha || null;
      } else if (get.status !== 404) {
        const info = await get.json().catch(() => ({}));
        throw new Error(info.message || `GitHub ${get.status}`);
      }

      const body = {
        message: `Upload illustration ${number}.png`,
        content,
        branch: BRANCH
      };
      if (sha) body.sha = sha;

      const put = await fetch(url, {
        method:'PUT',
        headers: headers({'Content-Type':'application/json'}),
        body: JSON.stringify(body)
      });
      if (!put.ok) {
        const info = await put.json().catch(() => ({}));
        throw new Error(info.message || `GitHub ${put.status}`);
      }
      setStatus(tools, `✓ GitHub: illustrations/${number}.png`, 'ok');
      return true;
    } catch (err) {
      setStatus(tools, `GitHub upload failed: ${err.message}`, 'error');
      return false;
    }
  }

  document.addEventListener('click', e => {
    if (e.target && e.target.id === 'connectGithubBtn') {
      const input = document.getElementById('githubToken');
      token = input ? input.value.trim() : '';
    }
    if (e.target && e.target.id === 'disconnectGithubBtn') token = '';
  }, true);

  document.addEventListener('change', e => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;
    const tools = input.closest('.bookSectionTools');
    if (!tools || !input.files || !input.files[0]) return;
    let page = tools.previousElementSibling;
    while (page && !page.classList.contains('bookPage')) page = page.previousElementSibling;
    const number = page && page.dataset ? page.dataset.section : '';
    if (!number) return;
    upload(number, input.files[0], tools);
  }, true);

  window.BODGitHubIllustrations = { upload };
})();
