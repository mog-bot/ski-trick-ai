(() => {
  async function start() {
    const lineStatus = document.getElementById('lineStatus');
    const versusStatus = document.getElementById('versusStatus');
    const analyzeBtn = document.getElementById('analyzeLineBtn');
    const compareBtn = document.getElementById('compareBtn');

    try {
      if (lineStatus) lineStatus.textContent = 'Loading trained Ski Trick AI model...';
      if (versusStatus) versusStatus.textContent = 'Loading trained Ski Trick AI model...';

      const response = await fetch('/api/model?ts=' + Date.now(), { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load trained model.');

      const weightsResponse = await fetch(data.weightsUrl, { cache: 'no-store' });
      if (!weightsResponse.ok) throw new Error('Could not download trained model weights.');
      const weightData = await weightsResponse.arrayBuffer();

      const loaded = await tf.loadLayersModel(tf.io.fromMemory({
        modelTopology: data.modelTopology,
        weightSpecs: data.weightSpecs,
        weightData
      }));

      if (typeof model !== 'undefined' && model) model.dispose();
      model = loaded;

      const config = data.config || {};
      classNames = Array.isArray(config.classNames) ? config.classNames : [];
      trickScores = config.trickScores || {};
      trainedSteps = Number(config.trainedSteps) || 48;
      trainedFeatureCount = Number(config.trainedFeatureCount) || 0;
      modelDatasetRevision = datasetRevision;

      if (analyzeBtn) analyzeBtn.disabled = false;
      if (compareBtn) compareBtn.disabled = false;
      if (lineStatus) lineStatus.textContent = 'AI ready. Choose a full line video.';
      if (versusStatus) versusStatus.textContent = 'AI ready. Choose two full line videos.';
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
