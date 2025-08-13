/*********************** CONFIG ***********************/
const DATA_ODDS_URL = "./data/odds.json";     // ajuste se necessário
const DATA_RESULTS_URL = "./data/results.json";
const CUTOFF_MINUTES_DEFAULT = 2;

/********************* COOKIES/NICK ********************/
function setCookie(name, value, days=365){const d=new Date();d.setTime(d.getTime()+days*24*60*60*1e3);document.cookie=`${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/`;}
function getCookie(name){const c=name+"=";return decodeURIComponent(document.cookie).split(";").map(s=>s.trim()).find(s=>s.startsWith(c))?.slice(c.length)||null;}
let NICK = getCookie('tb_nick');
function keySaldo(){return `tb_${NICK}_saldo`;}
function keyApostas(){return `tb_${NICK}_bets`;}
function getSaldo(){return Number(localStorage.getItem(keySaldo()) ?? 1000);} 
function setSaldo(v){localStorage.setItem(keySaldo(), String(v)); renderSaldo();}
function renderSaldo(){document.getElementById('saldo').textContent = `Saldo: ${getSaldo().toFixed(2)} créditos`;}
function getBets(){try{return JSON.parse(localStorage.getItem(keyApostas())||'[]')}catch{return []}}
function setBets(a){localStorage.setItem(keyApostas(), JSON.stringify(a)); renderHist();}

/********************* UTILITÁRIOS *********************/
const byId = id => document.getElementById(id);
const el = (tag,cls,txt) => {const e=document.createElement(tag); if(cls) e.className=cls; if(txt) e.textContent=txt; return e;}
const norm = s => (s||'').replace(/\s+/g,' ').trim();
function leftMs(startIso, cutoff){return new Date(startIso).getTime() - Date.now() - cutoff*60*1000;}
function fmt(iso){const d=new Date(iso);return d.toLocaleString('pt-BR',{dateStyle:'short', timeStyle:'short'});}

/******************** TOAST ****************************/
function showToast({ title="Aposta criada", message="", undo=null, duration=5000 } = {}){
  const box = byId('toastContainer');
  const t = document.createElement('div'); t.className = 'toast';
  const ttl = document.createElement('span'); ttl.className='title'; ttl.textContent = title;
  const msg = document.createElement('span'); msg.textContent = message;
  const close = document.createElement('button'); close.className='close'; close.textContent='✕';
  close.onclick = () => dismiss();
  t.append(ttl, msg);
  if(undo){
    const btn = document.createElement('button'); btn.className='undo'; btn.textContent='Desfazer';
    btn.onclick = () => { try{undo()}finally{dismiss()} };
    t.append(btn);
  }
  t.append(close);
  box.appendChild(t);
  const timer = setTimeout(dismiss, duration);
  function dismiss(){ clearTimeout(timer); t.remove(); }
}

/******************* RENDER DE JOGOS ******************/ 
let CURRENT_ODDS = null;
async function loadOdds(){
  byId('lista').innerHTML = '<div class="muted">Carregando jogos…</div>';
  try{
    const r=await fetch(DATA_ODDS_URL,{cache:'no-store'});
    CURRENT_ODDS = await r.json();
  }catch(e){
    byId('lista').innerHTML = '<div class="muted">Não consegui carregar o arquivo de odds.</div>';
    return;
  }

  byId('leagueBadge').textContent = CURRENT_ODDS.league || 'Liga';
  const cutoff = CURRENT_ODDS.cutoffMinutes ?? CUTOFF_MINUTES_DEFAULT;
  const list = byId('lista'); list.innerHTML = '';

  (CURRENT_ODDS.matches||[]).forEach(match => {
    const card = el('div','card');

    // Cabeçalho do jogo
    const top = el('div','row');
    const teams = el('div','teams grow', `${match.home} x ${match.away}`);
    const when = el('div','muted', fmt(match.start) + ' • PRÉ');
    top.append(teams, when);

    // Stake
    const stakeRow = el('div','row');
    const stakeLbl = el('span','muted','Stake');
    const stakeIn = el('input'); stakeIn.type='number'; stakeIn.min='1'; stakeIn.step='1'; stakeIn.value='10'; stakeIn.id = `stake_${match.id}`;
    stakeRow.append(stakeLbl, stakeIn);

    // Odds 1X2
    const odds = el('div','odds');
    const o = match.markets?.['1X2'];
    const btns = [];
    [['home','Casa'],['draw','Empate'],['away','Fora']].forEach(([k,label])=>{
      if(!o||!Number.isFinite(o[k])) return;
      const b = el('button','odd', `${label} @ ${o[k].toFixed(2)}`);
      b.addEventListener('click', () => apostar(match,'1X2',k,o[k],cutoff,b));
      btns.push(b); odds.appendChild(b);
    });

    // Timer
    const timer = el('div','timer muted');
    const tick=()=>{const ms=leftMs(match.start,cutoff); btns.forEach(b=>b.disabled = ms<=0); timer.textContent = ms>0?`Fecha em ${Math.max(0,Math.floor(ms/1000))}s`:'Apostas fechadas';};
    tick(); setInterval(tick,1000);

    card.append(top, stakeRow, odds, timer);
    list.appendChild(card);
  });
}

function apostar(match, market, pick, odd, cutoff, btn){
  if(leftMs(match.start,cutoff) <= 0){ btn.disabled=true; return; }
  const stakeEl = byId(`stake_${match.id}`); const stake = Math.max(1, Math.floor(Number(stakeEl?.value||10)));
  const saldo = getSaldo(); if(stake>saldo){ showToast({title:'Saldo insuficiente', message:`Você tem ${saldo.toFixed(2)} créditos.`}); return; }

  setSaldo(saldo - stake);
  const bets = getBets();
  const bet = { id:`bet_${Date.now()}_${Math.random().toString(16).slice(2)}`, eventId: match.id, desc:`${match.home} x ${match.away}`, start: match.start, market, pick, odd, stake, status:'PENDING', retorno:null };
  bets.push(bet);
  setBets(bets);

  // Toast “aposta criada”
  showToast({
    title:"Aposta criada",
    message:` ${market} ${pick.toUpperCase()} @ ${odd} • stake ${stake}`,
    undo: () => { // desfazer se ainda der tempo (antes do cutoff)
      const cutoffMin = (CURRENT_ODDS?.cutoffMinutes ?? CUTOFF_MINUTES_DEFAULT);
      if (leftMs(match.start, cutoffMin) <= 0) return;
      setSaldo(getSaldo() + bet.stake);
      setBets(getBets().filter(x => x.id !== bet.id));
    },
    duration: 5000
  });
}

/******************** HISTÓRICO ************************/ 
function renderHist(){
  const box = byId('hist');
  const a = getBets().slice().reverse();
  if(!a.length){box.innerHTML='<span class="muted">Sem apostas ainda.</span>'; return;}
  box.innerHTML = '';
  for(const b of a){
    const row = el('div','row');
    const left = el('div','grow', `${b.desc} • ${b.market} ${b.pick.toUpperCase()} @ ${b.odd} • stake ${b.stake}`);
    let tag;
    if(b.status==='WON') tag=el('span','tag tag-won','WON');
    else if(b.status==='LOST') tag=el('span','tag tag-lost','LOST');
    else if(b.status==='VOID') tag=el('span','tag tag-void','VOID');
    else tag=el('span','tag tag-pending','PENDING');

    // Cancelar antes do cutoff
    const match = (CURRENT_ODDS?.matches||[]).find(m=>m.id===b.eventId);
    if (match && leftMs(match.start, CURRENT_ODDS?.cutoffMinutes ?? CUTOFF_MINUTES_DEFAULT) > 0 && b.status==='PENDING') {
      const actions = el('div','btn-row');
      const btnCancel = el('button','btn-sm','Cancelar');
      btnCancel.onclick = () => {
        setSaldo(getSaldo() + b.stake);
        setBets(getBets().filter(x => x.id !== b.id));
        showToast({title:'Aposta cancelada', message:`${b.desc}`});
      };
      actions.append(btnCancel);
      row.append(actions);
    }

    row.append(left, tag);
    box.appendChild(row);
  }
}

/********************* LIQUIDAÇÃO **********************/
async function liquidar(){
  let payload; 
  try{
    const r=await fetch(DATA_RESULTS_URL,{cache:'no-store'});
    if(!r.ok) return;
    payload=await r.json();
  }catch{return;}
  const resMap = new Map((payload.results||[]).map(r=>[r.eventId, r]));
  const bets = getBets(); let saldo = getSaldo(); let mudou=false;
  for(const bet of bets){
    if(bet.status!=='PENDING') continue;
    const r = resMap.get(bet.eventId); if(!r || r.status!== 'FINISHING') continue; // só liquida quando FINISHING
    const ph = Number(r.home), pa = Number(r.away);
    let won=false;
    if(bet.market==='1X2'){
      if(ph>pa) won = bet.pick==='home'; else if(ph<pa) won = bet.pick==='away'; else won = bet.pick==='draw';
    }
    if(won){ const ret = Math.floor(bet.stake * bet.odd); saldo += ret; bet.status='WON'; bet.retorno=ret; }
    else { bet.status='LOST'; bet.retorno=0; }
    mudou=true;
  }
  if(mudou){ setSaldo(saldo); setBets(bets); showToast({title:'Pronto', message:'Apostas liquidadas!'}); }
}

/******************** NICK / MODAL *********************/
const modal = byId('modalNick');
function ensureNick(){
  if(!NICK){ modal.style.display='flex'; byId('nickInput').focus(); }
  else { if(localStorage.getItem(keySaldo())==null) setSaldo(1000); renderSaldo(); renderHist(); loadOdds(); }
}
byId('nickConfirm').addEventListener('click', ()=>{ const v=norm(byId('nickInput').value).slice(0,24); if(!v) return; NICK=v; setCookie('tb_nick', v); modal.style.display='none'; if(localStorage.getItem(keySaldo())==null) setSaldo(1000); renderSaldo(); renderHist(); loadOdds();});
byId('btnNick').addEventListener('click', ()=>{ modal.style.display='flex'; byId('nickInput').value=''; byId('nickInput').focus(); });

/********************* BOTOES TOP **********************/
byId('btnSettle').addEventListener('click', liquidar);
byId('btnReset').addEventListener('click', ()=>{ if(confirm('Zerar sua carteira e apostas?')){ setSaldo(1000); setBets([]); showToast({title:'Pronto', message:'Carteira zerada.'}); }});

/*********************** INIT **************************/
ensureNick();
