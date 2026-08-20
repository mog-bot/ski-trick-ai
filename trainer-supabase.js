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

    exportBtn.textContent = 'Publish trained AI';
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

    async function connectAndImport() {
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

        status.textContent = 'Connected. Found ' + entries.length + ' videos across ' + classes.length + ' trick folders. Preparing automatic import...';
        debug.textContent = 'Supabase connected successfully. Waiting for the pose-tracking training engine...';
        await waitForTrainerEngine();

        status.textContent = 'Importing all ' + entries.length + ' Supabase videos into the AI trainer automatically. This can take a while because each clip is pose-tracked locally.';
        debug.textContent = 'Automatic cloud import in progress. Keep this page open until it finishes.';
        const result = await window.skiTrainerImportRemote(entries);

        status.textContent = 'Cloud dataset ready. Imported ' + result.added + ' videos automatically' + (result.failed ? '; ' + result.failed + ' were skipped because tracking was too weak.' : '.');
        debug.textContent = 'Now press Train trick model. When training finishes, press Publish trained AI so the public app uses it.';
      } catch (err) {
        const message = err && err.name === 'AbortError'
          ? 'The Vercel API did not answer within 15 seconds.'
          : (err.message || String(err));
        status.textContent = 'Automatic Supabase training import failed: ' + message;
        debug.textContent = 'Diagnostic: ' + message + '\nReload after checking the latest Vercel deployment and Supabase connection.';
        importStarted = false;
      } finally {
        clearTimeout(timer);
      }
    }

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

    setTimeout(connectAndImport, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
