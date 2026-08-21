(() => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function waitForEngine(timeoutMs = 30000) {
    const started = Date.now();
    while (typeof window.skiAppInstallModel !== 'function') {
      if (Date.now() - started > timeoutMs) {
        throw new Error('The ski analysis engine did not become ready in time.');
      }
      await sleep(100);
    }
  }

  function setStatus(text) {
    const lineStatus = document.getElementById('lineStatus');
    const versusStatus = document.getElementById('versusStatus');
    if (lineStatus) lineStatus.textContent = text;
    if (versusStatus) versusStatus.textContent = text;
  }

  function setButtons(enabled) {
    const analyzeBtn = document.getElementById('analyzeLineBtn');
    const compareBtn = document.getElementById('compareBtn');
    if (analyzeBtn) analyzeBtn.disabled = !enabled;
    if (compareBtn) compareBtn.disabled = !enabled;
  }

  async function fetchModelRecord() {
    const response = await fetch('/api/model?ts=' + Date.now(), {
      cache: 'no-store',
      headers: { accept: 'application/json' }
    });
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; }
    catch (_) { throw new Error('Model API returned invalid data (HTTP ' + response.status + ').'); }
    return { response, data };
  }

  async function installModel(data) {
    if (!data.weightsUrl) throw new Error('Published model is missing its weights URL.');
    const weightsResponse = await fetch(data.weightsUrl, { cache: 'no-store' });
    if (!weightsResponse.ok) {
      throw new Error('Could not download trained model weights (HTTP ' + weightsResponse.status + ').');
    }
    const weightData = await weightsResponse.arrayBuffer();
    return await window.skiAppInstallModel({
      modelTopology: data.modelTopology,
      weightSpecs: data.weightSpecs,
      weightData,
      config: data.config || {}
    });
  }

  function startHiddenTrainer() {
    let frame = document.getElementById('skiAiBootstrapTrainer');
    if (frame) return frame;
    frame = document.createElement('iframe');
    frame.id = 'skiAiBootstrapTrainer';
    frame.src = '/trainer.html?bootstrap=' + Date.now();
    frame.setAttribute('aria-hidden', 'true');
    frame.style.position = 'fixed';
    frame.style.left = '-10000px';
    frame.style.top = '0';
    frame.style.width = '2px';
    frame.style.height = '2px';
    frame.style.opacity = '0.01';
    frame.style.pointerEvents = 'none';
    frame.style.border = '0';
    document.body.appendChild(frame);
    return frame;
  }

  async function bootstrapMissingModel() {
    setStatus('No trained model exists yet. Building it automatically from the Supabase training library. Keep this page open...');
    startHiddenTrainer();

    const started = Date.now();
    const timeoutMs = 30 * 60 * 1000;
    let checks = 0;

    while (Date.now() - started < timeoutMs) {
      await sleep(5000);
      checks++;
      const { response, data } = await fetchModelRecord();
      if (response.ok) return data;
      if (response.status !== 404) {
        throw new Error(data.error || ('Model API failed with HTTP ' + response.status));
      }
      const minutes = Math.max(1, Math.ceil((Date.now() - started) / 60000));
      if (checks % 3 === 0) {
        setStatus('Training the Ski Trick AI automatically from Supabase... about ' + minutes + ' minute' + (minutes === 1 ? '' : 's') + ' elapsed. Keep this page open.');
      }
    }

    throw new Error('Automatic first-time training did not finish within 30 minutes.');
  }

  async function start() {
    setButtons(false);
    try {
      setStatus('Loading trained Ski Trick AI model...');
      await waitForEngine();

      let { response, data } = await fetchModelRecord();

      if (response.status === 404 && String(data.error || '').toLowerCase().includes('no trained model')) {
        data = await bootstrapMissingModel();
        response = { ok: true, status: 200 };
      }

      if (!response.ok) throw new Error(data.error || 'Could not load trained model.');

      const result = await installModel(data);
      setButtons(true);

      const count = result?.classNames?.length || 0;
      const readyText = 'AI ready. Loaded ' + count + ' trick class' + (count === 1 ? '' : 'es') + '.';
      const lineStatus = document.getElementById('lineStatus');
      const versusStatus = document.getElementById('versusStatus');
      if (lineStatus) lineStatus.textContent = readyText + ' Choose a full line video.';
      if (versusStatus) versusStatus.textContent = readyText + ' Choose two full line videos.';

      const frame = document.getElementById('skiAiBootstrapTrainer');
      if (frame) frame.remove();
    } catch (err) {
      setButtons(false);
      setStatus('AI setup error: ' + (err.message || String(err)));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
