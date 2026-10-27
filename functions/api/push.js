// 휴대폰 알림 보내기 (Cloudflare Pages Functions · POST /api/push)
// Supabase 트리거(pg_net)가 받는 사람 구독 목록과 내용을 보내면, Web Push(RFC 8291 aes128gcm + VAPID)로 보내요.
// 비밀 열쇠(VAPID private)는 DB(ag_push_config)에만 있고, 여기엔 공개 열쇠만 있어요 → 다른 열쇠로는 못 씀.
const VAPID_PUB = "BNcls-HIoPArAWcm_D_3fMlt7YVIau4W3AxZHhXKK6kN3mZCK32roqgpCii2fVSHCqFiof7H26I566efh_73zF0";
const SUBJECT = "https://agit-gardener.pages.dev/";
const SB_URL = "https://qdwynctnhjndkmykecbu.supabase.co";
const SB_KEY = "sb_publishable_gv8l9z7imNyR0_lsUmVLxw_cFFclQ6O";

const te = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const hmac = async (key, data) => new Uint8Array(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), data));

// VAPID: ES256 JWT (aud = 받는 푸시 서버 주소)
async function vapidAuth(endpoint, privD) {
  const pub = unb64u(VAPID_PUB);
  const key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", d: privD, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true },
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${VAPID_PUB}`;
}

// 내용 암호화 (RFC 8291, 한 덩어리)
export async function encrypt(p256dh, auth, text) {
  const ua = unb64u(p256dh), secret = unb64u(auth);
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const as = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256));
  const ikm = await hmac(await hmac(secret, ecdh), cat(te.encode("WebPush: info\0"), ua, as, [1]));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(te.encode("Content-Encoding: aes128gcm\0"), [1]))).slice(0, 16);
  const nonce = (await hmac(prk, cat(te.encode("Content-Encoding: nonce\0"), [1]))).slice(0, 12);
  const k = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, k, cat(te.encode(text), [2])));
  return cat(salt, [0, 0, 16, 0], [as.length], as, ct);   // salt · rs 4096 · idlen · keyid · 암호문
}

async function sendOne(sub, text, privD, ttl) {
  const r = await fetch(sub.endpoint, {
    method: "POST",
    headers: { Authorization: await vapidAuth(sub.endpoint, privD), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: String(ttl), Urgency: "high" },
    body: await encrypt(sub.p256dh, sub.auth, text),
  });
  return r.status;
}

export async function onRequestPost({ request }) {
  let j; try { j = await request.json(); } catch { return new Response("bad json", { status: 400 }); }
  if (j?.vapid?.pub !== VAPID_PUB || !j.vapid.priv || !Array.isArray(j.subs)) return new Response("forbidden", { status: 403 });
  const text = JSON.stringify(j.msg || {}), ttl = j.ttl || 86400;
  const res = await Promise.all(j.subs.map(s => sendOne(s, text, j.vapid.priv, ttl).catch(() => 0)));
  const gone = j.subs.filter((s, i) => res[i] === 404 || res[i] === 410).map(s => s.endpoint);
  if (gone.length && j.secret) {   // 앱을 지웠거나 알림을 끈 기기는 목록에서 빼요
    await fetch(`${SB_URL}/rest/v1/rpc/ag_push_prune`, { method: "POST", headers: { apikey: SB_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ p_secret: j.secret, p_endpoints: gone }) }).catch(() => {});
  }
  return Response.json({ sent: res.filter(s => s >= 200 && s < 300).length, gone: gone.length, status: res });
}
export const onRequestGet = () => new Response("agit-gardener push", { status: 200 });
