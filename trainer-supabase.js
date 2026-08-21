(() => {
  function start() {
    const status = document.getElementById('supabaseLibraryStatus');
    const list = document.getElementById('supabaseLibraryList');
    const debug = document.getElementById('supabaseDebug');
    const exportBtn = document.getElementById('exportTrainedModel');
    const cloudTrainBtn = document.getElementById('cloudTrainBtn');

    if (!status || !list || !debug || !exportBtn || !cloudTrainBtn) {
      setTimeout(start, 250);
      return;
    }

    let importStarted = false;
    let datasetReady = false;

    async function waitForTrainerEngine(timeoutMs = 30000) {
      const started = Date.now();
      while (typeof window.skiTrainerImportRemote !== 'function') {
        if (Date.now() - started > timeoutMs) {
          throw new Error('The training engine did not become ready in time. Reload the page and try again.');
        }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }

    async function getRealTrainButton(timeoutMs = 15000) {
      const started = Date.now();
      while (true) {
        const trainBtn = document.getElementById('trainBtn');
        if (trainBtn && !trainBtn.disabled) return trainBtn;
        if (Date.now() - started > timeoutMs) {
          throw new Error('The training dataset is not ready yet. Make sure at least two trick folders imported successfully.');
        }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }

    async function connectAndImport() {
      if (importStarted) return;
      importStarted = true;
      datasetReady = false;
      cloudTrainBtn.disabled = true;
      status.textContent = 'Connecting to Supabase and loading the training library...';
      debug.textContent = 'Reading /api/training-library...';
      list.innerHTML = '';

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      try {
        const response = await fetch('/api/training-library?ts=' + Date.now(), {
          cache: 'no-store',
          signal: controller.signal,
          headers: { accept: 'application/json' }
        });
        const raw = await response.text();
        let data = {};
        try { data = raw ? JSON.parse(raw) : {}; }
        catch (_) { throw new Error('API returned non-JSON output (HTTP ' + response.status + '). ' + raw.slice(0, 180)); }
        if (!response.ok) throw new Error(data.error || ('API returned HTTP ' + response.status));

        const classes = data.classes || [];
        const entries = classes.flatMap(group =>
          (group.videos || []).map(video => ({ ...video, label: group.label }))
        );

        list.innerHTML = classes.map(item =>
          '<div class="supabaseClass"><strong>' + item.label + '</strong><span>' + item.videos.length + ' videos</span></div>'
        ).join('');

        if (!entries.length) {
          status.textContent = 'Connected to Supabase, but no training videos were found.';
          debug.textContent = 'Add videos to trick folders inside the training videos bucket, then reload this page.';
          return;
        }

        if (classes.length < 2) {
          throw new Error('The AI needs at least two different trick folders before it can train.');
        }

        status.textContent = 'Connected. Found ' + entries.length + ' videos across ' + classes.length + ' trick folders. Importing and pose-tracking them now...';
        debug.textContent = 'Keep this page open while the videos are processed.';
        await waitForTrainerEngine();

        const result = await window.skiTrainerImportRemote(entries);
        if (!result.added) throw new Error('None of the Supabase videos produced usable pose-tracking data.');

        const realTrainBtn = await getRealTrainButton();
        datasetReady = !!realTrainBtn;
        cloudTrainBtn.disabled = !datasetReady;

        status.textContent = 'Dataset ready. Imported ' + result.added + ' videos' + (result.failed ? '; ' + result.failed + ' were skipped.' : '.') + ' Press Train AI model.';
        debug.textContent = 'Training is ready. The model will publish to Supabase automatically when training finishes.';
      } catch (err) {
        const message = err && err.name === 'AbortError'
          ? 'The Vercel API did not answer within 15 seconds.'
          : (err.message || String(err));
        status.textContent = 'Training setup failed: ' + message;
        debug.textContent = 'Diagnostic: ' + message;
        importStarted = false;
        cloudTrainBtn.disabled = true;
      } finally {
        clearTimeout(timer);
      }
    }

    cloudTrainBtn.addEventListener('click', async () => {
      if (!datasetReady) return;
      try {
        cloudTrainBtn.disabled = true;
        const realTrainBtn = await getRealTrainButton();
        status.textContent = 'Starting AI training. Leave this page open until all 80 epochs finish.';
        debug.textContent = 'Training started. After epoch 80, the trainer will publish the model automatically.';
        realTrainBtn.click();
      } catch (err) {
        status.textContent = 'Could not start training: ' + err.message;
        cloudTrainBtn.disabled = false;
      }
    });

    exportBtn.addEventListener('click', async () => {
      try {
        if (typeof window.skiTrainerPublishModel !== 'function') throw new Error('Train the model first.');
        await window.skiTrainerPublishModel();
        status.textContent = 'Published. The public app can now load the trained model.';
      } catch (err) {
        status.textContent = 'Publish failed: ' + err.message;
      }
    });

    setTimeout(connectAndImport, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
