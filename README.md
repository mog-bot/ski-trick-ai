# Ski Trick AI

Browser-based ski trick recognition and scoring prototype.

## Pages

- `index.html` — public line-analysis interface. Training controls are hidden from normal users.
- `trainer.html` — private training interface with Supabase training-library import and TensorFlow.js model export.
- `api/training-library.mjs` — Vercel server function that reads the private Supabase `training videos` bucket and returns short-lived signed URLs.

## Required Vercel environment variables

Add these in Vercel Project Settings > Environment Variables, then redeploy:

- `SUPABASE_URL` — the Supabase project URL.
- `SUPABASE_SECRET_KEY` — the Supabase secret key. Keep this server-side only and never place it in browser HTML.

The public Supabase publishable key is not required by the private training-library route.

## Training flow

1. Store videos in the private Supabase bucket named `training videos`.
2. Use one top-level folder per trick, such as `360`, `Backflip`, and `Frontflip`.
3. Open `/trainer.html`.
4. Check the Supabase library, import all clips, then train the trick model.
5. Export the trained AI. TensorFlow.js downloads the model JSON, weights file, and a config JSON.
6. Put the exported trained model into the production app in the next deployment step so public users do not retrain the model.
