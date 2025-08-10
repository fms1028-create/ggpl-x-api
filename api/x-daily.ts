// api/x-daily.ts  ←そのまま上書き
export const config = { runtime: 'edge' };

const TZ = 'Asia/Tokyo';
const BASE = 'https://api.twitter.com/2';
const BEARER = process.env.TW_BEARER_TOKEN!;
const USER_ID = process.env.TW_USER_ID!; // 例: 1755170447925749760 など。@GGPL_shinjuku を一度調べて入れる

function jstRange(dateStr?: string) {
  const now = dateStr ? new Date(`${dateStr}T00:00:00+09:00`) : new Date();
  const y = now.toLocaleString('sv-SE', { timeZone: TZ }).slice(0,10);
  const start = new Date(`${y}T00:00:00+09:00`);
  const end   = new Date(`${y}T23:59:59+09:00`);
  return {
    start: start.toISOString(), // → UTC
    end: end.toISOString(),
    label: y
  };
}

async function tw(path: string, params: Record<string,string>) {
  const url = new URL(BASE + path);
  for (const [k,v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${BEARER}` },
    // Edge のHTTPキャッシュを活用（同日内の再取得を爆速に）
    cache: 'force-cache',
    next: { revalidate: 60 }, // 60秒で再検証
  });
  if (!res.ok) {
    const t = await res.text().catch(()=> '');
    return new Response(JSON.stringify({ error: true, status: res.status, body: t }), { status: res.status });
  }
  return res.json();
}

export default async function handler(req: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') ?? undefined;
    const lite = searchParams.get('lite') === '1';

    if (!BEARER) return new Response('Missing TW_BEARER_TOKEN', { status: 500 });
    if (!USER_ID) return new Response('Missing TW_USER_ID', { status: 500 });

    const r = jstRange(date);

    // その日の投稿だけを最小フィールドで取得（速さ優先）
    const params: Record<string,string> = {
      'max_results': '100',
      'start_time': r.start,
      'end_time': r.end,
      'exclude': 'retweets,replies',
      'tweet.fields': 'created_at,text,lang',
    };

    const data = await tw(`/users/${USER_ID}/tweets`, params);
    // tw() 失敗時は Response を返すのでそのまま返却
    if (data instanceof Response) return data;

    const tweets = (data?.data ?? []).map((t: any) => ({
      id: t.id,
      created_at: t.created_at,
      text: t.text,
      url: `https://x.com/i/web/status/${t.id}`,
    }));

    const payload = lite ? tweets : {
      status: tweets.length ? 'ok' : 'empty',
      range: { jst: r.label, start: r.start, end: r.end },
      count: tweets.length,
      tweets,
    };

    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  } catch (e:any) {
    return new Response(JSON.stringify({ error: true, message: e?.message ?? String(e) }), { status: 500 });
  }
}
