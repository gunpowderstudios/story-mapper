(() => {
  const DB_NAME = 'bodStoryMapperAssets';
  const DB_STORE = 'illustrations';
  let dbPromise = null;
  let overlay = null;
  let pagesEl = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function getLocalImage(number) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(String(number));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function putLocalImage(number, file) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put({blob:file, name:file.name, type:file.type, savedAt:new Date().toISOString()}, String(number));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  function syncMapToLocalStorage() {
    const save = document.getElementById('saveBtn');
    const panel = document.getElementById('githubPanel');
    if (save) save.click();
    if (panel) setTimeout(() => panel.classList.add('hidden'), 0);
  }

  function getState() {
    try {
      const raw = localStorage.getItem('bodStoryMapper');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed.nodes)) return parsed;
      if (parsed && parsed.state && Array.isArray(parsed.state.nodes)) return parsed.state;
    } catch (_) {}
    return {nodes:[], links:[], nextId:1};
  }

  function sectionSort(a, b) {
    const ao = Number.isFinite(Number(a.bookOrder)) ? Number(a.bookOrder) : Number(a.number);
    const bo = Number.isFinite(Number(b.bookOrder)) ? Number(b.bookOrder) : Number(b.number);
    if (ao !== bo) return ao - bo;
    return Number(a.number) - Number(b.number);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>'\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','\"':'&quot;'}[c]));
  }

  function paragraphs(text) {
    const clean = String(text || '').replace(/\r/g, '').trim();
    if (!clean) return [''];
    return clean.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  }

  async function resolveImage(number) {
    const local = await getLocalImage(number).catch(() => null);
    if (local && local.blob) return {url:URL.createObjectURL(local.blob), name:local.name || `${number}.png`, local:true};
    const extensions = ['png','jpg','jpeg','webp'];
    for (const ext of extensions) {
      const url = `illustrations/${encodeURIComponent(number)}.${ext}`;
      const ok = await new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = `${url}?v=${Date.now()}`;
      });
      if (ok) return {url, name:`${number}.${ext}`, local:false};
    }
    return null;
  }

  function makePage(section, pageNo, continuation = false) {
    const page = document.createElement('article');
    page.className = 'bookPage';
    page.dataset.section = section.number;
    page.innerHTML = `
      <div class="sectionNumber">${continuation ? '' : escapeHtml(section.number)}</div>
      <div class="sectionTitle">${continuation ? '' : escapeHtml(section.title || '')}</div>
      <div class="storyText"></div>
      <div class="pageNumber">${pageNo}</div>`;
    return page;
  }

  function pageOverflows(page) {
    const text = page.querySelector('.storyText');
    return text && (text.scrollHeight > text.clientHeight + 2 || page.scrollHeight > page.clientHeight + 2);
  }

  async function renderSection(section, pageCounter) {
    const image = await resolveImage(section.number);
    const ps = paragraphs(section.text);
    let page = makePage(section, pageCounter.value++, false);
    pagesEl.appendChild(page);
    let story = page.querySelector('.storyText');

    if (image) {
      const img = document.createElement('img');
      img.className = 'storyIllustration';
      img.alt = `Illustration ${section.number}`;
      img.src = image.url;
      page.insertBefore(img, page.querySelector('.sectionNumber'));
      await new Promise(resolve => { img.onload = img.onerror = resolve; });
    } else {
      const ph = document.createElement('div');
      ph.className = 'imagePlaceholder';
      ph.textContent = `Illustration ${section.number}.png`;
      page.insertBefore(ph, page.querySelector('.sectionNumber'));
    }

    for (const pText of ps) {
      let p = document.createElement('p');
      p.textContent = pText;
      story.appendChild(p);
      if (!pageOverflows(page)) continue;

      story.removeChild(p);
      let words = pText.split(/\s+/);
      let chunk = [];
      while (words.length) {
        chunk.push(words.shift());
        p.textContent = chunk.join(' ');
        story.appendChild(p);
        if (pageOverflows(page)) {
          story.removeChild(p);
          const last = chunk.pop();
          if (chunk.length) {
            const keep = document.createElement('p');
            keep.textContent = chunk.join(' ');
            story.appendChild(keep);
          }
          page = makePage(section, pageCounter.value++, true);
          pagesEl.appendChild(page);
          story = page.querySelector('.storyText');
          chunk = last ? [last] : [];
          p = document.createElement('p');
          p.textContent = chunk.join(' ');
          story.appendChild(p);
        }
      }
    }

    const tools = document.createElement('div');
    tools.className = 'bookSectionTools';
    tools.innerHTML = `<span class="filename">${image ? escapeHtml(image.name) : `No ${escapeHtml(section.number)}.png yet`}</span>
      <label>Upload illustration<input type="file" accept="image/png,image/jpeg,image/webp"></label>`;
    const input = tools.querySelector('input');
    input.addEventListener('change', async () => {
      if (!input.files[0]) return;
      await putLocalImage(section.number, input.files[0]);
      await renderBook();
    });
    pagesEl.appendChild(tools);
  }

  async function renderBook() {
    if (!pagesEl) return;
    pagesEl.innerHTML = '';
    syncMapToLocalStorage();
    await new Promise(r => setTimeout(r, 20));
    const state = getState();
    const sections = [...(state.nodes || [])].sort(sectionSort);
    if (!sections.length) {
      pagesEl.innerHTML = '<div class="bookEmpty">No story nodes yet.</div>';
      return;
    }
    const counter = {value:1};
    for (const section of sections) await renderSection(section, counter);
    const info = document.getElementById('bookPreviewInfo');
    if (info) info.textContent = `${sections.length} sections • ${counter.value - 1} preview pages • 6 × 9 in`;
  }

  function downloadText(name, text, type='application/json') {
    const blob = new Blob([text], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  async function exportInDesignJson() {
    syncMapToLocalStorage();
    await new Promise(r => setTimeout(r, 20));
    const state = getState();
    const sections = [...(state.nodes || [])].sort(sectionSort);
    const output = {
      format:'book-of-dungeon-indesign-v1',
      trim:{widthIn:6,heightIn:9,widthCm:15.24,heightCm:22.86},
      paper:'cream',
      typography:{body:'Times New Roman',bodyPt:11.25,leading:1.32},
      exportedAt:new Date().toISOString(),
      sections:sections.map((n,i) => ({
        order:i+1,
        number:Number(n.number),
        title:n.title || '',
        text:n.text || '',
        illustration:`illustrations/${n.number}.png`,
        printedOnDungeonMap:!!n.map
      }))
    };
    downloadText('book-of-dungeon-indesign.json', JSON.stringify(output,null,2));
  }

  function exportCsv() {
    const state = getState();
    const sections = [...(state.nodes || [])].sort(sectionSort);
    const q = v => `"${String(v ?? '').replace(/"/g,'""')}"`;
    const rows = [['Order','Section','Title','Text','Illustration','Printed on map']];
    sections.forEach((n,i) => rows.push([i+1,n.number,n.title||'',n.text||'',`${n.number}.png`,n.map?'Yes':'No']));
    downloadText('book-of-dungeon-sections.csv', rows.map(r=>r.map(q).join(',')).join('\n'), 'text/csv');
  }

  function closePreview() {
    if (overlay) overlay.classList.add('bookPreviewHidden');
  }

  async function openPreview() {
    if (!overlay) createOverlay();
    overlay.classList.remove('bookPreviewHidden');
    await renderBook();
  }

  function createOverlay() {
    overlay = document.createElement('section');
    overlay.id = 'bookPreviewOverlay';
    overlay.className = 'bookPreviewHidden';
    overlay.innerHTML = `
      <div class="bookPreviewTop">
        <strong>Book Preview</strong>
        <span id="bookPreviewInfo" class="bookPreviewInfo">6 × 9 in • KDP cream paper</span>
        <span class="spacer"></span>
        <span class="bookExportNote">Preview only. Final editable layout will be produced in InDesign.</span>
        <button id="bookExportCsv">CSV</button>
        <button id="bookExportJson">InDesign JSON</button>
        <button id="bookPrintPreview">Print / PDF</button>
        <button id="bookRefresh">Refresh</button>
        <button id="bookClose" class="primary">Back to Mapper</button>
      </div>
      <div class="bookPagesWrap"><div id="bookPages" class="bookPages"></div></div>`;
    document.body.appendChild(overlay);
    pagesEl = overlay.querySelector('#bookPages');
    overlay.querySelector('#bookClose').addEventListener('click', closePreview);
    overlay.querySelector('#bookRefresh').addEventListener('click', renderBook);
    overlay.querySelector('#bookPrintPreview').addEventListener('click', () => window.print());
    overlay.querySelector('#bookExportJson').addEventListener('click', exportInDesignJson);
    overlay.querySelector('#bookExportCsv').addEventListener('click', exportCsv);
  }

  function installButton() {
    const tools = document.querySelector('.tools');
    if (!tools || document.getElementById('bookPreviewBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'bookPreviewBtn';
    btn.className = 'secondary';
    btn.textContent = 'Book Preview';
    const save = document.getElementById('saveBtn');
    tools.insertBefore(btn, save || null);
    btn.addEventListener('click', openPreview);

    const mobileMore = document.getElementById('mobileMoreBtn');
    if (mobileMore) {
      let timer;
      mobileMore.addEventListener('click', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const panel = document.getElementById('githubPanel');
          if (panel && !panel.classList.contains('hidden') && !panel.querySelector('#mobileBookPreviewBtn')) {
            const m = document.createElement('button');
            m.id = 'mobileBookPreviewBtn';
            m.textContent = 'Book Preview';
            m.style.marginTop = '8px';
            m.addEventListener('click', openPreview);
            panel.appendChild(m);
          }
        }, 30);
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installButton);
  else installButton();
})();
