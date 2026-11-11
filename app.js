// Boyfriend Tax: bills every hour they game and flies a tiny plane toward your trip.
// Plain JavaScript, no build step. Everything is saved in this browser's localStorage.
"use strict";

const KEY = "boyfriend-tax:v1";
const DEMO = new URLSearchParams(location.search).has("demo");
const WHO = ["boyfriend", "girlfriend", "partner", "husband", "wife", "roommate"];
const VIEWS = ["playtime", "penalties", "trip", "receipts"];

const DEFAULTS = {
  label: "boyfriend", name: "", game: "GTA VI", place: "Vice City",
  rate: 20, cur: "$", dest: "Japan", city: "Tokyo", home: "Home",
  otAfter: 0, otX: 1.5, interest: 15, lateFee: 50, email: "", from: "",
  items: [["Flight, 1 seat", 840], ["Hotel, 7 nights", 520], ["Ramen, matcha", 140]],
};

const blank = () => ({
  installed: false, settings: { ...DEFAULTS, items: DEFAULTS.items.map(i => [...i]) },
  live: null, entries: [], fundedSeen: false,
});

let S;                    // the whole app state (set at the bottom, once everything is defined)
let flash = null;         // { text, undo }: the toast at the bottom
let filter = "all";       // receipts filter: all | session | penalty

function load() {
  try {
    const r = JSON.parse(localStorage.getItem(KEY));
    if (r && r.settings && Array.isArray(r.entries)) return normalize(r);
  } catch (e) { /* storage blocked or corrupt: start fresh */ }
  return blank();
}
function normalize(r) {
  const b = blank();
  const s = { ...DEFAULTS, ...r.settings };
  delete s.pronoun; delete s.counts;   // older versions
  if (!Array.isArray(s.items) || !s.items.length) s.items = b.settings.items;
  const entries = r.entries.filter(e => e && typeof e.amount === "number" && e.kind !== "payment");
  return { ...b, ...r, settings: s, entries };
}
function save() {
  if (DEMO) return;
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { say("Couldn't save in this browser. Use Backup & more → Export backup to keep your data."); }
}

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const r2 = v => Math.round(v * 100) / 100;
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
function money(v, cents = true) {
  return S.settings.cur + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
}
const bigMoney = v => money(v, Math.abs(v) < 100 && Math.round(v * 100) % 100 !== 0);
const round$ = v => money(v, v % 1 !== 0);
const dur = m => { if (m < 1) return Math.round(m * 60) + "s"; m = Math.round(m); return Math.floor(m / 60) + "h " + String(m % 60).padStart(2, "0") + "m"; };
const hm = h => Math.floor(h) + "h " + String(Math.floor(h * 60) % 60).padStart(2, "0") + "m";
const clk = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return [s / 3600, s % 3600 / 60, s % 60].map(v => String(Math.floor(v)).padStart(2, "0")).join(":"); };
const when = ts => new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const isPenalty = e => e.kind !== "session";

// Everything says their name (or "your girlfriend", "your boyfriend"…), never he/she.
const who = () => S.settings.name || "Your " + (S.settings.label || "partner");      // starts a sentence
const whoMid = () => S.settings.name || "your " + (S.settings.label || "partner");   // inside a sentence
const whoTag = () => S.settings.name || cap1(S.settings.label || "partner");         // short labels: "ALEX OWES"
const appName = () => cap1(S.settings.label || "partner") + " Tax";
const logo = () => ({ boyfriend: "bf", girlfriend: "gf" }[S.settings.label] || S.settings.label || "partner") + " tax.";
const winTitle = () => `${appName()} — ${S.settings.dest || "Trip"} Fund${DEMO ? " (demo, nothing is saved)" : ""}`;

// ---------- money ----------
function sessionCost(mins) {
  const s = S.settings, h = mins / 60, ot = +s.otAfter || 0;
  if (!ot || h <= ot) return r2(h * s.rate);
  return r2(ot * s.rate + (h - ot) * s.rate * (+s.otX || 1));
}
const liveMins = () => S.live ? (Date.now() - S.live.start) / 60000 : 0;
const isOvertime = mins => (+S.settings.otAfter || 0) > 0 && mins / 60 > +S.settings.otAfter;

// One number: every hour plus every penalty goes into the fund. The fund is what they owe, and it moves the plane.
function totals() {
  let fund = 0, mins = 0, sessions = 0;
  for (const e of S.entries) {
    fund += e.amount;
    if (e.kind === "session") { mins += e.mins || 0; sessions += e.amount; }
  }
  const lm = liveMins(), lc = S.live ? sessionCost(lm) : 0;
  fund += lc; sessions += lc; mins += lm;
  const trip = S.settings.items.reduce((a, i) => a + (+i[1] || 0), 0);
  return { fund, sessions, fees: fund - sessions, hours: mins / 60, liveCost: lc, liveMins: lm, trip,
    pct: trip ? Math.min(1, fund / trip) : 0 };
}

function add(e) {
  const entry = { id: uid(), ts: Date.now(), ...e, amount: r2(e.amount) };
  S.entries.push(entry);
  S.entries.sort((a, b) => a.ts - b.ts);
  save(); render(); checkFunded();
  return entry;
}

// ---------- actions ----------
const ACTIONS = {
  toggle() {
    if (!S.live) {
      S.live = { start: Date.now() }; save(); render();
      say(`Timer on. Press stop when ${whoMid()} puts the controller down.`);
      return;
    }
    const mins = liveMins(), start = S.live.start, cost = sessionCost(mins);
    S.live = null; save();
    if (cost < 0.01) { render(); say("That was too short to bill."); return; }
    add({ kind: "session", label: "Gaming session" + (isOvertime(mins) ? " (overtime)" : ""), mins, amount: cost, ts: start });
    receipt(mins, cost);
  },

  log() {
    const today = new Date().toISOString().slice(0, 10);
    dialog({
      title: "Add hours you forgot to time",
      body: `<div class="f"><label>Day</label><input name="d" type="date" value="${today}" max="${today}">
        <div class="row"><div><label>Hours</label><input name="h" inputmode="decimal" value="2"></div>
        <div><label>Minutes</label><input name="m" inputmode="numeric" value="0"></div></div>
        <p class="hint">Billed at ${round$(S.settings.rate)} an hour${+S.settings.otAfter ? `, overtime ×${S.settings.otX} after ${S.settings.otAfter}h` : ""}.</p></div>`,
      buttons: [{ label: "Cancel" }, { label: "Add hours", def: true, action(f) {
        const h = num(f, "h", 0), m = num(f, "m", 0);
        if (h === null || m === null) return false;
        const mins = h * 60 + m;
        if (mins <= 0) return bad(f, "h");
        // starts at 8pm that day, but never ends in the future
        const d = f.elements.d.value ? new Date(f.elements.d.value + "T20:00") : new Date();
        const ts = Math.min(d.getTime(), Date.now() - mins * 60000), cost = sessionCost(mins);
        add({ kind: "session", label: "Gaming session" + (isOvertime(mins) ? " (overtime)" : ""), mins, amount: cost, ts });
        say(`Added ${dur(mins)}: +${money(cost)}.`);
      } }],
    });
  },

  interest() {
    const t = totals(), pct = +S.settings.interest || 0, amt = r2(t.fund * pct / 100);
    if (amt <= 0) {
      alertBox("warn", "Nothing to charge interest on yet.", `Interest is ${pct}% of what ${esc(whoMid())} owes, so it needs some playtime first.`);
      return;
    }
    const yes = { label: "Yes", action: () => { add({ kind: "interest", label: "“One more mission”", note: pct + "% interest", amount: amt }); say(`Interest added: +${money(amt)}.`); } };
    dialog({
      title: "Alert", icon: "warn",
      body: `“One more mission?”<p>+${pct}% interest on ${money(t.fund)} = <b style="color:var(--red)">+${money(amt)}</b></p>`,
      buttons: [yes, { ...yes, def: true }],
    });
  },

  late() {
    dialog({
      title: "Missed plan",
      body: `<div class="f"><label>What did ${esc(whoMid())} miss?</label><input name="p" value="dinner" maxlength="40">
        <label>Late fee</label><input name="a" inputmode="decimal" value="${S.settings.lateFee}"></div>`,
      buttons: [{ label: "Cancel" }, { label: "Charge late fee", def: true, action(f) {
        const a = num(f, "a"); if (a === null || a <= 0) return bad(f, "a");
        add({ kind: "late", label: "Missed plan: " + (f.elements.p.value.trim() || "a plan"), note: "late fee", amount: a });
        say(`Late fee added: +${money(a)}.`);
      } }],
    });
  },

  mental() {
    const s = S.settings;
    dialog({
      title: `Form 40 — ${appName().replace(" Tax", "")} Income Tax`,
      body: `<div class="form"><div><span>Physically present</span><b>YES</b></div><div><span>Mentally present</span><b>NO</b></div>
        <div><span>Location of mind</span><b>${esc(s.place)}</b></div><div><span>Amount taxable</span><b id="taxAmt">ALL OF IT</b></div></div>
        <div class="f"><div class="row"><div><label>For how long? Hours</label><input name="h" inputmode="decimal" value="0"></div>
        <div><label>Minutes</label><input name="m" inputmode="numeric" value="30"></div></div>
        <p class="hint">Taxed at the full rate, ${round$(s.rate)} an hour. Being in the room doesn't count as being in the room.</p></div>`,
      buttons: [{ label: "Cancel" }, { label: "File it", def: true, action(f) {
        const h = num(f, "h", 0), m = num(f, "m", 0); if (h === null || m === null) return false;
        const mins = h * 60 + m; if (mins <= 0) return bad(f, "m");
        const amt = mins / 60 * s.rate;
        add({ kind: "mental", label: "Present, mentally in " + s.place, note: "tax", mins, amount: amt });
        say(`Taxed: +${money(amt)}.`);
      } }],
      onOpen(f) {
        const upd = () => { const h = parseFloat(f.elements.h.value) || 0, m = parseFloat(f.elements.m.value) || 0;
          f.querySelector("#taxAmt").textContent = money((h * 60 + m) / 60 * s.rate); };
        f.addEventListener("input", upd); upd();
      },
    });
  },

  custom() {
    dialog({
      title: "Something else",
      body: `<div class="f"><label>What for?</label><input name="l" placeholder="Rage-quit, threw the controller" maxlength="50">
        <label>Amount</label><input name="a" inputmode="decimal" placeholder="25"></div>`,
      buttons: [{ label: "Cancel" }, { label: "Add penalty", def: true, action(f) {
        const l = f.elements.l.value.trim(); if (!l) return bad(f, "l");
        const a = num(f, "a"); if (a === null || a <= 0) return bad(f, "a");
        add({ kind: "custom", label: l, amount: a });
        say(`Added: +${money(a)}.`);
      } }],
    });
  },

  invoice() {
    const t = totals(), s = S.settings, text = invoiceText();
    const subject = `Invoice: ${appName()}, ${money(t.fund)} due`;
    const canText = !!navigator.share && matchMedia("(pointer:coarse)").matches;
    const clean = v => v.trim().replace(/[^\w.@+'-]/g, "");
    const addr = f => clean(f.elements.email.value), from = f => clean(f.elements.from.value);
    const keep = f => { const a = addr(f), m = from(f); if (a !== s.email || m !== s.from) { s.email = a; s.from = m; save(); } return a; };
    const to = a => a ? `, addressed to <b>${esc(a)}</b>` : "";
    const sent = how => setTimeout(() => alertBox("warn", `Invoice sent to ${whoMid()}.`,
      `Total due: ${money(t.fund)}. ${esc(who())} has been notified during a mission.<br><span class="fine">${how}</span>`), 0);
    dialog({
      title: "Send invoice",
      body: `<div class="paper mini"><b class="plogo">${esc(logo())}</b><div class="pt">INVOICE</div><div class="ps">Billed to ${esc(whoTag())}</div>
        <hr><div class="kv"><span>Playtime (${hm(t.hours)})</span><span>${money(t.sessions)}</span></div>
        <div class="kv"><span>Penalties</span><span>${money(t.fees)}</span></div>
        <hr><div class="kv total"><span>TOTAL DUE</span><span>${money(t.fund)}</span></div>
        <div class="kv"><span>✈ ${esc(s.dest)} fund</span><span>${Math.floor(t.pct * 100)}% there</span></div></div>
        <div class="f sendto"><label>Send to: ${esc(whoTag())}'s email</label>
        <input name="email" type="email" value="${esc(s.email)}" placeholder="them@email.com" autocomplete="off" autocapitalize="off" spellcheck="false">
        <p class="hint">"Email it" opens your email app with every line written out. It sends from that app's main account. Nothing is sent from this site.</p></div>
        <details class="f gm"${s.from ? " open" : ""}><summary>Use Gmail instead</summary>
        <label>Your Gmail, so it opens the right account</label>
        <input name="from" type="email" value="${esc(s.from || "")}" placeholder="you@gmail.com" autocomplete="email" autocapitalize="off" spellcheck="false">
        <a class="pill" id="gmail" target="_blank" rel="noopener">Open in Gmail →</a></details>`,
      onOpen(f) {
        const g = f.querySelector("#gmail");
        const upd = () => { g.href = "https://mail.google.com/mail/?" + (from(f) ? "authuser=" + encodeURIComponent(from(f)) + "&" : "") +
          "view=cm&fs=1&to=" + encodeURIComponent(addr(f)) +
          "&su=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(text); };
        f.elements.email.addEventListener("input", upd); f.elements.from.addEventListener("input", upd); upd();
        g.addEventListener("click", () => { const a = keep(f); setTimeout(() => { $$(".overlay").forEach(o => o.remove());
          sent(`It opened in Gmail${from(f) ? ` as <b>${esc(from(f))}</b>` : ""}${to(a)}. Hit send.`); }, 0); });
      },
      buttons: [
        { label: "Copy", async action(f) { keep(f);
          try { await navigator.clipboard.writeText(text); sent(`It's on your clipboard. Paste it to ${esc(whoMid())} anywhere.`); }
          catch (e) { alertBox("warn", "Copy this invoice", `<textarea readonly style="width:100%;height:160px;margin-top:8px;font:12px var(--mono)">${esc(text)}</textarea>`); } } },
        ...(canText ? [{ label: "Text it", async action(f) { keep(f);
          try { await navigator.share({ text }); sent("Shared."); } catch (e) { /* closed the share sheet */ } } }] : []),
        { label: "Email it", def: true, action(f) {
          const a = keep(f);
          if (a && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a)) return bad(f, "email");
          location.href = `mailto:${a}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
          sent(`It opened in your email app${to(a)}. Check the From line, then hit send.`);
        } },
      ],
    });
  },

  remove(id) {
    const e = S.entries.find(x => x.id === id); if (!e) return;
    S.entries = S.entries.filter(x => x.id !== id);
    save(); render(); checkFunded();
    say(`Removed ${e.label}.`, () => { S.entries.push(e); S.entries.sort((a, b) => a.ts - b.ts); save(); render(); checkFunded(); });
  },

  settings() { settingsDialog(false, matchMedia("(pointer:coarse)").matches ? null : "name"); },   // no surprise keyboard on phones
  editWho() { settingsDialog(false, "name"); },
  editFund() { settingsDialog(false, "dest"); },

  more() {
    const d = dialog({
      title: "Backup & more",
      body: `<div class="list">
        <button type="button" class="pill" data-m="exportData">Export backup</button>
        <button type="button" class="pill" data-m="importData">Import backup</button>
        <button type="button" class="pill" data-m="demo">${DEMO ? "Leave the demo" : "Try the demo (nothing saved)"}</button>
        <button type="button" class="pill" data-m="reset">Start over…</button>
        <button type="button" class="pill" data-m="about">About</button></div>`,
      buttons: [{ label: "Close", def: true }],
    });
    d.el.querySelectorAll("[data-m]").forEach(b => { b.onclick = () => { d.close(); ACTIONS[b.dataset.m](); }; });
  },

  exportData() {
    const blob = new Blob([JSON.stringify({ app: "boyfriend-tax", version: 1, exported: new Date().toISOString(), ...S }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `boyfriend-tax-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    say("Backup exported.");
  },

  importData() {
    if (DEMO) { say("Leave the demo first (Backup & more)."); return; }
    const inp = $("#file");
    inp.value = "";
    inp.onchange = async () => {
      const file = inp.files[0]; if (!file) return;
      try {
        const r = JSON.parse(await file.text());
        if (!r || !r.settings || !Array.isArray(r.entries)) throw new Error("not a backup");
        S = normalize(r); S.installed = true; save(); render(); say(`Backup imported: ${S.entries.length} items.`);
      } catch (e) { alertBox("warn", "That file isn't a backup from this app.", "Make one with Backup & more → Export backup."); }
    };
    inp.click();
  },

  demo() { location.href = location.pathname + (DEMO ? "" : "?demo=1"); },

  reset() {
    if (DEMO) { location.href = location.pathname; return; }
    dialog({
      title: "Start over", icon: "warn",
      body: `Erase everything?<p>All sessions, penalties and settings in this browser will be deleted. Export a backup first if you want to keep them.</p>`,
      buttons: [{ label: "Cancel", def: true }, { label: "Erase", action() { S = blank(); save(); render(); setup(); } }],
    });
  },

  about() {
    alertBox("plane", `${appName()} 1.0`,
      `Turns their screen time into your flight time.<br>Free and open source (MIT). Your data stays in this browser; nothing is sent anywhere.`);
  },
};

// the invoice, written out as plain text for email, texts and the clipboard
function invoiceText() {
  const t = totals(), s = S.settings, es = S.entries, shown = es.slice(-40);
  const L = [`INVOICE: ${appName()}`, `Billed to: ${whoTag()}`,
    `Issued: ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`, ""];
  if (es.length > shown.length) L.push(`(${es.length - shown.length} earlier items not shown)`);
  shown.forEach(e => L.push(`${when(e.ts)}: ${isPenalty(e) ? e.label : `${dur(e.mins || 0)} of ${s.game}`}  +${money(e.amount)}`));
  if (S.live) L.push(`Right now: playing, ${dur(t.liveMins)} so far  +${money(t.liveCost)}`);
  if (!es.length && !S.live) L.push("Nothing billed yet.");
  L.push("", `Playtime: ${hm(t.hours)} × ${round$(s.rate)}/hr = ${money(t.sessions)}`);
  if (t.fees > 0.004) L.push(`Penalties: ${money(t.fees)}`);
  L.push(`TOTAL DUE: ${money(t.fund)}`, "", `Payable to: the ${s.dest} Fund ✈ (${Math.floor(t.pct * 100)}% of the way there)`);
  return L.join("\n");
}

// the receipt that stays on screen when a session ends
function receipt(mins, cost) {
  const t = totals(), s = S.settings;
  dialog({
    title: "Session over",
    body: `<div class="paper mini"><b class="plogo">${esc(logo())}</b><div class="pt">SESSION RECEIPT</div>
      <hr><div class="kv"><span>${esc(s.game)}</span><span>${dur(mins)}</span></div>
      <div class="kv"><span>× ${round$(s.rate)} an hour</span><span>+${money(cost)}</span></div>
      <hr><div class="kv total"><span>${esc(whoTag().toUpperCase())} OWES</span><span>${money(t.fund)}</span></div>
      <div class="kv"><span>✈ ${esc(s.dest)}</span><span>${Math.floor(t.pct * 100)}% there</span></div></div>`,
    buttons: [{ label: "Send invoice", action: () => { setTimeout(() => ACTIONS.invoice(), 0); } }, { label: "Done", def: true }],
  });
}

// ---------- dialogs ----------
const ICONS = {
  warn: `<svg viewBox="0 0 48 48"><defs><linearGradient id="gw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#f2a900"/></linearGradient></defs><path d="M24 4 45 42H3z" fill="url(#gw)" stroke="#c98a00" stroke-width="1.5" stroke-linejoin="round"/><path d="M22 17h4l-.7 13h-2.6zM22 33h4v4h-4z" fill="#3a2a00"/></svg>`,
  plane: `<svg viewBox="0 0 24 24" style="color:var(--blue)"><use href="#i-trip"/></svg>`,
  heart: `<svg viewBox="0 0 48 48"><defs><linearGradient id="gh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9aa8"/><stop offset="1" stop-color="#e5304d"/></linearGradient></defs><path d="M24 42S5 30 5 17a9.5 9.5 0 0 1 19-3 9.5 9.5 0 0 1 19 3c0 13-19 25-19 25z" fill="url(#gh)"/></svg>`,
};

function dialog({ title, icon, body, buttons, wide, lock, onOpen, cls }) {
  const ov = document.createElement("div");
  ov.className = "overlay";
  if (lock) ov.dataset.lock = "1";
  ov.innerHTML = `<form class="dlg${wide ? " wide" : ""}${cls ? " " + cls : ""}" novalidate role="dialog" aria-modal="true">
    <div class="titlebar"><span class="lights"><i${lock ? "" : ' data-close title="Close"'}></i><i></i><i></i></span><b>${esc(title || "")}</b></div>
    <div class="dbody">${icon ? `<div class="ico">${ICONS[icon]}</div>` : ""}<div class="dmain">${body}</div></div>
    <div class="btns">${buttons.map((b, i) => `<button type="${b.def ? "submit" : "button"}" class="${b.def ? "gel" : "pill"}" data-i="${i}">${esc(b.label)}</button>`).join("")}</div>
  </form>`;
  document.body.appendChild(ov);
  const f = ov.querySelector("form");
  const close = () => ov.remove();
  const run = i => { const b = buttons[i]; const r = b && b.action ? b.action(f) : undefined; if (r !== false) close(); };
  f.addEventListener("submit", e => { e.preventDefault(); run(buttons.findIndex(b => b.def)); });
  f.querySelectorAll(".btns button[type=button]").forEach(el => { el.onclick = () => run(+el.dataset.i); });
  const x = f.querySelector("[data-close]"); if (x) x.onclick = close;
  if (!lock) ov.addEventListener("mousedown", e => { if (e.target === ov) close(); });
  if (onOpen) onOpen(f);
  setTimeout(() => {
    const el = matchMedia("(pointer:coarse)").matches ? f.querySelector(".gel") : (f.querySelector("input:not([readonly]):not([type=hidden]),select") || f.querySelector(".gel"));
    if (el) el.focus({ preventScroll: true });
  }, 0);
  return { el: f, close };
}
function alertBox(icon, head, text) {
  return dialog({ icon, body: `${esc(head)}<p>${text}</p>`, buttons: [{ label: "OK", def: true }] });
}
function num(f, name, empty = null) {
  const el = f.elements[name], raw = el.value.trim().replace(/[^0-9.\-]/g, "");
  if (raw === "") { if (empty !== null) return empty; bad(f, name); return null; }
  const v = parseFloat(raw);
  if (!isFinite(v) || v < 0) { bad(f, name); return null; }
  el.classList.remove("bad");
  return v;
}
function bad(f, name) { const el = f.elements[name]; el.classList.add("bad"); el.focus(); return false; }

// ---------- first run: who → install → the deal ----------
const whoPicker = (label, name, head = true) => `
  ${head ? "<label>Who's paying the tax?</label>" : ""}
  <div class="who">${WHO.map(w => `<button type="button" data-w="${w}"${w === label ? ' class="on"' : ""}>${cap1(w)}</button>`).join("")}</div>
  <input type="hidden" name="label" value="${esc(label)}">
  <input name="other" value="${WHO.includes(label) ? "" : esc(label)}" maxlength="20" placeholder="Someone else? Type it" style="margin-top:8px" aria-label="Someone else">
  <label>Their name <span style="font-weight:400;color:var(--muted)">(optional)</span></label>
  <input name="name" value="${esc(name)}" maxlength="20" placeholder="Maya, Alex…">`;
function wireWho(f) {
  const pick = v => { f.elements.label.value = v; f.querySelectorAll("[data-w]").forEach(b => b.classList.toggle("on", b.dataset.w === v)); };
  f.querySelectorAll("[data-w]").forEach(b => { b.onclick = () => { f.elements.other.value = ""; pick(b.dataset.w); }; });
  f.elements.other.addEventListener("input", () => pick(f.elements.other.value.trim().toLowerCase() || "partner"));
}

function setup() {
  dialog({
    title: "Setup", lock: true,
    body: `<div class="f">${whoPicker(S.settings.label, S.settings.name)}</div>`,
    onOpen: wireWho,
    buttons: [{ label: "Install", def: true, action(f) {
      S.settings.label = f.elements.label.value.trim().toLowerCase() || "partner";
      S.settings.name = f.elements.name.value.trim();
      render(); install();
    } }],
  });
}

function install() {
  const name = appName();
  const files = ["hours_played.db", "owes.ledger", "one_more_mission.int", "late_fees.plist", "trip_fund.app", "dashboard.app"];
  const d = dialog({
    title: `${name} Installer`, lock: true, cls: "inst",
    body: `<h2 id="iH">Installing ${esc(name)}…</h2><div class="file" id="iF"></div><div class="abar"><i id="iB"></i></div>
      <div class="done" id="iD">✓ Dashboard included</div>`,
    buttons: [{ label: "Continue", def: true, action() { settingsDialog(true); } }],
  });
  const btn = d.el.querySelector(".gel"); btn.disabled = true;
  const t0 = performance.now(), T = matchMedia("(prefers-reduced-motion:reduce)").matches ? 200 : 1800;
  (function step(now) {
    const u = Math.min(1, (now - t0) / T);
    d.el.querySelector("#iB").style.width = u * 100 + "%";
    d.el.querySelector("#iF").textContent = u < 1 ? "Copying " + files[Math.min(files.length - 1, Math.floor(u * files.length))] : "Install complete.";
    if (u < 1) { requestAnimationFrame(step); return; }
    d.el.querySelector("#iH").textContent = `${name} installed.`;
    d.el.querySelector("#iD").style.visibility = "visible";
    btn.disabled = false; btn.focus();
  })(t0);
}

function settingsDialog(first, focus) {
  const s = S.settings;
  const costRow = (n = "", c = "") => `<div class="cost"><input name="in" value="${esc(n)}" placeholder="Flight" maxlength="30" aria-label="What it's for"><input name="ic" value="${c}" inputmode="decimal" placeholder="${esc(s.cur)}0" aria-label="Amount"><button type="button" class="x" data-rm title="Remove" aria-label="Remove">×</button></div>`;
  dialog({
    title: first ? "The deal" : "Names, rate & fund", wide: true, lock: first,
    body: `<div class="f">
      ${first ? "" : `<div class="fs"><h3>Who's paying</h3>${whoPicker(s.label, s.name, false)}
        <label>Their email <span style="font-weight:400;color:var(--muted)">(optional, for sending invoices)</span></label>
        <input name="email" type="email" value="${esc(s.email)}" placeholder="them@email.com" autocapitalize="off" spellcheck="false"></div>`}
      <div class="fs"><h3>Their game</h3>
        <div class="row"><div><label>Game</label><input name="game" value="${esc(s.game)}" maxlength="30"></div>
        <div><label>Charge per hour</label><input name="rate" inputmode="decimal" value="${s.rate}"></div></div></div>
      <div class="fs"><h3>The fund</h3><p class="hint">What their hours pay for.</p>
        <div class="row"><div><label>Fund name</label><input name="dest" value="${esc(s.dest)}" maxlength="24" placeholder="Japan"></div>
        <div><label>City on the map</label><input name="city" value="${esc(s.city)}" maxlength="20" placeholder="Tokyo"></div></div>
        <span class="preview" id="pv"></span>
        <label>What it costs</label>
        <div id="costs">${s.items.map(i => costRow(i[0], i[1])).join("")}</div>
        <button type="button" class="link" id="addCost">+ add a cost</button></div>
      <details><summary>More settings</summary>
        <div class="row"><div><label>Currency symbol</label><input name="cur" value="${esc(s.cur)}" maxlength="4"></div>
        <div><label>Where their mind goes</label><input name="place" value="${esc(s.place)}" maxlength="30"></div></div>
        <div class="row"><div><label>“One more mission” interest %</label><input name="interest" inputmode="decimal" value="${s.interest}"></div>
        <div><label>Missed plan fee</label><input name="lateFee" inputmode="decimal" value="${s.lateFee}"></div></div>
        <div class="row"><div><label>Overtime after (hours in one go)</label><input name="otAfter" inputmode="decimal" value="${+s.otAfter || ""}" placeholder="never"></div>
        <div><label>Overtime rate ×</label><input name="otX" inputmode="decimal" value="${s.otX}"></div></div>
      </details></div>`,
    onOpen(f) {
      if (!first) wireWho(f);
      const costs = f.querySelector("#costs"), dest = f.elements.dest, city = f.elements.city;
      // the city follows the fund name until they type their own
      let cityTouched = !(s.city === s.dest || (s.dest === "Japan" && s.city === "Tokyo"));
      city.addEventListener("input", () => { cityTouched = true; });
      const pv = () => {
        if (!cityTouched && dest.value.trim() !== s.dest) city.value = dest.value.trim();
        f.querySelector("#pv").textContent = `Shows as: ${(dest.value.trim() || "the trip")} fund · Home → ${city.value.trim() || dest.value.trim() || "?"}`;
      };
      dest.addEventListener("input", pv); city.addEventListener("input", pv); pv();
      f.querySelector("#addCost").onclick = () => { costs.insertAdjacentHTML("beforeend", costRow()); costs.lastElementChild.querySelector("input").focus(); };
      costs.addEventListener("click", e => { if (e.target.closest("[data-rm]") && costs.children.length > 1) e.target.closest(".cost").remove(); });
      if (focus && f.elements[focus]) setTimeout(() => { const el = f.elements[focus]; el.scrollIntoView({ block: "center" }); el.focus(); el.select(); }, 20);
    },
    buttons: (first ? [] : [{ label: "Cancel" }]).concat([{ label: first ? "Start billing" : "Save", def: true, action(f) {
      const g = n => f.elements[n].value.trim();
      const rate = num(f, "rate"); if (rate === null || rate <= 0) return bad(f, "rate");
      const interest = num(f, "interest", 0), lateFee = num(f, "lateFee", 0), otAfter = num(f, "otAfter", 0), otX = num(f, "otX", 1);
      if ([interest, lateFee, otAfter, otX].includes(null)) { f.querySelector("details").open = true; return false; }
      if (!first && g("email") && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(g("email"))) return bad(f, "email");
      const items = [];
      for (const row of f.querySelectorAll(".cost")) {
        const [n, c] = row.querySelectorAll("input"), name = n.value.trim(), raw = c.value.replace(/[^0-9.]/g, "");
        if (!name && !raw) continue;
        const cost = parseFloat(raw);
        if (!isFinite(cost) || cost <= 0) { c.classList.add("bad"); c.focus(); return false; }
        items.push([name || "Trip", cost]);
      }
      if (!items.length) { const c = f.querySelector(".cost input"); c.classList.add("bad"); c.focus(); return false; }
      const dest = g("dest") || "the trip";
      if (!first) Object.assign(S.settings, { label: g("label").toLowerCase() || "partner", name: g("name"), email: g("email") });
      Object.assign(S.settings, {
        game: g("game") || "their game", place: g("place") || "the game", rate, cur: g("cur") || "$",
        dest, city: g("city") || dest, items, interest, lateFee, otAfter, otX: otX || 1,
      });
      S.installed = true; S.fundedSeen = totals().pct >= 1;
      save(); render(); if (!first) say("Saved.");
    } }]),
  });
}

function checkFunded() {
  const t = totals();
  if (t.pct >= 1 && t.trip > 0 && !S.fundedSeen) {
    S.fundedSeen = true; save();
    alertBox("heart", "Trip fully funded.", `${esc(S.settings.dest)}: ${money(t.trip, false)} covered by ${hm(t.hours)} of ${esc(S.settings.game)}.<br>Thank you for your service, ${esc(whoTag())} ♡`);
  } else if (t.pct < 1 && S.fundedSeen) { S.fundedSeen = false; save(); }
}

// ---------- toast (status + undo) ----------
let toastTimer;
function say(text, undo) {
  flash = { text, undo };
  $("#tText").textContent = text;
  const u = $("#undo");
  u.hidden = !undo;
  u.onclick = () => { const f = flash && flash.undo; hideToast(); if (f) { f(); say("Put back."); } };
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, undo ? 8000 : 4000);
}
function hideToast() { flash = null; $("#toast").hidden = true; }

// ---------- views ----------
function view() { const v = location.hash.slice(1); return VIEWS.includes(v) ? v : "playtime"; }
function showView() {
  const v = view();
  VIEWS.forEach(n => { $("#v-" + n).hidden = n !== v; });
  $$(".side [data-view], .tabs [data-view]").forEach(b => b.classList.toggle("on", b.dataset.view === v));
}

// ---------- render ----------
const rowHTML = (e, title, sub) => `<div class="li"><div class="l"><b>${esc(title)}</b><small>${esc(sub)}</small></div>
  <span class="amt">+${money(e.amount)}</span><button class="x" data-del="${e.id}" title="Remove" aria-label="Remove ${esc(e.label)}">×</button></div>`;

function render() {
  const s = S.settings;
  document.title = winTitle();
  $("#title").textContent = winTitle();
  $("#mLogo").textContent = logo();
  // the name under the Home Screen icon: "BF Tax", "GF Tax", "Partner Tax"…
  $("#appTitle").content = (({ boyfriend: "BF", girlfriend: "GF" })[s.label] || cap1(s.label || "partner")) + " Tax";
  const initial = (s.name || s.label || "?").charAt(0).toUpperCase();
  $("#av").textContent = initial; $("#mAv").textContent = initial;
  $("#meName").textContent = whoTag();
  $("#meSub").textContent = `${s.name ? s.label + " · " : ""}${s.game}`;
  $("#sTrip").textContent = `${s.dest} fund`;
  $("#lC").textContent = s.city;
  $("#tWho").textContent = whoTag();
  $("#R").textContent = round$(s.rate) + "/hr";
  $("#oweLbl").textContent = `= ${whoTag()} owes`;
  $("#tDest").textContent = s.dest.toLowerCase();
  $("#rHome").textContent = s.home || "Home";
  $("#rCity").textContent = s.city;
  $("#sCount").textContent = S.entries.length || "";

  // playtime: the timer and the latest sessions
  const on = !!S.live;
  $(".timer").classList.toggle("on", on);
  $("#tState").textContent = on ? "is playing " + s.game : "isn't playing";
  $("#tLive").hidden = !on; $("#sLive").hidden = !on;
  const play = $("#play");
  play.textContent = on ? `■ ${who()} stopped playing` : `▶ ${who()} started playing`;
  play.classList.toggle("stop", on);
  const sess = S.entries.filter(e => !isPenalty(e)).slice(-5).reverse()
    .map(e => rowHTML(e, when(e.ts), `${dur(e.mins || 0)} of ${s.game}`));
  if (on) sess.unshift(`<div class="li live"><div class="l"><b>Playing now</b><small id="lvT"></small></div><span class="amt" id="lvA"></span><span class="x"></span></div>`);
  $("#sessRows").innerHTML = sess.length ? `<div class="card list">${sess.join("")}</div>`
    : `<div class="note">No sessions yet. Press <b>▶ ${esc(who())} started playing</b> when ${esc(s.game)} comes on.</div>`;

  // penalties
  $("#pLede").textContent = `Tap one when ${whoMid()} earns it. It goes straight onto what ${whoMid()} owes.`;
  const P = [
    ["interest", "“One more mission”", `+${s.interest}% interest`, "purple", `Said one more mission and kept going. Adds ${s.interest}% of what ${whoMid()} owes.`, `<span id="intBtn">Charge interest</span>`],
    ["late", "Missed a plan", `+${round$(s.lateFee)} late fee`, "orange", `Skipped dinner, a date or anything you'd planned, for ${s.game}.`, "Charge late fee"],
    ["mental", `Mentally in ${s.place}`, "by the hour", "blue", "In the room, but not really there. Taxed at the full rate.", "File Form 40"],
    ["custom", "Something else", "you name it", "gray", "Rage-quit, threw the controller, anything else that deserves a fee.", "Add a penalty"],
  ];
  $("#pens").innerHTML = P.map(([act, title, tag, tone, desc, btn]) => `<div class="card pcard">
    <div class="top"><b>${esc(title)}</b><span class="tag ${tone}">${esc(tag)}</span></div>
    <p>${esc(desc)}</p><button class="gel" data-act="${act}">${btn}</button></div>`).join("");
  const pens = S.entries.filter(isPenalty).slice().reverse().map(e => rowHTML(e, e.label, [when(e.ts), e.note || ""].filter(Boolean).join(" · ")));
  $("#penRows").innerHTML = pens.length ? `<div class="card list">${pens.join("")}</div>` : `<div class="note">Nothing charged yet.</div>`;

  renderPaper();
  showView();
  tick();
}

// receipts: every session and penalty on one long receipt
function renderPaper() {
  const s = S.settings, n = { all: S.entries.length, session: 0, penalty: 0 };
  S.entries.forEach(e => n[isPenalty(e) ? "penalty" : "session"]++);
  $("#seg").innerHTML = [["all", "All"], ["session", "Sessions"], ["penalty", "Penalties"]]
    .map(([k, l]) => `<button data-filter="${k}"${filter === k ? ' class="on"' : ""}>${l} ${n[k]}</button>`).join("");
  const list = S.entries.map((e, i) => ({ e, i })).filter(({ e }) => filter === "all" || (filter === "penalty") === isPenalty(e));
  const lines = list.map(({ e, i }) => `<div class="en"><div class="h"><span><b>#${i + 1}</b> ${isPenalty(e) ? "Penalty" : "Session"}</span><span>${esc(when(e.ts))}</span></div>
    <div class="bub"><span>${esc(isPenalty(e) ? e.label : `${dur(e.mins || 0)} of ${s.game}`)}</span><b>+${money(e.amount)}</b>
    <button class="x" data-del="${e.id}" title="Remove" aria-label="Remove ${esc(e.label)}">×</button></div></div>`);
  if (S.live && filter !== "penalty") lines.push(`<div class="en live"><div class="h"><span><b>#${S.entries.length + 1}</b> Playing now</span><span>${esc(when(S.live.start))}</span></div>
    <div class="bub"><span id="pLiveT"></span><b id="pLiveA"></b><span class="x"></span></div></div>`);
  $("#paper").innerHTML = `<b class="plogo">${esc(logo())}</b><div class="pt">INVOICE</div><div class="ps">Billed to ${esc(whoTag())}</div>
    <hr><div class="kv"><span>Game</span><span>${esc(s.game)}</span></div>
    <div class="kv"><span>Rate</span><span>${round$(s.rate)} an hour</span></div>
    <div class="kv"><span>Pays for</span><span>Trip to ${esc(s.dest)}</span></div>
    <div class="kv"><span>Issued</span><span>${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span></div>
    <hr>${lines.length ? lines.join("") : `<div class="empty">Nothing billed yet.</div>`}
    <hr><div class="kv"><span>Playtime <span id="pHrs"></span></span><span id="pSes"></span></div>
    <div class="kv"><span>Penalties</span><span id="pFee"></span></div>
    <hr><div class="kv total"><span>TOTAL DUE</span><span id="pTot"></span><span class="stamp" id="stamp" hidden></span></div>
    <hr><div class="center">PAYABLE TO THE ${esc(s.dest.toUpperCase())} FUND<br><span id="pPct"></span></div>
    ${barcode(S.entries.length + ":" + S.entries.reduce((a, e) => a + e.amount, 0).toFixed(2))}`;
}

// a fake barcode that changes whenever the receipt does
function barcode(seed) {
  let h = 2166136261, x = 0, bars = "";
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; };
  while (x < 300) { const w = 1 + Math.floor(rnd() * 3.2); if (rnd() > .42) bars += `<rect x="${x}" width="${w}" height="46"/>`; x += w + 1; }
  return `<svg class="barcode" viewBox="0 0 300 46" preserveAspectRatio="none" style="fill:#1b1c20;stroke:none" aria-hidden="true">${bars}</svg>`;
}

// every second: anything that moves while they're playing
function tick() {
  const t = totals(), s = S.settings, pc = t.pct * 100;
  // the LCD strip
  $("#lH").textContent = hm(t.hours).toUpperCase();
  $("#lO").textContent = bigMoney(t.fund);
  $("#lP").textContent = Math.floor(pc) + "%";
  const tb = $("#tbPlay");
  tb.textContent = S.live ? `■ Stop · ${clk(Date.now() - S.live.start)}` : "▶ Start timer";
  tb.classList.toggle("live", !!S.live);
  // playtime
  $("#clock").textContent = S.live ? clk(Date.now() - S.live.start) : "00:00:00";
  $("#sofar").innerHTML = S.live
    ? `<b>+${money(t.liveCost)}</b> so far at ${round$(s.rate)}/hr${isOvertime(t.liveMins) ? ` · <b>OVERTIME ×${s.otX}</b>` : ""}`
    : `Press start when ${esc(s.game)} comes on. Every hour is ${round$(s.rate)}.`;
  $("#H").textContent = hm(t.hours);
  $("#F").textContent = bigMoney(t.fees);
  $("#own").textContent = bigMoney(t.fund);
  const la = $("#lvA"), lt = $("#lvT");
  if (la) la.textContent = "+" + money(t.liveCost);
  if (lt) lt.textContent = `${dur(t.liveMins)} so far`;
  // penalties: interest depends on the running total
  const ib = $("#intBtn"), amt = r2(t.fund * (+s.interest || 0) / 100);
  if (ib) ib.textContent = amt > 0 ? `Charge +${money(amt)}` : "Charge interest";
  // the trip
  $("#fAmt").textContent = money(t.trip ? Math.min(t.fund, t.trip) : t.fund, t.fund < 1000);
  $("#fOf").textContent = t.trip ? `of ${money(t.trip, false)}` + (t.pct < 1 ? ` · ${money(t.trip - t.fund, false)} to go` : " · funded") : "";
  $("#fPc").textContent = Math.floor(pc) + "%";
  $("#fBar").style.width = pc + "%";
  $("#rDone").style.width = pc + "%";
  $("#plane").style.left = pc + "%";
  let cum = 0, nextShown = false;
  $("#items").innerHTML = s.items.map(([n, c]) => {
    cum += +c || 0;
    const ok = t.fund >= cum - 0.005;
    let tag = `<span class="v">${round$(+c || 0)}</span>`;
    if (ok) tag = `<span class="tag green">PAID</span>`;
    else if (!nextShown) { nextShown = true; tag = `<span class="v">${money(cum - t.fund, false)} left</span><span class="tag blue">NEXT</span>`; }
    return `<div class="it"><span class="n">${esc(n)}</span>${tag}</div>`;
  }).join("");
  // receipt totals
  $("#pHrs").textContent = `(${hm(t.hours)})`;
  $("#pSes").textContent = money(t.sessions);
  $("#pFee").textContent = money(t.fees);
  $("#pTot").textContent = money(t.fund);
  $("#pPct").textContent = `(${Math.floor(pc)}% of the way there)`;
  const st = $("#stamp");
  st.hidden = !S.entries.length && !S.live;
  st.textContent = t.pct >= 1 ? "FUNDED" : "UNPAID";
  const pa = $("#pLiveA"), pt = $("#pLiveT");
  if (pa) pa.textContent = "+" + money(t.liveCost);
  if (pt) pt.textContent = `${dur(t.liveMins)} so far`;
  if (S.live) checkFunded();
}

// ---------- demo ----------
function demoState() {
  const st = blank(); st.installed = true; st.settings.name = "Alex";
  const D = 86400000, base = new Date(); base.setHours(19, 30, 0, 0);
  const at = (d, h = 0) => base.getTime() - (5 - d) * D + h * 3600000;
  const push = (e, ts) => st.entries.push({ id: uid(), ts, ...e, amount: r2(e.amount) });
  const owes = () => st.entries.reduce((a, e) => a + e.amount, 0);
  const sess = (d, mins) => push({ kind: "session", label: "Gaming session", mins, amount: mins / 60 * 20 }, at(d));
  sess(0, 250); sess(1, 362);
  push({ kind: "interest", label: "“One more mission”", note: "15% interest", amount: owes() * .15 }, at(1, 6.1));
  sess(2, 330);
  push({ kind: "late", label: "Missed plan: dinner", note: "late fee", amount: 50 }, at(3, 1));
  push({ kind: "mental", label: "Present, mentally in Vice City", note: "tax", mins: 135, amount: 45 }, at(3, 3));
  sess(4, 500);
  push({ kind: "interest", label: "“One more mission”", note: "15% interest", amount: owes() * .15 }, at(4, 9.2));
  st.fundedSeen = true;
  return st;
}

// ---------- events ----------
document.addEventListener("click", e => {
  const del = e.target.closest("[data-del]");
  if (del) { ACTIONS.remove(del.dataset.del); return; }
  const v = e.target.closest("[data-view]");
  if (v) { location.hash = v.dataset.view; return; }
  const fl = e.target.closest("[data-filter]");
  if (fl) { filter = fl.dataset.filter; renderPaper(); tick(); return; }
  const act = e.target.closest("[data-act]");
  if (act && ACTIONS[act.dataset.act]) ACTIONS[act.dataset.act]();
});
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  const ovs = $$(".overlay"), top = ovs[ovs.length - 1];
  if (top && !top.dataset.lock) top.remove();
});
addEventListener("hashchange", () => { showView(); scrollTo(0, 0); });
// another tab changed the data
addEventListener("storage", e => { if (e.key === KEY && !DEMO) { S = load(); render(); } });

S = DEMO ? demoState() : load();
render();
setInterval(tick, 1000);
if (!S.installed) setup();
else if (DEMO) say("Demo: nothing is saved. Backup & more → Leave the demo.");
