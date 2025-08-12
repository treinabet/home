/*********************** CONFIG ***********************/
const DATA_ODDS_URL = "./data/odds.json";
const DATA_RESULTS_URL = "./data/results.json";
const CUTOFF_MINUTES_DEFAULT = 2;

/********************* COOKIES/NICK ********************/
function setCookie(name, value, days = 365) {
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1e3);
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/`;
}
function getCookie(name) {
  const c = name + "=";
  return decodeURIComponent(document.cookie)
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(c))
    ?.slice(c.length) || null;
}
let NICK = getCookie("tb_nick");
function keySaldo() {
  return `tb_${NICK}_saldo`;
}
function keyApostas() {
  return `tb_${NICK}_bets`;
}
function getSaldo() {
  return Number(localStorage.getItem(keySaldo()) ?? 1000);
}
function setSaldo(v) {
  localStorage.setItem(keySaldo(), String(v));
  renderSaldo();
}
function renderSaldo() {
  document.getElementById(
    "saldo"
  ).textContent = `Saldo: ${getSaldo().toFixed(2)} créditos`;
}
function getBets() {
  try {
    return JSON.parse(localStorage.getItem(keyApostas()) || "[]");
  } catch {
    return [];
  }
}
function setBets(a) {
  localStorage.setItem(keyApostas(), JSON.stringify(a));
  renderHist();
}

/********************* UTILITÁRIOS *********************/
const byId = (id) => document.getElementById(id);
const el = (tag, cls, txt) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt) e.textContent = txt;
  return e;
};
const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
function leftMs(startIso, cutoff) {
  return new Date(startIso).getTime() - Date.now() - cutoff * 60 * 1000;
}
function fmt(iso) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/******************** TOAST ****************************/
function showToast(msg, undoCallback = null) {
  let toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<span>${msg}</span>`;

  if (undoCallback) {
    let undoBtn = document.createElement("button");
    undoBtn.textContent = "Cancelar";
    undoBtn.onclick = () => {
      undoCallback();
      toast.remove();
    };
    toast.appendChild(undoBtn);
  }

  document.getElementById("toastContainer").appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 5000);
}

/******************* RENDER DE JOGOS ******************/
let CURRENT_ODDS = null;
async function loadOdds() {
  byId("lista").innerHTML = '<div class="muted">Carregando jogos…</div>';
  try {
    const r = await fetch(DATA_ODDS_URL, { cache: "no-store" });
    CURRENT_ODDS = await r.json();
  } catch (e) {
    byId("lista").innerHTML =
      '<div class="muted">Não consegui carregar o arquivo de odds.</div>';
    return;
  }
  byId("oddsFile").textContent = DATA_ODDS_URL;
  byId("leagueBadge").textContent = CURRENT_ODDS.league || "Liga";

  const cutoff = CURRENT_ODDS.cutoffMinutes ?? CUTOFF_MINUTES_DEFAULT;
  const list = byId("lista");
  list.innerHTML = "";

  (CURRENT_ODDS.matches || []).forEach((match) => {
    const card = el("div", "card");

    const top = el("div", "row");
    const teams = el(
      "div",
      "teams grow",
      `${match.home} x ${match.away}`
    );
    const when = el("div", "muted", fmt(match.start) + " • PRÉ");
    top.append(teams, when);

    const stakeRow = el("div", "row");
    const stakeLbl = el("span", "muted", "Stake");
    const stakeIn = el("input");
    stakeIn.type = "number";
    stakeIn.min = "1";
    stakeIn.step = "1";
    stakeIn.value = "10";
    stakeIn.id = `stake_${match.id}`;
    stakeRow.append(stakeLbl, stakeIn);

    const odds = el("div", "odds");
    const o = match.markets?.["1X2"];
    const btns = [];
    [["home", "Casa"], ["draw", "Empate"], ["away", "Fora"]].forEach(
      ([k, label]) => {
        if (!o || !Number.isFinite(o[k])) return;
        const b = el(
          "button",
          "odd",
          `${label} @ ${o[k].toFixed(2)}`
        );
        b.addEventListener("click", () =>
          apostar(match, "1X2", k, o[k], cutoff, b)
        );
        btns.push(b);
        odds.appendChild(b);
      }
    );

    const timer = el("div", "timer muted");
    const tick = () => {
      const ms = leftMs(match.start, cutoff);
      btns.forEach((b) => (b.disabled = ms <= 0));
      timer.textContent =
        ms > 0
          ? `Fecha em ${Math.max(0, Math.floor(ms / 1000))}s`
          : "Apostas fechadas";
    };
    tick();
    setInterval(tick, 1000);

    card.append(top, stakeRow, odds, timer);
    list.appendChild(card);
  });
}

function apostar(match, market, pick, odd, cutoff, btn) {
  if (leftMs(match.start, cutoff) <= 0) {
    btn.disabled = true;
    return;
  }
  const stakeEl = byId(`stake_${match.id}`);
  const stake = Math.max(1, Math.floor(Number(stakeEl?.value || 10)));
  const saldo = getSaldo();
  if (stake > saldo) {
    alert("Saldo insuficiente.");
    return;
  }
  setSaldo(saldo - stake);
  const bets = getBets();
  const newBet = {
    id: `bet_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    eventId: match.id,
    desc: `${match.home} x ${match.away}`,
    start: match.start,
    market,
    pick,
    odd,
    stake,
    status: "PENDING",
    retorno: null,
  };
  bets.push(newBet);
  setBets(bets);

  showToast(`Aposta criada: ${match.home} x ${match.away}`, () => {
    cancelarAposta(newBet.id);
  });
}

function cancelarAposta(betId) {
  let bets = getBets();
  let bet = bets.find((b) => b.id === betId);
  if (bet && bet.status === "PENDING") {
    setSaldo(getSaldo() + bet.stake);
    bets = bets.filter((b) => b.id !== betId);
    setBets(bets);
    showToast("Aposta cancelada");
  }
}

/******************** HISTÓRICO ************************/
function renderHist() {
  const box = byId("hist");
  const a = getBets().slice().reverse();
  if (!a.length) {
    box.innerHTML = '<span class="muted">Sem apostas ainda.</span>';
    return;
  }
  box.innerHTML = "";
  for (const b of a) {
    const row = el("div", "row");
    const left = el(
      "div",
      "grow",
      `${b.desc} • ${b.market} ${b.pick.toUpperCase()} @ ${b.odd} • stake ${
        b.stake
      }`
    );
    let tag;
    if (b.status === "WON") tag = el("span", "tag tag-won", "WON");
    else if (b.status === "LOST") tag = el("span", "tag tag-lost", "LOST");
    else if (b.status === "VOID") tag = el("span", "tag tag-void", "VOID");
    else {
      tag = el("span", "tag tag-pending", "PENDING");
      let cancelBtn = el("button", "btn btn-danger", "Cancelar");
      cancelBtn.style.marginLeft = "10px";
      cancelBtn.onclick = () => cancelarAposta(b.id);
      row.append(cancelBtn);
    }
    row.append(left, tag);
    box.appendChild(row);
  }
}

/********************* LIQUIDAÇÃO **********************/
async function liquidar() {
  let payload;
  try {
    const r = await fetch(DATA_RESULTS_URL, { cache: "no-store" });
    if (!r.ok) return;
    payload = await r.json();
  } catch {
    return;
  }
  const resMap = new Map(
    (payload.results || []).map((r) => [r.eventId, r])
  );
  const bets = getBets();
  let saldo = getSaldo();
  let mudou = false;
  for (const bet of bets) {
    if (bet.status !== "PENDING") continue;
    const r = resMap.get(bet.eventId);
    if (!r || r.status !== "FINISHING") continue;
    const ph = Number(r.home),
      pa = Number(r.away);
    let won = false;
    if (bet.market === "1X2") {
      if (ph > pa) won = bet.pick === "home";
      else if (ph < pa) won = bet.pick === "away";
      else won = bet.pick === "draw";
    }
    if (won) {
      const ret = Math.floor(bet.stake * bet.odd);
      saldo += ret;
      bet.status = "WON";
      bet.retorno = ret;
    } else {
      bet.status = "LOST";
      bet.retorno = 0;
    }
    mudou = true;
  }
  if (mudou) {
    setSaldo(saldo);
    setBets(bets);
    showToast("Apostas liquidadas!");
  }
}

/******************** NICK / MODAL *********************/
const modal = byId("modalNick");
function ensureNick() {
  if (!NICK) {
    modal.style.display = "flex";
    byId("nickInput").focus();
  } else {
    if (localStorage.getItem(keySaldo()) == null) setSaldo(1000);
    renderSaldo();
    renderHist();
    loadOdds();
  }
}
byId("nickConfirm").addEventListener("click", () => {
  const v = norm(byId("nickInput").value).slice(0, 24);
  if (!v) return;
  NICK = v;
  setCookie("tb_nick", v);
  modal.style.display = "none";
  if (localStorage.getItem(keySaldo()) == null) setSaldo(1000);
  renderSaldo();
  renderHist();
  loadOdds();
});
byId("btnNick").addEventListener("click", () => {
  modal.style.display = "flex";
  byId("nickInput").value = "";
  byId("nickInput").focus();
});

/********************* BOTOES TOP **********************/
byId("btnSettle").addEventListener("click", liquidar);
byId("btnReset").addEventListener("click", () => {
  if (confirm("Zerar sua carteira e apostas?")) {
    setSaldo(1000);
    setBets([]);
  }
});

/*********************** INIT **************************/
ensureNick();
