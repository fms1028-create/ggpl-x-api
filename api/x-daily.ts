// api/x-daily.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

const BEARER = process.env.TWITTER_BEARER!;
const DEFAULT_USERNAME = process.env.X_USERNAME || 'GGPL_shinjuku';

// X v2 recent search (過去7日程度) を日付で取る
// ?date=YYYY-MM-DD&username=optional
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const date = String(req.query.date || '').trim();
    if (!date) return res.status(400).json({ error: 'Missing date (YYYY-MM-DD)' });

    const username = String(req.query.username || DEFAULT_USERNAME).trim();

    // ユーザーID取得
    const user = await fetchJSON(
      `https://api.twitter.com/2/users/by/username/${encodeURIComponent(username)}?user.fields=id,name,username`
    );
    if (!user?.data?.id) {
      return res.status(404).json({ error: 'User not found', username });
    }
    const userId = user.data.id;

    // その日の0:00〜23:59:59(JST)の範囲で検索したいので、UTCに直してfrom/toを作る
    const jstStart = new Date(`${date}T00:00:00+09:00`);
    const jstEnd   = new Date(`${date}T23:59:59+09:00`);
    const startTime = jstStart.toISOString();
    const endTime   = jstEnd.toISOString();

    // from:ユーザー かつ 時間範囲
    // v2 searchでは from:username でOK（公式投稿とRT/返信も含む）。
    const query = `from:${username}`;

    const searchUrl = new URL('https://api.twitter.com/2/tweets/search/recent');
    searchUrl.searchParams.set('query', query);
    searchUrl.searchParams.set('start_time', startTime);
    searchUrl.searchParams.set('end_time', endTime);
    searchUrl.searchParams.set('max_results', '100');
    searchUrl.searchParams.set('tweet.fields', 'created_at,public_metrics,referenced_tweets,entities');
    searchUrl.searchParams.set('expansions', 'referenced_tweets.id,attachments.media_keys,author_id');
    searchUrl.searchParams.set('user.fields', 'username,name');
    searchUrl.searchParams.set('media.fields', 'type,url,preview_image_url');

    const tweets = await fetchJSON(searchUrl.toString());

    // ざっくり集計（いいね・RT・リプの合計 等）
    const list = (tweets?.data || []).map((t: any) => ({
      id: t.id,
      text: t.text,
      created_at: t.created_at,
      metrics: t.public_metrics,
      type: detectType(t) // tweet / retweet / reply / quote
    }));

    const summary = list.reduce((acc: any, t: any) => {
      acc.count++;
      acc.likes += t.metrics?.like_count || 0;
      acc.rts   += t.metrics?.retweet_count || 0;
      acc.replies += t.metrics?.reply_count || 0;
      acc.quotes  += t.metrics?.quote_count || 0;
      acc.types[t.type] = (acc.types[t.type] || 0) + 1;
      return acc;
    }, { count: 0, likes: 0, rts: 0, replies: 0, quotes: 0, types: {} as Record<string, number> });

    return res.status(200).json({
      username,
      date,
      window: { startTime, endTime },
      total: summary,
      tweets: list
    });

  } catch (err: any) {
    const code = Number(err?.status || err?.code || 500);
    return res.status(code >= 400 && code < 600 ? code : 500).json({
      error: 'fetch_failed',
      detail: err?.message || String(err)
    });
  }
}

async function fetchJSON(url: string) {
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${BEARER}` }
  });
  if (r.status === 429) {
    // シンプルなリトライ（wait 2s）
    await new Promise((ok) => setTimeout(ok, 2000));
    return fetchJSON(url);
  }
  if (!r.ok) {
    const text = await r.text();
    const err: any = new Error(text);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

function detectType(t: any): 'tweet'|'retweet'|'reply'|'quote' {
  const refs = t?.referenced_tweets || [];
  if (refs.some((r: any) => r.type === 'retweeted')) return 'retweet';
  if (refs.some((r: any) => r.type === 'replied_to')) return 'reply';
  if (refs.some((r: any) => r.type === 'quoted')) return 'quote';
  return 'tweet';
}
