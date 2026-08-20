import { createClient } from '@supabase/supabase-js';

const BUCKET = 'training videos';
const INTERNAL_FOLDERS = new Set(['_model']);

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    return sendJson(res, 500, {
      error: 'Server is missing SUPABASE_URL or SUPABASE_SECRET_KEY environment variables.'
    });
  }

  try {
    const supabase = createClient(url, secret, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });

    const { data: root, error: rootError } = await supabase.storage
      .from(BUCKET)
      .list('', {
        limit: 1000,
        sortBy: { column: 'name', order: 'asc' }
      });

    if (rootError) throw rootError;

    const folders = (root || []).filter(item =>
      item.id == null && !INTERNAL_FOLDERS.has(item.name)
    );
    const classes = [];

    for (const folder of folders) {
      const label = folder.name;

      const { data: items, error: listError } = await supabase.storage
        .from(BUCKET)
        .list(label, {
          limit: 1000,
          sortBy: { column: 'name', order: 'asc' }
        });

      if (listError) throw listError;

      const files = (items || []).filter(item => item.id != null);
      const paths = files.map(file => `${label}/${file.name}`);

      let signed = [];
      if (paths.length) {
        const { data, error: signError } = await supabase.storage
          .from(BUCKET)
          .createSignedUrls(paths, 60 * 60);

        if (signError) throw signError;
        signed = data || [];
      }

      const videos = files.map((file, index) => ({
        name: file.name,
        path: `${label}/${file.name}`,
        size: file.metadata?.size || null,
        mimeType: file.metadata?.mimetype || file.metadata?.contentType || 'video/mp4',
        signedUrl: signed[index]?.signedUrl || null
      })).filter(video => video.signedUrl);

      classes.push({
        label,
        count: videos.length,
        videos
      });
    }

    return sendJson(res, 200, {
      ok: true,
      bucket: BUCKET,
      classCount: classes.length,
      videoCount: classes.reduce((sum, item) => sum + item.videos.length, 0),
      classes
    });
  } catch (error) {
    console.error('training-library error', error);
    return sendJson(res, 500, {
      error: error?.message || String(error)
    });
  }
}
