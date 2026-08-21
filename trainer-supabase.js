(() => {
  function start() {
    const status = document.getElementById('supabaseLibraryStatus');
    const list = document.getElementById('supabaseLibraryList');
    const debug = document.getElementById('supabaseDebug');
    const exportBtn = document.getElementById('exportTrainedModel');

    if (!status || !list || !debug || !exportBtn) {
      setTimeout(start, 250);
      return;
    }

    let pipelineStarted = false;

    async function waitForTrainerEngine(timeoutMs = 30000) {
      const started = Date.now();
      while (typeof window.skiTrainerImportRemote !== 'function') {
        if (Date.now() - started > timeoutMs) {
          throw new Error('The training engine did not become ready in time. Reload the page and try again.');
        }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }

    async function waitForRealTrainButton(timeoutMs = 20000) {
      const started = Date.now();
      while (true) {
        const trainBtn = document.getElementById('trainBtn');
        if (trainBtn && !trainBtn.disabled) return trainBtn;
        if (Date.now() - started > timeoutMs) {
          throw new Error('The dataset finished importing, but training could not start. At least two trick classes need usable tracked videos.');
        }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }

    async function runPipeline() {
      if (pipelineStarted) return;
      pipelineStarted = true;
      status.textContent = 'Connecting to Supabase and loading the training library...';
      debug.textContent = 'Step 1 of 4: reading the training library.';
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

        if (!entries.length) throw new Error('No training videos were found in Supabase.');
        if (classes.length < 2) throw new Error('The AI needs at least two different trick folders before it can train.');

        await waitForTrainerEngine();

        status.textContent = 'Importing and pose-tracking ' + entries.length + ' videos automatically...';
        debug.textContent = 'Step 2 of 4: converting every video into pose and ski-motion training data. Keep this page open.';
        const result = await window.skiTrainerImportRemote(entries);
        if (!result.added) throw new Error('None of the Supabase videos produced usable pose-tracking data.');

        status.textContent = 'Imported ' + result.added + ' videos' + (result.failed ? '; ' + result.failed + ' were skipped.' : '.') + ' Starting AI training automatically...';
        debug.textContent = 'Step 3 of 4: training the temporal neural network through 80 epochs.';

        const realTrainBtn = await waitForRealTrainButton();
        realTrainBtn.click();

        // trainCurrentDataset now auto-publishes at the end. Watch its status text
        // and mirror the final outcome into this cloud section.
        const trainStatus = document.getElementById('trainStatus');
        const startedAt = Date.now();
        while (true) {
          const text = trainStatus?.textContent || '';
          if (text.includes('Published automatically')) {
            status.textContent = 'Training complete. The newest AI model was published automatically and is ready for the public app.';
            debug.textContent = 'Step 4 of 4 complete: published to Supabase. Refresh the public Ski Trick AI app.';
            break;
          }
          if (text.includes('Automatic publish failed') || text.startsWith('Training error:')) {
            throw new Error(text);
          }
          if (Date.now() - startedAt > 30 * 60 * 1000) {
            throw new Error('Training took longer than 30 minutes and the automatic pipeline stopped waiting.');
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (err) {
        const message = err && err.name === 'AbortError'
          ? 'The Vercel API did not answer within 15 seconds.'
          : (err.message || String(err));
        status.textContent = 'Automatic training failed: ' + message;
        debug.textContent = 'The automatic pipeline stopped. Fix the problem, then reload this trainer page to try again.';
        pipelineStarted = false;
      } finally {
        clearTimeout(timer);
      }
    }

    // Hidden manual fallback if needed internally later.
    exportBtn.addEventListener('click', async () => {
      if (typeof window.skiTrainerPublishModel === 'function') {
        await window.skiTrainerPublishModel();
      }
    });

    setTimeout(runPipeline, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
