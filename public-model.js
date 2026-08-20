(() => {
  async function waitForEngine(timeoutMs = 30000) {
    const started = Date.now();
    while (typeof window.skiAppInstallModel !== 'function') {
      if (Date.now() - started > timeoutMs) {
        throw new Error('The ski analysis engine did not become ready in time.');
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async function start() {
    const lineStatus = document.getElementById('lineStatus');
    const versusStatus = document.getElementById('versusStatus');
    const analyzeBtn = document.getElementById('analyzeLineBtn');
    const compareBtn = document.getElementById('compareBtn');

    if (analyzeBtn) analyzeBtn.disabled = true;
    if (compareBtn) compareBtn.disabled = true;

    try {
      if (lineStatus) lineStatus.textContent = 'Loading trained Ski Trick AI model...';
      if (versusStatus) versusStatus.textContent = 'Loading trained Ski Trick AI model...';

      await waitForEngine();

      const response = await fetch('/api/model?ts=' + Date.now(), {
        cache: 'no-store',
        headers: { accept: 'application/json' }
      });

      const raw = await response.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; }
      catch (_) { throw new Error('Model API returned an invalid response (HTTP ' + response.status + ').'); }

      if (!response.ok) throw new Error(data.error || 'Could not load trained model.');
      if (!data.weightsUrl) throw new Error('Published model is missing its weights URL.');

      const weightsResponse = await fetch(data.weightsUrl, { cache: 'no-store' });
      if (!weightsResponse.ok) throw new Error('Could not download trained model weights (HTTP ' + weightsResponse.status + ').');
      const weightData = await weightsResponse.arrayBuffer();

      const result = await window.skiAppInstallModel({
        modelTopology: data.modelTopology,
        weightSpecs: data.weightSpecs,
        weightData,
        config: data.config || {}
      });

      if (analyzeBtn) analyzeBtn.disabled = false;
      if (compareBtn) compareBtn.disabled = false;

      const count = result?.classNames?.length || 0;
      const readyText = 'AI ready. Loaded ' + count + ' trick class' + (count === 1 ? '' : 'es') + '.';
      if (lineStatus) lineStatus.textContent = readyText + ' Choose a full line video.';
      if (versusStatus) versusStatus.textContent = readyText + ' Choose two full line videos.';
    } catch (err) {
      if (analyzeBtn) analyzeBtn.disabled = true;
      if (compareBtn) compareBtn.disabled = true;
      const message = 'AI model unavailable: ' + (err.message || String(err));
      if (lineStatus) lineStatus.textContent = message;
      if (versusStatus) versusStatus.textContent = message;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
