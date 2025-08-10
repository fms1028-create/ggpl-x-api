export default async function handler(req, res) {
  try {
    const bearer = process.env.TW_BEARER_TOKEN;
    const username = (req.query.username as string) || 'GGPL_shinjuku';
    if (!bearer) return res.status(500).json({ ok:false, error:'Missing TW_BEARER_TOKEN' });

    // 1) username → user id
    const r1 = await fetch(`https://api.twitter.com/2/users/by/username/${encodeURIComponent(username)}?user.fields=id`, {
      headers: { Authorization: `Bearer ${bearer}`, 'User-Agent': 'vercel-probe' }
    });
    const j1 = await r1.json();
    if (!r1.ok) return res.status(r1.status).json({ ok:false, step:'users.by.username', detail:j1 });

    const id = j1?.data?.id;
    if (!id) return res.status(404).json({ ok:false, step:'resolve-id', detail:j1 });

    // 2) latest tweet 1件
    const r2 = await fetch(`https://api.twitter.com/2/users/${id}/tweets?max_results=5&tweet.fields=created_at`, {
      headers: { Authorization: `Bearer ${bearer}`, 'User-Agent': 'vercel-probe' }
    });
    const j2 = await r2.json();
    if (!r2.ok) return res.status(r2.status).json({ ok:false, step:'user-tweets', detail:j2 });

    return res.status(200).json({ ok:true, id, sample:j2 });
  } catch (e:any) {
    return res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
}
