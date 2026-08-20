import { createClient } from '@supabase/supabase-js';

const BUCKET = 'training videos';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

export default async function handler(request) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    return json({
      error: 'Server is missing SUPABASE_URL or SUPABASE_SECRET_KEY environment variables.'
    }, 500);
  }

  try {
    const supabase = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: root, error: rootError } = await supabase.storage
      .from(BUCKET)
      .list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } });

    if (rootError) throw rootError;

    const folders = (root || []).filter(item => item.id === null);
    const classes = [];

    for (const folder of folders) {
      const label = folder.name;
      const { data: items, error: listError } = await supabase.storage
        .from(BUCKET)
        .list(label, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
      if (listError) throw listError;

      const files = (items || []).filter(item => item.id !== null);
      const paths = files.map(file => `${label}/${file.name}`);

      let signed = [];
      if (paths.length) {
        const { data, error: signError } = await supabase.storage
          .from(BUCKET)
          .createSignedUrls(paths, 60 * 60);
        if (signError) throw signError;
        signed = data || [];
      }

      classes.push({
        label,
        count: files.length,
        videos: files.map((file, index) => ({
          name: file.name,
          path: `${label}/${file.name}`,
          size: file.metadata?.size || null,
          mimeType: file.metadata?.mimetype || file.metadata?.contentType || 'video/mp4',
          signedUrl: signed[index]?.signedUrl || null
        })).filter(video => video.signedUrl)
      });
    }

    return json({
      bucket: BUCKET,
      classCount: classes.length,
      videoCount: classes.reduce((sum, item) => sum + item.videos.length, 0),
      classes
    });
  } catch (error) {
    return json({ error: error?.message || String(error) }, 500);
  }
}
