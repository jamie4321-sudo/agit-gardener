// 아지트 식물 — 크루가 식물을 공부하는 도감 + 사진 퀴즈
// 데이터: plants.js (식물 정보) · plants/credits.js (사진 출처)
// 어디에 있는지: 아지트 가든 관리구역 시트(garden-dash 관리 현황과 같은 시트) 공개 CSV를 읽어요
(function () {
"use strict";
const SHEET_ID = "1CNgkMtWYW-ajL4BCf86nH8KFapq3LEZsM_Cmd5i1eSE";
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=0`;
const CACHE = "ag-plant-where";
const PL = window.AG_PLANTS || [], CATS = window.AG_PLANT_CATS || [], CRED = () => window.AG_PLANT_CREDITS || {};
const BY = Object.fromEntries(PL.map(p => [p.id, p]));
const NAME = {};   // 시트 표기 → id
PL.forEach(p => [p.n, ...(p.alias || [])].forEach(k => (NAME[k.replace(/\s/g, "")] = p.id)));

let ctx = null;    // { S, render, esc, I, toast }
const st = () => (ctx.S.pg ||= { cat: "all", q: "", mode: "book", where: null, loading: false, quiz: null, sort: "many" });
const esc = s => ctx.esc(s);

/* ── 시트 → 식물마다 있는 곳 ── */
function parseCSV(t) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; } else if (c !== "\r") f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
function whereFrom(csv) {
  const out = {};
  parseCSV(csv).slice(1).forEach(r => {
    const b = (r[1] || "").trim(), z = (r[2] || "").trim();
    if (!b && !z) return;
    const place = (b.startsWith("공용부") ? "" : b + " ") + z;
    [[r[4], "수납장"], [r[6], "공용부"]].forEach(([x, kind]) => {
      x = (x || "").replace(/^★[^:]+:\s*/, "");
      x.split(",").map(s => s.trim().replace(/\s/g, "")).filter(Boolean).forEach(k => {
        const id = NAME[k]; if (!id) return;
        const a = (out[id] ||= { spots: [], cab: 0, pub: 0 });
        if (!a.spots.includes(place.trim())) a.spots.push(place.trim());
        kind === "수납장" ? a.cab++ : a.pub++;
      });
    });
  });
  return out;
}
async function loadWhere() {
  const s = st();
  if (s.where || s.loading) return;
  try { const c = localStorage.getItem(CACHE); if (c) s.where = whereFrom(c); } catch (e) {}
  s.loading = true;
  try {
    const r = await fetch(SHEET_URL + "&cb=" + Date.now(), { cache: "no-store" });
    const csv = await r.text();
    if (!csv.includes("층 / 구역")) throw new Error("sheet");
    s.where = whereFrom(csv);
    try { localStorage.setItem(CACHE, csv); } catch (e) {}
  } catch (e) { s.where ||= {}; }
  s.loading = false;
  if (ctx.S.view === "plants") ctx.render();
}
const spots = id => st().where?.[id]?.spots || [];

/* ── 작은 조각 ── */
const img = (p, cls = "") => `<img class="pg-img ${cls}" src="plants/img/${p.id}.webp?v=1" alt="${esc(p.n)} 사진" loading="lazy" decoding="async" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'pg-img pg-img--none ${cls}',textContent:'사진 준비 중'}))">`;
const LIGHT = ["", "그늘도 괜찮아요", "밝은 그늘", "햇빛 좋아요"];
const WATER = ["", "물 적게", "물 보통", "물 자주"];
const dots = (n, kind) => `<span class="pg-dots pg-dots--${kind}" aria-hidden="true">${[1, 2, 3].map(i => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span>`;
const catName = c => (CATS.find(x => x[0] === c) || [c, c])[1];
const OUTDOOR = ["tree", "grass"];

function list() {
  const s = st(), q = s.q.trim().replace(/\s/g, "");
  let xs = PL.filter(p => (s.cat === "all" || p.cat === s.cat) &&
    (!q || [p.n, ...(p.alias || []), p.sci].some(k => k.replace(/\s/g, "").toLowerCase().includes(q.toLowerCase()))));
  if (s.sort === "many") xs = xs.slice().sort((a, b) => spots(b.id).length - spots(a.id).length);
  else xs = xs.slice().sort((a, b) => a.n.localeCompare(b.n, "ko"));
  return xs;
}

/* ── 화면 ── */
function view() {
  const s = st(); loadWhere();
  const head = `<header class="head"><h1>아지트 식물</h1><p>아지트에서 키우는 식물 ${PL.length}종이에요. 사진과 특징으로 하나씩 익혀요.</p></header>`;
  const seg = `<div class="seg pg-mode" role="group" aria-label="보기">
    <button data-act="pg-mode" data-v="book" aria-pressed="${s.mode === "book"}">도감</button>
    <button data-act="pg-mode" data-v="quiz" aria-pressed="${s.mode === "quiz"}">이름 맞히기</button></div>`;
  return head + seg + (s.mode === "quiz" ? quizView() : bookView());
}

function bookView() {
  const s = st(), xs = list();
  const cnt = c => PL.filter(p => c === "all" || p.cat === c).length;
  const chips = [["all", "전체"], ...CATS.map(c => [c[0], c[1]])].map(([k, l]) =>
    `<button data-act="pg-cat" data-v="${k}" aria-pressed="${s.cat === k}">${esc(l)}<span class="num">${cnt(k)}</span></button>`).join("");
  const cat = CATS.find(c => c[0] === s.cat);
  return `<div class="pg-tools">
      <label class="pg-srch"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input id="pg-q" type="search" placeholder="식물 이름 찾기 (예: 몬스테라)" value="${esc(s.q)}" autocomplete="off"></label>
      <div class="pg-cats" role="group" aria-label="무리">${chips}</div>
    </div>
    <div class="pg-bar"><p>${cat ? `<b>${esc(cat[1])}</b> · ${esc(cat[2])}` : `<b>전체</b> · 아지트에 많이 있는 순서예요`}</p>
      <span class="pg-legend">${dots(2, "sun")}빛 ${dots(2, "water")}물</span>
      <button class="tool" data-act="pg-sort">${s.sort === "many" ? "가나다순으로" : "많은 순으로"}</button></div>
    ${xs.length ? `<div class="pg-grid">${xs.map(card).join("")}</div>`
      : `<div class="empty"><b>찾는 식물이 없어요</b><p>다른 이름으로 찾아봐요.</p></div>`}
    <p class="pg-foot">사진: 위키미디어 공용(Wikimedia Commons) 자유 이용 사진 · 식물을 누르면 사진 출처가 보여요</p>`;
}

function card(p) {
  const n = spots(p.id).length, out = OUTDOOR.includes(p.cat);
  return `<button class="pg-card" data-act="pg-open" data-id="${p.id}">
    <span class="pg-card__ph">${img(p)}</span>
    <span class="pg-card__t"><b>${esc(p.n)}</b><small>${esc(catName(p.cat))}</small>
      <span class="pg-card__m">${dots(p.light, "sun")}${dots(p.water, "water")}${n ? `<em class="num">${n}곳</em>` : out ? `<em>야외</em>` : ""}</span></span>
  </button>`;
}

/* ── 자세히 (시트) ── */
function sheet() {
  const s = ctx.S.sheet, p = BY[s.id]; if (!p) return "";
  const I = ctx.I, w = st().where?.[p.id], sp = w?.spots || [];
  const c = CRED()[p.id];
  const same = PL.filter(x => x.cat === p.cat && x.id !== p.id).slice(0, 8);
  const grp = {};
  sp.forEach(x => { const m = x.match(/^(\S+동)\s+(.*)$/); const k = m ? m[1] : "공용부"; (grp[k] ||= []).push(m ? m[2] : x); });
  const row = (t, v, cls = "") => v ? `<div class="pg-row ${cls}"><h4>${t}</h4><p>${esc(v)}</p></div>` : "";
  return `<div class="scrim" data-act="close"></div><section class="sheet pg-sheet" role="dialog" aria-modal="true" aria-label="${esc(p.n)}">
    <div class="sheet__h"><div><h2>${esc(p.n)}</h2><p><i>${esc(p.sci)}</i> · ${esc(catName(p.cat))}</p></div><button class="x" data-act="close" aria-label="닫기">${I.x}</button></div>
    <div class="sheet__b">
      <figure class="pg-fig">${img(p, "pg-img--lg")}${c ? `<figcaption>사진 <a href="${esc(c.page)}" target="_blank" rel="noopener">${esc(c.artist || "Wikimedia Commons")}</a> · ${esc(c.license)}</figcaption>` : ""}</figure>
      <p class="pg-one">${esc(p.one)}</p>
      <div class="pg-need">
        <div><span>빛</span>${dots(p.light, "sun")}<b>${LIGHT[p.light]}</b></div>
        <div><span>물</span>${dots(p.water, "water")}<b>${WATER[p.water]}</b></div>
      </div>
      ${row("이렇게 알아봐요", p.look)}
      ${row("물 주기", p.w)}
      ${row("이럴 땐", p.sign, "pg-row--sign")}
      ${row("알아두기", p.tip)}
      <div class="pg-row"><h4>아지트 어디에 있나요?${sp.length ? ` <span class="num">${sp.length}곳</span>` : ""}</h4>
        ${sp.length ? Object.entries(grp).map(([b, zs]) => `<div class="pg-where"><b>${esc(b)}</b><span>${zs.map(z => `<i>${esc(z)}</i>`).join("")}</span></div>`).join("")
          : `<p class="pg-muted">${st().loading ? "불러오는 중이에요…" : OUTDOOR.includes(p.cat) ? "테라스·야외 화단에 있어요." : "관리구역 시트에 아직 없어요."}</p>`}
      </div>
      ${same.length ? `<div class="pg-row"><h4>같은 무리 식물</h4><div class="pg-same">${same.map(x => `<button data-act="pg-open" data-id="${x.id}">${img(x)}<span>${esc(x.n)}</span></button>`).join("")}</div></div>` : ""}
    </div></section>`;
}

/* ── 이름 맞히기 퀴즈 ── (개인 점수 비교 없이, 이번에 몇 개 맞혔는지만) */
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function newQuiz(scope) {
  const pool = scope === "in" ? PL.filter(p => !OUTDOOR.includes(p.cat)) : scope === "many" ? PL.filter(p => spots(p.id).length >= 8) : PL;
  st().quiz = { scope, order: shuffle(pool.length >= 4 ? pool : PL).slice(0, 10).map(p => p.id), i: 0, pick: null, right: 0, opts: null };
  nextOpts();
}
function nextOpts() {
  const z = st().quiz, p = BY[z.order[z.i]]; if (!p) return;
  const sameCat = shuffle(PL.filter(x => x.id !== p.id && x.cat === p.cat));
  const rest = shuffle(PL.filter(x => x.id !== p.id && x.cat !== p.cat));
  z.opts = shuffle([p, ...sameCat.slice(0, 2), ...rest].slice(0, 4)).map(x => x.id);
  z.pick = null;
}
function quizView() {
  const s = st();
  if (!s.quiz) return `<section class="pg-quiz pg-quiz--start">
      <h2>사진을 보고 이름을 골라요</h2><p>한 번에 10문제예요. 틀려도 바로 설명이 나와요.</p>
      <div class="pg-qstart">
        <button class="btn btn--main" data-act="pg-quiz" data-v="many">아지트에 많은 식물</button>
        <button class="btn" data-act="pg-quiz" data-v="in">실내 식물 전체</button>
        <button class="btn" data-act="pg-quiz" data-v="all">야외까지 모두</button>
      </div></section>`;
  const z = s.quiz;
  if (z.i >= z.order.length) return `<section class="pg-quiz pg-quiz--end">
      <h2>${z.order.length}문제 중 <span class="num">${z.right}</span>개 맞혔어요</h2>
      <p>${z.right === z.order.length ? "모두 맞혔어요! 식물 박사예요." : "틀린 식물은 도감에서 한 번 더 봐요."}</p>
      <div class="pg-qstart"><button class="btn btn--main" data-act="pg-quiz" data-v="${z.scope}">한 번 더</button><button class="btn" data-act="pg-mode" data-v="book">도감 보기</button></div></section>`;
  const p = BY[z.order[z.i]], done = z.pick != null;
  return `<section class="pg-quiz">
    <div class="pg-qtop"><span class="num">${z.i + 1} / ${z.order.length}</span><div class="bar" aria-hidden="true"><i style="width:${(z.i + (done ? 1 : 0)) / z.order.length * 100}%"></i></div></div>
    <div class="pg-qph">${img(p, "pg-img--lg")}</div>
    <h2 class="pg-qq">이 식물의 이름은?</h2>
    <div class="pg-opts">${z.opts.map(id => {
      const cls = !done ? "" : id === p.id ? "is-right" : id === z.pick ? "is-wrong" : "is-dim";
      return `<button class="${cls}" data-act="pg-answer" data-id="${id}" ${done ? "disabled" : ""}>${esc(BY[id].n)}</button>`;
    }).join("")}</div>
    ${done ? `<div class="pg-qans ${z.pick === p.id ? "ok" : "no"}"><b>${z.pick === p.id ? "맞았어요!" : `정답은 ${esc(p.n)}`}</b><p>${esc(p.look)}</p>
      <button class="btn btn--main btn--wide" data-act="pg-next">${z.i + 1 < z.order.length ? "다음 문제" : "결과 보기"}</button></div>` : ""}
  </section>`;
}

/* ── 버튼 ── */
function act(a, el) {
  const s = st(), S = ctx.S;
  switch (a) {
    case "pg-mode": s.mode = el.dataset.v; if (s.mode === "quiz") s.quiz = null; break;
    case "pg-cat": s.cat = el.dataset.v; break;
    case "pg-sort": s.sort = s.sort === "many" ? "abc" : "many"; break;
    case "pg-open": S.sheet = { type: "plant", id: el.dataset.id }; ctx.render(); document.querySelector(".pg-sheet")?.scrollTo({ top: 0 }); return true;
    case "pg-quiz": newQuiz(el.dataset.v); break;
    case "pg-answer": { const z = s.quiz; if (z.pick != null) return true; z.pick = el.dataset.id; if (z.pick === z.order[z.i]) z.right++;
      ctx.render(); document.querySelector(".pg-qans")?.scrollIntoView({ behavior: "smooth", block: "center" }); return true; }
    case "pg-next": { const z = s.quiz; z.i++; if (z.i < z.order.length) nextOpts(); ctx.render(); window.scrollTo({ top: 0 }); return true; }
    default: return false;
  }
  ctx.render(); return true;
}
// 검색은 글자 칠 때마다 목록만 다시 그려요 (입력칸 포커스 유지)
document.addEventListener("input", e => {
  if (e.target.id !== "pg-q" || !ctx) return;
  st().q = e.target.value;
  const box = document.querySelector(".pg-grid, .pg-tools ~ .empty"), xs = list();
  const html = xs.length ? `<div class="pg-grid">${xs.map(card).join("")}</div>` : `<div class="empty"><b>찾는 식물이 없어요</b><p>다른 이름으로 찾아봐요.</p></div>`;
  if (box) box.outerHTML = html;
});

window.AGP = { init(c) { ctx = c; }, view, sheet, act };
})();
