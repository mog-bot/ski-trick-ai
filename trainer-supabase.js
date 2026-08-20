(() => {
  function start() {
    const status = document.getElementById('supabaseLibraryStatus');
    const list = document.getElementById('supabaseLibraryList');
    const importBtn = document.getElementById('importSupabaseLibrary');
    const debug = document.getElementById('supabaseDebug');
    const loadBtn = document.getElementById('loadSupabaseLibrary');
    const exportBtn = document.getElementById('exportTrainedModel');

    if (!status || !list || !importBtn || !loadBtn || !exportBtn) {
      setTimeout(start, 250);
      return;
    }

    let library = null;

    async function loadLibrary() {
      status.textContent = 'Connecting to the private Supabase training library...';
      debug.textContent = 'Calling /api/training-library...';
      importBtn.disabled = true;
      loadBtn.disabled = true;
      list.innerHTML = '';

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);

      try {
        const response = await fetch('/api/training-library?ts=' + Date.now(), {
          cache: 'no-store',
          signal: controller.signal,
          headers: { accept: 'application/json' }
        });

        const raw = await response.text();
        let data = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch (_) {
          throw new Error('API returned non-JSON output (HTTP ' + response.status + '). ' + raw.slice(0, 180));
        }

        if (!response.ok) {
          throw new Error(data.error || ('API returned HTTP ' + response.status));
        }

        library = data;
        status.textContent = 'Connected. Found ' + data.videoCount + ' videos across ' + data.classCount + ' trick folders.';
        debug.textContent = 'Connection successful. Bucket: ' + (data.bucket || 'training videos');
        list.innerHTML = (data.classes || []).map(item =>
          '<div class="supabaseClass"><strong>' + item.label + '</strong><span>' + item.videos.length + ' videos</span></div>'
        ).join('');
        importBtn.disabled = !data.videoCount;
      } catch (err) {
        const message = err && err.name === 'AbortError'
          ? 'The Vercel API did not answer within 12 seconds. Check the latest Production deployment and environment variables.'
          : (err.message || String(err));
        status.textContent = 'Supabase connection error: ' + message;
        debug.textContent = 'Diagnostic: ' + message + '\nOpen /api/training-library in a new tab to inspect the raw response.';
      } finally {
        clearTimeout(timer);
        loadBtn.disabled = false;
      }
    }

    loadBtn.addEventListener('click', loadLibrary);

    importBtn.addEventListener('click', async () => {
      if (!library) return;
      const entries = (library.classes || []).flatMap(group =>
        (group.videos || []).map(video => ({ ...video, label: group.label }))
      );

      if (typeof window.skiTrainerImportRemote !== 'function') {
        status.textContent = 'Trainer import engine is still loading. Try again in a moment.';
        return;
      }

      importBtn.disabled = true;
      status.textContent = 'Importing ' + entries.length + ' videos. Each video is being pose-tracked locally.';
      try {
        const result = await window.skiTrainerImportRemote(entries);
        status.textContent = 'Imported ' + result.added + ' videos into the trainer. ' + result.failed + ' skipped. Now press Train trick model.';
      } catch (err) {
        status.textContent = 'Import failed: ' + err.message;
      } finally {
        importBtn.disabled = false;
      }
    });

    exportBtn.addEventListener('click', async () => {
      try {
        if (typeof window.skiTrainerExportModel !== 'function') {
          throw new Error('Train the model first or wait for the trainer to finish loading.');
        }
        status.textContent = 'Exporting the trained model...';
        await window.skiTrainerExportModel();
        status.textContent = 'Export complete. Keep the model JSON, weights file, and config file together.';
      } catch (err) {
        status.textContent = 'Export failed: ' + err.message;
      }
    });

    setTimeout(loadLibrary, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
