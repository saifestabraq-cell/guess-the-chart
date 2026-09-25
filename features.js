// Guess.The.Chart extras: saved rounds, first-round tutorial, scoring, personal stats,
// achievements, Vittoria's readings, reveal card image and the Rodden rating explainer.
// Loaded after the game script; it wraps a few game functions instead of editing them.
(() => {
  const RKEY = "gtc-round-v1", PKEY = "gtc-profile-v1", TKEY = "gtc-tutorial-v1";
  const TUTORIAL_NAME = "Albert Einstein";
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const el = (tag, attrs = {}, text) => { const e = document.createElement(tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; };
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const sunSign = () => SIGNS[Math.floor(state.chart.bodies.su.lon / 30)];

  // ---------- profile: scores, stats by Sun sign, achievements ----------
  const blankProfile = () => ({ games: 0, solved: 0, scoreTotal: 0, best: 0, bySign: {}, ach: {} });
  let profile = Object.assign(blankProfile(), store.get(PKEY) || {});
  const saveProfile = () => store.set(PKEY, profile);

  const ACH = [
    { id: "first", name: "First light", desc: "Solve your first chart" },
    { id: "pure", name: "Straight from the chart", desc: "Solve without asking a question" },
    { id: "perfect", name: "Perfect reading", desc: "Score 100: no questions, hints, wrong guesses or positions" },
    { id: "streak5", name: "On a roll", desc: "Solve 5 charts in a row" },
    { id: "ten", name: "Ten charts read", desc: "Solve 10 charts" },
    { id: "old", name: "Old soul", desc: "Solve someone born before 1700" },
    { id: "zodiac", name: "Full zodiac", desc: "Solve a chart of every Sun sign" },
  ];

  // ---------- round state that the game itself doesn't track ----------
  let meta = { posOpened: false, tutorial: false };
  let forcePick = null, booted = false;
  const posDetails = () => $("#posTable").closest("details");

  const _pickNext = pickNext;
  pickNext = function () {
    if (forcePick) { const p = forcePick; forcePick = null; state.queue = state.queue.filter(i => PEOPLE[i] !== p); return p; }
    return _pickNext();
  };

  const tutorialPending = () => !store.get(TKEY) && stats.played === 0;

  const _newRound = newRound;
  newRound = function () {
    let saved = null, tut = false;
    if (!booted) {
      booted = true;
      saved = store.get(RKEY);
      if (saved && !PEOPLE.some(p => p[0] === saved.name)) saved = null;
      if (saved) forcePick = PEOPLE.find(p => p[0] === saved.name);
      else if (tutorialPending()) { forcePick = PEOPLE.find(p => p[0] === TUTORIAL_NAME); tut = true; }
    }
    const d = posDetails(); if (d) d.open = false;
    _newRound();
    meta = { posOpened: false, tutorial: tut || !!(saved && saved.tutorial) };
    if (saved) restore(saved);
    clearRevealExtras();
    updateRoddenHelp();
    saveRound();
    if (tutorialPending() && meta.tutorial) setTimeout(() => startTutorial(false), 0);
  };

  function restore(sv) {
    state.qLeft = sv.qLeft; state.wrong = sv.wrong; state.tried = sv.tried || []; state.hintsUsed = sv.hintsUsed || [];
    meta.posOpened = !!sv.posOpened;
    const th = $("#thread"); th.innerHTML = "";
    for (const m of sv.msgs || []) { const e = el("div", { class: m.c }, m.t); th.append(e); }
    th.scrollTop = 1e9;
    renderStatus(); updateControls();
  }

  let saveTimer;
  function saveRound() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!state.person || state.done) { store.del(RKEY); return; }
      const msgs = [...$("#thread").children].filter(e => !e.classList.contains("pending")).map(e => ({ c: e.className, t: e.textContent }));
      store.set(RKEY, { name: state.person[0], qLeft: state.qLeft, wrong: state.wrong, tried: state.tried, hintsUsed: state.hintsUsed, posOpened: meta.posOpened, tutorial: meta.tutorial, msgs });
    }, 120);
  }

  // ---------- scoring ----------
  function scoreOf(won, q, g, h, pos) {
    if (!won) return 0;
    return Math.max(10, 100 - 12 * q - 15 * g - 10 * h - (pos ? 10 : 0));
  }

  const _finish = finish;
  finish = function (won) {
    if (state.done) return _finish(won);
    const q = 4 - state.qLeft, g = (state.tried || []).length, h = (state.hintsUsed || []).length, pos = meta.posOpened;
    _finish(won);
    store.del(RKEY);
    const score = scoreOf(won, q, g, h, pos);
    const sign = sunSign();
    profile.games++; profile.scoreTotal += score; profile.best = Math.max(profile.best, score);
    const b = profile.bySign[sign] || (profile.bySign[sign] = { p: 0, s: 0 }); b.p++;
    if (won) { profile.solved++; b.s++; }
    const fresh = won ? unlock({ q, score }) : [];
    saveProfile();
    if (meta.tutorial) store.set(TKEY, 1);
    showRevealExtras({ won, q, g, h, pos, score, fresh });
    renderYou();
  };

  function unlock({ q, score }) {
    const has = id => !!profile.ach[id], got = [];
    const give = id => { if (!has(id)) { profile.ach[id] = Date.now(); got.push(id); } };
    give("first");
    if (q === 0) give("pure");
    if (score === 100) give("perfect");
    if (stats.streak >= 5) give("streak5");
    if (profile.solved >= 10) give("ten");
    if (state.person[2] < 1700) give("old");
    if (SIGNS.every(s => profile.bySign[s] && profile.bySign[s].s > 0)) give("zodiac");
    return got;
  }

  // ---------- reveal card additions ----------
  let rvBox;
  function ensureReveal() {
    if (rvBox) return;
    rvBox = el("div", { class: "rvExtras" });
    $("#rvBig").after(rvBox);
    const btn = el("button", { type: "button", class: "ghost", id: "cardBtn" }, "Save card image");
    btn.addEventListener("click", saveCard);
    $("#nextBtn").before(btn);
  }
  function clearRevealExtras() { if (rvBox) rvBox.innerHTML = ""; lastResult = null; }

  let lastResult = null;
  function showRevealExtras(r) {
    ensureReveal(); lastResult = r; rvBox.innerHTML = "";
    const sc = el("div", { class: "rvScore" });
    sc.append(el("span", { class: "rvScoreNum" }, String(r.score)), el("span", { class: "rvScoreLab" }, "score"));
    rvBox.append(sc);
    const parts = [plural(r.q, "question"), plural(r.g, "wrong guess").replace("guesss", "guesses"), plural(r.h, "hint")];
    if (r.pos) parts.push("positions shown");
    rvBox.append(el("p", { class: "rvBreak" }, r.won ? parts.join(" · ") : "Revealed charts score 0"));
    const note = (window.VITTORIA_NOTES || {})[state.person[0]];
    if (note) {
      const q = el("figure", { class: "vNote" });
      q.append(el("figcaption", {}, "Vittoria's reading"), el("blockquote", {}, note));
      rvBox.append(q);
    }
    if (r.fresh.length) {
      const a = el("div", { class: "achNew" });
      for (const id of r.fresh) { const d = ACH.find(x => x.id === id); a.append(el("span", { class: "achChip", title: d.desc }, "Unlocked: " + d.name)); }
      rvBox.append(a);
    }
  }

  // ---------- personal stats panel ----------
  let youBody;
  function buildYou() {
    const d = el("details", { class: "you", id: "youPanel" });
    d.append(el("summary", {}, "Your stats & achievements"));
    youBody = el("div", { class: "youBody" });
    d.append(youBody);
    $(".foot").after(d);
  }
  function renderYou() {
    if (!youBody) return;
    youBody.innerHTML = "";
    if (!profile.games) { youBody.append(el("p", { class: "youEmpty" }, "Finish a round to start your stats.")); }
    else {
      const avg = Math.round(profile.scoreTotal / profile.games);
      const row = el("div", { class: "youNums" });
      for (const [n, l] of [[`${profile.solved}/${profile.games}`, "solved"], [avg, "average score"], [profile.best, "best score"]]) {
        const c = el("div"); c.append(el("b", {}, String(n)), el("span", {}, l)); row.append(c);
      }
      youBody.append(row);
      const rated = SIGNS.map(s => ({ s, ...(profile.bySign[s] || { p: 0, s: 0 }) })).map(o => ({ sign: o.s, p: o.p, rate: o.p ? o.s / o.p : 0 }));
      const enough = rated.filter(o => o.p >= 3).sort((a, b) => b.rate - a.rate);
      if (enough.length) {
        const best = enough[0], worst = enough[enough.length - 1];
        youBody.append(el("p", { class: "youLine" }, `You solve ${best.sign} Suns ${Math.round(best.rate * 100)}% of the time.`));
        if (enough.length > 1 && worst.rate < best.rate) youBody.append(el("p", { class: "youLine" }, `${worst.sign} Suns are your blind spot: ${Math.round(worst.rate * 100)}%.`));
      } else youBody.append(el("p", { class: "youLine" }, "Play three charts of a Sun sign to see how well you read it."));
      const grid = el("div", { class: "signGrid" });
      rated.forEach((o, i) => {
        const c = el("div", { class: "signCell" + (o.p ? "" : " none"), title: `${o.sign}: ${o.p ? Math.round(o.rate * 100) + "% of " + plural(o.p, "chart") : "not played yet"}` });
        c.append(el("span", { class: "sg el" + (i % 4) }, SG[i]), el("span", {}, o.p ? Math.round(o.rate * 100) + "%" : "–"));
        grid.append(c);
      });
      youBody.append(grid);
    }
    const al = el("ul", { class: "achList" });
    for (const a of ACH) {
      const li = el("li", { class: profile.ach[a.id] ? "got" : "" });
      li.append(el("b", {}, a.name), el("span", {}, a.desc));
      al.append(li);
    }
    youBody.append(el("h3", {}, "Achievements"), al);
  }

  // ---------- Rodden rating explainer ----------
  let rodden;
  function buildRodden() {
    rodden = el("details", { class: "rodden", id: "roddenHelp" });
    rodden.append(el("summary", {}, "What do AA, A and B mean?"));
    const dl = el("dl");
    for (const [k, v] of [
      ["AA", "From a birth certificate or official birth record. The most reliable."],
      ["A", "Quoted by the person, their family or a close source, from memory or a diary."],
      ["B", "Taken from a biography or autobiography."],
      ["Noon", "No trustworthy time is known, so the chart is set for midday. Planets are close; houses and rising sign may be off."],
    ]) { dl.append(el("dt", {}, k), el("dd", {}, v)); }
    rodden.append(dl, el("p", {}, "These are Rodden ratings, the standard astrologers use to grade birth data."));
    $("#timeNote").after(rodden);
  }
  function updateRoddenHelp() { if (rodden) { rodden.hidden = !/Rodden/.test($("#timeNote").textContent); rodden.open = false; } }

  // ---------- tutorial ----------
  const STEPS = [
    ["#wheel", "This is a real birth chart: where the Sun, Moon and planets were at the moment someone famous was born. Your first one is an easy one."],
    ["#askForm", "Ask up to four yes-or-no questions, like “Was this person a scientist?” or “Born in Europe?”"],
    ["#guessForm", "Type a name whenever you're ready. Questions, hints and wrong guesses lower your score, so the fewer clues you use, the better."],
  ];
  let tut, tutStep = 0;
  function startTutorial(manual) {
    if (tut) tut.remove();
    tutStep = 0;
    tut = el("div", { class: "tut", role: "dialog", "aria-label": "How to play" });
    $("header").after(tut);
    renderTut(manual);
  }
  function renderTut(manual) {
    document.querySelectorAll(".tutFocus").forEach(e => e.classList.remove("tutFocus"));
    const [sel, text] = STEPS[tutStep];
    const target = $(sel).closest(".wheelWrap, .row") || $(sel);
    target.classList.add("tutFocus");
    tut.innerHTML = "";
    tut.append(el("span", { class: "tutStep" }, `How to play · ${tutStep + 1} of ${STEPS.length}`), el("p", {}, text));
    const row = el("div", { class: "tutBtns" });
    const skip = el("button", { type: "button", class: "ghost" }, "Skip");
    const next = el("button", { type: "button" }, tutStep < STEPS.length - 1 ? "Next" : "Start playing");
    skip.addEventListener("click", () => endTutorial());
    next.addEventListener("click", () => { if (tutStep < STEPS.length - 1) { tutStep++; renderTut(manual); } else endTutorial(); });
    row.append(skip, next); tut.append(row);
    if (tutStep > 0) target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    next.focus({ preventScroll: true });
  }
  function endTutorial() {
    document.querySelectorAll(".tutFocus").forEach(e => e.classList.remove("tutFocus"));
    if (tut) { tut.remove(); tut = null; }
    store.set(TKEY, 1);
    const g = $("#q").disabled ? $("#g") : $("#q"); g.focus({ preventScroll: true });
  }

  // ---------- reveal card image ----------
  const cx = document.createElement("canvas").getContext("2d");
  const norm = c => { if (!c || c === "none" || c === "transparent") return c; cx.fillStyle = "#000"; cx.fillStyle = c; return cx.fillStyle; };
  function wheelSvg(size) {
    const src = $("#wheel"), cl = src.cloneNode(true);
    const a = src.querySelectorAll("*"), b = cl.querySelectorAll("*");
    const P = ["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline"];
    a.forEach((e, i) => {
      const s = getComputedStyle(e);
      b[i].setAttribute("style", P.map(p => `${p}:${p === "fill" || p === "stroke" ? norm(s.getPropertyValue(p)) : s.getPropertyValue(p)}`).join(";") + ";font-family:'Segoe UI Symbol','Apple Symbols','Noto Sans Symbols',sans-serif");
    });
    cl.querySelectorAll("title").forEach(t => t.remove());
    cl.setAttribute("xmlns", "http://www.w3.org/2000/svg"); cl.setAttribute("width", size); cl.setAttribute("height", size);
    return new XMLSerializer().serializeToString(cl);
  }
  function wrap(ctx, text, maxW) {
    const words = text.split(" "), lines = []; let line = "";
    for (const w of words) { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line); return lines;
  }
  async function renderCard() {
    const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d"), cs = getComputedStyle(document.documentElement), v = n => norm(cs.getPropertyValue(n).trim());
    const [bg, paper, ink, mute, accent, soil, star] = ["--bg", "--paper", "--ink", "--mute", "--accent", "--soil", "--star"].map(v);
    try { await Promise.all(["400 80px Fraunces", "italic 400 32px Fraunces", "600 28px Karla", "400 30px Karla"].map(f => document.fonts.load(f))); } catch (e) {}
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    x.fillStyle = star; for (let i = 0; i < 70; i++) { x.globalAlpha = .25 + rnd() * .6; x.beginPath(); x.arc(rnd() * W, rnd() * H, .8 + rnd() * 1.6, 0, 7); x.fill(); }
    x.globalAlpha = 1; x.textAlign = "center";
    x.fillStyle = mute; x.font = "600 24px Karla, sans-serif"; x.letterSpacing = "6px"; x.fillText("GUESS.THE.CHART", W / 2, 84); x.letterSpacing = "0px";
    const WS = 760, wx = (W - WS) / 2, wy = 120;
    const g = x.createRadialGradient(W / 2, wy + WS / 2, WS * .2, W / 2, wy + WS / 2, WS / 2);
    g.addColorStop(0, paper); g.addColorStop(1, soil); x.fillStyle = g; x.beginPath(); x.arc(W / 2, wy + WS / 2, WS / 2, 0, 7); x.fill();
    const img = new Image(); img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(wheelSvg(WS - 40));
    await img.decode(); x.drawImage(img, wx + 20, wy + 20, WS - 40, WS - 40);
    let y = wy + WS + 96;
    const name = state.person[0]; let fs = 84; x.font = `400 ${fs}px Fraunces, Georgia, serif`;
    while (x.measureText(name).width > W - 140 && fs > 48) { fs -= 4; x.font = `400 ${fs}px Fraunces, Georgia, serif`; }
    x.fillStyle = ink; x.fillText(name, W / 2, y); y += 52;
    x.fillStyle = mute; x.font = "400 30px Karla, sans-serif"; x.fillText(state.person[9], W / 2, y); y += 48;
    x.font = "italic 400 30px Fraunces, Georgia, serif"; x.fillText($("#rvBig").textContent, W / 2, y); y += 56;
    const note = (window.VITTORIA_NOTES || {})[name];
    if (note) {
      x.fillStyle = ink; x.font = "italic 400 30px Fraunces, Georgia, serif";
      const lines = wrap(x, "“" + note + "”", W - 200).slice(0, 3);
      for (const l of lines) { x.fillText(l, W / 2, y); y += 40; }
      x.fillStyle = mute; x.font = "600 20px Karla, sans-serif"; x.letterSpacing = "4px"; x.fillText("VITTORIA, ASTROLOGER", W / 2, y + 4); x.letterSpacing = "0px"; y += 44;
    }
    x.fillStyle = accent; x.font = "600 26px Karla, sans-serif"; x.letterSpacing = "4px";
    x.fillText(lastResult && lastResult.won ? `SOLVED · SCORE ${lastResult.score}` : "CAN YOU READ IT?", W / 2, Math.min(y + 10, H - 90)); x.letterSpacing = "0px";
    x.fillStyle = mute; x.font = "400 26px Karla, sans-serif"; x.fillText(location.host, W / 2, H - 44);
    return new Promise(r => c.toBlob(r, "image/png"));
  }
  async function saveCard() {
    const btn = $("#cardBtn"), label = btn.textContent;
    btn.disabled = true; btn.textContent = "Making card…";
    try {
      const blob = await renderCard();
      const fname = "guess-the-chart-" + state.person[0].toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".png";
      const file = new File([blob], fname, { type: "image/png" });
      if (matchMedia("(pointer:coarse)").matches && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: "Guess.The.Chart" }); } catch (e) {}
      } else {
        const a = el("a", { href: URL.createObjectURL(blob), download: fname }); document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
      btn.textContent = "Card saved";
    } catch (e) { btn.textContent = "Couldn't make the card"; }
    setTimeout(() => { btn.textContent = label; btn.disabled = false; }, 2500);
  }

  // ---------- wiring ----------
  document.addEventListener("DOMContentLoaded", () => {
    new MutationObserver(saveRound).observe($("#thread"), { childList: true, subtree: true, characterData: true, attributes: true });
    const d = posDetails();
    if (d) d.addEventListener("toggle", () => { if (d.open && !state.done && !meta.posOpened) { meta.posOpened = true; saveRound(); } });
    const how = el("button", { type: "button", class: "ghost", id: "howBtn" }, "How to play");
    how.addEventListener("click", () => startTutorial(true));
    $(".foot").prepend(how);
    $("#resetStats").addEventListener("click", () => setTimeout(() => { if (stats.played === 0) { profile = blankProfile(); saveProfile(); renderYou(); } }, 0));
    buildYou(); renderYou();
  });
  // The game builds its first round on DOMContentLoaded; build the Rodden explainer before that.
  buildRodden();
})();
