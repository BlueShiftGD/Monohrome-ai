// net.js — мультиплеер и лобби для WORST NIGHTMARE (Firebase Realtime Database, SDK v10, ES-модули).
// Подключается в index.html как <script type="module" src="net.js"></script>.
// Структура в базе:
//   lobbies/{CODE}/meta     {host, max, mode, status:"lobby"|"playing", seed, created}
//   lobbies/{CODE}/players/{playerId}  {n:ник, j:время входа, x,y,a,f,h,t,s,z,m — состояние игрока}
//   lobbies/{CODE}/mon      [[x,y,floor,state] x3] — монстры (пишет только хост)
//   lobbies/{CODE}/ev       события (открыт ящик, смерть, рывок, победа...)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getDatabase, ref, set, get, update, remove, push, onValue, onChildAdded, onChildChanged,
  onChildRemoved, onDisconnect, runTransaction, goOffline, goOnline }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

// !!! ВАЖНО: в сообщении у тебя authDomain и databaseURL были обрезаны ("://firebaseapp.com",
// "https://firebasedatabase.app"). Ниже — восстановленные значения. databaseURL обязательно
// сверь с Firebase Console → Realtime Database → вкладка «Данные» (адрес над деревом данных).
// Для европейского региона он выглядит так: https://worst-nightmare-default-rtdb.europe-west1.firebasedatabase.app
const firebaseConfig = {
  apiKey: "AIzaSyBLYrPyujbKRHGBKa0W8clxmiFlutbDqUc",
  authDomain: "worst-nightmare.firebaseapp.com",
  databaseURL: "https://firebasedatabase.app",
  projectId: "worst-nightmare",
  storageBucket: "worst-nightmare.firebasestorage.app",
  messagingSenderId: "683709393949",
  appId: "1:683709393949:web:7bdce17fe64e72317caaf4"
};

const SEND_MS = 66;            // ≤ 15 отправок координат в секунду
const HIDE_GRACE_MS = 15000;   // свернул вкладку/браузер дольше этого времени — игрок удаляется из комнаты
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MODE_DESC = {
  normal: "Командой найдите 5 ключей и код, откройте ворота. 3 жизни, сейф-зона у ворот.",
  nightmare: "Одна жизнь, без сейф-зон. Монстры быстрее и иногда чуют случайного живого игрока.",
  speed: "Прыжок (Пробел) и рывок в воздухе (Shift). Экранные кнопки на телефоне. Идёт таймер."
};
const $ = id => document.getElementById(id);
const myId = Math.random().toString(36).slice(2, 10);

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const roster = new Map();      // все игроки лобби, включая себя: id -> {id,n,j}
let joined = false, unsubs = [], evUnsub = null;
let lobbyRef, metaRef, playersRef, monRef, evRef, meRef;
let lastSent = 0, lastJson = "", everConn = false, wasConn = false, hideT = null, wentOffline = false;

const NET = window.NET = {
  id: myId, nick: "", room: null, host: false, meta: null, inGame: false,
  players: new Map(),          // удалённые игроки (без себя) с интерполяцией
  mon: null,
  pushState(st) {
    if (!joined) return;
    const now = performance.now(), j = JSON.stringify(st);
    if (now - lastSent < SEND_MS) return;
    if (j === lastJson && now - lastSent < 1500) return;
    lastSent = now; lastJson = j;
    update(meRef, st).catch(() => {});
  },
  pushMon(a) { if (joined && NET.host) set(monRef, a).catch(() => {}); },
  event(o) { if (joined) push(evRef, { ...o, from: myId, n: NET.nick }).catch(() => {}); },
  async create(nick) {
    NET.nick = cleanNick(nick);
    let code = genCode();
    for (let i = 0; i < 8; i++) {
      const s = await get(ref(db, "lobbies/" + code + "/meta"));
      if (!s.exists()) break;
      code = genCode();
    }
    const me = ref(db, `lobbies/${code}/players/${myId}`);
    await onDisconnect(me).remove();
    await set(ref(db, "lobbies/" + code), {
      meta: { host: myId, max: 4, mode: "normal", status: "lobby", seed: 0, created: Date.now() },
      players: { [myId]: { n: NET.nick, j: Date.now() } }
    });
    enter(code);
  },
  async join(nick, codeRaw) {
    const code = (codeRaw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length < 4 || code.length > 6) throw new Error("Введи код комнаты (4–5 символов).");
    const snap = await get(ref(db, "lobbies/" + code));
    if (!snap.exists()) throw new Error("Лобби не найдено.");
    const v = snap.val(), meta = v.meta, pl = v.players || {};
    if (!meta || !Object.keys(pl).length) {            // «осиротевшая» комната без игроков
      remove(ref(db, "lobbies/" + code)).catch(() => {});
      throw new Error("Лобби не найдено.");
    }
    if (meta.status !== "lobby") throw new Error("Игра уже идёт — зайти нельзя.");
    if (Object.keys(pl).length >= meta.max) throw new Error("Лобби переполнено.");
    NET.nick = cleanNick(nick);
    const me = ref(db, `lobbies/${code}/players/${myId}`);
    await onDisconnect(me).remove();
    const res = await runTransaction(ref(db, `lobbies/${code}/players`), cur => {
      if (cur === null) return cur;                    // кэша ещё нет — SDK повторит вызов с реальными данными
      if (Object.keys(cur).length >= meta.max) return; // отмена: переполнено
      cur[myId] = { n: NET.nick, j: Date.now() };
      return cur;
    });
    if (!res.committed) { await onDisconnect(me).cancel().catch(() => {}); throw new Error("Лобби переполнено."); }
    enter(code);
  },
  async leave() {
    if (!joined) return;
    const code = NET.room, alone = roster.size <= 1;
    const me = meRef;
    joined = false; unsub(); detachEvents();
    NET.inGame = false; NET.players.clear(); roster.clear(); NET.room = null; NET.host = false; NET.meta = null; NET.mon = null;
    try { await onDisconnect(me).cancel(); } catch (e) {}
    try { alone ? await remove(ref(db, "lobbies/" + code)) : await remove(me); } catch (e) {}
  },
  async start() {
    if (!NET.host || !joined) return;
    const seed = Math.floor(Math.random() * 2147483647);
    await update(lobbyRef, { "meta/status": "playing", "meta/seed": seed, ev: null, mon: null });
  },
  async backToLobby() {
    if (!NET.host || !joined) return;
    await update(lobbyRef, { "meta/status": "lobby", ev: null, mon: null });
  }
};

function cleanNick(s) {
  s = (s || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 12);
  return s || "Игрок" + (100 + Math.floor(Math.random() * 900));
}
function genCode() { let s = ""; for (let i = 0; i < 5; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)]; return s; }
function unsub() { unsubs.forEach(f => { try { f(); } catch (e) {} }); unsubs = []; }
function detachEvents() { if (evUnsub) { try { evUnsub(); } catch (e) {} evUnsub = null; } }
function attachEvents() {
  detachEvents();
  evUnsub = onChildAdded(evRef, s => { const ev = s.val(); if (ev && ev.from !== myId) WN.event(ev); });
}
function resetMine() {
  lastJson = ""; lastSent = 0;
  update(meRef, { x: null, y: null, a: null, f: null, h: null, t: null, s: null, z: null, m: null }).catch(() => {});
}

function enter(code) {
  NET.room = code; joined = true;
  lobbyRef = ref(db, "lobbies/" + code);
  metaRef = ref(db, `lobbies/${code}/meta`);
  playersRef = ref(db, `lobbies/${code}/players`);
  monRef = ref(db, `lobbies/${code}/mon`);
  evRef = ref(db, `lobbies/${code}/ev`);
  meRef = ref(db, `lobbies/${code}/players/${myId}`);
  roster.clear(); NET.players.clear(); NET.meta = null; NET.inGame = false;
  unsubs.push(onValue(metaRef, onMeta));
  unsubs.push(onChildAdded(playersRef, onPlayer));
  unsubs.push(onChildChanged(playersRef, onPlayer));
  unsubs.push(onChildRemoved(playersRef, onGone));
  unsubs.push(onValue(monRef, s => { NET.mon = s.val(); }));
  unsubs.push(onValue(ref(db, ".info/connected"), onConn));
  UI.open("lobby");
}

function onMeta(s) {
  const m = s.val();
  if (!m) { if (joined) hardLeave("Лобби закрыто."); return; }
  NET.meta = m; NET.host = m.host === myId;
  if (m.status === "playing" && !NET.inGame) {
    NET.inGame = true;
    NET.players.forEach(r => { r.seen = false; r.m = 0; r.imm = 0; });
    attachEvents();
    WN.start({ seed: m.seed, gm: m.mode });
  } else if (m.status === "lobby" && NET.inGame) {
    NET.inGame = false; detachEvents(); resetMine(); WN.backToLobby();
  }
  renderLobby();
}

function onPlayer(s) {
  const id = s.key, v = s.val() || {};
  roster.set(id, { id, n: v.n || "?", j: v.j || 0 });
  if (id !== myId) {
    let r = NET.players.get(id);
    if (!r) {
      r = { id, n: v.n || "?", x: 0, y: 0, angle: 0, floor: 0, hidden: false, torch: false, sprinting: false, z: 0, m: 0,
        tx: 0, ty: 0, ta: 0, tz: 0, imm: 0, seen: false, cam: [0, 0] };
      NET.players.set(id, r);
    }
    r.n = v.n || r.n;
    if (v.x != null) {
      const fl = v.f || 0;
      if (!r.seen || r.floor !== fl) { r.x = v.x; r.y = v.y; r.z = v.z || 0; r.angle = v.a || 0; r.seen = true; }
      r.tx = v.x; r.ty = v.y; r.ta = v.a || 0; r.tz = v.z || 0; r.floor = fl;
      r.hidden = !!v.h; r.torch = !!v.t; r.sprinting = !!v.s; r.m = v.m || 0;
    }
  }
  renderLobby();
}

function onGone(s) {
  const id = s.key, r = NET.players.get(id);
  roster.delete(id); NET.players.delete(id);
  if (r && NET.inGame) WN.toast(r.n + " покинул игру");
  if (NET.meta && NET.meta.host === id) electHost(id);   // хост ушёл — передаём роль следующему
  renderLobby();
}
function electHost(old) {
  const cand = [...roster.values()].sort((a, b) => a.j - b.j || (a.id < b.id ? -1 : 1))[0];
  if (cand && cand.id === myId)
    runTransaction(ref(db, `lobbies/${NET.room}/meta/host`), cur => (cur === old ? myId : undefined)).catch(() => {});
}

function onConn(s) {
  const c = !!s.val();
  if (c && everConn && !wasConn && joined) {             // переподключились — проверим, что нас не удалили
    get(meRef).then(sn => { if (joined && !sn.exists()) hardLeave("Соединение потеряно — ты удалён из лобби."); }).catch(() => {});
  }
  if (c) everConn = true;
  wasConn = c;
}
function hardLeave(msg) {
  const was = joined;
  joined = false; unsub(); detachEvents();
  NET.inGame = false; NET.players.clear(); roster.clear(); NET.room = null; NET.host = false; NET.meta = null; NET.mon = null;
  if (was) WN.lost(msg);
}

// Свернул браузер/вкладку на телефоне → через HIDE_GRACE_MS уходим офлайн, сервер срабатывает onDisconnect().remove().
document.addEventListener("visibilitychange", () => {
  if (!joined) return;
  if (document.hidden) {
    clearTimeout(hideT);
    hideT = setTimeout(() => { if (document.hidden && joined) { wentOffline = true; goOffline(db); } }, HIDE_GRACE_MS);
  } else {
    clearTimeout(hideT);
    if (wentOffline) { wentOffline = false; goOnline(db); }
  }
});
addEventListener("pagehide", () => { if (joined) remove(meRef).catch(() => {}); });

// ---------------------------------------------------------------- интерфейс лобби (DOM)
function renderLobby() {
  if (!joined || !$("p-lobby")) return;
  const m = NET.meta || { max: 4, mode: "normal", host: "" };
  const list = [...roster.values()].sort((a, b) => a.j - b.j || (a.id < b.id ? -1 : 1));
  $("lb-code").textContent = NET.room || "";
  $("lb-count").textContent = "Игроки: " + list.length + " / " + m.max;
  const ul = $("lb-players"); ul.textContent = "";
  list.forEach(p => {
    const li = document.createElement("li");
    li.textContent = p.n + (p.id === m.host ? "  ★ хост" : "") + (p.id === myId ? "  (ты)" : "");
    ul.appendChild(li);
  });
  const sm = $("lb-max"), sd = $("lb-mode");
  sm.value = String(m.max); sd.value = m.mode;
  sm.disabled = sd.disabled = !NET.host;
  [...sm.options].forEach(o => { o.disabled = +o.value < list.length; });
  $("btn-start").style.display = NET.host ? "block" : "none";
  $("lb-wait").style.display = NET.host ? "none" : "block";
  $("lb-desc").textContent = MODE_DESC[m.mode] || "";
}

window.UI = {
  open(name) {
    $("ui").style.display = "flex"; window.UIOPEN = true;
    $("p-mp").style.display = name === "mp" ? "block" : "none";
    $("p-lobby").style.display = name === "lobby" ? "block" : "none";
    WN.releaseKeys();
    if (name === "lobby") { WN.scene("lobby"); renderLobby(); }
    else { WN.scene("menu"); $("mp-err").textContent = ""; }
  },
  close() { $("ui").style.display = "none"; window.UIOPEN = false; },
  toast: t => WN.toast(t)
};

let busy = false;
async function run(fn) {
  if (busy) return; busy = true; $("mp-err").textContent = "";
  document.querySelectorAll("#p-mp button").forEach(b => b.disabled = true);
  try { await fn(); }
  catch (e) { $("mp-err").textContent = (e && e.message) || "Ошибка соединения с Firebase."; console.error(e); }
  busy = false; document.querySelectorAll("#p-mp button").forEach(b => b.disabled = false);
}
$("btn-create").onclick = () => run(() => NET.create($("nick").value));
$("btn-join").onclick = () => run(() => NET.join($("nick").value, $("code-in").value));
$("code-in").addEventListener("keydown", e => { if (e.key === "Enter") $("btn-join").click(); });
$("btn-mp-back").onclick = () => WN.toMenu();
$("btn-leave").onclick = async () => { await NET.leave(); WN.toMenu(); };
$("btn-start").onclick = () => NET.start().catch(e => WN.toast("Не удалось начать: " + e.message));
$("lb-max").onchange = e => {
  if (!NET.host) return;
  const v = +e.target.value;
  if (v < roster.size) { WN.toast("В лобби уже больше игроков."); renderLobby(); return; }
  update(metaRef, { max: v }).catch(() => {});
};
$("lb-mode").onchange = e => { if (NET.host) update(metaRef, { mode: e.target.value }).catch(() => {}); };
$("btn-copy").onclick = async () => {
  const t = NET.room || "";
  try { await navigator.clipboard.writeText(t); }
  catch (e) { const i = document.createElement("input"); i.value = t; document.body.appendChild(i); i.select(); try { document.execCommand("copy"); } catch (_) {} i.remove(); }
  const b = $("btn-copy"); b.textContent = "Скопировано"; setTimeout(() => { b.textContent = "Скопировать"; }, 1500);
};
