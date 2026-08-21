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

    // Publishing now happens automatically after every successful training run.
    // Keep this button hidden as an emergency/manual fallback only.
    exportBtn.style.display = 'none';

    let importStarted = false;

    async function waitForTrainerEngine(timeoutMs = 30000) {
      const started = Date.now();
      while (typeof window.skiTrainerImportRemote !== 'function') {
        if (Date.now() - started > timeoutMs) {
          throw new Error('The training engine did not become ready in time. Reload the page and try again.');
        }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }

    async function waitForTrainButton(timeoutMs = 15000) {
      const started = Date.now();
      while (true) {
        const trainBtn = document.getElementById('trainBtn');
        if (trainBtn && !trainBtn.disabled) return trainBtn;
        if (Date.now() - started > timeoutMs) {
          throw new Error('The training dataset imported, but the AI could not start training. Make sure at least two trick folders contain usable videos.');
        }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }

    async function connectImportAndTrain() {
      if (importStarted) return;
      importStarted = true;
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

        status.textContent = 'Connected. Found ' + entries.length + ' videos across ' + classes.length + ' trick folders. Preparing automatic import...';
        debug.textContent = 'Supabase connected successfully. Waiting for the pose-tracking engine...';
        await waitForTrainerEngine();

        status.textContent = 'Importing all ' + entries.length + ' Supabase videos automatically. Each clip is being pose-tracked locally.';
        debug.textContent = 'Automatic cloud import in progress. Keep this page open.';
        const result = await window.skiTrainerImportRemote(entries);

        if (!result.added) {
          throw new Error('None of the Supabase videos produced usable pose-tracking data.');
        }

        status.textContent = 'Cloud dataset ready. Imported ' + result.added + ' videos' + (result.failed ? '; ' + result.failed + ' were skipped.' : '.') + ' Starting AI training automatically...';
        debug.textContent = 'No button press is needed. Training will run through 80 epochs and then publish to Supabase automatically.';

        const trainBtn = await waitForTrainButton();
        trainBtn.click();

        // The main trainer updates this cloud status again after training and automatic publishing complete.
      } catch (err) {
        const message = err && err.name === 'AbortError'
          ? 'The Vercel API did not answer within 15 seconds.'
          : (err.message || String(err));
        status.textContent = 'Automatic training setup failed: ' + message;
        debug.textContent = 'Diagnostic: ' + message + '\nReload the trainer after checking the Supabase library.';
        importStarted = false;
      } finally {
        clearTimeout(timer);
      }
    }

    // Manual fallback remains wired even though the button is hidden.
    exportBtn.addEventListener('click', async () => {
      try {
        if (typeof window.skiTrainerPublishModel !== 'function') {
          throw new Error('Train the model first or wait for the trainer to finish loading.');
        }
        exportBtn.disabled = true;
        status.textContent = 'Publishing the trained AI to Supabase...';
        await window.skiTrainerPublishModel();
        status.textContent = 'Published. The public Ski Trick AI app can now load this trained model automatically.';
        debug.textContent = 'Model publish complete. Reload the public app to use the newest trained AI.';
      } catch (err) {
        status.textContent = 'Publish failed: ' + err.message;
      } finally {
        exportBtn.disabled = false;
      }
    });

    setTimeout(connectImportAndTrain, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
