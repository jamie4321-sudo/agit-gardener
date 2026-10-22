// 아지트 가드너 — 매니저가 가드너별 담당 층을 정하고, 각자 로그인해서 내 층 / 전체를 봐요.
// 데이터: Supabase ag_* 함수(RPC). 함수가 아직 없으면 '체험 모드'(이 기기에만 저장)로 열려요.
(() => {
"use strict";

const CFG = window.AG_CONFIG || {};
const ASSIGN_ON = CFG.assignOn !== false; // false 면 배정 메뉴를 흐리게 잠그고 현장 이슈만
const $root = document.getElementById("root");
const SESSION_KEY = "ag-session", PREF_KEY = "ag-pref", DEMO_KEY = "ag-demo";
const COLORS = ["#16a34a", "#2563eb", "#ea580c", "#7c3aed", "#0d9488", "#db2777", "#475569", "#b45309"];
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

// ── 작은 도우미 ──
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const today = () => ymd(new Date());
const fmtDay = s => { const d = parse(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`; };
const fmtShort = s => { const d = parse(s); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
const dayWord = s => { const t = today(); return s === t ? "오늘" : s === addDays(t, 1) ? "내일" : s === addDays(t, -1) ? "어제" : fmtShort(s); };
const load = (k, f) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const drop = k => { try { localStorage.removeItem(k); } catch {} };
const initial = n => (String(n || "?").trim().replace(/^가드너\s*/, "") || "?").slice(0, 1);

const I = {
  leaf: '<svg class="i" viewBox="0 0 24 24"><path d="M12 21V11M12 14c0-4 3-7 8-7 0 4-3 7-8 7zM12 17c0-3-2.6-6-7-6 0 3.6 2.6 6 7 6z"/></svg>',
  me: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
  all: '<svg class="i" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  assign: '<svg class="i" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg>',
  team: '<svg class="i" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.3c2 .8 3.5 2.8 3.5 5.7"/></svg>',
  check: '<svg class="i" viewBox="0 0 24 24"><path d="M5 12.5 10 17 19 7.5"/></svg>',
  left: '<svg class="i" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>',
  right: '<svg class="i" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>',
  x: '<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  warn: '<svg class="i" viewBox="0 0 24 24"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17.5v.01"/></svg>',
  ok: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/></svg>',
  msg: '<svg class="i" viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  big: '<svg class="i" viewBox="0 0 24 24"><path d="M3 19 8 6l5 13M4.8 15h6.4M15 19l3-8 3 8M15.9 17h4.2"/></svg>',
  moon: '<svg class="i" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
  out: '<svg class="i" viewBox="0 0 24 24"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/></svg>',
  plus: '<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  up: '<svg class="i" viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg>',
  down: '<svg class="i" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
  issue: '<svg class="i" viewBox="0 0 24 24"><path d="M5 21V4h11l-1.5 4L16 12H5"/></svg>',
  cam: '<svg class="i" viewBox="0 0 24 24"><path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z"/><circle cx="12" cy="13.2" r="3.4"/></svg>',
  pin: '<svg class="i" viewBox="0 0 24 24"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></svg>',
  heart: '<svg class="i" viewBox="0 0 24 24"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/></svg>',
  send: '<svg class="i" viewBox="0 0 24 24"><path d="M4 12 20 4l-4 16-4-7z"/><path d="m12 13 8-9"/></svg>',
  cmp: '<svg class="i" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 3v18"/></svg>',
  key: '<svg class="i" viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2"/></svg>',
};

// ── 백엔드: Supabase RPC ──
const remote = {
  async rpc(fn, args) {
    const key = CFG.sbKey || "";
    const r = await fetch(`${CFG.sbUrl}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}), "Content-Type": "application/json" },
      body: JSON.stringify(args || {}),
    });
    if (!r.ok) {
      const t = await r.json().catch(() => ({}));
      const e = new Error(t.message || `오류 ${r.status}`); e.status = r.status; e.code = t.code; throw e;
    }
    const txt = await r.text(); return txt ? JSON.parse(txt) : null;
  },
  roster() { return this.rpc("ag_roster"); },
  login(id, pin) { return this.rpc("ag_login", { p_id: id, p_pin: pin }); },
  logout(t) { return this.rpc("ag_logout", { p_token: t }).catch(() => {}); },
  board(t, day) { return this.rpc("ag_board", { p_token: t, p_day: day }); },
  assign(t, day, member, zones, note, zoneNotes) { return this.rpc("ag_assign_set", { p_token: t, p_day: day, p_member: member, p_zones: zones, p_note: note, p_zone_notes: zoneNotes || {} }); },
  done(t, day, zone, flag) { return this.rpc("ag_done_set", { p_token: t, p_day: day, p_zone: zone, p_done: flag }); },
  memberDelete(t, id) { return this.rpc("ag_member_delete", { p_token: t, p_id: id }); },
  memberOrder(t, ids) { return this.rpc("ag_member_order", { p_token: t, p_ids: ids }); },
  zoneSave(t, old, code, label) { return this.rpc("ag_zone_save", { p_token: t, p_old: old || null, p_code: code, p_label: label }); },
  zoneDelete(t, code) { return this.rpc("ag_zone_delete", { p_token: t, p_code: code }); },
  zoneOrder(t, codes) { return this.rpc("ag_zone_order", { p_token: t, p_codes: codes }); },
  memberSave(t, m) { return this.rpc("ag_member_save", { p_token: t, p_id: m.id || null, p_name: m.name, p_role: m.role, p_pin: m.pin || null, p_sort: m.sort, p_active: m.active }); },
  memberPin(t, id, pin) { return this.rpc("ag_member_pin", { p_token: t, p_id: id, p_pin: pin }); },
  issueList(t, status) { return this.rpc("ag_issue_list", { p_token: t, p_status: status, p_limit: 60 }); },
  issuePhoto(t, id) { return this.rpc("ag_issue_photo", { p_token: t, p_id: id }); },
  issueWeek(t, from) { return this.rpc("ag_issue_week", { p_token: t, p_from: from }); },
  issueSave(t, id, zone, memo, place, day) { return this.rpc("ag_issue_save", { p_token: t, p_id: id || null, p_zone: zone || null, p_memo: memo, p_place: place || "", p_day: day || null }); },
  issuePhotoAdd(t, issue, kind, ph) { return this.rpc("ag_issue_photo_add", { p_token: t, p_issue: issue, p_kind: kind, p_thumb: ph.thumb, p_full: ph.full }); },
  issuePhotoDelete(t, id) { return this.rpc("ag_issue_photo_delete", { p_token: t, p_id: id }); },
  issueDone(t, id, flag, note) { return this.rpc("ag_issue_done", { p_token: t, p_id: id, p_done: flag, p_note: note || "" }); },
  issueDelete(t, id) { return this.rpc("ag_issue_delete", { p_token: t, p_id: id }); },
  commentAdd(t, issue, body) { return this.rpc("ag_issue_comment_add", { p_token: t, p_issue: issue, p_body: body }); },
  commentDelete(t, id) { return this.rpc("ag_issue_comment_delete", { p_token: t, p_id: id }); },
  react(t, issue, kind, on) { return this.rpc("ag_issue_react", { p_token: t, p_issue: issue, p_kind: kind, p_on: on }); },
  news(t) { return this.rpc("ag_issue_news", { p_token: t }); },
  newsSeen(t) { return this.rpc("ag_issue_news_seen", { p_token: t }); },
};

// ── 백엔드: 체험 모드 (이 기기 localStorage, SQL 과 같은 규칙) ──
const ZONES = [["B1", "지하 1층 춘식도락"], ["1F", "1층 공용"], ["2F", "2층 아지뜰"], ["3F", "3층 공용"], ["4F", "4층 공용"],
  ["5A", "5층 A"], ["5B", "5층 B"], ["6A", "6층 A"], ["6B", "6층 B"], ["7A", "7층 A"], ["7B", "7층 B"], ["8A", "8층 A"],
  ["9A", "9층 A"], ["9B", "9층 B"], ["10A", "10층 A"], ["11A", "11층 A"], ["12A", "12층 A"], ["13A", "13층 A"], ["14A", "14층 A"], ["15A", "15층 A"]]
  .map(([code, label]) => ({ code, label }));
const demo = {
  db() {
    let d = load(DEMO_KEY, null);
    if (!d) {
      const t = today();
      d = { members: [
        { id: "ma", name: "관리자", role: "admin", pin: "9999", sort: -1, active: true },
        { id: "m0", name: "매니저", role: "manager", pin: "0427", sort: 0, active: true },
        { id: "m1", name: "가드너 1", role: "crew", pin: "1111", sort: 1, active: true },
        { id: "m2", name: "가드너 2", role: "crew", pin: "2222", sort: 2, active: true },
        { id: "m3", name: "가드너 3", role: "crew", pin: "3333", sort: 3, active: true },
        { id: "m4", name: "가드너 4", role: "crew", pin: "4444", sort: 4, active: true },
      ], assign: [
        { day: t, member: "m0", zones: ["B1", "1F", "2F"], note: "" },
        { day: t, member: "m1", zones: ["3F", "4F", "5A", "5B"], note: "", zone_notes: { "5A": "창가 화분은 물을 조금만 주세요.", "4F": "회의실 앞 고무나무 잎 닦기" } },
        { day: t, member: "m2", zones: ["6A", "6B", "7A", "7B"], note: "" },
        { day: t, member: "m3", zones: ["8A", "9A", "9B", "10A"], note: "" },
        { day: t, member: "m4", zones: ["11A", "12A", "13A", "14A"], note: "" },
      ], zones: ZONES.map(z => ({ ...z })), done: [{ day: t, zone: "B1", member: "m0" }, { day: t, zone: "3F", member: "m1" }], sessions: {} };
      save(DEMO_KEY, d);
    }
    if (!d.zones) d.zones = ZONES.map(z => ({ ...z }));
    if (!d.members.some(m => m.role === "admin")) d.members.unshift({ id: "ma", name: "관리자", role: "admin", pin: "9999", sort: -1, active: true });
    if (!d.issues) d.issues = [];
    if (!d.photos) d.photos = [];
    if (!d.comments) d.comments = [];
    if (!d.hearts) d.hearts = [];
    return d;
  },
  put(d) { save(DEMO_KEY, d); },
  me(t) { const d = this.db(), id = d.sessions[t], m = d.members.find(x => x.id === id && x.active); if (!m) { const e = new Error("AUTH"); e.code = "28000"; throw e; } return m; },
  eff(d, day) {
    const out = [];
    for (const m of d.members.filter(x => x.active)) {
      const a = d.assign.filter(x => x.member === m.id && x.day <= day).sort((p, q) => q.day.localeCompare(p.day))[0];
      if (a) out.push({ ...a });
    }
    return out;
  },
  async roster() { return this.db().members.filter(m => m.active).sort((a, b) => a.sort - b.sort).map(({ id, name, role }) => ({ id, name, role })); },
  async login(id, pin) {
    const d = this.db(), m = d.members.find(x => x.id === id && x.active);
    if (!m) return { ok: false, err: "none" };
    if (m.pin !== pin) return { ok: false, err: "pin", left: 4 };
    const t = "demo-" + Math.random().toString(36).slice(2); d.sessions[t] = m.id; this.put(d);
    return { ok: true, token: t, me: { id: m.id, name: m.name, role: m.role } };
  },
  async logout(t) { const d = this.db(); delete d.sessions[t]; this.put(d); },
  async board(t, day) {
    const m = this.me(t), d = this.db();
    return { me: { id: m.id, name: m.name, role: m.role }, today: today(),
      members: d.members.filter(x => x.active).sort((a, b) => a.sort - b.sort).map(({ id, name, role, sort }) => ({ id, name, role, sort })),
      zones: d.zones, assign: this.eff(d, day), done: d.done.filter(x => x.day === day) };
  },
  async assign(t, day, member, zones, note, zoneNotes) {
    this.mgr(t);
    const d = this.db(); d.assign = d.assign.filter(x => !(x.day === day && x.member === member));
    const zone_notes = Object.fromEntries(Object.entries(zoneNotes || {}).filter(([k, v]) => zones.includes(k) && String(v).trim()).map(([k, v]) => [k, String(v).trim().slice(0, 500)]));
    d.assign.push({ day, member, zones, note, zone_notes }); this.put(d);
  },
  async done(t, day, zone, flag) {
    const m = this.me(t), d = this.db();
    if (m.role === "crew" && (day !== today() || !this.eff(d, day).some(a => a.member === m.id && a.zones.includes(zone)))) throw new Error("FORBIDDEN");
    d.done = d.done.filter(x => !(x.day === day && x.zone === zone));
    if (flag) d.done.push({ day, zone, member: m.id });
    this.put(d);
  },
  async memberSave(t, p) {
    const me = this.adm(t);
    if (!p.name.trim()) throw new Error("이름을 적어 주세요");
    if (p.pin && !/^\d{4}$/.test(p.pin)) throw new Error("비밀번호는 숫자 4자리예요");
    if (p.id === me.id && (p.role !== "admin" || !p.active)) throw new Error("내 계정은 관리자에서 뺄 수 없어요");
    const d = this.db();
    if (!p.id) { if (!p.pin) throw new Error("비밀번호 4자리를 정해 주세요"); const id = "m" + Date.now(); d.members.push({ id, name: p.name.trim(), role: p.role, pin: p.pin, sort: p.sort ?? 99, active: true }); this.put(d); return id; }
    const m = d.members.find(x => x.id === p.id); Object.assign(m, { name: p.name.trim(), role: p.role, sort: p.sort ?? m.sort, active: p.active }); if (p.pin) m.pin = p.pin; this.put(d); return m.id;
  },
  mgr(t) { const m = this.me(t); if (m.role === "crew") throw new Error("FORBIDDEN"); return m; },
  adm(t) { const m = this.me(t); if (m.role !== "admin") throw new Error("FORBIDDEN"); return m; },
  async memberPin(t, id, pin) {
    this.adm(t); if (!/^\d{4}$/.test(pin || "")) throw new Error("비밀번호는 숫자 4자리예요");
    const d = this.db(), m = d.members.find(x => x.id === id); if (!m) throw new Error("크루를 찾지 못했어요");
    m.pin = pin; this.put(d);
  },
  async memberDelete(t, id) {
    const me = this.adm(t); if (id === me.id) throw new Error("내 계정은 삭제할 수 없어요");
    const d = this.db(); d.members = d.members.filter(x => x.id !== id); d.assign = d.assign.filter(x => x.member !== id); this.put(d);
  },
  async memberOrder(t, ids) { this.adm(t); const d = this.db(); ids.forEach((id, i) => { const m = d.members.find(x => x.id === id); if (m) m.sort = i; }); this.put(d); },
  async zoneSave(t, old, code, label) {
    this.adm(t); const d = this.db(), zs = d.zones; code = String(code || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{1,6}$/.test(code)) throw new Error("층 이름은 영어·숫자 6자 이내예요 (예: 5A, B1)");
    if (!String(label || "").trim()) throw new Error("설명을 적어 주세요 (예: 5층 A)");
    if (code !== old && zs.some(z => z.code === code)) throw new Error("이미 있는 층이에요");
    if (!old) zs.push({ code, label: label.trim() });
    else {
      Object.assign(zs.find(z => z.code === old), { code, label: label.trim() });
      if (code !== old) { d.assign.forEach(a => (a.zones = a.zones.map(z => (z === old ? code : z)))); d.done.forEach(x => { if (x.zone === old) x.zone = code; }); d.issues.forEach(x => { if (x.zone === old) x.zone = code; }); }
    }
    this.put(d);
  },
  async zoneDelete(t, code) {
    this.adm(t); const d = this.db();
    d.zones = d.zones.filter(z => z.code !== code); d.assign.forEach(a => (a.zones = a.zones.filter(z => z !== code))); d.done = d.done.filter(x => x.zone !== code);
    d.issues.forEach(x => { if (x.zone === code) x.zone = null; }); this.put(d);
  },
  async zoneOrder(t, codes) { this.adm(t); const d = this.db(); d.zones.sort((a, b) => codes.indexOf(a.code) - codes.indexOf(b.code)); this.put(d); },
  // 현장 이슈 (이 기기 저장 공간이 작아서 사진을 많이 넣으면 저장이 안 될 수 있어요)
  async issueList(t, status) {
    this.me(t); const d = this.db(), nm = id => d.members.find(m => m.id === id)?.name || "";
    const at = x => x.done_at || x.created_at;
    let items = d.issues.filter(x => (status === "done") === !!x.done_at).sort((a, b) => at(b).localeCompare(at(a)));
    if (status === "done") items = items.slice(0, 60);
    const places = [...new Set([...d.issues].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(x => x.place).filter(Boolean))].slice(0, 12);
    return { open: d.issues.filter(x => !x.done_at).length, done: d.issues.filter(x => x.done_at).length, places,
      items: items.map(x => ({ ...x, created_name: nm(x.created_by), done_name: nm(x.done_by),
        photos: d.photos.filter(p => p.issue_id === x.id).map(p => ({ id: p.id, kind: p.kind, thumb: p.thumb, by: p.created_by })) })) };
  },
  async issueWeek(t, from) {
    this.me(t); const d = this.db(), to = addDays(from, 6), t0 = today(), nm = id => d.members.find(m => m.id === id)?.name || "";
    const cur = from <= t0 && t0 <= to;
    d.issues.forEach(x => { if (!x.day) x.day = ymd(new Date(x.created_at)); });
    const items = d.issues.filter(x => (x.day >= from && x.day <= to) || (cur && x.day < from && !x.done_at))
      .sort((a, b) => b.day.localeCompare(a.day) || b.created_at.localeCompare(a.created_at))
      .map(x => ({ ...x, carry: x.day < from, created_name: nm(x.created_by), done_name: nm(x.done_by),
        photos: d.photos.filter(p => p.issue_id === x.id).map(p => ({ id: p.id, kind: p.kind, thumb: p.thumb, by: p.created_by })),
        comments: d.comments.filter(c => c.issue_id === x.id).map(c => ({ id: c.id, body: c.body, by: c.created_by, name: nm(c.created_by), at: c.created_at })),
        hearts: d.hearts.filter(h => h.issue_id === x.id).map(h => ({ by: h.member_id, kind: h.kind || "heart", name: nm(h.member_id) })) }));
    const places = [...new Set([...d.issues].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(x => x.place).filter(Boolean))].slice(0, 12);
    return { from, to, open_all: d.issues.filter(x => !x.done_at).length, places, items };
  },
  async issuePhoto(t, id) { this.me(t); return this.db().photos.find(p => p.id === id)?.full_img || null; },
  async issueSave(t, id, zone, memo, place, day) {
    day = day && day <= today() ? day : today();
    const m = this.me(t), d = this.db(); if (id && m.role === "crew" && d.issues.find(i => i.id === id)?.created_by !== m.id) throw new Error("FORBIDDEN");
    zone = d.zones.some(z => z.code === zone) ? zone : null; memo = String(memo || "").trim().slice(0, 1000); place = String(place || "").trim().slice(0, 40);
    if (!id) { id = "i" + Date.now(); d.issues.push({ id, day, zone, place, memo, created_by: m.id, created_at: new Date().toISOString(), done_at: null, done_by: null, done_note: "" }); }
    else { const x = d.issues.find(i => i.id === id); if (!x) throw new Error("이슈를 찾지 못했어요"); Object.assign(x, { day, zone, place, memo }); }
    this.put(d); return id;
  },
  async issuePhotoAdd(t, issue, kind, ph) {
    const m = this.me(t), d = this.db(); if (kind === "before" && m.role === "crew" && d.issues.find(i => i.id === issue)?.created_by !== m.id) throw new Error("FORBIDDEN");
    if (d.photos.filter(p => p.issue_id === issue && p.kind === kind).length >= 4) throw new Error("사진은 4장까지 올릴 수 있어요");
    const id = "p" + Date.now() + Math.random().toString(36).slice(2, 6);
    d.photos.push({ id, issue_id: issue, kind, thumb: ph.thumb, full_img: ph.full, created_by: m.id });
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(d)); } catch { throw new Error("체험 모드 저장 공간이 꽉 찼어요"); }
    return id;
  },
  async issuePhotoDelete(t, id) {
    const m = this.me(t), d = this.db(), p = d.photos.find(x => x.id === id);
    if (p && m.role === "crew" && p.created_by !== m.id) throw new Error("FORBIDDEN");
    d.photos = d.photos.filter(x => x.id !== id); this.put(d);
  },
  async issueDone(t, id, flag, note) {
    const m = this.me(t), d = this.db(), x = d.issues.find(i => i.id === id); if (!x) throw new Error("이슈를 찾지 못했어요");
    if (flag) Object.assign(x, { done_at: x.done_at || new Date().toISOString(), done_by: x.done_by || m.id, done_note: String(note || "").trim().slice(0, 1000) });
    else {
      if (m.role === "crew" && x.done_by !== m.id) throw new Error("FORBIDDEN");
      Object.assign(x, { done_at: null, done_by: null, done_note: "" }); d.photos = d.photos.filter(p => !(p.issue_id === id && p.kind === "after"));
    }
    this.put(d);
  },
  async issueDelete(t, id) { const m = this.me(t), d = this.db(); if (m.role === "crew" && d.issues.find(i => i.id === id)?.created_by !== m.id) throw new Error("FORBIDDEN"); d.issues = d.issues.filter(x => x.id !== id); d.photos = d.photos.filter(p => p.issue_id !== id); d.comments = d.comments.filter(c => c.issue_id !== id); d.hearts = d.hearts.filter(h => h.issue_id !== id); this.put(d); },
  async commentAdd(t, issue, body) {
    const m = this.me(t), d = this.db(), x = d.issues.find(i => i.id === issue); body = String(body || "").trim().slice(0, 500);
    if (!body) throw new Error("댓글 내용을 적어 주세요"); if (!x) throw new Error("이슈를 찾지 못했어요"); if (!x.done_at) throw new Error("조치 완료한 이슈에만 댓글을 남길 수 있어요");
    const id = "c" + Date.now(); d.comments.push({ id, issue_id: issue, body, created_by: m.id, created_at: new Date().toISOString() }); this.put(d); return id;
  },
  async commentDelete(t, id) {
    const m = this.me(t), d = this.db(), c = d.comments.find(x => x.id === id);
    if (c && m.role === "crew" && c.created_by !== m.id) throw new Error("FORBIDDEN");
    d.comments = d.comments.filter(x => x.id !== id); this.put(d);
  },
  async react(t, issue, kind, on) {
    const m = this.me(t), d = this.db(); d.hearts = d.hearts.filter(h => !(h.issue_id === issue && h.member_id === m.id && (h.kind || "heart") === kind));
    if (on) { if (!d.issues.find(i => i.id === issue)?.done_at) throw new Error("조치 완료한 이슈에만 칭찬을 남길 수 있어요"); d.hearts.push({ issue_id: issue, member_id: m.id, kind, created_at: new Date().toISOString() }); }
    this.put(d);
  },
  async news(t) {
    const m = this.me(t), d = this.db(), nm = id => d.members.find(x => x.id === id)?.name || "";
    d.seen = d.seen || {}; if (!d.seen[m.id]) { d.seen[m.id] = new Date().toISOString(); this.put(d); }
    const since = d.seen[m.id], mine = d.issues.filter(i => i.created_by === m.id || i.done_by === m.id), at = id => mine.find(i => i.id === id);
    const pick = (x, i) => ({ issue: i.id, day: i.day, zone: i.zone, place: i.place, memo: (i.memo || "").slice(0, 40), name: nm(x.by), at: x.at });
    const items = [
      ...d.hearts.filter(h => at(h.issue_id) && h.member_id !== m.id && (h.created_at || "") > since).map(h => ({ type: "react", kind: h.kind || "heart", ...pick({ by: h.member_id, at: h.created_at }, at(h.issue_id)) })),
      ...d.comments.filter(c => at(c.issue_id) && c.created_by !== m.id && c.created_at > since).map(c => ({ type: "comment", body: c.body.slice(0, 80), ...pick({ by: c.created_by, at: c.created_at }, at(c.issue_id)) })),
    ].sort((a, b) => b.at.localeCompare(a.at));
    return { count: items.length, items: items.slice(0, 20) };
  },
  async newsSeen(t) { const m = this.me(t), d = this.db(); d.seen = d.seen || {}; d.seen[m.id] = new Date().toISOString(); this.put(d); },
};

// ── 상태 ──
const pref = load(PREF_KEY, {});
const S = {
  api: remote, mode: "remote",
  sess: load(SESSION_KEY, null),   // {token, me, mode}
  roster: null, pick: null, pin: "", pinMsg: "",
  board: null, day: today(), view: null, allMode: pref.allMode || "person",
  sheet: null, busy: false,
};
const isMgr = () => ["manager", "admin"].includes(S.board?.me.role);
const isAdmin = () => S.board?.me.role === "admin";
const ROLE = { admin: "관리자", manager: "매니저", crew: "가드너" };
const roleName = r => ROLE[r] || "가드너";
const workers = () => (S.board?.members || []).filter(m => m.role !== "admin");   // 층을 맡는 사람 (관리자는 빠짐)
const firstView = me => !ASSIGN_ON ? "issues" : me.role === "admin" ? "all" : me.role === "manager" && !assignOf(me.id)?.zones.length ? "all" : "me";
const applyPref = () => {
  const r = document.documentElement;
  if (pref.big) r.dataset.big = "1"; else delete r.dataset.big;
  if (pref.theme) r.dataset.theme = pref.theme; else delete r.dataset.theme;
};
applyPref();

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.hidden = false; t.style.animation = "none"; void t.offsetWidth; t.style.animation = "";
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2200);
}
function errMsg(e) {
  if (e?.code === "42501" || /FORBIDDEN/.test(e?.message)) return "이 일은 할 수 있는 권한이 없어요.";
  if (missingFn(e)) return "서버 업데이트가 필요해요 (v3.sql 실행).";
  if (e instanceof TypeError) return "인터넷 연결을 확인해 주세요.";
  return e?.message || "잠시 후 다시 해 주세요.";
}
const missingFn = e => e && (e.status === 404 || e.code === "PGRST202" || e.code === "42883");

// ── 데이터 계산 ──
const colorOf = id => { const i = (S.board?.members || S.roster || []).findIndex(m => m.id === id); return COLORS[(i < 0 ? 0 : i) % COLORS.length]; };
const avatar = (m, cls = "") => `<span class="av ${cls}" style="--c:${colorOf(m.id)}" aria-hidden="true">${esc(initial(m.name))}</span>`;
const zoneNote = (a, code) => a?.zone_notes?.[code] || "";
const zoneLabel = code => S.board?.zones.find(z => z.code === code)?.label || code;
const assignOf = id => S.board?.assign.find(a => a.member === id) || null;
const doneOf = code => S.board?.done.find(d => d.zone === code) || null;
const memberName = id => S.board?.members.find(m => m.id === id)?.name || "";
const zoneOrder = code => { const i = S.board?.zones.findIndex(z => z.code === code); return i < 0 ? 999 : i; };
const sortZones = zs => [...zs].sort((a, b) => zoneOrder(a) - zoneOrder(b));
const ownersOf = code => (S.board?.members || []).filter(m => assignOf(m.id)?.zones.includes(code));

// ── 시작 ──
async function boot() {
  if (S.sess) {
    S.api = S.sess.mode === "demo" ? demo : remote; S.mode = S.sess.mode || "remote";
    try { await loadBoard(); S.view = S.view || firstView(S.board.me); render(); bgIssues(); return; }
    catch (e) { if (e.code !== "28000" && !/AUTH/.test(e.message)) { renderFatal(errMsg(e)); return; } logoutLocal(); }
  }
  await showLogin();
}
async function loadBoard() { S.board = await S.api.board(S.sess.token, S.day); }
function logoutLocal() { drop(SESSION_KEY); S.sess = null; S.board = null; S.issues = null; S.sheet = null; S.view = null; S.pick = null; S.pin = ""; S.pinMsg = ""; S.day = today(); }

async function showLogin() {
  S.api = remote; S.mode = "remote";
  if (!CFG.sbUrl || !CFG.sbKey || new URLSearchParams(location.search).has("demo")) { S.api = demo; S.mode = "demo"; }
  try { S.roster = await S.api.roster(); }
  catch (e) {
    if (missingFn(e)) { S.api = demo; S.mode = "demo"; S.roster = await demo.roster(); }
    else { renderFatal(errMsg(e)); return; }
  }
  renderLogin();
}

function renderFatal(msg) {
  $root.innerHTML = `<div class="login"><div class="login__brand"><span class="mark">${I.leaf}</span><b>아지트 가드너</b></div>
    <div class="empty"><b>화면을 열지 못했어요</b><p>${esc(msg)}</p><button class="btn btn--main" data-act="reload">다시 열기</button></div></div>`;
}

// ── 로그인 ──
function renderLogin() {
  const brand = `<div class="login__brand"><span class="mark">${I.leaf}</span><b>아지트 가드너</b><span>KAKAO AGIT · LINKAGELAB</span></div>`;
  const demoNote = S.mode === "demo" ? `<p class="demo-note">지금은 <b>체험 모드</b>예요. 기록이 이 기기에만 저장돼요.<br>비밀번호: 관리자 9999 · 매니저 0427 · 가드너 1 → 1111, 가드너 2 → 2222 …</p>` : "";
  if (!S.pick) {
    $root.innerHTML = `<main class="login">${brand}<h1>누구세요?<br><small style="font-size:1.05rem;color:var(--ink-2);font-weight:700">내 이름을 눌러요</small></h1>
      <div class="who">${S.roster.map((m, i) => `<button data-act="pick" data-id="${esc(m.id)}" style="--i:${i}">${avatar(m, "av--xl")}<b>${esc(m.name)}</b><small>${roleName(m.role)}</small></button>`).join("")}</div>${demoNote}</main>`;
    return;
  }
  const m = S.roster.find(x => x.id === S.pick);
  $root.innerHTML = `<main class="login">${brand}<section class="pin" aria-label="비밀번호 입력">
    <div class="pin__who">${avatar(m, "av--xl")}<b>${esc(m.name)}</b></div>
    <p class="pin__q">비밀번호 4자리를 눌러요</p>
    <div class="dots" id="dots" aria-label="${S.pin.length}자리 입력함">${[0, 1, 2, 3].map(i => `<i class="${i < S.pin.length ? "on" : ""}"></i>`).join("")}</div>
    <p class="pin__msg" role="alert">${esc(S.pinMsg)}</p>
    <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-act="key" data-k="${n}" aria-label="${n}">${n}</button>`).join("")}
      <button class="fn" data-act="back-who">처음으로</button><button data-act="key" data-k="0" aria-label="0">0</button><button class="fn" data-act="del">지우기</button></div>
  </section></main>`;
}
async function pressKey(k) {
  if (S.busy || S.pin.length >= 4) return;
  S.pin += k; S.pinMsg = ""; renderLogin();
  if (S.pin.length < 4) return;
  S.busy = true;
  try {
    const r = await S.api.login(S.pick, S.pin);
    if (r.ok) {
      S.sess = { token: r.token, me: r.me, mode: S.mode }; save(SESSION_KEY, S.sess);
      S.pick = null; S.pin = ""; S.day = today();
      await loadBoard();
      S.view = firstView(r.me); S.issues = null;
      render(); bgIssues(); toast(`${r.me.name}님, 안녕하세요`);
    } else {
      S.pin = "";
      S.pinMsg = r.err === "locked" ? `여러 번 틀렸어요. ${Math.ceil((r.wait || 300) / 60)}분 뒤에 다시 해요.` : r.err === "pin" ? "비밀번호가 달라요. 다시 눌러요." : "이름을 다시 골라 주세요.";
      renderLogin(); const d = document.getElementById("dots"); d?.classList.add("shake");
      navigator.vibrate?.(200);
    }
  } catch (e) { S.pin = ""; S.pinMsg = errMsg(e); renderLogin(); }
  finally { S.busy = false; }
}

// ── 앱 화면 ──
// [키, 이름, 아이콘, 휴대폰 아래 탭 이름]
const MGR_VIEWS = ["assign", "admin"];
const locked = k => !ASSIGN_ON && ["me", "all", "assign"].includes(k);
const navAttr = k => locked(k) ? 'aria-disabled="true" class="is-off" title="준비 중이에요"' : S.view === k ? 'aria-current="page"' : "";
function navItems() {
  const items = [["me", "내 업무", I.me, "내 업무"], ["all", "전체 보기", I.all, "전체"], ["issues", "현장 이슈", I.issue, "현장 이슈"]];
  if (isMgr()) items.push(["assign", "업무 배정", I.assign, "배정"]);
  if (isAdmin()) items.push(["admin", "관리자 설정", I.team, "설정"]);
  return items;
}
function render() {
  if (!S.board) return;
  const me = S.board.me, nav = navItems();
  const views = { me: viewMe, all: viewAll, issues: viewIssues, assign: viewAssign, admin: viewAdmin };
  if (!nav.some(([k]) => k === S.view) || locked(S.view)) S.view = firstView(me);
  const badge = k => k !== "issues" ? "" : S.news?.count ? `<span class="badge badge--news num" title="새 소식">${I.heart}${S.news.count}</span>`
    : S.issues?.open_all ? `<span class="badge num">${S.issues.open_all}</span>` : "";
  const banner = S.mode === "demo" ? `<span class="mode-banner">체험 모드<span class="d-only"> · 이 기기에만 저장</span></span>` : "";
  $root.innerHTML = `<div class="app">
    <aside class="side" aria-label="메뉴">
      <div class="brand"><span class="mark">${I.leaf}</span><div><b>아지트 가드너</b><span>KAKAO AGIT · LINKAGELAB</span></div></div>
      <nav class="nav"><h6>메뉴</h6>${nav.filter(([k]) => !MGR_VIEWS.includes(k)).map(n => navBtn(n, badge)).join("")}${nav.some(([k]) => MGR_VIEWS.includes(k)) ? `<h6>${isAdmin() ? "관리자" : "매니저"}</h6>${nav.filter(([k]) => MGR_VIEWS.includes(k)).map(n => navBtn(n, badge)).join("")}` : ""}</nav>
      <div class="side__me">${avatar(me, "av--sm")}<div><b>${esc(me.name)}</b><small>${roleName(me.role)}</small></div><button class="btn btn--ghost" data-act="logout">나가기</button></div>
    </aside>
    <main class="main" id="main">
      <div class="topbar${S.mode === "demo" ? " is-demo" : ""}">
        <div class="m-head"><span class="mark">${I.leaf}</span><b>아지트 가드너</b></div>
        ${banner}<span class="sp"></span>
        <button class="tool" data-act="big" aria-pressed="${!!pref.big}">${I.big}<span>글자 크게</span></button>
        <button class="tool" data-act="theme" aria-label="화면 밝기 바꾸기">${I.moon}</button>
        <button class="tool m-only" data-act="logout" aria-label="나가기">${I.out}</button>
      </div>
      ${views[S.view]()}
    </main>
    <nav class="tabbar" aria-label="메뉴">${nav.map(([k, l, ic, short]) => `<button data-act="go" data-v="${k}" aria-label="${l}" ${navAttr(k)}><i class="tabbar__ic">${ic}${badge(k)}</i><span>${short}</span></button>`).join("")}</nav>
  </div>${S.sheet ? renderSheet() : ""}`;
  if (S.sheet) setTimeout(() => $root.querySelector(".sheet [autofocus]")?.focus(), 30);
}
const navBtn = ([k, l, ic], badge) => `<button data-act="go" data-v="${k}" ${navAttr(k)}>${ic}<span>${l}</span>${badge(k)}${locked(k) ? `<small class="soon">준비 중</small>` : ""}</button>`;

function dateBar() {
  if (!isMgr()) return "";
  const t = today();
  return `<div class="datebar"><div class="d">
      <button data-act="day" data-n="-1" aria-label="하루 전">${I.left}</button>
      <label>${fmtDay(S.day)}<input type="date" value="${S.day}" data-act="dayset" aria-label="날짜 고르기"></label>
      <button data-act="day" data-n="1" aria-label="하루 뒤">${I.right}</button></div>
    ${S.day !== t ? `<button class="tool" data-act="today">오늘로</button>` : ""}</div>`;
}

// 내 업무
function viewMe() {
  const me = S.board.me, a = assignOf(me.id), zs = sortZones(a?.zones || []);
  const doneN = zs.filter(z => doneOf(z)).length, isToday = S.day === today();
  const head = `<header class="head"><h1>안녕하세요, ${esc(me.name)}님</h1><p>${dayWord(S.day) === "오늘" ? "오늘은 " : ""}${fmtDay(S.day)}이에요</p></header>`;
  if (!zs.length) return `${head}${dateBar()}<div class="empty"><b>${dayWord(S.day)} 맡은 층이 없어요</b><p>매니저에게 물어봐요.</p><button class="btn" data-act="go" data-v="all">${I.all} 전체 보기</button></div>`;
  const pct = Math.round(doneN / zs.length * 100);
  const all = doneN === zs.length;
  return `${head}${dateBar()}
    <div class="progress" role="status"><b>${all ? "모두 다 했어요!" : `${zs.length}곳 중 <span class="num">${doneN}</span>곳 했어요`}</b><div class="bar" aria-hidden="true"><i style="width:${pct}%"></i></div></div>
    ${a?.note ? `<div class="memo">${I.msg}<div><h3>매니저가 남긴 말</h3><p>${esc(a.note)}</p></div></div>` : ""}
    <h2 class="sec-h"><span style="font-size:1.35rem;color:var(--ink);font-weight:800">${dayWord(S.day)} 내가 맡은 층</span></h2>
    <div class="tiles">${zs.map((z, i) => {
      const d = doneOf(z), can = isToday || isMgr();
      return `<article class="tile ${d ? "done" : ""}" style="--i:${i}">
        <div class="tile__z"><div><b>${esc(z)}</b><span>${esc(zoneLabel(z))}</span></div><span class="check" aria-hidden="true">${I.check}</span></div>
        ${zoneNote(a, z) ? `<p class="tile__note">${I.msg}<span>${esc(zoneNote(a, z))}</span></p>` : ""}
        ${d ? `<button class="btn btn--wide" data-act="done" data-z="${esc(z)}" data-f="0" ${can ? "" : "disabled"}><span class="undo"><b>다 했어요 ✓</b><small>잘못 눌렀으면 다시 누르기</small></span></button>`
            : `<button class="btn btn--main btn--wide" data-act="done" data-z="${esc(z)}" data-f="1" ${can ? "" : "disabled"}>${I.check} 다 했어요</button>`}
      </article>`;
    }).join("")}</div>`;
}

// 전체 보기
function viewAll() {
  const t = S.day === today();
  const head = `<header class="head"><h1>전체 보기</h1><p>${dayWord(S.day) === "오늘" ? "오늘 " : ""}${fmtDay(S.day)} · 누가 어느 층을 맡았는지 봐요</p></header>`;
  const seg = `<div class="seg" role="group" aria-label="보는 방법"><button data-act="allmode" data-m="person" aria-pressed="${S.allMode === "person"}">사람별</button><button data-act="allmode" data-m="zone" aria-pressed="${S.allMode === "zone"}">층별</button></div>`;
  let body;
  if (S.allMode === "person") {
    const ms = [...workers()].sort((a, b) => (b.id === S.board.me.id) - (a.id === S.board.me.id));
    body = `<div class="people">${ms.map((m, i) => {
      const a = assignOf(m.id), zs = sortZones(a?.zones || []), dn = zs.filter(z => doneOf(z)).length, mine = m.id === S.board.me.id;
      return `<article class="person ${mine ? "me" : ""}" style="--i:${i}">
        <div class="person__h">${avatar(m, "av--lg")}<div><b>${esc(m.name)}${mine ? '<span class="tag tag--me">나</span>' : ""}${m.role !== "crew" ? `<span class="tag">${roleName(m.role)}</span>` : ""}</b>
          <small>${zs.length ? `${zs.length}곳 · ${dn}곳 완료` : "맡은 층 없음"}</small></div></div>
        ${zs.length ? `<div class="chips">${zs.map(z => `<span class="chip ${doneOf(z) ? "done" : ""}" title="${esc(zoneLabel(z))}">${doneOf(z) ? I.check : ""}${esc(z)}</span>`).join("")}</div>` : `<span class="none">${t ? "오늘은 쉬어요" : "배정 없음"}</span>`}
        ${zs.filter(z => zoneNote(a, z)).map(z => `<p class="note"><b>${esc(z)}</b> ${esc(zoneNote(a, z))}</p>`).join("")}
        ${a?.note ? `<p class="note">${esc(a.note)}</p>` : ""}
      </article>`;
    }).join("")}</div>`;
  } else {
    body = `<div class="zones">${S.board.zones.map((z, i) => {
      const own = ownersOf(z.code), d = doneOf(z.code), mine = own.some(m => m.id === S.board.me.id);
      return `<article class="zone ${d ? "done" : ""} ${own.length ? "" : "free"} ${mine ? "mine" : ""}" style="--i:${i}">
        <div class="zone__t"><b>${esc(z.code)}</b><span class="check" aria-label="${d ? "완료" : "아직"}">${I.check}</span></div>
        <span>${esc(z.label)}</span>
        <div class="ppl">${own.length ? own.map(m => `<em>${avatar(m)}${esc(m.name)}</em>`).join("") : `<span class="nobody">담당 없음</span>`}</div>
      </article>`;
    }).join("")}</div>`;
  }
  return `${head}${dateBar()}${seg}${body}`;
}

// 업무 배정 (매니저)
function viewAssign() {
  const used = new Set(S.board.assign.flatMap(a => a.zones));
  const free = S.board.zones.filter(z => !used.has(z.code)).map(z => z.code);
  const dup = S.board.zones.filter(z => ownersOf(z.code).length > 1).map(z => z.code);
  return `<header class="head"><h1>업무 배정</h1><p>날짜를 고르고, 사람마다 맡을 층을 정해요. 정한 날부터 다시 바꿀 때까지 그대로 이어져요.</p></header>
    ${dateBar()}
    ${free.length ? `<div class="alert">${I.warn}<div>아직 담당이 없는 층 ${free.length}곳 · ${free.map(esc).join(", ")}</div></div>` : `<div class="alert ok">${I.ok}<div>모든 층에 담당이 있어요.</div></div>`}
    ${dup.length ? `<div class="alert">${I.warn}<div>두 사람이 같이 맡은 층 · ${dup.map(esc).join(", ")}</div></div>` : ""}
    <div class="rows">${workers().map(m => {
      const a = assignOf(m.id), zs = sortZones(a?.zones || []);
      const from = a && a.day !== S.day ? `<span class="from">${fmtShort(a.day)}에 정한 그대로예요</span>` : a ? `<span class="from">${dayWord(S.day)} 새로 정했어요</span>` : "";
      return `<article class="row">${avatar(m, "av--lg")}
        <div class="row__body"><div class="row__who"><b>${esc(m.name)}${m.role !== "crew" ? `<span class="tag">${roleName(m.role)}</span>` : ""}</b></div>
          ${zs.length ? `<div class="chips">${zs.map(z => `<span class="chip ${doneOf(z) ? "done" : ""}">${esc(z)}</span>`).join("")}</div>` : `<span class="from">맡은 층 없음</span>`}
          ${zs.filter(z => zoneNote(a, z)).map(z => `<p class="note"><b>${esc(z)}</b> ${esc(zoneNote(a, z))}</p>`).join("")}
          ${a?.note ? `<p class="note">“${esc(a.note)}”</p>` : ""}${from}</div>
        <button class="btn" data-act="edit-assign" data-id="${esc(m.id)}">층 정하기</button></article>`;
    }).join("")}</div>`;
}

// 현장 이슈: 매니저가 사진으로 남기고, 조치하면 '조치 완료' (조치 후 사진·메모는 선택)
const fmtWhen = iso => {
  const d = new Date(iso), k = ymd(d), hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${k === today() ? "오늘" : k === addDays(today(), -1) ? "어제" : fmtShort(k)} ${hm}`;
};
const thumbs = (ps, label) => ps.length ? `<div class="shots"><h4>${label} <span class="num">${ps.length}</span></h4><div class="shots__g">${ps.map(p =>
  `<button class="shot" data-act="photo" data-id="${esc(p.id)}" aria-label="${label} 사진 크게 보기"><img src="${p.thumb}" alt="" loading="lazy"></button>`).join("")}</div></div>` : "";
const issuePlace = x => x.zone && x.place ? `${zoneLabel(x.zone)} · ${x.place}` : x.place || (x.zone ? zoneLabel(x.zone) : "위치 정하지 않음");
const monday = d => { const w = (parse(d).getDay() + 6) % 7; return addDays(d, -w); };
function issueCard(x, i) {
  const me = S.board.me, before = x.photos.filter(p => p.kind === "before"), after = x.photos.filter(p => p.kind === "after");
  const canUndo = isMgr() || x.done_by === me.id, canEdit = isMgr() || x.created_by === me.id;
  return `<article class="issue ${x.done_at ? "is-done" : ""}${S.flash === x.id ? " is-flash" : ""}" id="is-${esc(x.id)}" style="--i:${i}">
      <div class="issue__h">${x.zone ? `<span class="zcode">${esc(x.zone)}</span>` : `<span class="zcode zcode--none">${I.pin}</span>`}
        <div><b>${esc(issuePlace(x))}</b><small>${esc(x.created_name || "알 수 없음")} · ${x.carry ? fmtShort(x.day) + "부터" : fmtShort(x.day)}</small></div>
        ${x.done_at ? `<span class="state state--done">${I.check} 조치 완료</span>` : `<span class="state">진행 중</span>`}</div>
      ${x.memo ? `<p class="issue__memo">${esc(x.memo)}</p>` : ""}
      ${thumbs(before, x.done_at ? "조치 전" : "현장 사진")}
      ${x.done_at ? `<div class="issue__done"><p class="issue__by">${I.ok}<span><b>${esc(x.done_name || "알 수 없음")}</b> · ${fmtWhen(x.done_at)} 조치</span></p>${x.done_note ? `<p class="issue__memo">${esc(x.done_note)}</p>` : ""}${thumbs(after, "조치 후")}${before.length && after.length ? `<button class="btn btn--sm cmp-btn" data-act="compare" data-id="${esc(x.id)}">${I.cmp} 조치 전·후 비교</button>` : ""}</div>` : ""}
      ${x.done_at && x.comments ? issueTalk(x) : ""}
      <div class="issue__acts">
        ${x.done_at ? (canUndo ? `<button class="btn btn--sm" data-act="issue-done" data-id="${esc(x.id)}">조치 내용 수정</button><button class="btn btn--sm" data-act="issue-undo" data-id="${esc(x.id)}">진행 중으로</button>` : "")
                    : `<button class="btn btn--main" data-act="issue-done" data-id="${esc(x.id)}">${I.check} 조치 완료</button>`}
        ${canEdit ? `<button class="btn btn--sm" data-act="edit-issue" data-id="${esc(x.id)}">${x.done_at ? "이슈 수정" : "수정"}</button><button class="btn btn--sm btn--danger" data-act="ask-del" data-k="issue" data-id="${esc(x.id)}">삭제</button>` : ""}
      </div></article>`;
}
// 조치 완료한 이슈 아래: 하트 + 댓글
const CHEERS = [["heart", "", "하트"], ["thanks", "🌱", "고마워요"], ["best", "👏", "최고예요"], ["clean", "✨", "깔끔해요"]];
const cheerName = k => CHEERS.find(c => c[0] === k)?.[2] || "하트";
function issueTalk(x) {
  const me = S.board.me, hearts = (x.hearts || []).map(h => ({ ...h, kind: h.kind || "heart" }));
  const names = [...new Set(hearts.map(h => h.name || "알 수 없음"))];
  const who = names.length ? `${names.join(", ")}님이 칭찬했어요` : "수고했어요, 칭찬을 남겨 주세요";
  const chips = CHEERS.map(([k, emo, label]) => {
    const list = hearts.filter(h => h.kind === k), on = list.some(h => h.by === me.id);
    return `<button class="cheer cheer--${k}" data-act="react" data-id="${esc(x.id)}" data-k="${k}" aria-pressed="${on}" aria-label="${label} ${on ? "빼기" : "누르기"}">${k === "heart" ? I.heart : `<span class="cheer__e" aria-hidden="true">${emo}</span>${label}`}${list.length || k === "heart" ? `<span class="num">${list.length}</span>` : ""}</button>`;
  }).join("");
  const list = x.comments.map(c => `<li class="cmt"><div class="cmt__h"><b>${esc(c.name || "알 수 없음")}</b><small>${fmtWhen(c.at)}</small>
      ${isMgr() || c.by === me.id ? `<button class="cmt__x" data-act="cmt-del" data-id="${esc(c.id)}" aria-label="댓글 지우기">${I.x}</button>` : ""}</div><p>${esc(c.body)}</p></li>`).join("");
  return `<div class="talk">
      <div class="cheers">${chips}</div><small class="cheers__who">${esc(who)}</small>
      ${list ? `<ul class="cmts">${list}</ul>` : ""}
      <form class="cmt-in" data-issue="${esc(x.id)}"><input type="text" maxlength="500" placeholder="댓글 남기기" aria-label="댓글" enterkeyhint="send"><button class="btn btn--sm" aria-label="댓글 올리기">${I.send}</button></form>
    </div>`;
}
// 현장 이슈 · 주간 보기 (월~일). 이번 주에는 지난주부터 남은 진행 중 이슈도 같이 보여요.
function viewIssues() {
  const wk = S.issueWeek || monday(today()), cur = wk === monday(today()), tab = S.issueTab || "all", d = S.issues;
  const head = `<header class="head"><h1>현장 이슈</h1><p>현장 사진으로 이슈를 남기고, 조치했으면 '조치 완료'를 눌러요.</p></header>`;
  const bar = `<div class="datebar"><div class="d">
      <button data-act="iweek" data-n="-7" aria-label="지난주">${I.left}</button>
      <label>${fmtShort(wk)} – ${fmtShort(addDays(wk, 6))}${cur ? " · 이번 주" : ""}<input type="date" value="${wk}" max="${today()}" data-act="iweekset" aria-label="주 고르기"></label>
      <button data-act="iweek" data-n="7" aria-label="다음 주" ${cur ? "disabled" : ""}>${I.right}</button></div>
    ${cur ? "" : `<button class="tool" data-act="iweek-now">이번 주로</button>`}</div>`;
  const add = `<button class="btn btn--main add-btn" data-act="new-issue">${I.cam} 이슈 올리기</button>`;
  if (d?.missing) return `${head}<div class="empty"><b>서버 업데이트가 필요해요</b><p>Supabase 에서 v4.sql 을 실행하면 열려요.</p></div>`;
  if (!d || d.week !== wk) return `${head}${bar}${add}<div class="empty"><p>불러오는 중…</p></div>`;
  const inWeek = d.items.filter(x => !x.carry), carry = d.items.filter(x => x.carry);
  const nOpen = inWeek.filter(x => !x.done_at).length, nDone = inWeek.length - nOpen;
  const sum = `<div class="wsum"><div><b class="num">${inWeek.length}</b><span>올라온 이슈</span></div><div><b class="num">${nOpen}</b><span>진행 중</span></div><div><b class="num">${nDone}</b><span>조치 완료</span></div></div>`;
  const seg = `<div class="seg" role="group" aria-label="보기"><button data-act="issuetab" data-t="all" aria-pressed="${tab === "all"}">전체</button><button data-act="issuetab" data-t="open" aria-pressed="${tab === "open"}">진행 중</button><button data-act="issuetab" data-t="done" aria-pressed="${tab === "done"}">조치 완료</button></div>`;
  const keep = x => tab === "all" || (tab === "open" ? !x.done_at : !!x.done_at);
  const cards = inWeek.filter(keep), carried = carry.filter(keep);
  let i = 0, body = "";
  if (carried.length) body += `<section class="dayg"><h2 class="dayh">지난주부터 진행 중 <span class="num">${carried.length}</span></h2><div class="issues">${carried.map(x => issueCard(x, i++)).join("")}</div></section>`;
  const days = [...new Set(cards.map(x => x.day))].sort().reverse();
  body += days.map(day => {
    const list = cards.filter(x => x.day === day);
    return `<section class="dayg"><h2 class="dayh">${dayWord(day) === "오늘" || dayWord(day) === "어제" ? dayWord(day) + " · " : ""}${fmtDay(day)} <span class="num">${list.length}</span></h2><div class="issues">${list.map(x => issueCard(x, i++)).join("")}</div></section>`;
  }).join("");
  if (!body) body = `<div class="empty"><b>${tab === "open" ? "진행 중인 이슈가 없어요" : tab === "done" ? "조치 완료한 이슈가 없어요" : cur ? "이번 주 이슈가 아직 없어요" : "이 주에는 이슈가 없었어요"}</b><p>${cur ? "현장에서 사진을 찍어 올려 보세요." : "주를 바꿔서 볼 수 있어요."}</p></div>`;
  return `${head}${newsCard()}${bar}${sum}${add}${seg}${body}`;
}
// 새 소식: 내가 올리거나 조치한 이슈에 다른 사람이 남긴 칭찬·댓글
function newsCard() {
  const n = S.news; if (!n?.count) return "";
  const line = y => y.type === "comment" ? `<b>${esc(y.name || "알 수 없음")}</b>님 댓글 “${esc(y.body)}”`
    : `<b>${esc(y.name || "알 수 없음")}</b>님이 ${y.kind === "heart" ? "하트를 눌렀어요" : `‘${cheerName(y.kind)}’를 남겼어요`}`;
  const emo = y => y.type === "comment" ? I.msg : y.kind === "heart" ? I.heart : `<span aria-hidden="true">${CHEERS.find(c => c[0] === y.kind)?.[1] || ""}</span>`;
  return `<section class="news" aria-label="새 소식"><div class="news__h"><h2>새 소식 <span class="num">${n.count}</span></h2><button class="btn btn--sm" data-act="news-seen">확인했어요</button></div>
    <ul>${n.items.slice(0, 5).map(y => `<li><button data-act="news-go" data-id="${esc(y.issue)}" data-day="${esc(y.day)}"><i class="news__ic ${y.type === "comment" ? "" : "is-" + esc(y.kind)}">${emo(y)}</i>
      <span><span class="news__t">${line(y)}</span><small>${esc(issuePlace(y))} · ${fmtWhen(y.at)}</small></span></button></li>`).join("")}</ul></section>`;
}
async function loadIssues() {
  if (!S.sess) return;
  const wk = S.issueWeek || monday(today());
  const news = S.api.news(S.sess.token).then(n => { S.news = n; }, () => { S.news = null; });
  try { S.issues = { ...(await S.api.issueWeek(S.sess.token, wk)), week: wk }; }
  catch (e) {
    if (e.code === "28000" || /AUTH/.test(e.message)) throw e;
    if (missingFn(e)) S.issues = { open_all: 0, items: [], week: wk, missing: true };
  }
  await news;
}
// 사진 줄이기: 큰 사진(긴 변 1280px)과 목록용 작은 사진(320px) — DB 용량 아끼려고 1600→1280
async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("사진을 읽지 못했어요")); i.src = url; });
    const draw = (max, q) => {
      const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", q);
    };
    return S.mode === "demo" ? { full: draw(900, .6), thumb: draw(240, .6) } : { full: draw(1280, .72), thumb: draw(320, .65) };
  } finally { URL.revokeObjectURL(url); }
}
const photoPicker = (s, label) => {
  const have = (s.photos || []).filter(p => !s.del?.includes(p.id)), n = have.length + s.add.length;
  return `<div class="field"><span>${label} <small>(4장까지${s.type === "done" ? " · 선택" : ""})</small></span>
    <div class="shots__g">${have.map(p => `<div class="shot"><img src="${p.thumb}" alt=""><button class="shot__x" data-act="photo-rm" data-id="${esc(p.id)}" aria-label="사진 빼기">${I.x}</button></div>`).join("")}
      ${s.add.map((p, i) => `<div class="shot"><img src="${p.thumb}" alt=""><button class="shot__x" data-act="photo-rm" data-i="${i}" aria-label="사진 빼기">${I.x}</button></div>`).join("")}
      ${n < 4 ? `<label class="shot shot--add">${I.cam}<span>${s.busyPhoto ? "줄이는 중…" : "사진 추가"}</span><input type="file" accept="image/*" multiple data-act="photo-in" hidden></label>` : ""}</div></div>`;
};

// 관리자 설정 (관리자): 크루 목록 · 층 목록
function viewAdmin() {
  const tab = S.adminTab || "crew";
  const seg = `<div class="seg" role="group" aria-label="설정 종류"><button data-act="admintab" data-t="crew" aria-pressed="${tab === "crew"}">크루 목록 <span class="num">${S.board.members.length}</span></button><button data-act="admintab" data-t="zone" aria-pressed="${tab === "zone"}">층 목록 <span class="num">${S.board.zones.length}</span></button></div>`;
  const arrows = (kind, id, i, n) => `<button class="btn btn--sm btn--ghost" data-act="move" data-k="${kind}" data-id="${esc(id)}" data-n="-1" aria-label="위로" ${i === 0 ? "disabled" : ""}>${I.up}</button><button class="btn btn--sm btn--ghost" data-act="move" data-k="${kind}" data-id="${esc(id)}" data-n="1" aria-label="아래로" ${i === n - 1 ? "disabled" : ""}>${I.down}</button>`;
  if (tab === "zone") {
    return `<header class="head"><h1>관리자 설정</h1><p>층 이름과 설명, 순서를 정해요. 바꾸면 모든 크루 화면에 바로 반영돼요.</p></header>${seg}
    <div class="rows">${S.board.zones.map((z, i, a) => {
      const own = ownersOf(z.code);
      return `<article class="row row--admin"><span class="zcode">${esc(z.code)}</span>
      <div class="row__body"><div class="row__who"><b>${esc(z.label)}</b><small>${own.length ? "담당 · " + esc(own.map(o => o.name).join(", ")) : "담당 없음"}</small></div></div>
      <div class="row__acts">${arrows("zone", z.code, i, a.length)}<button class="btn btn--sm" data-act="edit-zone" data-id="${esc(z.code)}">수정</button><button class="btn btn--sm btn--danger" data-act="ask-del" data-k="zone" data-id="${esc(z.code)}">삭제</button></div></article>`;
    }).join("")}</div>
    <button class="btn btn--ink add-btn" data-act="edit-zone" data-id="">${I.plus} 층 추가</button>`;
  }
  return `<header class="head"><h1>관리자 설정</h1><p>크루 이름·역할과 비밀번호를 정해요. 바꾸면 로그인 화면과 모든 크루 화면에 바로 반영돼요.</p></header>${seg}
    <div class="rows">${S.board.members.map((m, i, a) => {
      const zs = sortZones(assignOf(m.id)?.zones || []), mine = m.id === S.board.me.id;
      return `<article class="row row--admin">${avatar(m, "av--lg")}
      <div class="row__body"><div class="row__who"><b>${esc(m.name)}${mine ? '<span class="tag tag--me">나</span>' : ""}</b><small>${roleName(m.role)}${m.role === "admin" ? "" : ` · ${zs.length ? esc(zs.join(", ")) : "맡은 층 없음"}`}</small></div></div>
      <div class="row__acts">${arrows("member", m.id, i, a.length)}<button class="btn btn--sm" data-act="edit-pin" data-id="${esc(m.id)}">${I.key} 비밀번호</button><button class="btn btn--sm" data-act="edit-member" data-id="${esc(m.id)}">수정</button>${mine ? "" : `<button class="btn btn--sm btn--danger" data-act="ask-del" data-k="member" data-id="${esc(m.id)}">삭제</button>`}</div></article>`;
    }).join("")}</div>
    <button class="btn btn--ink add-btn" data-act="edit-member" data-id="">${I.plus} 크루 추가</button>
    <p class="hint">크루가 비밀번호를 잊거나 5번 틀려 잠기면 '비밀번호'에서 새로 정해 주세요. 새로 정하면 잠금도 바로 풀려요. 내 계정은 삭제할 수 없어요.</p>`;
}

// ── 시트 ──
function zoneNoteFields(s) {
  if (!s.zones.length) return `<p class="hint">위에서 층을 누르면, 그 층에 전달할 내용을 적는 칸이 생겨요.</p>`;
  return `<h3 class="znotes__h">층별 전달 내용 <small>(선택 · 가드너 층 타일에 크게 보여요)</small></h3>` + sortZones(s.zones).map(z =>
    `<div class="znote"><label for="zn-${esc(z)}"><b>${esc(z)}</b><span>${esc(zoneLabel(z))}</span></label><textarea id="zn-${esc(z)}" data-zn="${esc(z)}" rows="2" maxlength="500" placeholder="예) 창가 화분은 물을 조금만 주세요.">${esc(s.zoneNotes[z] || "")}</textarea></div>`).join("");
}
function renderSheet() {
  const s = S.sheet;
  if (s.type === "assign") {
    const m = S.board.members.find(x => x.id === s.id);
    return `<div class="scrim" data-act="close"></div><section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(m.name)} 담당 층">
      <div class="sheet__h">${avatar(m, "av--lg")}<div><h2>${esc(m.name)}님 담당 층</h2><p>${fmtDay(S.day)}부터 · ${s.zones.length}곳 골랐어요</p></div><button class="x" data-act="close" aria-label="닫기">${I.x}</button></div>
      <div class="sheet__b">
        <div class="pick">${S.board.zones.map(z => {
          const on = s.zones.includes(z.code), others = ownersOf(z.code).filter(o => o.id !== m.id);
          return `<button data-act="toggle-zone" data-z="${esc(z.code)}" aria-pressed="${on}"><b>${esc(z.code)}</b><small>${others.length ? esc(others.map(o => o.name).join(", ")) : esc(z.label)}</small></button>`;
        }).join("")}</div>
        <div class="znotes" id="znotes">${zoneNoteFields(s)}</div>
        <div class="field"><label for="note">전체에게 남길 말 <small>(선택 · 가드너 화면 맨 위에 보여요)</small></label><textarea id="note" maxlength="500" placeholder="예) 오늘은 물 주는 날이에요.">${esc(s.note)}</textarea></div>
      </div>
      <div class="sheet__f"><button class="btn btn--ghost" data-act="clear-zones">모두 빼기</button><button class="btn btn--main" data-act="save-assign">저장하기</button></div></section>`;
  }
  if (s.type === "member") {
    const isNew = !s.id;
    return `<div class="scrim" data-act="close"></div><section class="sheet" role="dialog" aria-modal="true" aria-label="${isNew ? "크루 추가" : "크루 고치기"}">
      <div class="sheet__h"><div><h2>${isNew ? "크루 추가" : `${esc(s.name)} 고치기`}</h2><p>${isNew ? "이름과 비밀번호 4자리를 정해요" : "비밀번호는 목록의 '비밀번호' 버튼에서 바꿔요"}</p></div><button class="x" data-act="close" aria-label="닫기">${I.x}</button></div>
      <div class="sheet__b">
        <div class="field"><label for="m-name">이름</label><input id="m-name" value="${esc(s.name)}" maxlength="20" autocomplete="off" ${isNew ? "autofocus" : ""}></div>
        <div class="field"><span>역할</span><div class="seg" role="group">${["crew", "manager", "admin"].map(r => `<button data-act="role" data-r="${r}" aria-pressed="${s.role === r}">${roleName(r)}</button>`).join("")}</div>
          <small>${{ crew: "가드너는 내 업무·전체 보기를 보고, 현장 이슈를 올려요.", manager: "매니저는 업무 배정과 모든 현장 이슈 고치기·지우기를 해요.", admin: "관리자는 매니저 일에 더해 크루·비밀번호·층 목록을 관리해요." }[s.role]}</small></div>
        ${isNew ? `<div class="field"><label for="m-pin">비밀번호 (숫자 4자리)</label><input id="m-pin" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="0000"></div>` : ""}
      </div>
      <div class="sheet__f"><button class="btn btn--ghost" data-act="close">취소</button><button class="btn btn--main" data-act="save-member">저장하기</button></div></section>`;
  }
  if (s.type === "zone") {
    const isNew = !s.old;
    return `<div class="scrim" data-act="close"></div><section class="sheet" role="dialog" aria-modal="true" aria-label="${isNew ? "층 추가" : "층 수정"}">
      <div class="sheet__h"><div><h2>${isNew ? "층 추가" : `${esc(s.old)} 수정`}</h2><p>크루 화면에 크게 보이는 이름이에요</p></div><button class="x" data-act="close" aria-label="닫기">${I.x}</button></div>
      <div class="sheet__b">
        <div class="field"><label for="z-code">층 이름 (영어·숫자, 예: 5A · B1)</label><input id="z-code" value="${esc(s.code)}" maxlength="6" autocomplete="off" autocapitalize="characters" ${isNew ? "autofocus" : ""}></div>
        <div class="field"><label for="z-label">설명 (예: 5층 A · 2층 아지뜰)</label><input id="z-label" value="${esc(s.label)}" maxlength="30" autocomplete="off"></div>
        ${isNew ? "" : '<p class="hint">층 이름을 바꾸면 배정과 완료 기록도 새 이름으로 같이 바뀌어요.</p>'}
      </div>
      <div class="sheet__f"><button class="btn btn--ghost" data-act="close">취소</button><button class="btn btn--main" data-act="save-zone">저장하기</button></div></section>`;
  }
  if (s.type === "pin") {
    const m = S.board.members.find(x => x.id === s.id);
    return `<div class="scrim" data-act="close"></div><section class="sheet sheet--sm" role="dialog" aria-modal="true" aria-label="${esc(m.name)} 비밀번호">
      <div class="sheet__h">${avatar(m, "av--lg")}<div><h2>${esc(m.name)}님 비밀번호</h2><p>숫자 4자리로 새로 정해요</p></div><button class="x" data-act="close" aria-label="닫기">${I.x}</button></div>
      <div class="sheet__b">
        <div class="field"><label for="p-new">새 비밀번호</label><input id="p-new" class="pin-in" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="new-password" placeholder="••••" autofocus></div>
        <div class="field"><label for="p-again">한 번 더</label><input id="p-again" class="pin-in" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="new-password" placeholder="••••"></div>
        <p class="hint">저장하면 잠금이 풀리고, ${esc(m.name)}님이 다른 기기에서 로그인해 둔 것은 끊겨요. 새 비밀번호는 직접 알려 주세요.</p>
      </div>
      <div class="sheet__f"><button class="btn btn--ghost" data-act="close">취소</button><button class="btn btn--main" data-act="save-pin">저장하기</button></div></section>`;
  }
  if (s.type === "issue") {
    const isNew = !s.id;
    return `<div class="scrim" data-act="close"></div><section class="sheet" role="dialog" aria-modal="true" aria-label="${isNew ? "이슈 올리기" : "이슈 수정"}">
      <div class="sheet__h"><div><h2>${isNew ? "현장 이슈 올리기" : "이슈 수정"}</h2><p>사진과 내용 중 하나는 꼭 있어야 해요</p></div><button class="x" data-act="close" aria-label="닫기">${I.x}</button></div>
      <div class="sheet__b">
        <div class="field"><label for="i-day">날짜</label><input id="i-day" type="date" value="${esc(s.day)}" max="${today()}"></div>
        ${photoPicker(s, "현장 사진")}
        <div class="field"><label for="i-memo">어떤 이슈인가요?</label><textarea id="i-memo" maxlength="1000" placeholder="예) 5A 창가 몬스테라 잎이 노랗게 변했어요. 물 주기 확인 필요.">${esc(s.memo)}</textarea></div>
        <div class="field"><label for="i-place">어디인가요? <small>(선택 · 직접 적어도 돼요)</small></label>
          <input id="i-place" value="${esc(s.place)}" maxlength="40" autocomplete="off" placeholder="예) 3층 회의실 앞, 1층 로비 입구">
          ${(S.issues?.places || []).length ? `<div class="places"><small>최근 위치</small>${S.issues.places.map(pl => `<button class="place" data-act="issue-place" data-p="${esc(pl)}" aria-pressed="${s.place === pl}">${I.pin}${esc(pl)}</button>`).join("")}</div>` : ""}</div>
        <div class="field"><span>층 <small>(선택)</small></span><div class="pick">${S.board.zones.map(z => `<button data-act="issue-zone" data-z="${esc(z.code)}" aria-pressed="${s.zone === z.code}"><b>${esc(z.code)}</b><small>${esc(z.label)}</small></button>`).join("")}</div></div>
      </div>
      <div class="sheet__f"><button class="btn btn--ghost" data-act="close">취소</button><button class="btn btn--main" data-act="save-issue" ${s.busyPhoto ? "disabled" : ""}>${isNew ? "올리기" : "저장하기"}</button></div></section>`;
  }
  if (s.type === "done") {
    const x = S.issues?.items.find(i => i.id === s.id), edit = !!x?.done_at;
    return `<div class="scrim" data-act="close"></div><section class="sheet" role="dialog" aria-modal="true" aria-label="${edit ? "조치 내용 수정" : "조치 완료"}">
      <div class="sheet__h">${x?.zone ? `<span class="zcode">${esc(x.zone)}</span>` : ""}<div><h2>${edit ? "조치 내용 수정" : "조치 완료"}</h2><p>${esc(x?.memo ? x.memo.slice(0, 40) + (x.memo.length > 40 ? "…" : "") : "현장 이슈")}</p></div><button class="x" data-act="close" aria-label="닫기">${I.x}</button></div>
      <div class="sheet__b">
        ${photoPicker(s, "조치 후 사진")}
        <div class="field"><label for="d-note">어떻게 조치했나요? <small>(선택)</small></label><textarea id="d-note" maxlength="1000" placeholder="예) 잎 정리하고 물 양 줄였어요.">${esc(s.note)}</textarea></div>
      </div>
      <div class="sheet__f"><button class="btn btn--ghost" data-act="close">취소</button><button class="btn btn--main" data-act="save-done" ${s.busyPhoto ? "disabled" : ""}>${edit ? "저장하기" : `${I.check} 조치 완료`}</button></div></section>`;
  }
  if (s.type === "photo") {
    return `<div class="scrim scrim--dark" data-act="close"></div><section class="viewer" role="dialog" aria-modal="true" aria-label="사진 크게 보기">
      <button class="x" data-act="close" aria-label="닫기" autofocus>${I.x}</button>
      ${s.src ? `<img src="${s.src}" alt="현장 사진">` : `<p>${s.err ? esc(s.err) : "불러오는 중…"}</p>`}</section>`;
  }
  if (s.type === "compare") {
    return `<div class="scrim scrim--dark" data-act="close"></div><section class="viewer cmp" role="dialog" aria-modal="true" aria-label="조치 전후 비교">
      <button class="x" data-act="close" aria-label="닫기" autofocus>${I.x}</button>
      <div class="cmp__box" style="--x:${s.x}%" role="slider" tabindex="0" aria-label="조치 전후 비교 위치" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(s.x)}">
        <img class="cmp__b" src="${s.bsrc}" alt="조치 전" draggable="false"><img class="cmp__a" src="${s.asrc}" alt="조치 후" draggable="false">
        <span class="cmp__line"><i>${I.left}${I.right}</i></span><span class="cmp__tag">조치 전</span><span class="cmp__tag cmp__tag--a">조치 후</span></div>
      <p class="cmp__hint">가운데 선을 좌우로 밀어 보세요</p></section>`;
  }
  if (s.type === "confirm") {
    const isZone = s.kind === "zone", isIssue = s.kind === "issue", m = isZone || isIssue ? null : S.board.members.find(x => x.id === s.id);
    const title = isIssue ? "이 이슈를 삭제할까요?" : isZone ? `${esc(s.id)} 층을 삭제할까요?` : `${esc(m?.name)}님을 삭제할까요?`;
    const desc = isIssue ? "사진과 조치 기록이 모두 지워져요. 되돌릴 수 없어요." : isZone ? "배정에서도 빠지고, 이 층의 완료 기록도 지워져요." : "로그인 목록과 배정에서 사라져요. 되돌릴 수 없어요.";
    return `<div class="scrim" data-act="close"></div><section class="sheet sheet--sm" role="alertdialog" aria-modal="true" aria-label="삭제 확인">
      <div class="sheet__b confirm">${isIssue ? `<span class="zcode">${I.issue}</span>` : isZone ? `<span class="zcode">${esc(s.id)}</span>` : avatar(m, "av--xl")}<h2>${title}</h2><p>${desc}</p></div>
      <div class="sheet__f"><button class="btn btn--ghost" data-act="close" autofocus>취소</button><button class="btn btn--danger-fill" data-act="do-del">삭제하기</button></div></section>`;
  }
  return "";
}
function syncSheetFields() {
  if (!S.sheet) return;
  const n = document.getElementById("note"); if (n) S.sheet.note = n.value;
  const nm = document.getElementById("m-name"); if (nm) S.sheet.name = nm.value;
  const p = document.getElementById("m-pin"); if (p) S.sheet.pin = p.value;
  const zc = document.getElementById("z-code"); if (zc) S.sheet.code = zc.value;
  const zl = document.getElementById("z-label"); if (zl) S.sheet.label = zl.value;
  const im = document.getElementById("i-memo"); if (im) S.sheet.memo = im.value;
  const ip = document.getElementById("i-place"); if (ip) S.sheet.place = ip.value;
  const idy = document.getElementById("i-day"); if (idy) S.sheet.day = idy.value || today();
  const dn = document.getElementById("d-note"); if (dn) S.sheet.note = dn.value;
  document.querySelectorAll("[data-zn]").forEach(t => { if (S.sheet.zoneNotes) S.sheet.zoneNotes[t.dataset.zn] = t.value; });
}

// ── 동작 ──
async function act(a, el) {
  try {
    switch (a) {
      case "reload": location.reload(); break;
      case "pick": S.pick = el.dataset.id; S.pin = ""; S.pinMsg = ""; renderLogin(); break;
      case "back-who": S.pick = null; S.pin = ""; S.pinMsg = ""; renderLogin(); break;
      case "key": pressKey(el.dataset.k); break;
      case "del": S.pin = S.pin.slice(0, -1); S.pinMsg = ""; renderLogin(); break;
      case "logout":
        if (!confirm("로그아웃 할까요?")) return;
        S.api.logout(S.sess.token); logoutLocal(); await showLogin(); break;
      case "go": if (locked(el.dataset.v)) { toast("배정은 준비 중이에요"); break; } S.view = el.dataset.v; render(); window.scrollTo({ top: 0 }); if (S.view === "issues") { await loadIssues(); if (!S.sheet) render(); } break;
      case "big": pref.big = !pref.big; save(PREF_KEY, pref); applyPref(); render(); break;
      case "theme": {
        const dark = pref.theme ? pref.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
        pref.theme = dark ? "light" : "dark"; save(PREF_KEY, pref); applyPref();
        document.querySelector('meta[name="theme-color"]').content = pref.theme === "dark" ? "#0a0a0b" : "#f4f5f1"; break;
      }
      case "allmode": S.allMode = el.dataset.m; pref.allMode = S.allMode; save(PREF_KEY, pref); render(); break;
      case "day": S.day = addDays(S.day, +el.dataset.n); await refresh(); break;
      case "today": S.day = today(); await refresh(); break;
      case "done": {
        const f = el.dataset.f === "1"; el.disabled = true;
        await S.api.done(S.sess.token, S.day, el.dataset.z, f); await refresh();
        if (f) { navigator.vibrate?.(40); const a2 = assignOf(S.board.me.id); toast(a2 && a2.zones.every(z => doneOf(z)) ? "모두 다 했어요! 수고했어요" : `${el.dataset.z} 다 했어요`); }
        break;
      }
      case "edit-assign": { const a2 = assignOf(el.dataset.id); S.sheet = { type: "assign", id: el.dataset.id, zones: [...(a2?.zones || [])], note: a2?.note || "", zoneNotes: { ...(a2?.zone_notes || {}) } }; render(); break; }
      case "toggle-zone": {
        syncSheetFields(); const z = el.dataset.z, zs = S.sheet.zones;
        S.sheet.zones = zs.includes(z) ? zs.filter(x => x !== z) : sortZones([...zs, z]);
        el.setAttribute("aria-pressed", S.sheet.zones.includes(z));
        const p = document.querySelector(".sheet__h p"); if (p) p.textContent = `${fmtDay(S.day)}부터 · ${S.sheet.zones.length}곳 골랐어요`;
        const box = document.getElementById("znotes"); if (box) box.innerHTML = zoneNoteFields(S.sheet);
        if (S.sheet.zones.includes(z)) { const t = document.getElementById(`zn-${z}`); t?.scrollIntoView({ block: "nearest", behavior: "smooth" }); t?.focus({ preventScroll: true }); }
        break;
      }
      case "clear-zones": syncSheetFields(); S.sheet.zones = []; render(); break;
      case "save-assign": {
        syncSheetFields(); el.disabled = true;
        const zn = Object.fromEntries(S.sheet.zones.map(z => [z, (S.sheet.zoneNotes[z] || "").trim()]).filter(([, v]) => v));
        await S.api.assign(S.sess.token, S.day, S.sheet.id, sortZones(S.sheet.zones), S.sheet.note.trim(), zn);
        S.sheet = null; await refresh(); toast("저장했어요"); break;
      }
      case "edit-member": {
        const m = S.board.members.find(x => x.id === el.dataset.id);
        S.sheet = m ? { type: "member", id: m.id, name: m.name, role: m.role, sort: m.sort, pin: "" } : { type: "member", id: "", name: "", role: "crew", sort: S.board.members.length, pin: "" };
        render(); break;
      }
      case "role": syncSheetFields(); S.sheet.role = el.dataset.r; render(); break;
      case "save-member": {
        syncSheetFields(); const s = S.sheet;
        if (!s.name.trim()) { toast("이름을 적어 주세요"); return; }
        if (s.pin && !/^\d{4}$/.test(s.pin)) { toast("비밀번호는 숫자 4자리예요"); return; }
        if (!s.id && !s.pin) { toast("비밀번호 4자리를 정해 주세요"); return; }
        el.disabled = true;
        await S.api.memberSave(S.sess.token, { id: s.id || null, name: s.name, role: s.role, pin: s.pin || null, sort: s.sort, active: true });
        S.sheet = null; await refresh(); toast(s.id ? "수정했어요" : "추가했어요"); break;
      }
      case "admintab": S.adminTab = el.dataset.t; render(); break;
      case "edit-zone": {
        const z = S.board.zones.find(x => x.code === el.dataset.id);
        S.sheet = { type: "zone", old: z?.code || "", code: z?.code || "", label: z?.label || "" }; render(); break;
      }
      case "save-zone": {
        syncSheetFields(); const s = S.sheet; el.disabled = true;
        await S.api.zoneSave(S.sess.token, s.old || null, s.code.trim().toUpperCase(), s.label.trim());
        S.sheet = null; await refresh(); toast(s.old ? "수정했어요" : "추가했어요"); break;
      }
      case "ask-del": S.sheet = { type: "confirm", kind: el.dataset.k, id: el.dataset.id }; render(); break;
      case "do-del": {
        const s = S.sheet; el.disabled = true;
        if (s.kind === "zone") await S.api.zoneDelete(S.sess.token, s.id);
        else if (s.kind === "issue") await S.api.issueDelete(S.sess.token, s.id);
        else await S.api.memberDelete(S.sess.token, s.id);
        S.sheet = null; await refresh(); toast("삭제했어요"); break;
      }
      case "edit-pin": S.sheet = { type: "pin", id: el.dataset.id }; render(); break;
      case "save-pin": {
        const a1 = document.getElementById("p-new").value, a2 = document.getElementById("p-again").value;
        if (!/^\d{4}$/.test(a1)) { toast("비밀번호는 숫자 4자리예요"); return; }
        if (a1 !== a2) { toast("두 번 적은 비밀번호가 달라요"); return; }
        el.disabled = true; await S.api.memberPin(S.sess.token, S.sheet.id, a1);
        S.sheet = null; render(); toast("비밀번호를 바꿨어요"); break;
      }
      case "issuetab": S.issueTab = el.dataset.t; render(); break;
      case "iweek": S.issueWeek = addDays(S.issueWeek || monday(today()), +el.dataset.n); if (S.issueWeek > monday(today())) S.issueWeek = monday(today()); render(); await loadIssues(); if (!S.sheet) render(); break;
      case "iweek-now": S.issueWeek = monday(today()); render(); await loadIssues(); if (!S.sheet) render(); break;
      case "new-issue": S.sheet = { type: "issue", id: "", day: today(), zone: "", place: "", memo: "", photos: [], add: [], del: [] }; render(); break;
      case "edit-issue": {
        const x = S.issues.items.find(i => i.id === el.dataset.id);
        S.sheet = { type: "issue", id: x.id, day: x.day, zone: x.zone || "", place: x.place || "", memo: x.memo, photos: x.photos.filter(p => p.kind === "before"), add: [], del: [] }; render(); break;
      }
      case "issue-place": syncSheetFields(); S.sheet.place = S.sheet.place === el.dataset.p ? "" : el.dataset.p; render(); break;
      case "issue-zone": syncSheetFields(); S.sheet.zone = S.sheet.zone === el.dataset.z ? "" : el.dataset.z; render(); break;
      case "photo-rm": {
        syncSheetFields();
        if (el.dataset.i != null) S.sheet.add.splice(+el.dataset.i, 1); else S.sheet.del.push(el.dataset.id);
        render(); break;
      }
      case "save-issue": {
        syncSheetFields(); const s = S.sheet, kept = s.photos.filter(p => !s.del.includes(p.id)).length;
        if (!s.memo.trim() && !kept && !s.add.length) { toast("사진이나 내용을 넣어 주세요"); return; }
        el.disabled = true; el.textContent = "올리는 중…";
        const id = await S.api.issueSave(S.sess.token, s.id || null, s.zone, s.memo.trim(), s.place.trim(), s.day);
        for (const pid of s.del) await S.api.issuePhotoDelete(S.sess.token, pid);
        for (const ph of s.add) await S.api.issuePhotoAdd(S.sess.token, id, "before", ph);
        S.sheet = null; S.issueWeek = monday(s.day); await refresh(); toast(s.id ? "수정했어요" : "이슈를 올렸어요"); break;
      }
      case "issue-done": {
        const x = S.issues.items.find(i => i.id === el.dataset.id);
        S.sheet = { type: "done", id: x.id, note: x.done_note || "", photos: x.photos.filter(p => p.kind === "after"), add: [], del: [] }; render(); break;
      }
      case "save-done": {
        syncSheetFields(); const s = S.sheet, edit = !!S.issues.items.find(i => i.id === s.id)?.done_at;
        el.disabled = true; el.textContent = "저장하는 중…";
        for (const pid of s.del) await S.api.issuePhotoDelete(S.sess.token, pid);
        for (const ph of s.add) await S.api.issuePhotoAdd(S.sess.token, s.id, "after", ph);
        await S.api.issueDone(S.sess.token, s.id, true, s.note.trim());
        S.sheet = null; await refresh(); navigator.vibrate?.(40); toast(edit ? "조치 내용을 고쳤어요" : "조치 완료했어요. 수고했어요"); break;
      }
      case "react": {
        const x = S.issues.items.find(i => i.id === el.dataset.id), k = el.dataset.k, me = S.board.me;
        const mineK = h => h.by === me.id && (h.kind || "heart") === k, on = !x.hearts.some(mineK);
        x.hearts = on ? [...x.hearts, { by: me.id, kind: k, name: me.name }] : x.hearts.filter(h => !mineK(h)); render();
        if (on) navigator.vibrate?.(20);
        try { await S.api.react(S.sess.token, x.id, k, on); } finally { await loadIssues(); if (!S.sheet) render(); }
        break;
      }
      case "news-seen": el.disabled = true; await S.api.newsSeen(S.sess.token); S.news = { count: 0, items: [] }; render(); toast("새 소식을 확인했어요"); break;
      case "news-go": {
        const id = el.dataset.id; S.issueWeek = monday(el.dataset.day); S.issueTab = "all"; S.flash = id;
        await loadIssues(); render();
        document.getElementById("is-" + id)?.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => { if (S.flash === id) S.flash = null; }, 2500); break;
      }
      case "compare": {
        const x = S.issues.items.find(i => i.id === el.dataset.id), b = x.photos.find(p => p.kind === "before"), a = x.photos.find(p => p.kind === "after");
        const s = S.sheet = { type: "compare", x: 50, bsrc: b.thumb, asrc: a.thumb }; render();
        const [bf, af] = await Promise.all([S.api.issuePhoto(S.sess.token, b.id).catch(() => null), S.api.issuePhoto(S.sess.token, a.id).catch(() => null)]);
        if (S.sheet === s) { s.bsrc = bf || s.bsrc; s.asrc = af || s.asrc; render(); }
        break;
      }
      case "cmt-del": {
        if (!confirm("댓글을 지울까요?")) return;
        el.disabled = true; await S.api.commentDelete(S.sess.token, el.dataset.id); await loadIssues(); if (!S.sheet) render(); toast("댓글을 지웠어요"); break;
      }
      case "issue-undo": {
        if (!confirm("진행 중으로 되돌릴까요? 조치 후 사진도 같이 지워져요.")) return;
        el.disabled = true; await S.api.issueDone(S.sess.token, el.dataset.id, false, ""); await refresh(); toast("진행 중으로 되돌렸어요"); break;
      }
      case "photo": {
        const id = el.dataset.id; S.sheet = { type: "photo", id, src: null }; render();
        try { const src = await S.api.issuePhoto(S.sess.token, id); if (S.sheet?.id === id) { S.sheet.src = src; if (!src) S.sheet.err = "사진을 찾지 못했어요"; render(); } }
        catch (e) { if (S.sheet?.id === id) { S.sheet.err = errMsg(e); render(); } }
        break;
      }
      case "move": {
        const isZone = el.dataset.k === "zone", list = (isZone ? S.board.zones : S.board.members).map(x => isZone ? x.code : x.id);
        const i = list.indexOf(el.dataset.id), k = i + +el.dataset.n;
        if (i < 0 || k < 0 || k >= list.length) return;
        [list[i], list[k]] = [list[k], list[i]]; el.disabled = true;
        await (isZone ? S.api.zoneOrder(S.sess.token, list) : S.api.memberOrder(S.sess.token, list));
        await refresh(); break;
      }
      case "close": S.sheet = null; render(); break;
    }
  } catch (e) {
    if (e.code === "28000" || /AUTH/.test(e.message)) { logoutLocal(); await showLogin(); toast("다시 로그인해 주세요"); return; }
    toast(errMsg(e)); if (el) el.disabled = false;
  }
}
async function refresh() { await Promise.all([loadBoard(), loadIssues()]); if (!S.sheet) render(); }
const bgIssues = () => loadIssues().then(() => { if (!S.sheet && S.board) render(); }).catch(() => {});

document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (!el || el.tagName === "INPUT" || el.disabled) return;
  act(el.dataset.act, el);
});
// 위치를 직접 적으면 '최근 위치' 버튼 선택도 따라가요
document.addEventListener("input", e => {
  if (e.target.id !== "i-place" || !S.sheet) return;
  S.sheet.place = e.target.value;
  document.querySelectorAll('[data-act="issue-place"]').forEach(b => b.setAttribute("aria-pressed", b.dataset.p === e.target.value.trim()));
});
document.addEventListener("change", async e => {
  if (e.target.dataset?.act === "photo-in" && S.sheet) {
    const s = S.sheet, files = [...e.target.files], room = 4 - (s.photos.filter(p => !s.del.includes(p.id)).length + s.add.length);
    if (files.length > room) toast(`사진은 4장까지예요. ${room}장만 넣었어요`);
    syncSheetFields(); s.busyPhoto = true; render();
    try { for (const f of files.slice(0, room)) s.add.push(await shrink(f)); }
    catch (err) { toast(errMsg(err)); }
    finally { s.busyPhoto = false; if (S.sheet === s) render(); }
    return;
  }
  if (e.target.dataset?.act === "iweekset" && e.target.value) { S.issueWeek = monday(e.target.value); loadIssues().then(() => !S.sheet && render()).catch(err => toast(errMsg(err))); return; }
  if (e.target.dataset?.act === "dayset" && e.target.value) { S.day = e.target.value; refresh().catch(err => toast(errMsg(err))); }
});
// 전·후 비교: 손가락으로 끌면 선이 따라와요 (다시 그리지 않고 --x 만 바꿔요)
const cmpSet = (box, v) => { S.sheet.x = Math.max(0, Math.min(100, v)); box.style.setProperty("--x", S.sheet.x + "%"); box.setAttribute("aria-valuenow", Math.round(S.sheet.x)); };
const cmpAt = (box, e) => { const r = box.getBoundingClientRect(); cmpSet(box, (e.clientX - r.left) / r.width * 100); };
document.addEventListener("pointerdown", e => {
  const box = e.target.closest?.(".cmp__box"); if (!box || S.sheet?.type !== "compare") return;
  box.setPointerCapture(e.pointerId); box.dataset.drag = "1"; cmpAt(box, e);
});
document.addEventListener("pointermove", e => { const box = e.target.closest?.(".cmp__box"); if (box?.dataset.drag) cmpAt(box, e); });
document.addEventListener("pointerup", e => { const box = e.target.closest?.(".cmp__box"); if (box) delete box.dataset.drag; });
// 댓글: 엔터나 보내기 버튼
document.addEventListener("submit", async e => {
  const f = e.target.closest(".cmt-in"); if (!f) return;
  e.preventDefault();
  const inp = f.querySelector("input"), btn = f.querySelector("button"), body = inp.value.trim();
  if (!body || btn.disabled) return;
  btn.disabled = inp.disabled = true;
  try { await S.api.commentAdd(S.sess.token, f.dataset.issue, body); await loadIssues(); if (!S.sheet) render(); }
  catch (err) {
    if (err.code === "28000" || /AUTH/.test(err.message)) { logoutLocal(); await showLogin(); toast("다시 로그인해 주세요"); return; }
    toast(errMsg(err)); btn.disabled = inp.disabled = false;
  }
});
document.addEventListener("keydown", e => {
  if (S.sheet && e.key === "Escape") { S.sheet = null; render(); return; }
  if (S.sheet?.type === "compare" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { const box = document.querySelector(".cmp__box"); if (box) cmpSet(box, S.sheet.x + (e.key === "ArrowLeft" ? -5 : 5)); return; }
  if (!S.sess && S.pick && !S.sheet) {
    if (/^[0-9]$/.test(e.key)) pressKey(e.key);
    else if (e.key === "Backspace") { S.pin = S.pin.slice(0, -1); renderLogin(); }
    else if (e.key === "Escape") { S.pick = null; S.pin = ""; renderLogin(); }
  }
});
// 30초마다, 그리고 화면으로 돌아올 때 새로고침 (시트 열려 있으면 건너뜀)
const typing = () => !!document.activeElement?.closest?.(".cmt-in") && !!document.activeElement.value;
const tick = () => { if (S.sess && S.board && !S.sheet && !typing() && document.visibilityState === "visible") refresh().catch(() => {}); };
setInterval(tick, 30000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !S.sess) return;
  if (!isMgr() && S.day !== today()) S.day = today();   // 크루는 늘 오늘
  tick();
});

boot();
})();
