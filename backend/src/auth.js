// スタッフ用パスコード（STAFF_PASSCODE）による簡易ログイン（HTTP Basic 認証）。
// お客様用の引換券ページ（/t/...）と、その表示に必要なものだけはパスコードなしで見られる。
// STAFF_PASSCODE が未設定のとき（自分のPCでの開発）はログインなし。
import crypto from 'node:crypto';

const PUBLIC_PATHS = [
  /^\/healthz$/,
  /^\/t\/[^/]+$/,
  /^\/ticket\.html$/,
  /^\/api\/public\//,
  /^\/api\/qr\.svg$/,
  /^\/css\//,
  /^\/js\//,
  /^\/favicon/,
];

export function staffAuth(passcode) {
  if (!passcode) return (req, res, next) => next();
  const expected = Buffer.from(passcode);

  return (req, res, next) => {
    if (PUBLIC_PATHS.some((re) => re.test(req.path))) return next();
    const [scheme, encoded] = (req.headers.authorization || '').split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString();
      const given = Buffer.from(decoded.slice(decoded.indexOf(':') + 1));
      if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Smart Cloak staff", charset="UTF-8"');
    res.status(401).type('text/plain').send('スタッフ用パスコードが必要です（ユーザー名は何でも可）');
  };
}
