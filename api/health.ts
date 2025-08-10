export default function handler(req, res) {
  const hasBearer = !!process.env.TW_BEARER_TOKEN;
  const hasUserId = !!process.env.TW_USER_ID;
  res.status(200).json({
    ok: true,
    env: { TW_BEARER_TOKEN: hasBearer, TW_USER_ID: hasUserId },
    node: process.version
  });
}
