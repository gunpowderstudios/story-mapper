(() => {
  const originalFetch = window.fetch.bind(window);
  const OLD_REPO = '/repos/gunpowderstudios/BOD3D-TEST';
  const NEW_REPO = '/repos/gunpowderstudios/story-mapper';
  const OLD_PATH = 'story-mapper/story-map.json';
  const NEW_PATH = 'saves/story-map.json';

  function rewriteUrl(value) {
    let url = String(value || '');
    if (!url.includes('api.github.com')) return url;
    url = url.replace(OLD_REPO, NEW_REPO);
    url = url.replace(encodeURIComponent(OLD_PATH), encodeURIComponent(NEW_PATH));
    url = url.replace(OLD_PATH, NEW_PATH);
    return url;
  }

  window.fetch = function(input, init) {
    if (typeof input === 'string') return originalFetch(rewriteUrl(input), init);
    if (input instanceof Request) {
      const nextUrl = rewriteUrl(input.url);
      if (nextUrl !== input.url) return originalFetch(new Request(nextUrl, input), init);
    }
    return originalFetch(input, init);
  };
})();
