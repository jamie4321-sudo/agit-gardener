// 아지트 가드너 서비스 워커 — 휴대폰 알림만 맡아요 (화면 파일은 저장해 두지 않음: 배포하면 바로 새 화면)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { m = { body: e.data?.text() || "" }; }
  e.waitUntil(self.registration.showNotification(m.title || "아지트 가드너", {
    body: m.body || "",
    tag: m.tag || undefined,
    renotify: !!m.tag,
    icon: "icons/icon-192.png",
    badge: "icons/badge-96.png",
    lang: "ko",
    data: { url: m.url || "" },
  }));
});

// 알림을 누르면 앱을 열고 그 이슈로 가요
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "", self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const w = wins.find(c => c.url.startsWith(self.registration.scope));
    if (w) { await w.focus(); w.postMessage({ type: "open", url }); return; }
    await self.clients.openWindow(url);
  })());
});
