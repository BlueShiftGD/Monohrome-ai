// net.js — мультиплеер, аккаунты, друзья, открытые комнаты и чат для WORST NIGHTMARE (Firebase Realtime Database, SDK v10, ES-модули).
// Подключается в index.html после lang.js: <script type="module" src="net.js"></script>.
//
// Три независимых проекта Firebase:
//   dbGame   (приложение по умолчанию, worst-nightmare) — lobbies/{CODE}/{meta,players,mon,ev}. Правила НЕ менялись.
//   dbSocial (приложение "social") — Auth + users / friendRequests / friends / invites.
//   dbChat   (приложение "chat", вход анонимный) — global_chat, public_lobbies.
//
// Команда в лобби/игре: события lobbies/{CODE}/ev с {type:"chat", txt} (тот же путь и формат, что у остальных событий,
// правила dbGame менять не нужно, пока они не запрещают лишнее поле txt в событии).
//
// Элементы index.html, которые ищет этот файл (все необязательные — если элемента нет, соответствующая часть просто молчит):
//   лобби/вход:  p-mp, p-lobby, mp-err, nick, btn-create, code-in, btn-join, btn-mp-back, mp-vis(select open|private), pub-list(ul), pub-empty,
//                lb-code, lb-count, lb-players, lb-max, lb-diff, lb-speed, lb-desc, lb-vis, btn-start, lb-wait, btn-leave, btn-copy
//   кнопки в углу: btn-prof, btn-fr
//   профиль:     p-prof, prof-tab-login, prof-tab-reg, prof-guest, prof-user, prof-nick-wrap, prof-nick, prof-email, prof-pass, btn-prof-submit,
//                btn-google, btn-logout, prof-name, prof-mail, prof-nick2, btn-nick-save, prof-err, btn-prof-close
//   друзья:      p-fr, fr-login-note, btn-fr-login, fr-body, fr-search, btn-fr-search, fr-result, fr-req-list(ul), fr-list(ul), fr-msg, btn-fr-close
//   чат:         chat, btn-chat-toggle, chat-tab-g, chat-tab-t, chat-log-g, chat-log-t, chat-in, chat-send, btn-chat-close, btn-chat
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getDatabase, ref, set, get, update, remove, push, query, orderByChild, equalTo, limitToLast, serverTimestamp,
  onValue, onChildAdded, onChildChanged, onChildRemoved, onDisconnect, runTransaction, goOffline, goOnline }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, signInAnonymously }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBLYrPyujbKRHGBKa0W8clxmiFlutbDqUc",
  authDomain: "worst-nightmare.firebaseapp.com",
  databaseURL: "https://worst-nightmare-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "worst-nightmare",
  storageBucket: "worst-nightmare.firebasestorage.app",
  messagingSenderId: "683709393949",
  appId: "1:683709393949:web:7bdce17fe64e72317caaf4"
};
const configSocial = {
  apiKey: "AIzaSyDHo-J4zNATEK6MnQRyA-mtn_mMD81bUX8",
  authDomain: "for-auth-and-friends.firebaseapp.com",
  databaseURL: "https://for-auth-and-friends-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "for-auth-and-friends",
  storageBucket: "for-auth-and-friends.firebasestorage.app",
  messagingSenderId: "279895436490",
  appId: "1:279895436490:web:fb27f94d88a99174099833"
};
const configChat = {
  apiKey: "AIzaSyCt-p0NT9rxPsEyDTz4gaXyI2zoYZhz7kI",
  authDomain: "wn-chat-45d5a.firebaseapp.com",
  databaseURL: "https://wn-chat-45d5a-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "wn-chat-45d5a",
  storageBucket: "wn-chat-45d5a.firebasestorage.app",
  messagingSenderId: "749651666373",
  appId: "1:749651666373:web:e5752084579aa0a08c57ac"
};

const SEND_MS = 66;            // ≤ 15 отправок координат в секунду
const HIDE_GRACE_MS = 15000;   // свернул вкладку/браузер дольше этого времени — игрок удаляется из комнаты
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MODES = ["normal", "nightmare", "speed"];   // legacy-поле meta.mode / public_lobbies.mode (для старых клиентов)
const DIFFS = ["easy", "normal", "hard", "nightmare"];
// сложность и спидран из меты (старые лобби без diff: mode nightmare → кошмар, mode speed → спидран)
const metaDiff = m => ({ diff: DIFFS.includes(m && m.diff) ? m.diff : (m && m.mode === "nightmare" ? "nightmare" : "normal"),
  speed: m && m.speed != null ? !!m.speed : !!(m && m.mode === "speed") });
// условие катки (режим из script.js → MODES) лежит в meta.cond; неизвестное/отсутствующее → "normal" (Game сам проверит доступность в MP)
const metaCond = m => (m && typeof m.cond === "string" && /^[a-z0-9_]{1,24}$/i.test(m.cond)) ? m.cond : "normal";
const legacyMode = (diff, speed) => speed ? "speed" : diff === "nightmare" ? "nightmare" : "normal";
const CHAT_MAX = 50, CHAT_GAP = 1500, CHAT_LEN = 150;

const $ = id => document.getElementById(id);
const on = (id, ev, fn) => { const e = $(id); if (e) e.addEventListener(ev, fn); return e; };
const setText = (id, s) => { const e = $(id); if (e) e.textContent = s; };
const showEl = (id, v, d) => { const e = $(id); if (e) e.style.display = v ? (d || "block") : "none"; };
const myId = Math.random().toString(36).slice(2, 10);
const toast = s => { if (window.WN && WN.toast) WN.toast(s); };

// Понятный локализованный текст из любой ошибки (наши ключи, коды Firebase Auth, PERMISSION_DENIED, офлайн).
const tp = k => t(k, { host: location.hostname || location.host || "—", project: configSocial.projectId, proto: location.protocol });
function errText(e) {
  if (!navigator.onLine) return t("err.offline");
  const m = (e && e.message) || "", c = (e && e.code) || "";
  if (/^(net|err|prof|fr|chat)\.[\w.]+$/.test(m)) return tp(m);
  if (c === "auth/operation-not-supported-in-this-environment" || (!/^https?:$/.test(location.protocol) && /^auth\//.test(c))) return tp("err.file");
  if (c) { const k = "err." + c, s = tp(k); if (s !== k) return s; }
  if (/PERMISSION_DENIED/i.test(m) || /PERMISSION_DENIED/i.test(c)) return t("err.perm");
  if (/network|offline|timeout/i.test(m)) return t("err.offline");
  return t("err.generic");
}

const app = initializeApp(firebaseConfig);                  // игровая база (по умолчанию)
const db = getDatabase(app);                                // dbGame
const appSocial = initializeApp(configSocial, "social");
const authSocial = getAuth(appSocial);
const dbSocial = getDatabase(appSocial);
const appChat = initializeApp(configChat, "chat");
const authChat = getAuth(appChat);
const dbChat = getDatabase(appChat);

const roster = new Map();      // все игроки лобби, включая себя: id -> {id,n,j}
let joined = false, unsubs = [], evUnsub = null, chatEvUnsub = null;
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
  async create(nick, vis, diff, speed, cond) {
    NET.nick = cleanNick(nick);
    diff = DIFFS.includes(diff) ? diff : "normal"; speed = !!speed; cond = metaCond({ cond });
    let code = genCode();
    for (let i = 0; i < 8; i++) {
      const s = await get(ref(db, "lobbies/" + code + "/meta"));
      if (!s.exists()) break;
      code = genCode();
    }
    const me = ref(db, `lobbies/${code}/players/${myId}`);
    await onDisconnect(me).remove();
    await set(ref(db, "lobbies/" + code), {
      meta: { host: myId, max: 4, mode: legacyMode(diff, speed), diff, speed, cond, status: "lobby", seed: 0, created: Date.now() },
      players: { [myId]: { n: NET.nick, j: Date.now() } }
    });
    pubWanted = vis === "open";
    enter(code);
    syncPublic();
  },
  async join(nick, codeRaw) {
    const code = (codeRaw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length < 4 || code.length > 6) throw new Error("net.err.code");
    const snap = await get(ref(db, "lobbies/" + code));
    if (!snap.exists()) throw new Error("net.err.notfound");
    const v = snap.val(), meta = v.meta, pl = v.players || {};
    if (!meta || !Object.keys(pl).length) {            // «осиротевшая» комната без игроков
      remove(ref(db, "lobbies/" + code)).catch(() => {});
      throw new Error("net.err.notfound");
    }
    if (meta.status !== "lobby") throw new Error("net.err.started");
    if (Object.keys(pl).length >= meta.max) throw new Error("net.err.full");
    NET.nick = cleanNick(nick);
    const me = ref(db, `lobbies/${code}/players/${myId}`);
    await onDisconnect(me).remove();
    const res = await runTransaction(ref(db, `lobbies/${code}/players`), cur => {
      if (cur === null) return cur;                    // кэша ещё нет — SDK повторит вызов с реальными данными
      if (Object.keys(cur).length >= meta.max) return; // отмена: переполнено
      cur[myId] = { n: NET.nick, j: Date.now() };
      return cur;
    });
    if (!res.committed) { await onDisconnect(me).cancel().catch(() => {}); throw new Error("net.err.full"); }
    pubWanted = false;
    enter(code);
  },
  async leave() {
    if (!joined) return;
    const code = NET.room, alone = roster.size <= 1;
    const me = meRef;
    joined = false; unsub(); detachEvents(); detachChatEv();
    NET.inGame = false; NET.players.clear(); roster.clear(); NET.room = null; NET.host = false; NET.meta = null; NET.mon = null;
    clearSentInvites(); updateStatus(); renderChatUI();
    await dropPublic();
    try { await onDisconnect(me).cancel(); } catch (e) {}
    try { alone ? await remove(ref(db, "lobbies/" + code)) : await remove(me); } catch (e) {}
  },
  async start() {
    if (!NET.host || !joined) return;
    const seed = Math.floor(Math.random() * 2147483647);
    unlistPublic();                                    // комната начала игру — убираем из списка открытых
    await update(lobbyRef, { "meta/status": "playing", "meta/seed": seed, ev: null, mon: null });
  },
  async backToLobby() {
    if (!NET.host || !joined) return;
    await update(lobbyRef, { "meta/status": "lobby", ev: null, mon: null });
  },
  // --- для script.js
  solo(on) { solo = !!on; updateStatus(); },          // одиночная игра идёт / закончилась (статус «В игре»)
  setChat(v) { setChat(v); },                         // «Чат: вкл/выкл» из настроек
  user() { return me; }
};

function cleanNick(s) {
  s = (s || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 12);
  return s || t("mp.nick.ph") + (100 + Math.floor(Math.random() * 900));
}
function cleanLong(s, n) { return String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, n); }
function genCode() { let s = ""; for (let i = 0; i < 5; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)]; return s; }
function unsub() { unsubs.forEach(f => { try { f(); } catch (e) {} }); unsubs = []; }
function detachEvents() { if (evUnsub) { try { evUnsub(); } catch (e) {} evUnsub = null; } }
function attachEvents() {
  detachEvents();
  evUnsub = onChildAdded(evRef, s => { const ev = s.val(); if (ev && ev.from !== myId && ev.type !== "chat") WN.event(ev); });
}
function resetMine() {
  lastJson = ""; lastSent = 0;
  update(meRef, { x: null, y: null, a: null, f: null, h: null, t: null, s: null, z: null, m: null, q: null, w: null }).catch(() => {});
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
  const tl = $("chat-log-t"); if (tl) tl.textContent = "";
  attachChatEv();
  updateStatus(); renderChatUI();
  UI.open("lobby");
}

function onMeta(s) {
  const m = s.val();
  if (!m) { if (joined) hardLeave("net.closed"); return; }
  NET.meta = m; NET.host = m.host === myId;
  if (m.status === "playing" && !NET.inGame) {
    NET.inGame = true;
    NET.players.forEach(r => { r.seen = false; r.m = 0; r.imm = 0; });
    attachEvents();
    const md = metaDiff(m);
    WN.start({ seed: m.seed, diff: md.diff, speed: md.speed, cond: metaCond(m) });
  } else if (m.status === "lobby" && NET.inGame) {
    NET.inGame = false; detachEvents(); resetMine(); WN.backToLobby();
  }
  syncPublic(); updateStatus(); renderChatUI();
  renderLobby();
}

function onPlayer(s) {
  const id = s.key, v = s.val() || {};
  roster.set(id, { id, n: v.n || "?", j: v.j || 0 });
  if (id !== myId) {
    let r = NET.players.get(id);
    if (!r) {
      r = { id, n: v.n || "?", x: 0, y: 0, angle: 0, floor: 0, hidden: false, torch: false, sprinting: false, z: 0, m: 0,
        tx: 0, ty: 0, ta: 0, tz: 0, imm: 0, seen: false, cam: [0, 0], shadow: false, trapped: false };
      NET.players.set(id, r);
    }
    r.n = v.n || r.n;
    if (v.x != null) {
      const fl = v.f || 0;
      if (!r.seen || r.floor !== fl) { r.x = v.x; r.y = v.y; r.z = v.z || 0; r.angle = v.a || 0; r.seen = true; }
      r.tx = v.x; r.ty = v.y; r.ta = v.a || 0; r.tz = v.z || 0; r.floor = fl;
      r.hidden = !!v.h; r.torch = !!v.t; r.sprinting = !!v.s; r.m = v.m || 0; r.shadow = !!v.q; r.trapped = !!v.w;
    }
  }
  syncPublic();
  renderLobby();
}

function onGone(s) {
  const id = s.key, r = NET.players.get(id);
  roster.delete(id); NET.players.delete(id);
  if (r && NET.inGame) toast(t("net.left", { who: r.n }));
  if (NET.meta && NET.meta.host === id) electHost(id);   // хост ушёл — передаём роль следующему
  syncPublic();
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
    get(meRef).then(sn => { if (joined && !sn.exists()) hardLeave("net.lost"); }).catch(() => {});
  }
  if (c) everConn = true;
  wasConn = c;
}
function hardLeave(key) {
  const was = joined;
  joined = false; unsub(); detachEvents(); detachChatEv();
  NET.inGame = false; NET.players.clear(); roster.clear(); NET.room = null; NET.host = false; NET.meta = null; NET.mon = null;
  clearSentInvites(); updateStatus(); renderChatUI();
  dropPublic();
  if (was) WN.lost(t(key));
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
addEventListener("pagehide", () => {
  if (joined) remove(meRef).catch(() => {});
  if (me) set(ref(dbSocial, "users/" + me.uid + "/status"), "offline").catch(() => {});
});

// ================================================================ открытые комнаты (dbChat/public_lobbies)
let pubWanted = false, pubRef = null, pubLast = "", pubData = {}, pubUnsub = null;

function syncPublic() {
  if (!pubWanted || !joined || !NET.room || !chatReady || !chatUid) return;
  const m = NET.meta || { mode: "normal", max: 4, status: "lobby" };
  if (m.status !== "lobby") { unlistPublic(); return; }
  const md = metaDiff(m);
  const data = { host: NET.nick || "?", hostUid: chatUid, mode: legacyMode(md.diff, md.speed), diff: md.diff, players: roster.size || 1, max: m.max };
  const j = JSON.stringify(data);
  if (pubRef && j === pubLast) return;
  pubLast = j;
  if (!pubRef) {
    const r = pubRef = ref(dbChat, "public_lobbies/" + NET.room);
    onDisconnect(r).remove().then(() => set(r, data)).catch(e => console.warn("public lobby", e));
  } else update(pubRef, { mode: data.mode, diff: data.diff, players: data.players, max: data.max }).catch(() => {});
}
async function unlistPublic() {                          // убрать из списка, но «открытость» запомнить (вернёмся в лобби — снова появится)
  const r = pubRef; pubRef = null; pubLast = "";
  if (!r) return;
  try { await onDisconnect(r).cancel(); } catch (e) {}
  try { await remove(r); } catch (e) {}
}
async function dropPublic() { pubWanted = false; await unlistPublic(); }

function subscribePublic() {
  if (pubUnsub) return;
  pubUnsub = onValue(ref(dbChat, "public_lobbies"), s => { pubData = s.val() || {}; renderPublic(); }, () => { pubData = {}; renderPublic(); });
}
function renderPublic() {
  const ul = $("pub-list"); if (!ul) return;
  ul.textContent = "";
  const rows = Object.entries(pubData).map(([code, v]) => v && ({
    code, host: cleanLong(v.host, 20) || "?", mode: MODES.includes(v.mode) ? v.mode : "normal", diff: DIFFS.includes(v.diff) ? v.diff : (v.mode === "nightmare" ? "nightmare" : "normal"), players: +v.players || 0, max: +v.max || 0
  })).filter(r => r && /^[A-Z0-9]{4,6}$/.test(r.code) && r.players > 0);
  showEl("pub-empty", !rows.length);
  rows.forEach(r => {
    const li = document.createElement("li"), full = r.max > 0 && r.players >= r.max;
    const sp = document.createElement("span"); sp.className = "pub-t";
    sp.textContent = r.host + " · " + t("diff." + r.diff) + (r.mode === "speed" ? " · " + t("diff.speed") : "") + " · " + r.players + (r.max ? "/" + r.max : "");
    const b = document.createElement("button"); b.type = "button"; b.className = "pub-join";
    b.textContent = full ? t("pub.full") : t("pub.join"); b.disabled = full;
    b.onclick = () => run(() => NET.join(($("nick") || {}).value, r.code));
    li.append(sp, b); ul.appendChild(li);
  });
}

// ================================================================ чат
let chatOn = true;
try { chatOn = localStorage.getItem("wn_chat") !== "0"; } catch (e) {}
let chatReady = false, chatUid = null, gUnsubs = [], gKeys = [], gEls = new Map(), gLive = false, lastSend = 0;
let chatTab = "g", typing = false, prevUI = false;

function chatNick() { return cleanLong((me && me.nick) || NET.nick || ($("nick") || {}).value, 20) || t("n.player"); }

onAuthStateChanged(authChat, u => {
  chatUid = u ? u.uid : null; chatReady = !!u;
  if (chatReady) { subscribeGlobal(); subscribePublic(); syncPublic(); }
  else { unsubscribeGlobal(); if (pubUnsub) { pubUnsub(); pubUnsub = null; } pubData = {}; renderPublic(); }
  renderChatUI();
});
function chatAuth() { signInAnonymously(authChat).catch(e => console.warn("chat auth", e)); }
chatAuth();
addEventListener("online", () => { if (!chatReady) chatAuth(); });
onValue(ref(dbChat, ".info/connected"), s => { if (s.val() && pubWanted) { pubRef = null; pubLast = ""; syncPublic(); } });

function subscribeGlobal() {
  if (!chatOn || !chatReady || gUnsubs.length) return;
  const q = query(ref(dbChat, "global_chat"), limitToLast(CHAT_MAX));
  gLive = false;
  gUnsubs.push(onChildAdded(q, s => addGlobal(s.key, s.val()), () => {}));
  gUnsubs.push(onChildRemoved(q, s => { const el = gEls.get(s.key); if (el) { el.remove(); gEls.delete(s.key); } }, () => {}));
  gUnsubs.push(onValue(q, () => { gLive = true; }, () => {}, { onlyOnce: true }));
}
function unsubscribeGlobal() {
  gUnsubs.forEach(f => { try { f(); } catch (e) {} }); gUnsubs = []; gKeys = []; gEls.clear(); gLive = false;
  const l = $("chat-log-g"); if (l) l.textContent = "";
}
function appendMsg(logId, n, text, mine) {
  const log = $(logId); if (!log) return null;
  const row = document.createElement("div"); row.className = "chat-msg" + (mine ? " mine" : "");
  const a = document.createElement("span"); a.className = "chat-n"; a.textContent = cleanLong(n, 20) + ": ";
  const b = document.createElement("span"); b.className = "chat-t"; b.textContent = cleanLong(text, CHAT_LEN);
  row.append(a, b); log.appendChild(row);
  while (log.childElementCount > CHAT_MAX) log.firstElementChild.remove();
  log.scrollTop = log.scrollHeight;
  return row;
}
function noteIncoming(tabName, n, text) {
  if (chatTab !== tabName) { const b = $(tabName === "t" ? "chat-tab-t" : "chat-tab-g"); if (b) b.classList.add("unread"); }
  if (NET.inGame && !typing) toast(cleanLong(n, 20) + ": " + cleanLong(text, CHAT_LEN));
}
function addGlobal(key, v) {
  if (!v || typeof v.n !== "string" || typeof v.t !== "string" || gEls.has(key)) return;
  const row = appendMsg("chat-log-g", v.n, v.t, v.u === chatUid);
  if (row) gEls.set(key, row);
  if (gLive && v.u !== chatUid) noteIncoming("g", v.n, v.t);
  gKeys.push(key);
  while (gKeys.length > CHAT_MAX) {                      // автоочистка: самые старые удаляем из базы
    const old = gKeys.shift(), el = gEls.get(old);
    if (el) { el.remove(); gEls.delete(old); }
    remove(ref(dbChat, "global_chat/" + old)).catch(() => {});
  }
}
function attachChatEv() {
  detachChatEv();
  if (!chatOn || !joined) return;
  chatEvUnsub = onChildAdded(evRef, s => {
    const ev = s.val();
    if (!ev || ev.type !== "chat" || ev.from === myId || typeof ev.txt !== "string") return;
    appendMsg("chat-log-t", ev.n || "?", ev.txt, false);
    noteIncoming("t", ev.n || "?", ev.txt);
  });
}
function detachChatEv() { if (chatEvUnsub) { try { chatEvUnsub(); } catch (e) {} chatEvUnsub = null; } }

async function sendChat() {
  const inp = $("chat-in"); if (!inp) return false;
  const text = cleanLong(inp.value, CHAT_LEN);
  if (!text) return false;
  if (!chatOn) { toast(t("chat.disabled")); return false; }
  const now = Date.now();
  if (now - lastSend < CHAT_GAP) { toast(t("chat.slow")); return false; }
  if (chatTab === "t" && joined) {
    lastSend = now; inp.value = "";
    NET.event({ type: "chat", txt: text });
    appendMsg("chat-log-t", chatNick(), text, true);
    return true;
  }
  if (!chatReady || !chatUid) { toast(t("chat.nonet")); return false; }
  lastSend = now; inp.value = "";
  try { await push(ref(dbChat, "global_chat"), { n: chatNick(), t: text, ts: serverTimestamp(), u: chatUid }); return true; }
  catch (e) { console.warn("chat send", e); toast(errText(e)); return false; }
}
function setChatTab(tb) {
  chatTab = tb === "t" && joined ? "t" : "g";
  const b = $(chatTab === "t" ? "chat-tab-t" : "chat-tab-g"); if (b) b.classList.remove("unread");
  renderChatUI();
}
function setChat(v) {
  chatOn = !!v;
  try { localStorage.setItem("wn_chat", chatOn ? "1" : "0"); } catch (e) {}
  if (chatOn) { subscribeGlobal(); attachChatEv(); }
  else { unsubscribeGlobal(); detachChatEv(); const l = $("chat-log-t"); if (l) l.textContent = ""; closeChat(); }
  renderChatUI();
}
function enterTyping() {
  if (typing) return;
  typing = true; prevUI = !!window.UIOPEN; window.UIOPEN = true; window.CHATOPEN = true;
  const c = $("chat"); if (c) c.classList.add("typing");
  if (window.WN && WN.releaseKeys) WN.releaseKeys();
  try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) {}
}
function leaveTyping() {
  if (!typing) return;
  typing = false; window.UIOPEN = prevUI; window.CHATOPEN = false;
  const c = $("chat"); if (c) c.classList.remove("typing");
  if (NET.inGame && window.WN && WN.relock) WN.relock();
}
function openChat(tb) {
  if (!chatOn) return;
  if (tb) setChatTab(tb);
  const inp = $("chat-in"); if (inp) { enterTyping(); inp.focus(); }
}
function closeChat() { const inp = $("chat-in"); if (inp && document.activeElement === inp) inp.blur(); leaveTyping(); }
NET.chat = { open: openChat, close: closeChat, isOpen: () => typing, enabled: () => chatOn };

function renderChatUI() {
  const c = $("chat"); if (c) { c.style.display = chatOn ? "" : "none"; c.classList.toggle("in-game", !!NET.inGame); }
  setText("btn-chat-toggle", t(chatOn ? "chat.on" : "chat.off"));
  if (chatTab === "t" && !joined) chatTab = "g";
  showEl("chat-tab-t", joined, "inline-block");
  const tg = $("chat-tab-g"), tt = $("chat-tab-t");
  if (tg) tg.classList.toggle("on", chatTab === "g");
  if (tt) tt.classList.toggle("on", chatTab === "t");
  showEl("chat-log-g", chatTab === "g"); showEl("chat-log-t", chatTab === "t");
  const inp = $("chat-in"); if (inp) { inp.placeholder = t("chat.ph"); inp.disabled = !chatOn; inp.maxLength = CHAT_LEN; }
  const bc = $("btn-chat"); if (bc) bc.style.display = chatOn && NET.inGame && matchMedia("(pointer:coarse)").matches ? "block" : "none";
}
on("chat-in", "focus", enterTyping);
on("chat-in", "blur", leaveTyping);
on("chat-in", "keydown", e => {
  e.stopPropagation();
  if (e.key === "Enter") { e.preventDefault(); sendChat().then(ok => { if (ok && NET.inGame) closeChat(); }); }
  else if (e.key === "Escape") { e.preventDefault(); closeChat(); }
});
on("chat-in", "keyup", e => e.stopPropagation());
on("chat-send", "click", () => { sendChat().then(ok => { if (ok && NET.inGame) closeChat(); }); });
on("chat-tab-g", "click", () => setChatTab("g"));
on("chat-tab-t", "click", () => setChatTab("t"));
on("btn-chat-toggle", "click", () => setChat(!chatOn));
on("btn-chat-close", "click", closeChat);
const bch = on("btn-chat", "pointerdown", e => { e.preventDefault(); e.stopPropagation(); openChat(); });
if (bch) bch.addEventListener("mousedown", e => e.preventDefault());

// ================================================================ аккаунт, друзья, приглашения, статус (dbSocial)
let me = null, solo = false, lastStatus = "", profMode = "login", regNick = null, welcomePending = false, reqLoaded = false;
let sUnsubs = [];
const friendsMap = new Map(), reqIn = new Map(), profInflight = new Map(), sentInv = new Set();
let invIn = new Map();

function cleanProfNick(s) { return cleanLong(s, 20); }

function ensureProfile(user, pref) {
  if (profInflight.has(user.uid)) return profInflight.get(user.uid);
  const p = (async () => {
    const uref = ref(dbSocial, "users/" + user.uid), snap = await get(uref), v = snap.val();
    if (!snap.exists() || !v || !v.nick) {
      const nick = cleanProfNick(pref) || cleanProfNick(user.displayName) || cleanProfNick((user.email || "").split("@")[0]) || (t("n.player") + (100 + Math.floor(Math.random() * 900)));
      await set(uref, { nick, status: "online" });
    }
  })().finally(() => profInflight.delete(user.uid));
  profInflight.set(user.uid, p);
  return p;
}

onAuthStateChanged(authSocial, async u => {
  if (!u) { teardownSocial(); renderProfile(); renderFriends(); return; }
  if (me && me.uid === u.uid) return;
  try { await ensureProfile(u, regNick); startSocial(u); }
  catch (e) { console.error("profile", e); if (!googleBusy) profMsg(errText(e), true); }
});

function startSocial(u) {
  teardownSocial();
  me = { uid: u.uid, email: u.email || "", nick: "" };
  reqLoaded = false;
  const sref = ref(dbSocial, "users/" + u.uid + "/status");
  sUnsubs.push(onValue(ref(dbSocial, "users/" + u.uid), s => {
    const v = s.val(); if (!v || !me) return;
    const first = !me.nick; me.nick = cleanProfNick(v.nick) || me.nick;
    const nk = $("nick"); if (nk && !nk.value) nk.value = me.nick.slice(0, 12);
    if (first && welcomePending) { welcomePending = false; profMsg(t("prof.welcome", { nick: me.nick }), false); }
    renderProfile(); renderFriends();
  }, () => {}));
  sUnsubs.push(onValue(ref(dbSocial, ".info/connected"), s => {
    if (!s.val() || !me) return;
    lastStatus = "";
    onDisconnect(sref).set("offline").then(updateStatus).catch(() => {});
  }));
  sUnsubs.push(onValue(ref(dbSocial, "friends/" + u.uid), onFriends, () => {}));
  sUnsubs.push(onValue(ref(dbSocial, "friendRequests/" + u.uid), onReq, () => {}));
  sUnsubs.push(onValue(ref(dbSocial, "invites/" + u.uid), onInv, () => {}));
  renderProfile(); renderFriends();
}
function teardownSocial() {
  sUnsubs.forEach(f => { try { f(); } catch (e) {} }); sUnsubs = [];
  friendsMap.forEach(f => { if (f.unsub) f.unsub(); }); friendsMap.clear(); reqIn.clear(); invIn = new Map(); sentInv.clear();
  me = null; lastStatus = "";
  renderInvites();
}
function curStatus() { return NET.inGame || solo ? "playing" : joined ? "lobby" : "online"; }
function updateStatus() {
  if (!me) return;
  const s = curStatus(); if (s === lastStatus) return;
  lastStatus = s;
  set(ref(dbSocial, "users/" + me.uid + "/status"), s).catch(() => { lastStatus = ""; });
}

// ---- вход / регистрация / выход
function profMsg(text, isErr) {
  const e = $("prof-err");
  if (e) { e.textContent = text || ""; e.style.color = isErr ? "" : "#9ad59a"; }
  else if (text) toast(text);
  if (!text) { const g = $("google-err"); if (g) g.textContent = ""; }
}
let profBusy = false;
async function guardProf(fn) {
  if (profBusy) return; profBusy = true; profMsg("");
  document.querySelectorAll("#p-prof button").forEach(b => b.disabled = true);
  try { await fn(); } catch (e) { console.error(e); welcomePending = false; profMsg(errText(e), true); }
  profBusy = false; document.querySelectorAll("#p-prof button").forEach(b => b.disabled = false);
}
function setProfMode(m) {
  profMode = m;
  ["login", "reg"].forEach(x => { const b = $("prof-tab-" + x); if (b) b.classList.toggle("on", x === m); });
  showEl("prof-nick-wrap", m === "reg");
  setText("btn-prof-submit", t(m === "reg" ? "prof.signup" : "prof.login"));
}
async function doLogin() {
  const email = ($("prof-email") || {}).value.trim(), pass = ($("prof-pass") || {}).value || "";
  if (!email || !pass) throw new Error("prof.fill");
  welcomePending = true;
  await signInWithEmailAndPassword(authSocial, email, pass);
}
async function doRegister() {
  const nick = cleanProfNick(($("prof-nick") || {}).value), email = ($("prof-email") || {}).value.trim(), pass = ($("prof-pass") || {}).value || "";
  if (!nick) throw new Error("prof.nick.err");
  if (!email || !pass) throw new Error("prof.fill");
  regNick = nick; welcomePending = true;
  try {
    const cred = await createUserWithEmailAndPassword(authSocial, email, pass);
    await ensureProfile(cred.user, nick);
  } finally { regNick = null; }
}
// Google: ошибку (локализованный текст + реальные code/message) показываем прямо под кнопкой #google-err.
let googleBusy = false;
function googleMsg(text) { const e = $("google-err"); if (e) e.textContent = text || ""; else if (text) profMsg(text, true); }
function googleErrText(e) {
  const c = (e && e.code) || "", m = (e && e.message) || String(e);
  const head = !c && /PERMISSION_DENIED/i.test(m) ? tp("err.google.profile") : errText(e);   // c === "auth/unauthorized-domain" → текст с location.hostname
  return head + "\n" + (c ? "code: " + c + "\n" : "") + "message: " + m;
}
async function doGoogle() {
  googleMsg("");
  if (!/^https?:$/.test(location.protocol)) {            // file://, capacitor:// и т. п.
    console.error("Google auth", new Error("page opened over " + location.protocol));
    googleMsg(tp("err.file") + "\nprotocol: " + location.protocol);
    return;
  }
  googleBusy = true; welcomePending = true;
  try {
    const cred = await signInWithPopup(authSocial, new GoogleAuthProvider());
    await ensureProfile(cred.user, null);                // если правила БД запретят users/<uid> — увидим это здесь
    if (!me) startSocial(cred.user);
  } catch (err) {
    welcomePending = false;
    console.error("Google auth", err);
    googleMsg(googleErrText(err));
  } finally { googleBusy = false; }
}
async function doLogout() {
  if (me) { try { await set(ref(dbSocial, "users/" + me.uid + "/status"), "offline"); } catch (e) {} }
  await signOut(authSocial);
  const p = $("prof-pass"); if (p) p.value = "";
  profMsg(t("prof.bye"), false);
}
async function saveNick() {
  if (!me) throw new Error("prof.needlogin");
  const nick = cleanProfNick(($("prof-nick2") || {}).value);
  if (!nick) throw new Error("prof.nick.err");
  await update(ref(dbSocial, "users/" + me.uid), { nick });
  profMsg(t("prof.nick.saved"), false);
}
function renderProfile() {
  showEl("prof-guest", !me); showEl("prof-user", !!me);
  setProfMode(profMode);
  if (!me) return;
  setText("prof-name", me.nick || t("prof.loading")); setText("prof-mail", me.email);   // почту видит только сам игрок
  const n2 = $("prof-nick2"); if (n2 && document.activeElement !== n2) n2.value = me.nick;
}
on("prof-tab-login", "click", () => { setProfMode("login"); profMsg(""); });
on("prof-tab-reg", "click", () => { setProfMode("reg"); profMsg(""); });
on("btn-prof-submit", "click", () => guardProf(() => profMode === "reg" ? doRegister() : doLogin()));
on("btn-google", "click", () => guardProf(doGoogle));
on("btn-logout", "click", () => guardProf(doLogout));
on("btn-nick-save", "click", () => guardProf(saveNick));
on("prof-pass", "keydown", e => { if (e.key === "Enter") { const b = $("btn-prof-submit"); if (b) b.click(); } });
on("btn-prof-close", "click", () => UI.back());

// ---- друзья
function friendMsg(text, isErr) { const e = $("fr-msg"); if (e) { e.textContent = text || ""; e.style.color = isErr ? "" : "#9ad59a"; } else if (text) toast(text); }
async function guardFr(fn) { friendMsg(""); try { await fn(); } catch (e) { console.error(e); friendMsg(errText(e), true); } }
const stOf = v => (v === "online" || v === "lobby" || v === "playing") ? v : "offline";

function onFriends(snap) {
  const ids = new Set(Object.keys(snap.val() || {}));
  for (const [id, f] of [...friendsMap]) if (!ids.has(id)) { if (f.unsub) f.unsub(); friendsMap.delete(id); }
  ids.forEach(id => {
    if (friendsMap.has(id)) return;
    const f = { nick: "…", status: "offline", unsub: null };
    friendsMap.set(id, f);
    f.unsub = onValue(ref(dbSocial, "users/" + id), s => {
      const v = s.val() || {}; f.nick = cleanProfNick(v.nick) || "?"; f.status = stOf(v.status); renderFriends();
    }, () => {});
  });
  renderFriends();
}
function onReq(snap) {
  const notify = reqLoaded, ids = Object.keys(snap.val() || {});
  for (const id of [...reqIn.keys()]) if (!ids.includes(id)) reqIn.delete(id);
  ids.forEach(async id => {
    if (reqIn.has(id)) return;
    reqIn.set(id, "…");
    try {
      const s = await get(ref(dbSocial, "users/" + id)), v = s.val() || {}, nick = cleanProfNick(v.nick) || "?";
      if (!reqIn.has(id)) return;
      reqIn.set(id, nick);
      if (notify) toast(t("fr.newreq", { nick }));
    } catch (e) {}
    renderFriends();
  });
  reqLoaded = true; renderFriends();
}
function mkBtn(label, fn, cls) { const b = document.createElement("button"); b.type = "button"; b.textContent = label; if (cls) b.className = cls; b.onclick = fn; return b; }
function renderFriends() {
  showEl("fr-login-note", !me); showEl("fr-body", !!me);
  if (!me) return;
  const rl = $("fr-req-list");
  if (rl) {
    rl.textContent = "";
    if (!reqIn.size) { const li = document.createElement("li"); li.className = "empty"; li.textContent = t("fr.requests.none"); rl.appendChild(li); }
    reqIn.forEach((nick, id) => {
      const li = document.createElement("li"), sp = document.createElement("span"); sp.className = "fr-n"; sp.textContent = nick;
      li.append(sp, mkBtn(t("fr.accept"), () => guardFr(() => acceptRequest(id)), "primary"), mkBtn(t("fr.decline"), () => guardFr(() => declineRequest(id)), "ghost"));
      rl.appendChild(li);
    });
  }
  const fl = $("fr-list");
  if (fl) {
    fl.textContent = "";
    if (!friendsMap.size) { const li = document.createElement("li"); li.className = "empty"; li.textContent = t("fr.list.none"); fl.appendChild(li); }
    const order = { online: 0, lobby: 1, playing: 2, offline: 3 };
    [...friendsMap].sort((a, b) => order[a[1].status] - order[b[1].status] || a[1].nick.localeCompare(b[1].nick)).forEach(([id, f]) => {
      const li = document.createElement("li"), sp = document.createElement("span"); sp.className = "fr-n"; sp.textContent = f.nick;
      const st = document.createElement("span"); st.className = "fr-st st-" + f.status; st.textContent = t("status." + f.status);
      li.append(sp, st, mkBtn(t("fr.invite"), () => guardFr(() => inviteFriend(id)), "primary"), mkBtn(t("fr.remove"), () => guardFr(() => removeFriend(id, f.nick)), "ghost"));
      fl.appendChild(li);
    });
  }
}
async function searchFriend() {
  if (!me) throw new Error("fr.login");
  const nick = cleanProfNick(($("fr-search") || {}).value), box = $("fr-result");
  if (box) box.textContent = "";
  if (!nick) return;
  const s = await get(query(ref(dbSocial, "users"), orderByChild("nick"), equalTo(nick))), res = [];
  s.forEach(c => { res.push([c.key, c.val()]); });
  const hit = res.find(([id]) => id !== me.uid);
  if (!hit) { friendMsg(t(res.length ? "fr.self" : "fr.notfound"), true); return; }
  const [id, v] = hit, name = cleanProfNick(v && v.nick) || nick;
  if (friendsMap.has(id)) { friendMsg(t("fr.already"), true); return; }
  if (!box) { await addFriend(id); return; }
  const row = document.createElement("div"), sp = document.createElement("span"); sp.className = "fr-n"; sp.textContent = name;
  row.append(sp, mkBtn(t("fr.send"), () => guardFr(() => addFriend(id)), "primary")); box.appendChild(row);
}
async function addFriend(id) {
  if (!me) throw new Error("fr.login");
  if (reqIn.has(id)) { await acceptRequest(id); return; }              // он уже звал нас — просто принимаем
  try { const ex = await get(ref(dbSocial, `friendRequests/${id}/${me.uid}`)); if (ex.exists()) { friendMsg(t("fr.pending"), true); return; } } catch (e) {}
  await set(ref(dbSocial, `friendRequests/${id}/${me.uid}`), true);
  friendMsg(t("fr.sent"), false);
}
async function acceptRequest(from) {
  if (!me) throw new Error("fr.login");
  await update(ref(dbSocial), {                                         // ровно один update() с тремя путями
    [`friends/${me.uid}/${from}`]: true, [`friends/${from}/${me.uid}`]: true, [`friendRequests/${me.uid}/${from}`]: null
  });
}
async function declineRequest(from) { if (me) await remove(ref(dbSocial, `friendRequests/${me.uid}/${from}`)); }
async function removeFriend(id, nick) {
  if (!me || !confirm(t("fr.remove.q", { nick }))) return;
  await update(ref(dbSocial), { [`friends/${me.uid}/${id}`]: null, [`friends/${id}/${me.uid}`]: null });
}
on("btn-fr-search", "click", () => guardFr(searchFriend));
on("fr-search", "keydown", e => { if (e.key === "Enter") guardFr(searchFriend); });
on("btn-fr-close", "click", () => UI.back());
on("btn-fr-login", "click", () => UI.open("prof"));

// ---- приглашения
async function inviteFriend(fid) {
  if (!me) throw new Error("fr.login");
  if (!joined || !NET.room) { friendMsg(t("fr.invite.nolobby"), true); return; }
  await set(ref(dbSocial, `invites/${fid}/${me.uid}`), { code: NET.room, nick: (me.nick || NET.nick || "?").slice(0, 20) });
  sentInv.add(fid);
  friendMsg(t("fr.invite.sent"), false);
}
function clearSentInvites() {
  if (me) sentInv.forEach(f => remove(ref(dbSocial, `invites/${f}/${me.uid}`)).catch(() => {}));
  sentInv.clear();
}
function onInv(snap) {
  const v = snap.val() || {}; invIn = new Map();
  for (const from in v) {
    const x = v[from];
    if (x && typeof x.code === "string" && /^[A-Za-z0-9]{3,10}$/.test(x.code)) invIn.set(from, { code: x.code.toUpperCase(), nick: cleanProfNick(x.nick) || "?" });
  }
  renderInvites();
}
function invBox() {
  let b = $("inv-box");
  if (!b) {
    b = document.createElement("div"); b.id = "inv-box";
    b.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);top:calc(64px + env(safe-area-inset-top,0px));z-index:35;display:flex;flex-direction:column;gap:8px;width:min(92vw,460px)";
    document.body.appendChild(b);
  }
  return b;
}
function renderInvites() {
  const b = invBox(); b.textContent = "";
  invIn.forEach((x, from) => {
    const d = document.createElement("div"); d.className = "inv-toast";
    d.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;background:rgba(10,4,4,.94);border:1px solid #8b0f0f;border-radius:4px;color:#e8dcd8;font:15px MonoFont,monospace;box-shadow:0 0 18px rgba(139,15,15,.45)";
    const sp = document.createElement("span"); sp.className = "inv-t"; sp.style.cssText = "flex:1;min-width:140px"; sp.textContent = t("invite.text", { nick: x.nick });
    const ok = mkBtn(t("invite.join"), () => acceptInvite(from, x.code), "primary"), no = mkBtn(t("invite.decline"), () => removeInvite(from), "ghost");
    for (const bt of [ok, no]) bt.style.cssText = "height:36px;padding:0 12px;background:#140808;color:#e8dcd8;border:1px solid #8b0f0f;border-radius:4px;font:14px MonoFont,monospace;cursor:pointer;touch-action:manipulation";
    d.append(sp, ok, no); b.appendChild(d);
  });
}
function removeInvite(from) {
  invIn.delete(from); renderInvites();
  if (me) remove(ref(dbSocial, `invites/${me.uid}/${from}`)).catch(() => {});
}
async function acceptInvite(from, code) {
  removeInvite(from);                                                   // после принятия и отказа приглашение удаляем
  try {
    if (joined) await NET.leave();
    const nk = ($("nick") || {}).value || (me && me.nick) || "";
    await NET.join(nk, code);
  } catch (e) { toast(e && e.message === "net.err.notfound" ? t("invite.expired") : errText(e)); }
}

// ================================================================ интерфейс лобби (DOM)
function renderLobby() {
  if (!joined || !$("p-lobby")) return;
  const m = NET.meta || { max: 4, mode: "normal", host: "" };
  const list = [...roster.values()].sort((a, b) => a.j - b.j || (a.id < b.id ? -1 : 1));
  setText("lb-code", NET.room || "");
  setText("lb-count", t("lobby.players", { n: list.length, max: m.max }));
  const ul = $("lb-players"); if (ul) {
    ul.textContent = "";
    list.forEach(p => {
      const li = document.createElement("li");
      li.textContent = p.n + (p.id === m.host ? "  " + t("lobby.host") : "") + (p.id === myId ? "  " + t("lobby.you") : "");
      ul.appendChild(li);
    });
  }
  const sm = $("lb-max"), sd = $("lb-diff"), ss = $("lb-speed"), md = metaDiff(m);
  if (sm) { sm.value = String(m.max); sm.disabled = !NET.host; [...sm.options].forEach(o => { o.disabled = +o.value < list.length; }); }
  if (sd) { sd.value = md.diff; sd.disabled = !NET.host; [...sd.options].forEach(o => { o.textContent = t("diff." + o.value); }); }
  if (ss) { ss.value = md.speed ? "1" : "0"; ss.disabled = !NET.host; [...ss.options].forEach(o => { o.textContent = t(o.value === "1" ? "diff.on" : "diff.off"); }); }
  showEl("btn-start", NET.host); showEl("lb-wait", !NET.host);
  const sc = $("lb-cond"), mc = metaCond(m), cl = (window.WN && WN.conds) ? WN.conds() : [], cm = cl.find(c => c.id === mc);   // условия катки: список из WN.conds() (MODES с mp:true)
  if (sc && cl.length) {
    if (sc.options.length !== cl.length) { sc.textContent = ""; cl.forEach(c => { const o = document.createElement("option"); o.value = c.id; sc.appendChild(o); }); }
    [...sc.options].forEach((o, i) => { o.textContent = t(cl[i].nameKey); });
    sc.value = cm ? mc : "normal"; sc.disabled = !NET.host;
  }
  setText("lb-desc", t("diff." + md.diff + ".d")   // описание берётся по сложности (ключи diff.<имя>.d в lang.js)
    + (md.speed ? " " + t("mode.speed.d") : "")
    + (cm && cm.id !== "normal" ? " " + t(cm.descKey) : ""));
  setText("lb-vis", NET.host ? t(pubWanted ? "vis.open" : "vis.private") : "");
}

// ---- панели оверлея #ui: mp / lobby / prof / fr
const PANELS = ["mp", "lobby", "prof", "fr"];
let curPanel = null, prevPanel = null;
function showPanel(name) {
  const u = $("ui"); if (u) u.style.display = "flex";
  window.UIOPEN = true;
  PANELS.forEach(n => { const e = $("p-" + n); if (e) e.style.display = n === name ? "block" : "none"; });
  curPanel = name;
}
window.UI = {
  open(name) {
    if (name === "prof" || name === "fr") {                              // поверх меню/лобби/игры: игру не роняем
      if (curPanel !== "prof" && curPanel !== "fr") prevPanel = curPanel;
      if (window.WN && WN.holdGame) WN.holdGame();
      showPanel(name); if (window.WN && WN.releaseKeys) WN.releaseKeys();
      if (name === "prof") { renderProfile(); profMsg(""); } else { renderFriends(); friendMsg(""); }
      return;
    }
    prevPanel = null;
    showPanel(name);
    WN.releaseKeys();
    if (name === "lobby") { WN.scene("lobby"); renderLobby(); }
    else { WN.scene("menu"); setText("mp-err", ""); renderPublic(); }
  },
  back() {                                                               // закрыть профиль/друзей и вернуться туда, откуда открыли
    if (curPanel !== "prof" && curPanel !== "fr") return;
    const p = prevPanel; prevPanel = null;
    if (p) showPanel(p); else this.close();
  },
  close() { const u = $("ui"); if (u) u.style.display = "none"; window.UIOPEN = false; curPanel = null; prevPanel = null; },
  toast: s => WN.toast(s)
};
for (const [id, name] of [["btn-prof", "prof"], ["btn-fr", "fr"]]) {
  const b = $(id);
  if (b) {
    b.addEventListener("mousedown", e => e.preventDefault());
    b.addEventListener("pointerdown", e => e.stopPropagation());
    b.addEventListener("click", e => { e.stopPropagation(); if (curPanel === name) UI.back(); else UI.open(name); b.blur(); });
  }
}

let busy = false;
async function run(fn) {
  if (busy) return; busy = true; setText("mp-err", "");
  document.querySelectorAll("#p-mp button").forEach(b => b.disabled = true);
  try { await fn(); }
  catch (e) { setText("mp-err", errText(e)); console.error(e); }
  busy = false; document.querySelectorAll("#p-mp button").forEach(b => { b.disabled = false; });
  renderPublic();
}
on("btn-create", "click", () => {                       // «Создать лобби» → экран сложности (canvas) → создание с выбранной сложностью
  if (busy) return;
  const nick = ($("nick") || {}).value, vis = ($("mp-vis") || {}).value || "private";
  if (!window.WN || !WN.pickDiff) { run(() => NET.create(nick, vis, "normal", false)); return; }
  WN.pickDiff({
    pick: (diff, speed, cond) => { UI.open("mp"); run(() => NET.create(nick, vis, diff, speed, cond)); },
    back: () => UI.open("mp")
  });
});
on("btn-join", "click", () => run(() => NET.join(($("nick") || {}).value, ($("code-in") || {}).value)));
on("code-in", "keydown", e => { if (e.key === "Enter") { const b = $("btn-join"); if (b) b.click(); } });
on("btn-mp-back", "click", () => WN.toMenu());
on("btn-leave", "click", async () => { await NET.leave(); WN.toMenu(); });
on("btn-start", "click", () => NET.start().catch(e => toast(t("net.err.start", { e: errText(e) }))));
on("lb-max", "change", e => {
  if (!NET.host) return;
  const v = +e.target.value;
  if (v < roster.size) { toast(t("net.err.max")); renderLobby(); return; }
  update(metaRef, { max: v }).catch(() => {});
});
function setLobbyDiff(diff, speed) { update(metaRef, { diff, speed, mode: legacyMode(diff, speed) }).catch(() => {}); }
on("lb-diff", "change", e => { if (NET.host) setLobbyDiff(e.target.value, metaDiff(NET.meta).speed); });
on("lb-speed", "change", e => { if (NET.host) setLobbyDiff(metaDiff(NET.meta).diff, e.target.value === "1"); });
on("lb-cond", "change", e => { if (NET.host) update(metaRef, { cond: metaCond({ cond: e.target.value }) }).catch(() => {}); });   // хост выбирает условия — значение в мете лобби
on("btn-copy", "click", async () => {
  const txt = NET.room || "";
  try { await navigator.clipboard.writeText(txt); }
  catch (e) { const i = document.createElement("input"); i.value = txt; document.body.appendChild(i); i.select(); try { document.execCommand("copy"); } catch (_) {} i.remove(); }
  const b = $("btn-copy"); if (b) { b.textContent = t("lobby.copied"); setTimeout(() => { b.textContent = t("lobby.copy"); }, 1500); }
});

// смена языка: перерисовать всё, что строится из JS
addEventListener("langchange", () => {
  renderLobby(); renderProfile(); renderFriends(); renderPublic(); renderInvites(); renderChatUI();
});
renderProfile(); renderFriends(); renderChatUI(); renderInvites();
