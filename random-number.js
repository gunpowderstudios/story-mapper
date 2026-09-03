(() => {
  const MAX_SECTION = 400;
  const addBtn = document.getElementById('addNodeBtn');
  const numberInput = document.getElementById('nodeNumber');
  const applyBtn = document.getElementById('applyNodeBtn');
  const nodesLayer = document.getElementById('nodes');

  if (!addBtn || !numberInput || !applyBtn || !nodesLayer) return;

  function randomUnusedNumber(currentNumber) {
    const used = new Set(
      [...nodesLayer.querySelectorAll('.bubble')]
        .map(el => Number(el.textContent))
        .filter(Number.isFinite)
    );

    // The freshly-created node is already on screen. Ignore its temporary
    // sequential number while choosing its final gamebook section number.
    used.delete(Number(currentNumber));

    let upper = MAX_SECTION;
    let available = [];

    while (!available.length) {
      for (let n = 1; n <= upper; n++) {
        if (!used.has(n)) available.push(n);
      }
      if (!available.length) upper += MAX_SECTION;
    }

    if (available.length > 1) {
      const currentIndex = available.indexOf(Number(currentNumber));
      if (currentIndex >= 0) available.splice(currentIndex, 1);
    }

    return available[Math.floor(Math.random() * available.length)];
  }

  function randomiseFreshNode() {
    // addNode() opens the editor synchronously; using a zero-delay callback
    // lets the normal mapper finish rendering before we assign the final number.
    const current = Number(numberInput.value);
    if (!Number.isFinite(current)) return;

    const randomNumber = randomUnusedNumber(current);
    if (!Number.isFinite(randomNumber) || randomNumber === current) return;

    numberInput.value = randomNumber;
    applyBtn.click();

    const hint = document.getElementById('hint');
    if (hint) hint.textContent = `New story section randomly numbered ${randomNumber}.`;
  }

  addBtn.addEventListener('click', () => setTimeout(randomiseFreshNode, 0));
})();
