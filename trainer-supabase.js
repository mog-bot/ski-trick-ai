(() => {
  function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }

  async function waitUntil(test, timeoutMs, errorMessage){
    const started = Date.now();
    while(!test()){
      if(Date.now() - started > timeoutMs) throw new Error(errorMessage);
      await sleep(250);
    }
  }

  async function start(){
    const status = document.getElementById('supabaseLibraryStatus');
    const list = document.getElementById('supabaseLibraryList');
    const debug = document.getElementById('supabaseDebug');

    if(!status || !list || !debug){
      setTimeout(start,250);
      return;
    }

    try{
      status.textContent = 'Connecting to Supabase...';
      debug.textContent = 'Step 1 of 4: loading training folders.';

      const response = await fetch('/api/training-library?ts=' + Date.now(), {
        cache:'no-store',
        headers:{accept:'application/json'}
      });
      const raw = await response.text();
      let data = {};
      try{ data = raw ? JSON.parse(raw) : {}; }
      catch(_){ throw new Error('Training library API returned invalid data.'); }
      if(!response.ok) throw new Error(data.error || ('Training library API failed (' + response.status + ')'));

      const classes = (data.classes || []).filter(group => group.label && !group.label.startsWith('_'));
      const entries = classes.flatMap(group =>
        (group.videos || []).map(video => ({...video,label:group.label}))
      );

      list.innerHTML = classes.map(group =>
        '<div class="supabaseClass"><strong>' + group.label + '</strong><span>' + group.videos.length + ' videos</span></div>'
      ).join('');

      if(classes.length < 2) throw new Error('At least two trick folders are required to train the AI.');
      if(!entries.length) throw new Error('No training videos were found in Supabase.');

      status.textContent = 'Waiting for the body-tracking model to finish loading...';
      debug.textContent = 'Step 2 of 4: preparing MediaPipe pose tracking.';

      await waitUntil(
        () => typeof window.skiTrainerImportRemote === 'function' && typeof window.skiTrainerPoseReady === 'function',
        60000,
        'The trainer engine did not load correctly.'
      );
      await waitUntil(
        () => window.skiTrainerPoseReady(),
        120000,
        'The MediaPipe body-tracking model did not become ready.'
      );

      status.textContent = 'Importing and pose-tracking ' + entries.length + ' training videos...';
      debug.textContent = 'Step 2 of 4: processing every Supabase video. Keep this tab open.';

      const result = await window.skiTrainerImportRemote(entries);
      if(!result || result.added < 2) throw new Error('Too few videos produced usable tracking data.');

      status.textContent = 'Imported ' + result.added + ' videos' + (result.failed ? '; ' + result.failed + ' skipped.' : '.') + ' Training the AI now...';
      debug.textContent = 'Step 3 of 4: running the original 80-epoch training engine.';

      await waitUntil(
        () => typeof window.skiTrainerStartTraining === 'function',
        30000,
        'The training function did not load correctly.'
      );

      const trained = await window.skiTrainerStartTraining();
      if(!trained) throw new Error('The training engine did not finish successfully.');

      status.textContent = 'Training finished. Publishing the trained model...';
      debug.textContent = 'Step 4 of 4: saving the model to Supabase for the public app.';

      await waitUntil(
        () => typeof window.skiTrainerPublishModel === 'function',
        30000,
        'The model publisher did not load correctly.'
      );
      const config = await window.skiTrainerPublishModel();

      status.textContent = 'AI ready. Trained and published ' + (config.classNames?.length || classes.length) + ' trick classes successfully.';
      debug.textContent = 'Complete. Refresh the public Ski Trick AI app to use this model.';
    }catch(err){
      status.textContent = 'Automatic training stopped: ' + (err.message || String(err));
      debug.textContent = 'Nothing else will run until this page is reloaded. The stable trainer engine has been preserved.';
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', start, {once:true});
  }else{
    start();
  }
})();
