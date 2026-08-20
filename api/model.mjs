import { createClient } from '@supabase/supabase-js';

const BUCKET = 'training videos';
const META_PATH = '_model/model-data.json';
const WEIGHTS_PATH = '_model/weights.bin';

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function getClient() {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY.');
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

export default async function handler(req, res) {
  try {
    const supabase = getClient();

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { modelTopology, weightSpecs, weightDataBase64, config } = body;
      if (!modelTopology || !Array.isArray(weightSpecs) || !weightDataBase64 || !config) {
        return sendJson(res, 400, { error: 'Incomplete model payload.' });
      }

      const meta = JSON.stringify({ modelTopology, weightSpecs, config });
      const weights = Buffer.from(weightDataBase64, 'base64');

      const { error: metaError } = await supabase.storage.from(BUCKET).upload(
        META_PATH,
        Buffer.from(meta, 'utf8'),
        { contentType: 'application/json', upsert: true }
      );
      if (metaError) throw metaError;

      const { error: weightsError } = await supabase.storage.from(BUCKET).upload(
        WEIGHTS_PATH,
        weights,
        { contentType: 'application/octet-stream', upsert: true }
      );
      if (weightsError) throw weightsError;

      return sendJson(res, 200, { ok: true, created: config.created || new Date().toISOString() });
    }

    if (req.method === 'GET') {
      const { data: metaBlob, error: metaError } = await supabase.storage.from(BUCKET).download(META_PATH);
      if (metaError) {
        return sendJson(res, 404, { error: 'No trained model has been published yet.' });
      }
      const meta = JSON.parse(await metaBlob.text());

      const { data: signed, error: signError } = await supabase.storage.from(BUCKET).createSignedUrl(WEIGHTS_PATH, 60 * 60);
      if (signError) throw signError;

      return sendJson(res, 200, {
        ok: true,
        modelTopology: meta.modelTopology,
        weightSpecs: meta.weightSpecs,
        config: meta.config,
        weightsUrl: signed.signedUrl
      });
    }

    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    console.error('model API error', error);
    return sendJson(res, 500, { error: error?.message || String(error) });
  }
}
