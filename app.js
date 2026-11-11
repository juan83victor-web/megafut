// Megafut: interface do modo carreira. O motor roda no worker (Python via Pyodide).
const app = document.getElementById("app");
const menu = document.getElementById("menu");

// ---------------------------------------------------------------------------
// Ponte com o motor
// ---------------------------------------------------------------------------
const motor = new Worker(new URL("./motor_worker.js", import.meta.url), { type: "module" });
let proximoPedido = 1;
const esperando = new Map();
let motorPronto = false;
motor.onmessage = (evento) => {
  const msg = evento.data || {};
  if (msg.tipo === "progresso") {
    const alvo = document.getElementById("progresso");
    if (alvo) alvo.textContent = msg.texto;
  } else if (msg.tipo === "pronto") {
    motorPronto = true;
    iniciarApp();
  } else if (msg.tipo === "falha") {
    app.innerHTML = `<div class="carregando"><div><h1>Megafut</h1><p class="sub">Não foi possível ligar o motor.</p>
      <p class="minus">${esc(msg.texto)}</p><button class="btn" onclick="location.reload()">Tentar de novo</button></div></div>`;
  } else if (msg.tipo === "resposta") {
    const pendente = esperando.get(msg.id);
    if (!pendente) return;
    esperando.delete(msg.id);
    let dados;
    try { dados = JSON.parse(msg.resposta); } catch (e) { pendente.rejeitar(new Error("Resposta inválida do motor")); return; }
    if (dados.ok) pendente.resolver(dados.dados); else pendente.rejeitar(new Error(dados.erro || "Erro no motor"));
  }
};
function api(acao, args = {}) {
  return new Promise((resolver, rejeitar) => {
    const id = proximoPedido++;
    esperando.set(id, { resolver, rejeitar });
    motor.postMessage({ tipo: "pedido", id, pedido: JSON.stringify({ acao, args }) });
  });
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function esc(t) {
  return String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const MENOS = "−";
function num(n) { return String(n ?? "").replace(/^-/, MENOS); }
function sinal(n) { return n > 0 ? "+" + n : num(n); }
function plural(n, um, varios) { return `${n} ${n === 1 ? um : varios}`; }
function escudo(sigla, tamanho = "") { return `<span class="escudo ${tamanho}">${esc(sigla || "?")}</span>`; }
function chip(texto, tipo = "") { return `<span class="chip ${tipo}">${esc(texto)}</span>`; }
function dominio(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return ""; } }
function fonte(url, rotulo = "Fonte") {
  if (!url || !String(url).startsWith("http")) return "";
  return `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(rotulo)}: ${esc(dominio(url))}</a>`;
}
let toastTimer = null;
function aviso(texto) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = texto;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 3200);
}
function carregando(texto) {
  app.innerHTML = `<div class="carregando"><div><div class="anel"></div><p class="sub">${esc(texto)}</p></div></div>`;
}
function folha(html) {
  fecharFolha();
  const f = document.createElement("div");
  f.className = "folha";
  f.innerHTML = `<div>${html}</div>`;
  f.addEventListener("click", (e) => { if (e.target === f) fecharFolha(); });
  document.body.appendChild(f);
  return f.firstElementChild;
}
function fecharFolha() { document.querySelectorAll(".folha").forEach((f) => f.remove()); }
function rotuloHumor(v) { return v >= 85 ? "Empolgada" : v >= 65 ? "Satisfeita" : v >= 45 ? "Neutra" : v >= 25 ? "Insatisfeita" : "Revoltada"; }
const TIPOS = {
  definitiva: "Transferência definitiva", livre: "Jogador livre", pre_contrato: "Pré contrato", emprestimo: "Empréstimo",
  multa: "Multa rescisória", troca: "Troca", recompra: "Recompra",
};
const ETAPAS = {
  clube: "Clube analisando", jogador: "Jogador analisando", aguardando_usuario: "Esperando você", concluida: "Concluída",
  recusada: "Recusada", expirada: "Expirada", cancelada: "Cancelada",
};
const POS = { GOL: "Goleiros", ZAG: "Zagueiros", LAT: "Laterais", VOL: "Volantes", MEI: "Meias", PON: "Pontas", ATA: "Atacantes" };
// Plantel por função: lateral direito e esquerdo separados; defensor sem função na fonte à parte
const GRUPOS_PLANTEL = [["GOL", "Goleiros"], ["ZAG", "Zagueiros"], ["LD", "Laterais direitos"], ["LE", "Laterais esquerdos"],
  ["LAT", "Laterais (lado a confirmar)"], ["DEF", "Defensores (zagueiro ou lateral a confirmar)"], ["VOL", "Volantes"],
  ["MEI", "Meias"], ["PD", "Pontas direitos"], ["PE", "Pontas esquerdos"], ["PON", "Pontas (lado a confirmar)"], ["ATA", "Atacantes"]];
// Nome e sobrenome: primeiro e último nome quando a fonte traz mais de dois; apelido fica como está
function corOvr(n) { return n >= 75 ? "o1" : n >= 65 ? "o2" : n >= 52 ? "o3" : "o4"; }
function textoIdade(j) { return j.idade_ok ? j.idade + " anos" : "idade sem fonte"; }
function nomeSobrenome(nome) {
  const p = String(nome || "").replace(/\s*\(.*?\)\s*/g, " ").trim().split(/\s+/).filter(Boolean);
  if (p.length <= 2) return p.join(" ");
  const ultimo = ["Júnior", "Junior", "Jr.", "Filho", "Neto", "Sobrinho"].includes(p[p.length - 1]) && p.length > 2 ? p.slice(-2).join(" ") : p[p.length - 1];
  return p[0] + " " + ultimo;
}
const ovr = (j) => (j.ovr ?? (j.nivel != null ? Math.round(j.nivel * 5) : "")); 
const ovrMostra = (j) => (j.conhec != null && j.conhec < 100 && j.ovr_txt ? j.ovr_txt.replace(" a ", "~") : ovr(j));

// ---------------------------------------------------------------------------
// Saves: banco do artifact (durável) e cópia local
// ---------------------------------------------------------------------------
const PARTE = 190000;
// Fora do Claude (app instalado no celular) o save fica no banco interno do navegador (IndexedDB),
// que aguenta saves grandes; o localStorage tem limite de uns 5 MB.
const EH_APP = !(window.claude && window.claude.use);
function idb() {
  return new Promise((ok, falha) => {
    try {
      const r = indexedDB.open("megafut", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("saves");
      r.onsuccess = () => ok(r.result);
      r.onerror = () => falha(r.error);
    } catch (e) { falha(e); }
  });
}
async function idbLer(chave) {
  try {
    const db = await idb();
    return await new Promise((ok) => { const q = db.transaction("saves").objectStore("saves").get(chave); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); });
  } catch (e) { return null; }
}
async function idbGravar(chave, valor) {
  try {
    const db = await idb();
    return await new Promise((ok) => { const t = db.transaction("saves", "readwrite"); t.objectStore("saves").put(valor, chave); t.oncomplete = () => ok(true); t.onerror = () => ok(false); });
  } catch (e) { return false; }
}
if (EH_APP && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
const VERSAO_APP = "a4d00ae2296f";
if (EH_APP && "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  const tinhaControle = Boolean(navigator.serviceWorker.controller);
  let recarregou = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // versão nova assumiu: recarrega sozinho (menos no meio de um jogo ao vivo)
    if (!tinhaControle || recarregou) return;
    if (telaAtual() === "aovivo") { aviso("Atualização do Megafut pronta: ela entra quando o jogo acabar."); return; }
    recarregou = true;
    aviso("Megafut atualizado. Recarregando");
    setTimeout(() => location.reload(), 900);
  });
  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then((reg) => {
    reg.update().catch(() => {});
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
    reg.addEventListener("updatefound", () => {
      const novo = reg.installing;
      if (novo && navigator.serviceWorker.controller) aviso("Baixando a versão nova do Megafut");
    });
  }).catch(() => {});
}
let banco = null;
let usuarioId = null;
let bancoPronto = (async () => {
  try {
    if (!window.claude || !window.claude.use) return;
    const [u, d] = await Promise.all([window.claude.use("user"), window.claude.use("db")]);
    if (!u || !d) return;
    const id = await u.id();
    if (!id) return;
    usuarioId = id;
    banco = d;
  } catch (e) { banco = null; }
})();
function local(chave, valor) {
  try {
    if (valor === undefined) return localStorage.getItem(chave);
    if (valor === null) localStorage.removeItem(chave); else localStorage.setItem(chave, valor);
  } catch (e) { return null; }
  return null;
}
// Dois espaços de carreira: o 1 usa as chaves antigas (saves de antes continuam valendo)
const SLOT = {
  idb: (n) => n === 2 ? "carreira2" : "carreira",
  texto: (n) => n === 2 ? "megafut_save2" : "megafut_save",
  rotulo: (n) => n === 2 ? "megafut_rotulo2" : "megafut_rotulo",
  doc: (n) => n === 2 ? "megafut2" : "megafut",
};
async function lerSaveDoBanco(slot = 1) {
  await Promise.race([bancoPronto, new Promise((r) => setTimeout(r, 10000))]);
  if (!banco || !usuarioId) return null;
  try {
    const col = banco.collection("data/users/" + usuarioId);
    const meta = await col.doc(SLOT.doc(slot) + "_meta").get();
    if (!meta.exists) return null;
    const m = meta.data();
    const partes = [];
    for (let i = 0; i < m.partes; i++) {
      const p = await col.doc(SLOT.doc(slot) + "_parte_" + i).get();
      if (!p.exists) return null;
      partes.push(p.data().texto);
    }
    return { texto: partes.join(""), rotulo: m.rotulo, quando: m.quando };
  } catch (e) { return null; }
}
let salvando = false;
async function gravarSave(texto, rotulo, slot = S.slot || 1) {
  local(SLOT.texto(slot), texto);
  local(SLOT.rotulo(slot), rotulo);
  S.saves[slot] = { texto, rotulo, quando: new Date().toISOString() };
  const noAparelho = await idbGravar(SLOT.idb(slot), S.saves[slot]);
  if (EH_APP) return noAparelho;
  if (!banco || !usuarioId || salvando) return false;
  salvando = true;
  try {
    const col = banco.collection("data/users/" + usuarioId);
    const partes = [];
    for (let i = 0; i < texto.length; i += PARTE) partes.push(texto.slice(i, i + PARTE));
    for (let i = 0; i < partes.length; i++) await col.doc(SLOT.doc(slot) + "_parte_" + i).set({ texto: partes[i] });
    await col.doc(SLOT.doc(slot) + "_meta").set({ partes: partes.length, rotulo, quando: new Date().toISOString() });
    return true;
  } catch (e) {
    return false;
  } finally { salvando = false; }
}
let ultimoSave = 0;
async function salvarAgora(forcar = false) {
  if (!S.estado) return;
  if (!forcar && Date.now() - ultimoSave < 45000) return;
  ultimoSave = Date.now();
  try {
    const s = await api("salvar");
    const ok = await gravarSave(s.texto, s.rotulo);
    if (forcar) aviso(ok ? (EH_APP ? "Carreira salva neste aparelho" : "Carreira salva") : "Salva neste aparelho (o salvamento na conta não respondeu)");
  } catch (e) { if (forcar) aviso("Não deu para salvar: " + e.message); }
}

// ---------------------------------------------------------------------------
// Estado da tela e navegação
// ---------------------------------------------------------------------------
const S = { inicio: null, estado: null, paises: null, pais: 0, partida: null, compAberta: null, abaMercado: "buscar",
  filtros: { posicao: "", pais: "", liga: "", nacionalidade: "", idade_min: 15, idade_max: 40, faixa: "", nivel_min: 0, situacao: "", ordem: "ovr", na_verba: false, texto: "" }, opcoesMercado: null, saveExistente: null, saves: { 1: null, 2: null }, slot: +(localStorage.getItem("megafut_slot") || 1) };
const TELAS_COM_MENU = ["painel", "elenco", "jogos", "mercado", "clube", "portal"];
function ir(nome) { if (location.hash !== "#" + nome) location.hash = nome; else desenhar(); }
window.addEventListener("hashchange", () => desenhar());
function telaAtual() { return (location.hash || "#inicio").slice(1) || "inicio"; }

const ICONES = {
  painel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  elenco: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c.8-3.4 3.2-5 6-5s5.2 1.6 6 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.3c2.4.1 4.3 1.6 5 4.7"/></svg>',
  jogos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 12h18M12 4v16"/><circle cx="12" cy="12" r="3"/></svg>',
  mercado: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h11l-3-3M20 17H9l3 3"/></svg>',
  clube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg>',
  portal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="7.5" r="3.5"/><path d="M5 20c1-4 3.8-6 7-6s6 2 7 6"/><path d="M17.5 4.5l2-1.5"/></svg>',
};
function desenharMenu(tela) {
  if (!S.estado || !TELAS_COM_MENU.includes(tela)) { menu.hidden = true; return; }
  menu.hidden = false;
  const nomes = { painel: "Painel", elenco: "Elenco", jogos: "Jogos", mercado: "Mercado", clube: "Clube", portal: "Portal" };
  const marca = S.estado.propostas ? " •" : "";
  const pt = S.estado.portal || {};
  const marcaPortal = pt.desempregado || pt.coletiva || pt.ofertas || pt.patrocinio || pt.risco === "alto" ? " •" : "";
  menu.innerHTML = TELAS_COM_MENU.map((t) => `<button class="${t === tela ? "on" : ""}" data-ir="${t}">${ICONES[t]}<span>${nomes[t]}${t === "mercado" ? marca : t === "portal" ? marcaPortal : ""}</span></button>`).join("");
  menu.querySelectorAll("[data-ir]").forEach((b) => b.addEventListener("click", () => ir(b.dataset.ir)));
}

async function desenhar() {
  const tela = telaAtual();
  temaCompeticao(null);
  fecharFolha();
  desenharMenu(tela);
  window.scrollTo(0, 0);
  try {
    if (!S.estado && TELAS_COM_MENU.includes(tela)) { ir("inicio"); return; }
    if (tela === "inicio") return telaInicio();
    if (tela === "escolha") return telaEscolha();
    if (tela === "dados") return telaDados();
    if (tela === "painel") return telaPainel();
    if (tela === "partida") return telaPartida();
    if (tela === "aovivo") return telaAoVivo();
    if (tela === "elenco") return telaElenco();
    if (tela === "jogos") return telaJogos();
    if (tela === "mercado") return telaMercado();
    if (tela === "clube") return telaClube();
    if (tela === "portal") return telaPortal();
    return telaInicio();
  } catch (e) {
    app.innerHTML = `<div class="cartao"><h3>Algo deu errado</h3><p class="minus">${esc(e.message)}</p></div>`;
  }
}

async function iniciarApp() {
  try { S.inicio = await api("inicio"); } catch (e) { S.inicio = null; }
  for (const n of [1, 2]) {
    const localTexto = local(SLOT.texto(n));
    let melhor = localTexto ? { texto: localTexto, rotulo: local(SLOT.rotulo(n)) || "Carreira salva" } : null;
    const doAparelho = await idbLer(SLOT.idb(n));
    if (doAparelho && doAparelho.texto && (!melhor || doAparelho.texto.length >= melhor.texto.length))
      melhor = { texto: doAparelho.texto, rotulo: doAparelho.rotulo || "Carreira salva", quando: doAparelho.quando };
    S.saves[n] = melhor;
  }
  desenhar();
  for (const n of [1, 2]) lerSaveDoBanco(n).then((s) => {
    if (s && s.texto && (!S.saves[n] || s.texto.length)) { S.saves[n] = s; if (telaAtual() === "inicio" && !S.estado) desenhar(); }
  });
}
function usarSlot(n) { S.slot = n; try { localStorage.setItem("megafut_slot", String(n)); } catch (e) { } }

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------
function telaInicio() {
  const i = S.inicio || {};
  app.innerHTML = `
    <div style="padding-top:28px">
      <p class="chip al">Modo carreira 2026</p>
      <h1 style="font-size:64px;margin:14px 0 6px">Mega<br>fut</h1>
      <p class="sub">${i.clubes || "..."} clubes de ${i.paises || "..."} países, todos jogando ao mesmo tempo. A temporada 2026 começa em aberto: participantes reais, resultados decididos em campo.</p>
    </div>
    ${S.estado ? `<button class="btn" id="voltar" style="margin-top:22px">Voltar para a carreira</button>` : ""}
    ${[1, 2].map((n) => { const sv = S.saves[n]; return `<div class="cartao ${sv ? "destaque" : ""}">
      <p class="minus">Carreira ${n}${S.estado && S.slot === n ? " · aberta agora" : ""}</p>
      ${sv ? `<h3 style="margin:4px 0 12px;color:var(--giz)">${esc(sv.rotulo)}</h3>${sv.quando ? `<p class="minus" style="margin:-6px 0 10px">Salva em ${esc(new Date(sv.quando).toLocaleString("pt-BR"))}</p>` : ""}
        <div class="grade2"><button class="btn" data-continuar="${n}">Continuar</button><button class="btn sec" data-nova="${n}">Nova aqui</button></div>`
      : `<h3 style="margin:4px 0 12px;color:var(--giz3)">Espaço livre</h3><button class="btn ${S.saves[1] || S.saves[2] ? "sec" : ""}" data-nova="${n}">Nova carreira</button>`}
    </div>`; }).join("")}
    <p class="minus" style="margin:6px 0 12px">${i.jogaveis || 0} clubes já têm elenco real com fonte e podem ser assumidos. Os outros estão em pesquisa.</p>
    <div class="grade2">
      <button class="btn sec" id="dados">Situação dos dados</button>
      <button class="btn sec" id="importar">Colar um save</button>
    </div>
    <p class="minus" style="margin-top:16px">Atributos, valores, salários, contratos e orçamentos são estimativas do Megafut e aparecem marcados. Escudo oficial não é usado: cada clube aparece com um selo de giz com a sigla.</p>`;
  const $ = (id) => document.getElementById(id);
  if ($("voltar")) $("voltar").onclick = () => ir("painel");
  app.querySelectorAll("[data-continuar]").forEach((b) => b.onclick = async () => {
    const n = +b.dataset.continuar;
    if (S.estado && S.slot === n) { ir("painel"); return; }
    if (S.estado) await salvarAgora(true);
    usarSlot(n); carregarSave(S.saves[n].texto);
  });
  app.querySelectorAll("[data-nova]").forEach((b) => b.onclick = async () => {
    const n = +b.dataset.nova;
    if (S.estado) await salvarAgora(true);
    if (S.saves[n]) {
      const c = folha(`<h2>Substituir a carreira ${n}?</h2><p class="sub">${esc(S.saves[n].rotulo)} será apagada quando a nova carreira for salva. Se quiser guardar, use antes Clube, Baixar save.</p>
        <div class="grade2" style="margin-top:12px"><button class="btn" id="simn">Começar do zero</button><button class="btn sec" id="naon">Cancelar</button></div>`);
      c.querySelector("#naon").onclick = fecharFolha;
      c.querySelector("#simn").onclick = () => { fecharFolha(); usarSlot(n); pedirNomeDoTecnico(); };
      return;
    }
    usarSlot(n); pedirNomeDoTecnico();
  });
  const pedirNomeDoTecnico = () => {
    const f = folha(`<h2>Seu nome de técnico</h2><p class="sub">É assim que a imprensa, a torcida e a diretoria vão te chamar.</p>
      <div class="campo"><label>Nome</label><input id="nome" maxlength="40" autocomplete="name" value="${esc(local("megafut_tecnico") || "")}" placeholder="Seu nome"></div>
      <button class="btn" id="ok">Escolher o clube</button>`);
    const entrada = f.querySelector("#nome");
    setTimeout(() => entrada.focus(), 200);
    f.querySelector("#ok").onclick = () => {
      const nome = entrada.value.replace(/-/g, " ").replace(/\s+/g, " ").trim();
      if (!nome) { aviso("Escreva o nome do técnico"); return; }
      S.tecnico = nome; local("megafut_tecnico", nome); fecharFolha(); S.paisMapa = null; S.ligaAberta = null; ir("escolha");
    };
  };
  $("dados").onclick = () => ir("dados");
  $("importar").onclick = () => {
    const f = folha(`<h2>Trazer uma carreira</h2><p class="sub">Abra o arquivo baixado em Clube, Baixar save, ou cole o texto copiado em Clube, Copiar save.</p>
      <label class="btn" style="margin:12px 0">Abrir arquivo de save<input type="file" id="arq" accept=".txt,.megafut,text/plain" style="display:none"></label>
      <textarea id="txt" placeholder="ou cole aqui o texto do save" style="width:100%;height:140px;margin:0 0 12px;background:rgba(0,0,0,.35);color:var(--giz);border:1px solid var(--linha);border-radius:10px;padding:10px"></textarea>
      <div class="campo"><label>Guardar em</label><select id="slotimp"><option value="1">Carreira 1${S.saves[1] ? " (substitui " + esc(S.saves[1].rotulo) + ")" : ""}</option><option value="2" ${S.saves[1] && !S.saves[2] ? "selected" : ""}>Carreira 2${S.saves[2] ? " (substitui " + esc(S.saves[2].rotulo) + ")" : ""}</option></select></div>
      <button class="btn sec" id="ok">Carregar texto colado</button>`);
    f.querySelector("#slotimp").onchange = (ev) => usarSlot(+ev.target.value);
    usarSlot(+f.querySelector("#slotimp").value);
    f.querySelector("#ok").onclick = () => { const t = f.querySelector("#txt").value.trim(); if (t) carregarSave(t); };
    f.querySelector("#arq").onchange = async (ev) => {
      const arquivo = ev.target.files && ev.target.files[0];
      if (!arquivo) return;
      const t = (await arquivo.text()).trim();
      if (t) carregarSave(t); else aviso("Arquivo vazio");
    };
  };
}
async function carregarSave(texto) {
  carregando("Abrindo a carreira");
  try { S.estado = await api("carregar", { texto }); salvarAgora(true); ir("painel"); }
  catch (e) { aviso("Save inválido: " + e.message); ir("inicio"); }
}

// ---------------------------------------------------------------------------
// Escolha do clube
// ---------------------------------------------------------------------------
let MAPA = null;
const GRUPOS_DO_PAIS = { "Estados Unidos": ["Estados Unidos e Canadá", "Estados Unidos"], "Canadá": ["Canadá", "Estados Unidos e Canadá"] };
function ligasDoPais(nome) {
  const grupos = GRUPOS_DO_PAIS[nome] || [nome];
  const ligas = [];
  for (const g of grupos) {
    const p = S.paises.find((x) => x.pais === g);
    if (!p) continue;
    for (const l of p.ligas) {
      const clubes = nome === "Canadá" && g === "Estados Unidos e Canadá" ? l.clubes : l.clubes;
      ligas.push({ ...l, clubes, pais: g });
    }
  }
  return ligas;
}
async function telaEscolha() {
  if (S.ultra === undefined) S.ultra = local("megafut_ultra") === "1";
  if (!S.paises) { carregando("Abrindo o mapa das Américas"); S.paises = await api("paises"); }
  if (!MAPA) { try { MAPA = await (await fetch("./mapa_americas.json")).json(); } catch (e) { MAPA = { w: 360, h: 600, paises: [] }; } }
  const pais = S.paisMapa;
  if (pais && S.ligaAberta !== null && S.ligaAberta !== undefined) return telaLiga(pais, S.ligaAberta);
  const temClube = (n) => ligasDoPais(n).some((l) => l.clubes.length);
  const jogavel = (n) => ligasDoPais(n).some((l) => l.clubes.some((c) => c.jogavel));
  const nomesComClube = [...new Set(MAPA.paises.filter((p) => p.nome && temClube(p.nome)).map((p) => p.nome))].sort((a, b) => (a !== "Brasil") - (b !== "Brasil") || a.localeCompare(b));
  const ligas = pais ? ligasDoPais(pais) : [];
  app.innerHTML = `
    <div class="entre"><div><p class="minus">Técnico ${esc(S.tecnico || "")}</p><h2 style="margin:2px 0 0">Onde vai trabalhar?</h2></div><button class="btn sec peq" id="volta">Voltar</button></div>
    <svg class="mapa" viewBox="0 0 ${MAPA.w} ${MAPA.h}" role="img" aria-label="Mapa das Américas">
      ${MAPA.paises.map((p) => p.nome && temClube(p.nome)
        ? `<path class="pais ${jogavel(p.nome) ? "jogavel" : ""} ${p.nome === pais ? "on" : ""}" data-pais="${esc(p.nome)}" d="${p.d}"><title>${esc(p.nome)}</title></path>`
        : `<path class="ctx" d="${p.d}"></path>`).join("")}
    </svg>
    <p class="minus" style="text-align:center">Toque no país. Verde: já tem clube jogável.</p>
    <label class="cartao ultra" style="display:flex;gap:10px;align-items:flex-start;cursor:pointer">
      <input type="checkbox" id="ultra" ${S.ultra ? "checked" : ""} style="width:22px;height:22px;margin-top:2px;accent-color:var(--cat,#4fd17c)">
      <span><strong>Modo ultra realista (só treinador)</strong><br><span class="minus">Quem negocia é a diretoria. Você define com quem conta e quem pode sair, pede reforço por posição e escolhe entre os nomes que ela traz. A torcida cobra jogadores e pode derrubar a diretoria.</span></span></label>
    <div class="abas">${nomesComClube.map((n) => `<button class="aba ${n === pais ? "on" : ""}" data-pais="${esc(n)}">${esc(n)}</button>`).join("")}</div>
    <div id="ligas">${pais ? `<h2>${esc(pais)}</h2>${ligas.map((l, i) => {
      const jog = l.clubes.filter((c) => c.jogavel).length;
      return `<button class="liga" data-l="${i}"><span class="div">${l.ordem < 9 ? l.ordem : "?"}</span><span class="cresce" style="flex:1"><strong>${esc(l.nome)}</strong>
        <span class="minus" style="display:block">${l.clubes.length} clubes · ${jog} com elenco real</span></span>${jog ? chip("Jogável", "ok") : chip("Em pesquisa", "")}</button>`;
    }).join("")}` : `<div class="vazio">Escolha um país no mapa.</div>`}</div>`;
  document.getElementById("volta").onclick = () => ir("inicio");
  document.getElementById("ultra").onchange = (ev) => { S.ultra = ev.target.checked; local("megafut_ultra", S.ultra ? "1" : ""); };
  const svg = app.querySelector("svg.mapa");
  const caixaDoPais = (nome) => {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    svg.querySelectorAll(`path[data-pais="${CSS.escape(nome)}"]`).forEach((el) => { const b = el.getBBox(); x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.width); y2 = Math.max(y2, b.y + b.height); });
    if (!isFinite(x1)) return [0, 0, MAPA.w, MAPA.h];
    const lado = Math.max(x2 - x1, (y2 - y1) * MAPA.w / MAPA.h, 26) * 1.8;
    const alto = lado * MAPA.h / MAPA.w;
    return [(x1 + x2) / 2 - lado / 2, (y1 + y2) / 2 - alto / 2, lado, alto];
  };
  const animarCaixa = (de, para, ms = 750) => new Promise((ok) => {
    const t0 = performance.now();
    const quadro = (t) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      svg.setAttribute("viewBox", de.map((v, i) => v + (para[i] - v) * e).join(" "));
      if (k < 1) requestAnimationFrame(quadro); else ok();
    };
    requestAnimationFrame(quadro);
  });
  const cheia = [0, 0, MAPA.w, MAPA.h];
  if (pais) {
    const alvo = caixaDoPais(pais);
    if (S.zoomAnterior) { svg.setAttribute("viewBox", S.zoomAnterior.join(" ")); animarCaixa(S.zoomAnterior, alvo); }
    else animarCaixa(cheia, alvo, 900);
    S.zoomAnterior = alvo;
    svg.insertAdjacentHTML("afterend", `<div style="text-align:center;margin-top:-4px"><button class="btn sec peq" id="americas">Ver as Américas</button></div>`);
    document.getElementById("americas").onclick = async () => { await animarCaixa(alvo, cheia, 600); S.paisMapa = null; S.zoomAnterior = null; telaEscolha(); };
  }
  app.querySelectorAll("[data-pais]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.pais === S.paisMapa) return;
    S.paisMapa = b.dataset.pais; S.ligaAberta = null; telaEscolha();
    setTimeout(() => { const l = document.getElementById("ligas"); if (l) l.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, 950);
  }));
  app.querySelectorAll("[data-l]").forEach((b) => b.onclick = () => { S.ligaAberta = +b.dataset.l; telaEscolha(); });
}
function telaLiga(pais, indice) {
  const liga = ligasDoPais(pais)[indice];
  if (!liga) { S.ligaAberta = null; return telaEscolha(); }
  app.innerHTML = `
    <div class="entre"><div><p class="minus">${esc(pais)}</p><h2 style="margin:2px 0 0">${esc(liga.nome)}</h2></div><button class="btn sec peq" id="volta">Voltar</button></div>
    <div class="cartao lista">${liga.clubes.map((c) => `
      <button class="item" data-c="${esc(c.chave)}">${escudo(c.sigla)}<div class="cresce"><div class="nome">${esc(c.nome)}</div>
        <div class="minus">${c.jogavel ? `${c.atletas} atletas com fonte` : "Elenco em pesquisa"}</div></div>
        ${c.jogavel ? chip("Jogável", "ok") : chip("Aguardando", "")}</button>`).join("")}</div>`;
  document.getElementById("volta").onclick = () => { S.ligaAberta = null; telaEscolha(); };
  app.querySelectorAll("[data-c]").forEach((b) => b.onclick = () => abrirResumo(b.dataset.c));
}
async function abrirResumo(chave) {
  const f = folha(`<div class="vazio"><div class="anel"></div>Montando o resumo</div>`);
  const r = await api("resumo", { chave });
  const t = r.torcida;
  f.innerHTML = `
    <div class="linha">${escudo(r.sigla, "g")}<div><h2 style="margin:0">${esc(r.nome)}</h2>
      <p class="sub">${esc([r.cidade, r.estado].filter(Boolean).join(", "))} · ${esc(r.liga)}</p></div></div>
    ${r.aviso ? `<p class="selo">${esc(r.aviso)}</p>` : ""}
    <h3>Principais títulos</h3>
    ${r.titulos.length ? `<div class="cartao lista">${r.titulos.map((x) => `<div class="item">${esc(x)}</div>`).join("")}</div>` : `<p class="minus">Sem títulos com fonte no almanaque (CONFIRMAR).</p>`}
    <h3>Principais jogadores</h3>
    ${r.jogadores.length ? `<div class="cartao lista">${r.jogadores.map((j) => `<div class="item"><span class="pos">${esc(j.pos.slice(0, 3).toUpperCase())}</span>
      <div class="cresce"><div class="nome">${esc(j.nome)}</div><div class="minus">${esc(j.idade)}</div></div><span class="nivel">${esc(String(j.nivel).replace(".", ","))}</span></div>`).join("")}</div>
      <p class="minus">Nível de jogo estimado pelo Megafut.</p>` : `<p class="minus">Elenco ainda em pesquisa.</p>`}
    ${r.idolos.length ? `<p class="sub" style="margin-top:8px">Ídolos: ${esc(r.idolos.join(", "))}</p>` : ""}
    <h3>Torcida agora</h3>
    <div class="cartao"><div class="entre"><strong>${esc(t.rotulo)}</strong><span class="num" style="font-size:24px">${t.humor}</span></div>
      <div class="barra" style="margin-top:8px"><i style="width:${t.humor}%"></i></div>
      ${t.fato ? `<p class="minus" style="margin-top:8px">${esc(t.fato)}</p>` : ""}
      ${(t.motivos || []).map((m) => `<p class="minus">${esc(m)}</p>`).join("")}
      <p class="minus">Humor inicial estimado pelo Megafut.</p></div>
    <h3>Objetivos da temporada</h3>
    <div class="cartao"><p><strong>${esc(r.objetivo)}</strong></p>
      <p class="minus" style="margin-top:6px">Competições previstas em 2026: ${esc(r.competicoes.join(", ") || "CONFIRMAR")}</p></div>
    <h3>Orçamento</h3>
    <div class="cartao"><div class="entre"><span class="sub">Receita anual</span><strong>${esc(r.orcamento.receita)}</strong></div>
      <div class="entre"><span class="sub">Verba para contratar</span><strong>${esc(r.orcamento.transferencias)}</strong></div>
      <div class="entre"><span class="sub">Folha salarial</span><strong>${esc(r.orcamento.folha)}</strong></div>
      <p class="minus" style="margin-top:8px">${esc(r.orcamento.base)}</p></div>
    ${r.rivais.length ? `<h3>Clássicos</h3><p class="sub">${r.rivais.map((x) => esc(`${x.apelido} (${x.rival})`)).join(" · ")}</p>` : ""}
    <p class="minus" style="margin-top:12px">Técnico: ${esc(r.tecnico)} · ${fonte(r.fonte, "Elenco")} ${r.data_fonte ? "· " + esc(r.data_fonte) : ""}</p>
    <div style="margin-top:16px">${r.jogavel ? `<button class="btn" id="assumir">Assumir o ${esc(r.nome)}</button>` :
      `<button class="btn" disabled>Elenco em pesquisa</button><p class="minus" style="margin-top:8px">Este clube abre assim que o elenco real chegar com fonte.</p>`}</div>`;
  const b = f.querySelector("#assumir");
  if (b) b.onclick = async () => {
    fecharFolha();
    carregando("Montando o mundo: todas as ligas, copas e mercados");
    try { S.estado = await api("nova", { chave, tecnico: S.tecnico || "", ultra: !!S.ultra }); local(SLOT.texto(S.slot || 1), null); salvarAgora(true); ir("painel"); }
    catch (e) { aviso(e.message); ir("escolha"); }
  };
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------
const ROTULO_CAT = { nacional: "Campeonato nacional", copa: "Copa", internacional: "Competição internacional" };
function temaCompeticao(cat) {
  document.body.classList.remove("cat-nacional", "cat-copa", "cat-internacional");
  if (cat) document.body.classList.add("cat-" + cat);
}
function cartaoJogo(j, grande = false) {
  if (!j) return `<div class="cartao"><p class="sub">Sem jogo marcado agora.</p></div>`;
  const placar = j.gc !== null && j.gc !== undefined ? `${j.gc} x ${j.gf}${j.pc !== null && j.pc !== undefined ? ` <span class="minus">(${j.pc} x ${j.pf} nos pênaltis)</span>` : ""}` : "x";
  return `<div class="cartao ${grande ? "destaque" : ""} ${j.cat ? "cat-" + j.cat : ""}">
    ${j.cat ? `<span class="selo-cat">${ROTULO_CAT[j.cat]}</span>` : ""}
    <div class="entre"><span class="minus">${esc(j.competicao)}${j.fase && j.fase !== "Pontos corridos" ? " · " + esc(j.fase) : ""}${j.rodada ? " · rodada " + j.rodada : ""}</span>
      <span class="minus">${esc(j.data)}${j.adiado ? " · adiado" : ""}</span></div>
    <div class="entre" style="margin-top:10px">
      <div class="linha" style="flex:1">${escudo(j.casa.sigla, grande ? "" : "p")}<strong>${esc(j.casa.nome)}</strong></div>
      <div class="num" style="font-size:${grande ? 30 : 22}px">${placar}</div>
      <div class="linha" style="flex:1;justify-content:flex-end"><strong style="text-align:right">${esc(j.fora.nome)}</strong>${escudo(j.fora.sigla, grande ? "" : "p")}</div>
    </div>${j.neutro ? `<p class="minus" style="margin-top:6px">Campo neutro</p>` : ""}</div>`;
}
function mancheteHtml(mt) {
  if (!mt) return "";
  let corpo = "";
  if (mt.linhas) {
    corpo = tabelaHtml(mt.linhas, mt.usuario, true) + (mt.classificam ? `<p class="minus" style="margin-top:6px">Avançam ${mt.classificam} por ${mt.titulo === "Tabela" ? "esta fase" : "grupo"}</p>` : "");
  } else if (mt.confrontos) {
    const placar = (c) => c.jogos.map((j) => `${esc(j.casa.sigla)} ${j.gc ?? ""} x ${j.gf ?? ""} ${esc(j.fora.sigla)}${j.pc !== null && j.pc !== undefined ? ` (pên. ${j.pc} x ${j.pf})` : ""}`).join(" · ");
    corpo = mt.confrontos.map((c) => `<div class="chave ${c.meu ? "minha" : ""}"><div class="entre"><strong>${esc(c.a.nome)}</strong><span class="minus">x</span><strong style="text-align:right">${esc(c.b ? c.b.nome : "Folga")}</strong></div>
      ${c.jogos.length ? `<p class="minus">${placar(c)}</p>` : ""}${c.vencedor ? `<span class="chip ok">Passou: ${esc(c.vencedor === c.a.id ? c.a.nome : c.b.nome)}</span>` : ""}</div>`).join("")
      + (mt.outros ? `<p class="minus" style="margin-top:6px">E mais ${mt.outros} confrontos</p>` : "")
      + (mt.caminho && mt.caminho.length ? `<p class="minus" style="margin-top:6px">Caminho até o título: ${mt.caminho.map(esc).join(" › ")}</p>` : "");
  }
  return `<div class="faixa-comp manchete cat-${mt.cat}"><div class="rotulo">${ROTULO_CAT[mt.cat] || ""} · ${esc(mt.titulo || mt.fase)}</div>
    <div class="titulo-comp">${esc(mt.nome)}</div><p class="minus">${esc(mt.fase)}</p>
    <div class="cartao" style="margin-bottom:0">${corpo}</div>
    <button class="btn sec peq" data-abrir-comp="${esc(mt.comp)}" style="margin-top:8px">Abrir a competição</button></div>`;
}
function telaPainel() {
  const e = S.estado;
  temaCompeticao(e.manchete ? e.manchete.cat : null);
  const dias = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
  const al = e.alertas || {};
  app.innerHTML = `
    <div class="entre"><div class="linha">${escudo(e.clube.sigla)}<div><h2 style="margin:0">${esc(e.clube.nome)}</h2>
      <p class="sub">${esc(e.clube.liga || "Sem liga nacional")} · técnico ${esc(e.clube.tecnico)}</p></div></div>
      <div style="text-align:right"><div class="num" style="font-size:22px">${esc(e.data)}</div><div class="minus">${dias[e.dia_semana]}</div></div></div>
    <div id="semana"></div>
    <h3>Próximo jogo</h3>
    ${cartaoJogo(e.proximo, true)}
    ${mancheteHtml(e.manchete)}
    <button class="btn" id="avancar" style="width:100%">${e.proximo ? "Ir para o jogo ao vivo" : "Avançar"}</button>
    <div class="grade2" style="margin-top:8px"><button class="btn sec" id="simular">${e.proximo ? "Simular o jogo" : "Avançar rápido"}</button><button class="btn sec" id="dia">Avançar um dia</button></div>
    ${e.bicho ? `<button class="cartao destaque item" id="bicho" style="margin-top:12px"><div class="cresce"><strong>O elenco pediu bicho</strong><div class="minus">${esc(e.bicho.rival)} · ${esc(e.bicho.comp)} · ${esc(e.bicho.motivo)}</div></div>${chip("Responder", "al")}</button>` : ""}
    ${e.propostas ? `<button class="cartao destaque item" id="props" style="margin-top:12px"><div class="cresce"><strong>${e.propostas} proposta${e.propostas > 1 ? "s" : ""} esperando resposta</strong><div class="minus">Mercado, Propostas</div></div>${chip("Ver", "al")}</button>` : ""}
    ${(() => { const pt = e.portal || {}; const itens = [];
      if (pt.desempregado) itens.push("Você está sem clube: escolha uma proposta");
      if (pt.coletiva) itens.push("Coletiva de imprensa antes do próximo jogo");
      if (pt.ofertas && !pt.desempregado) itens.push(pt.ofertas + " proposta" + (pt.ofertas > 1 ? "s" : "") + " de outros clubes");
      if (pt.patrocinio) itens.push("Patrocinadores esperando sua escolha");
      if (pt.risco === "alto") itens.push("Diretoria insatisfeita: risco alto de demissão");
      return itens.length ? `<button class="cartao destaque item" id="irportal" style="margin-top:12px"><div class="cresce"><strong>Portal do treinador</strong><div class="minus">${itens.map(esc).join(" · ")}</div></div>${chip("Abrir", "al")}</button>` : ""; })()}
    ${al.contratos ? `<div class="cartao"><strong>${al.contratos} contrato${al.contratos > 1 ? "s" : ""} terminando em 31/12</strong><p class="minus">Sem renovação, o jogador sai no fim do ano. Elenco, toque no jogador, Renovar.</p></div>` : ""}
    ${(al.lesionados || []).length ? `<p class="minus" style="margin-top:6px">No departamento médico: ${esc(al.lesionados.join(", "))}</p>` : ""}
    ${e.tabela && e.tabela.length && !e.manchete ? `<h3>${esc(e.clube.liga)}</h3><div class="cartao">${tabelaHtml(e.tabela, e.clube.id, true)}
      <button class="btn sec peq" id="tab" style="margin-top:8px">Tabela completa</button></div>` : ""}
    <div class="grade2" style="margin-top:4px">
      <div class="cartao"><p class="minus">Torcida</p><div class="entre"><strong>${esc(e.torcida.rotulo)}</strong><span class="num" style="font-size:22px">${e.torcida.valor}</span></div><div class="barra"><i style="width:${e.torcida.valor}%"></i></div></div>
      <div class="cartao"><p class="minus">Confiança da diretoria</p><div class="entre"><strong>Risco ${esc((e.portal || {}).risco || "baixo")}</strong><span class="num" style="font-size:22px">${(e.portal || {}).confianca ?? e.diretoria.valor}</span></div><div class="barra"><i style="width:${(e.portal || {}).confianca ?? e.diretoria.valor}%"></i></div></div>
    </div>
    <div class="cartao"><div class="entre"><span class="sub">Objetivo</span><strong style="text-align:right">${esc(e.objetivo)}</strong></div>
      <div class="entre"><span class="sub">Caixa</span><strong>${esc(e.financas.caixa)}</strong></div>
      <div class="entre"><span class="sub">Verba para contratar</span><strong>${esc(e.financas.orcamento)}</strong></div>
      <div class="entre"><span class="sub">Janela</span><strong>${e.janela.aberta ? "Aberta até " + esc(e.janela.fim) : "Fechada" + (e.janela.proxima ? ", abre " + esc(e.janela.proxima) : "")}</strong></div>
      <p class="minus" style="margin-top:6px">Valores estimados pelo Megafut.</p></div>
    ${e.ultimos.length ? `<h3>Últimos jogos</h3>${e.ultimos.map((j) => cartaoJogo(j)).join("")}` : ""}
    <h3>Central de notícias</h3>
    <div class="cartao lista">${e.noticias.length ? e.noticias.map(itemNoticia).join("") : `<div class="vazio">Sem notícias ainda.</div>`}</div>`;
  const $ = (id) => document.getElementById(id);
  app.querySelectorAll("[data-abrir-comp]").forEach((b) => b.onclick = () => { S.compAberta = b.dataset.abrirComp; ir("jogos"); });
  (async () => {
    try { if (!S.agenda || S.agenda.hoje !== isoDe(dataBr(e.data))) S.agenda = await api("agenda"); } catch (err) { return; }
    const alvo = document.getElementById("semana");
    if (!alvo) return;
    alvo.innerHTML = semanaHtml(S.agenda);
    const b = document.getElementById("vercal"); if (b) b.onclick = () => { S.verCalendario = true; ir("portal"); };
  })();
  $("avancar").onclick = () => avancar("jogo", true);
  $("simular").onclick = () => avancar("jogo");
  $("dia").onclick = () => avancar("dia");
  if ($("irportal")) $("irportal").onclick = () => ir("portal");
  if ($("bicho")) $("bicho").onclick = () => abrirBicho(e.bicho);
  if ($("props")) $("props").onclick = () => { S.abaMercado = "propostas"; ir("mercado"); };
  if ($("tab")) $("tab").onclick = () => { S.compAberta = e.liga_id; ir("jogos"); };
}
const TIPO_NOTICIA = { bastidores: ["Bastidores", "al"], carreira: ["Técnicos", ""], lesao: ["DM", "ruim"], financas: ["Finanças", "al"], titulo: ["Título", "ok"], base: ["Base", "ok"], mercado: ["Mercado", ""], competicao: ["Competição", ""] };
function itemNoticia(n) {
  const t = TIPO_NOTICIA[n.tipo];
  return `<div class="item" style="display:block"><div class="minus">${esc(n.data)}${t ? " " + chip(t[0], t[1]) : ""}</div><div>${esc(n.texto)}</div></div>`;
}
function tabelaHtml(linhas, meu, curta = false) {
  return `<table class="tabela"><tr><th>#</th><th>Clube</th><th>P</th><th>J</th>${curta ? "" : "<th>V</th><th>E</th><th>D</th>"}<th>SG</th>${curta ? "" : "<th>Últ.</th>"}</tr>
    ${linhas.map((l) => `<tr class="${l.clube.id === meu ? "eu" : ""}"><td>${l.pos}</td><td>${esc(l.clube.nome)}</td><td><strong>${l.p}</strong></td><td>${l.j}</td>
      ${curta ? "" : `<td>${l.v}</td><td>${l.e}</td><td>${l.d}</td>`}<td>${esc(sinal(l.sg))}</td>${curta ? "" : `<td style="letter-spacing:1px">${esc(l.ult)}</td>`}</tr>`).join("")}</table>`;
}

// ---------------------------------------------------------------------------
// Calendário: semana no painel, ano no portal e os dias passando
// ---------------------------------------------------------------------------
const DIAS_CURTOS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
function isoDe(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function dataBr(t) { const [d, m, a] = String(t).split("/").map(Number); return new Date(a, m - 1, d); }
function dataIso(t) { const [a, m, d] = String(t).split("-").map(Number); return new Date(a, m - 1, d); }
function maisDias(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function semanaIdx(d) { return (d.getDay() + 6) % 7; }
function mapaAgenda(ag) {
  const mapa = {};
  (ag.jogos || []).forEach((j) => { (mapa[j.data] = mapa[j.data] || {}).jogo = j; });
  const marcar = (lista, chave) => (lista || []).forEach((p) => { for (let d = dataIso(p.inicio); d <= dataIso(p.fim); d = maisDias(d, 1)) (mapa[isoDe(d)] = mapa[isoDe(d)] || {})[chave] = p; });
  marcar(ag.janelas, "janela"); marcar(ag.pausas, "pausa");
  return mapa;
}
function celulaDia(d, mapa, hojeIso, extra = "") {
  const k = isoDe(d), info = mapa[k] || {}, j = info.jogo;
  const cls = ["dia", extra, k === hojeIso ? "hoje" : "", k < hojeIso ? "passado" : "", info.janela ? "janela" : "", info.pausa ? "pausa" : ""].join(" ");
  const jogo = j ? `<span class="jg cat-${j.cat} ${j.res ? "r-" + j.res : ""}" title="${esc(j.competicao)}">${j.casa ? "" : "@"}${esc(j.rival.sigla)}${j.res ? " " + j.res : ""}</span>` : "";
  return `<div class="${cls}" data-dia="${k}">${extra.includes("semds") ? "" : `<div class="ds">${DIAS_CURTOS[semanaIdx(d)]}</div>`}<div class="dn">${d.getDate()}</div>${jogo}</div>`;
}
function semanaHtml(ag) {
  const mapa = mapaAgenda(ag), hoje = dataIso(ag.hoje), hojeIso = ag.hoje;
  const dias = Array.from({ length: 7 }, (_, i) => maisDias(hoje, i));
  const jogosSemana = dias.map((d) => (mapa[isoDe(d)] || {}).jogo).filter(Boolean);
  const janela = (mapa[hojeIso] || {}).janela;
  return `<div class="entre"><h3 style="margin:14px 0 0">Sua semana</h3><button class="btn sec peq" id="vercal">Calendário do ano</button></div>
    <div class="semana">${dias.map((d) => celulaDia(d, mapa, hojeIso)).join("")}</div>
    <p class="minus">${jogosSemana.length ? jogosSemana.map((j) => `${esc(j.rival.nome)} (${j.casa ? "casa" : "fora"}) pela ${esc(j.competicao)}`).join(" · ") : "Sem jogos nos próximos 7 dias."}${janela ? " · Janela aberta até " + dataIso(janela.fim).toLocaleDateString("pt-BR") : ""}</p>`;
}
function calendarioAnualHtml(ag, mes) {
  const mapa = mapaAgenda(ag), hojeIso = ag.hoje, ano = ag.ano;
  const primeiro = new Date(ano, mes, 1), ultimo = new Date(ano, mes + 1, 0);
  const vazios = Array.from({ length: semanaIdx(primeiro) }, () => `<div class="dia vazio"></div>`).join("");
  const dias = Array.from({ length: ultimo.getDate() }, (_, i) => celulaDia(new Date(ano, mes, i + 1), mapa, hojeIso, "semds")).join("");
  const contagem = (m) => (ag.jogos || []).filter((j) => dataIso(j.data).getMonth() === m && dataIso(j.data).getFullYear() === ano).length;
  const jogosMes = (ag.jogos || []).filter((j) => { const d = dataIso(j.data); return d.getMonth() === mes && d.getFullYear() === ano; });
  const janelasMes = (ag.janelas || []).filter((p) => dataIso(p.inicio) <= ultimo && dataIso(p.fim) >= primeiro);
  return `<div class="meses">${MESES.map((n, i) => `<button class="${i === mes ? "on" : ""}" data-mes="${i}">${n.slice(0, 3)}<i>${contagem(i) ? contagem(i) + (contagem(i) > 1 ? " jogos" : " jogo") : "·"}</i></button>`).join("")}</div>
    <div class="cartao"><div class="entre"><button class="btn sec peq" data-mes="${Math.max(0, mes - 1)}">‹</button><strong class="num" style="font-size:22px;text-transform:uppercase">${MESES[mes]} ${ano}</strong><button class="btn sec peq" data-mes="${Math.min(11, mes + 1)}">›</button></div>
      <div class="mes-cab">${DIAS_CURTOS.map((d) => `<div>${d}</div>`).join("")}</div><div class="mes">${vazios}${dias}</div>
      <div class="legenda"><span class="cat-nacional">Campeonato</span><span class="cat-copa">Copa</span><span class="cat-internacional">Internacional</span><span class="l-janela">Janela de transferências</span><span class="l-pausa">Pausa</span></div></div>
    ${janelasMes.map((p) => `<p class="minus">${esc(p.nome)}: ${dataIso(p.inicio).toLocaleDateString("pt-BR")} a ${dataIso(p.fim).toLocaleDateString("pt-BR")}${p.confirmado ? "" : " (CONFIRMAR)"}</p>`).join("")}
    <div class="cartao lista">${jogosMes.map((j) => `<div class="item cat-${j.cat}"><span class="pos" style="background:var(--cat);color:#0a140e">${dataIso(j.data).getDate()}</span><div class="cresce"><div class="nome">${j.casa ? "x" : "@"} ${esc(j.rival.nome)}</div><div class="minus">${esc(j.competicao)} · ${esc(j.fase)}</div></div><strong>${j.placar ? esc(j.placar) + " " + j.res : ""}</strong></div>`).join("") || `<div class="vazio">Sem jogos marcados neste mês.</div>`}</div>
    <p class="minus">Jogos de mata mata aparecem quando o confronto é definido.</p>`;
}
function abrirCalendario(ag, alvo, mesInicial) {
  let mes = mesInicial ?? dataIso(ag.hoje).getMonth();
  const desenhar = () => {
    alvo.innerHTML = calendarioAnualHtml(ag, mes);
    alvo.querySelectorAll("[data-mes]").forEach((b) => b.onclick = () => { mes = +b.dataset.mes; desenhar(); });
    const on = alvo.querySelector(".meses .on"); if (on) on.scrollIntoView({ inline: "center", block: "nearest" });
  };
  desenhar();
}
async function passagemDosDias(de, ate, ag) {
  const total = Math.round((ate - de) / 86400000);
  if (!(total > 0) || total > 120) return;
  const mapa = ag ? mapaAgenda(ag) : {};
  const ov = document.createElement("div");
  ov.className = "passagem";
  document.body.appendChild(ov);
  const passo = Math.max(70, Math.min(260, 2600 / total));
  for (let i = 0; i <= total; i++) {
    const d = maisDias(de, i), mesD = d.getMonth(), anoD = d.getFullYear();
    const primeiro = new Date(anoD, mesD, 1), ultimo = new Date(anoD, mesD + 1, 0);
    const vazios = Array.from({ length: semanaIdx(primeiro) }, () => `<div class="dia vazio"></div>`).join("");
    const dias = Array.from({ length: ultimo.getDate() }, (_, k) => { const x = new Date(anoD, mesD, k + 1); return celulaDia(x, mapa, "", "semds " + (isoDe(x) === isoDe(d) ? "atual" : isoDe(x) === isoDe(ate) ? "alvo" : "")); }).join("");
    const info = mapa[isoDe(d)] || {};
    ov.innerHTML = `<div class="caixa"><div class="mesnome">${MESES[mesD]} ${anoD}</div><div class="grande">${d.getDate()}</div>
      <p class="sub" style="text-align:center">${DIAS_CURTOS[semanaIdx(d)]} · ${i === total ? "Dia de jogo" : "faltam " + (total - i) + (total - i === 1 ? " dia" : " dias")}${info.janela ? " · janela aberta" : ""}</p>
      <div class="mes-cab" style="margin-top:10px">${DIAS_CURTOS.map((x) => `<div>${x}</div>`).join("")}</div><div class="mes">${vazios}${dias}</div></div>`;
    await new Promise((r) => setTimeout(r, i === total ? 450 : passo));
  }
  ov.remove();
}

function abrirBicho(b, depois) {
  const f = folha(`<h2>Bicho para o jogo</h2><p class="sub">${esc(b.texto)}</p>
    <p class="minus" style="margin:6px 0 10px">O valor só sai do caixa se o time ${b.condicao === "pela vitória" ? "vencer" : b.condicao === "pelo título" ? "for campeão" : "se classificar"}. Caixa agora: ${esc(b.caixa)} · folha mensal: ${esc(b.folha)}.</p>
    ${b.opcoes.map((o) => `<button class="cartao item" data-bicho="${o.i}" ${o.disponivel === false ? "disabled" : ""} style="width:100%;text-align:left;display:block;margin-bottom:8px;${o.disponivel === false ? "opacity:.45" : ""}">
      <div class="entre"><strong>${esc(o.rotulo)}</strong><strong style="color:#9be8b4">${esc(o.valor_txt)}</strong></div>
      <div class="minus">Moral do elenco ${o.moral > 0 ? "+" + o.moral : o.moral} · ${esc(o.reacao)}${o.disponivel === false ? " · sem dinheiro em caixa" : ""}</div></button>`).join("")}
    <p class="minus">Sem resposta, o elenco entende como recusa e entra chateado (moral menos 3).</p>`);
  f.querySelectorAll("[data-bicho]").forEach((bt) => bt.onclick = async () => {
    try {
      const r = await api("bicho", { opcao: +bt.dataset.bicho });
      fecharFolha(); aviso(r.texto || r.erro);
      S.estado = await api("estado");
      if (depois) depois(); else ir("painel");
    } catch (err) { aviso(err.message); }
  });
}
async function avancar(modo, aoVivo = false) {
  const e0 = S.estado || {};
  if (e0.bicho && (modo !== "dia" || e0.bicho.data === e0.data)) {
    abrirBicho(e0.bicho, () => avancar(modo, aoVivo));
    return;
  }
  const de = e0.data ? dataBr(e0.data) : null;
  const ate = !de ? null : modo === "dia" ? maisDias(de, 1) : e0.proximo ? dataBr(e0.proximo.data) : null;
  carregando(modo === "dia" ? "Um dia no mundo do futebol" : "Rodando o mundo até o seu jogo");
  try {
    const [r] = await Promise.all([api("avancar", { modo, ao_vivo: aoVivo }), de && ate ? passagemDosDias(de, ate, S.agenda) : null]);
    S.agenda = null;
    S.estado = r.estado;
    if (r.ao_vivo) { ir("aovivo"); return; }
    if (r.partida) { S.partida = r.partida; S.fim = r.fim_de_temporada; ir("partida"); }
    else if (r.fim_de_temporada) { mostrarFimDeTemporada(r.fim_de_temporada); ir("painel"); }
    else { ir("painel"); if (r.noticias.length) aviso(r.noticias[r.noticias.length - 1]); }
    salvarAgora(Boolean(r.partida || r.fim_de_temporada));
  } catch (e) { aviso(e.message); ir(/sem clube/.test(e.message) ? "portal" : "painel"); }
}
function mostrarFimDeTemporada(f) {
  const f2 = folha(`<h2>Fim da temporada ${f.ano}</h2>
    <h3>Campeões</h3><div class="cartao lista">${f.campeoes.slice(0, 40).map((c) => `<div class="item" style="display:block"><strong>${esc(c.campeao)}</strong><div class="minus">${esc(c.competicao)}${c.vice ? " · vice " + esc(c.vice) : ""}</div></div>`).join("")}</div>
    <h3>Acessos</h3><p class="sub">${esc((f.acessos || []).join(" · ") || "Nenhum")}</p>
    <h3>Rebaixamentos</h3><p class="sub">${esc((f.rebaixamentos || []).join(" · ") || "Nenhum")}</p>
    ${(f.contratos || []).length ? `<h3>Contratos</h3><p class="sub">${esc(f.contratos.join(" · "))}</p>` : ""}
    ${(f.aposentadorias || []).length ? `<h3>Aposentadorias</h3><p class="sub">${esc(f.aposentadorias.join(" · "))}</p>` : ""}
    <button class="btn" id="ok" style="margin-top:14px">Começar ${f.ano + 1}</button>`);
  f2.querySelector("#ok").onclick = fecharFolha;
}

// ---------------------------------------------------------------------------
// Partida: o lance a lance com relógio
// ---------------------------------------------------------------------------
function minutoNumero(m) {
  const t = String(m || "").replace("'", "");
  const [a, b] = t.split("+");
  return (parseInt(a, 10) || 0) + (parseInt(b, 10) || 0) / 10;
}
function telaPartida() {
  const p = S.partida;
  if (!p) { ir("painel"); return; }
  const j = p.jogo;
  const r = p.relatorio;
  app.innerHTML = `
    <div class="cartao destaque ${j.cat ? "cat-" + j.cat : ""}" style="text-align:center">
      ${j.cat ? `<span class="selo-cat">${ROTULO_CAT[j.cat]}</span>` : ""}
      <p class="minus">${esc(j.competicao)}${j.fase && j.fase !== "Pontos corridos" ? " · " + esc(j.fase) : ""} · ${esc(j.data)}</p>
      <div class="entre" style="margin-top:12px">
        <div style="flex:1">${escudo(j.casa.sigla, "g")}<p style="margin-top:6px;font-weight:600">${esc(j.casa.nome)}</p></div>
        <div><div class="placar" id="placar">0 x 0</div><div class="relogio" id="relogio">0'</div></div>
        <div style="flex:1">${escudo(j.fora.sigla, "g")}<p style="margin-top:6px;font-weight:600">${esc(j.fora.nome)}</p></div>
      </div>
      ${r && r.classico ? `<p class="chip al" style="margin-top:10px">${esc(r.classico.apelido)}</p>` : ""}
    </div>
    <div class="grade2"><button class="btn sec" id="pular">Ver o final</button><button class="btn sec" id="sair">Voltar ao painel</button></div>
    ${p.assistida ? "" : `<p class="minus" style="margin-top:8px;text-align:center">Jogo simulado pelo auxiliar. Para fazer trocas e mudar a formação, use "Ir para o jogo ao vivo" no Painel.</p>`}
    <div id="lances" class="cartao" style="margin-top:12px"></div>
    <div id="depois"></div>`;
  document.getElementById("sair").onclick = () => { S.partida = null; ir("painel"); if (S.fim) mostrarFimDeTemporada(S.fim); S.fim = null; };
  const placar = document.getElementById("placar");
  const relogio = document.getElementById("relogio");
  const lances = document.getElementById("lances");
  if (!r) {
    placar.textContent = `${j.gc} x ${j.gf}`;
    relogio.textContent = "Fim";
    lances.innerHTML = `<p class="sub">${esc((p.noticias || []).slice(-1)[0] || "Placar pela simulação rápida.")}</p>`;
    centralDaPartida(p);
    document.getElementById("pular").remove();
    return;
  }
  const eventos = r.eventos.filter((e) => e.nivel <= 1 || e.tipo === "GOL");
  let gc = 0, gf = 0, i = 0, acabou = false;
  if (p.assistida) { setTimeout(() => terminar(), 0); }
  const total = 22000;
  const passo = () => {
    if (acabou) return;
    if (i >= eventos.length) { terminar(); return; }
    const ev = eventos[i++];
    relogio.textContent = ev.m;
    if (ev.tipo === "GOL") {
      if (ev.sigla === r.casa.sigla) gc++; else gf++;
      placar.textContent = `${gc} x ${gf}`;
      placar.classList.remove("flash"); void placar.offsetWidth; placar.classList.add("flash");
      comemorarGol(ev.sigla === r.casa.sigla ? j.casa : j.fora, ev.texto);
    }
    const div = document.createElement("div");
    div.className = "evento" + (ev.tipo === "GOL" ? " gol" : "");
    div.innerHTML = `<span class="m">${esc(ev.m)}</span><span>${esc(ev.texto)}</span>`;
    lances.prepend(div);
    const proximo = eventos[i];
    const intervalo = proximo ? Math.max(260, Math.min(2200, (minutoNumero(proximo.m) - minutoNumero(ev.m)) * total / 95)) : 600;
    setTimeout(passo, ev.tipo === "GOL" ? intervalo + 900 : intervalo);
  };
  const terminar = () => {
    if (acabou) return;
    acabou = true;
    placar.textContent = `${r.casa.gols} x ${r.fora.gols}`;
    relogio.textContent = j.pc !== null && j.pc !== undefined ? `Pênaltis ${j.pc} x ${j.pf}` : "Fim de jogo";
    lances.innerHTML = eventos.slice().reverse().map((ev) => `<div class="evento${ev.tipo === "GOL" ? " gol" : ""}"><span class="m">${esc(ev.m)}</span><span>${esc(ev.texto)}</span></div>`).join("");
    const b = document.getElementById("pular"); if (b) b.remove();
    relatorioPartida(r);
    centralDaPartida(p);
  };
  document.getElementById("pular").onclick = terminar;
  setTimeout(passo, 700);
}
// ---------------------------------------------------------------------------
// Animações: gol e transição
// ---------------------------------------------------------------------------
function comemorarGol(clube, texto) {
  const camada = document.createElement("div");
  camada.className = "golzao";
  const pedacos = Array.from({ length: 26 }, (_, k) => `<i style="left:${(k * 37) % 100}%;animation-delay:${(k % 7) * 0.06}s;background:${["#ffd166", "#7ee2a0", "#f3f0e6", "#ff8a8a"][k % 4]}"></i>`).join("");
  camada.innerHTML = `<div class="golzao-centro"><div class="golzao-txt">GOL</div><div class="golzao-clube">${esc(clube.nome || clube)}</div></div>${pedacos}`;
  document.body.appendChild(camada);
  if (navigator.vibrate) { try { navigator.vibrate([60, 40, 120]); } catch (e) { } }
  setTimeout(() => camada.remove(), 1900);
}

function apito(titulo, sub) {
  const c = document.createElement("div");
  c.className = "apito";
  c.innerHTML = `<div class="apito-caixa"><div class="apito-ico">◉</div><div class="apito-t">${esc(titulo)}</div><div class="apito-s">${esc(sub || "")}</div></div>`;
  document.body.appendChild(c);
  setTimeout(() => c.remove(), 1700);
}
function cartaoNaTela(cor, texto) {
  const c = document.createElement("div");
  c.className = "cartaotela";
  c.innerHTML = `<div class="cartaozinho ${cor}"></div><div class="faixa-txt">${esc(texto)}</div>`;
  document.body.appendChild(c);
  setTimeout(() => c.remove(), 1600);
}
function faixaNaTela(titulo, texto) {
  const c = document.createElement("div");
  c.className = "faixatela";
  c.innerHTML = `<strong>⇄ ${esc(titulo)}</strong><span>${esc(texto)}</span>`;
  document.body.appendChild(c);
  setTimeout(() => c.remove(), 1800);
}

// ---------------------------------------------------------------------------
// Jogo ao vivo
// ---------------------------------------------------------------------------
const VIVO = { rodando: false, velocidade: 1, timer: null, estado: null, espera: false };
async function telaAoVivo() {
  carregando("Os times entram em campo");
  let v;
  try { v = await api("vivo_iniciar"); } catch (e) { aviso(e.message); ir("painel"); return; }
  VIVO.estado = v; VIVO.rodando = false; VIVO.velocidade = 1;
  app.innerHTML = `
    <div class="cartao destaque vivo-topo ${v.cat ? "cat-" + v.cat : ""}" style="text-align:center">
      ${v.cat ? `<span class="selo-cat">${ROTULO_CAT[v.cat]}</span>` : ""}
      <p class="minus">${esc(v.competicao)} · ao vivo</p>
      <div class="entre" style="margin-top:10px">
        <div style="flex:1">${escudo(v.casa.sigla, "g")}<p style="margin-top:6px;font-weight:600">${esc(v.casa.nome)}</p></div>
        <div><div class="placar" id="placar">0 x 0</div><div class="relogio" id="relogio">0'</div></div>
        <div style="flex:1">${escudo(v.fora.sigla, "g")}<p style="margin-top:6px;font-weight:600">${esc(v.fora.nome)}</p></div>
      </div>
      <div class="barra" style="margin-top:10px"><i id="progresso" style="width:0%"></i></div>
      <p class="minus" id="numeros" style="margin-top:6px"></p>
    </div>
    <div class="minicampo" id="minicampo">
      <svg viewBox="0 0 100 64" preserveAspectRatio="none" aria-hidden="true"><rect x="1" y="1" width="98" height="62" rx="2" fill="none" stroke="rgba(243,240,230,.5)" stroke-width=".5"/>
        <line x1="50" y1="1" x2="50" y2="63" stroke="rgba(243,240,230,.5)" stroke-width=".5"/><circle cx="50" cy="32" r="8" fill="none" stroke="rgba(243,240,230,.5)" stroke-width=".5"/>
        <rect x="1" y="18" width="13" height="28" fill="none" stroke="rgba(243,240,230,.5)" stroke-width=".5"/><rect x="86" y="18" width="13" height="28" fill="none" stroke="rgba(243,240,230,.5)" stroke-width=".5"/>
        <rect x="0" y="27" width="1.5" height="10" fill="rgba(243,240,230,.7)"/><rect x="98.5" y="27" width="1.5" height="10" fill="rgba(243,240,230,.7)"/></svg>
      <span class="mc-sigla esq">${esc(v.casa.sigla)} ataca →</span><span class="mc-sigla dir">← ${esc(v.fora.sigla)}</span>
      <div class="bola-vivo" id="bola"></div>
    </div>
    <div class="grade2"><button class="btn" id="play">Começar</button>
      <select id="vel"><option value="1">Velocidade normal</option><option value="2">Rápida</option><option value="4">Muito rápida</option></select></div>
    <div class="grade2" style="margin-top:8px"><button class="btn sec" id="trocas">Trocas</button><button class="btn sec" id="taticas">Formação e estilo</button></div>
    <button class="btn sec" id="final" style="width:100%;margin-top:8px">Simular até o fim</button>
    <div id="lances" class="cartao" style="margin-top:12px"></div>`;
  document.getElementById("play").onclick = () => VIVO.estado && VIVO.estado.fim ? terminarVivo() : (VIVO.rodando ? pausarVivo() : continuarVivo());
  document.getElementById("vel").onchange = (ev) => { VIVO.velocidade = +ev.target.value; };
  document.getElementById("trocas").onclick = () => { pausarVivo(); folhaTrocas(); };
  document.getElementById("taticas").onclick = () => { pausarVivo(); folhaTatica(); };
  document.getElementById("final").onclick = () => terminarVivo();
  desenharVivo(v);
}
function desenharVivo(v) {
  const placar = document.getElementById("placar");
  if (!placar) return;
  placar.textContent = `${v.casa.gols} x ${v.fora.gols}`;
  document.getElementById("relogio").textContent = v.minuto;
  document.getElementById("progresso").style.width = Math.min(100, v.progresso / 95 * 100) + "%";
  document.getElementById("numeros").textContent = `Posse ${v.posse}% · finalizações ${v.finalizacoes[0]} x ${v.finalizacoes[1]} · trocas ${v.trocas}/${v.max_trocas}` + (v.jogadores < 11 ? ` · com ${v.jogadores} em campo` : "");
  document.getElementById("trocas").textContent = `Trocas ${v.trocas}/${v.max_trocas}`;
  const bola = document.getElementById("bola");
  if (bola && v.bola) {
    bola.style.left = (v.bola.x + (Math.random() * 6 - 3)) + "%";
    bola.style.top = (v.bola.y + (Math.random() * 8 - 4)) + "%";
    bola.classList.toggle("fora", !v.bola.casa);
  }
  const lances = document.getElementById("lances");
  for (const ev of v.eventos) {
    if (ev.tipo === "INICIO" && lances.children.length) continue;
    const div = document.createElement("div");
    div.className = "evento" + (ev.tipo === "GOL" ? " gol" : "") + " entra";
    div.innerHTML = `<span class="m">${esc(ev.m)}</span><span>${esc(ev.texto)}</span>`;
    lances.prepend(div);
  }
}
function continuarVivo() {
  if (VIVO.estado && VIVO.estado.fim) return terminarVivo();
  if (VIVO.estado && VIVO.estado.progresso < 0.2) apito("Bola rolando", `${VIVO.estado.casa.nome} x ${VIVO.estado.fora.nome}`);
  VIVO.rodando = true;
  document.getElementById("play").textContent = "Pausar";
  tickVivo();
}
function pausarVivo() {
  VIVO.rodando = false;
  clearTimeout(VIVO.timer);
  const b = document.getElementById("play"); if (b) b.textContent = "Continuar";
}
async function tickVivo() {
  if (!VIVO.rodando || VIVO.espera || telaAtual() !== "aovivo") return;
  VIVO.espera = true;
  let v;
  try { v = await api("vivo_rodar", { ate: VIVO.estado.progresso + VIVO.velocidade }); }
  catch (e) { VIVO.espera = false; aviso(e.message); return pausarVivo(); }
  VIVO.espera = false;
  const anterior = VIVO.estado;
  VIVO.estado = v;
  desenharVivo(v);
  const gol = v.eventos.find((e) => e.tipo === "GOL");
  const meuSigla = v.eu_casa ? v.casa.sigla : v.fora.sigla;
  const vermelhoMeu = v.eventos.some((e) => e.tipo === "CARTAO_VERMELHO" && e.sigla === meuSigla);
  if (gol) comemorarGol(gol.sigla === v.casa.sigla ? v.casa : v.fora);
  else {
    const verm = v.eventos.find((e) => e.tipo === "CARTAO_VERMELHO");
    const amar = v.eventos.find((e) => e.tipo === "CARTAO_AMARELO");
    const troca = v.eventos.find((e) => e.tipo === "SUBSTITUICAO");
    if (verm) cartaoNaTela("vermelho", verm.texto);
    else if (amar) cartaoNaTela("amarelo", amar.texto);
    else if (troca) faixaNaTela("Substituição", troca.texto);
  }
  if (!anterior.fim && v.fim) apito("Fim de jogo", `${v.casa.sigla} ${v.casa.gols} x ${v.fora.gols} ${v.fora.sigla}`);
  else if (v.intervalo) apito("Intervalo", `${v.casa.sigla} ${v.casa.gols} x ${v.fora.gols} ${v.fora.sigla}`);
  if (v.fim) { pausarVivo(); document.getElementById("play").textContent = "Ver relatório"; aviso("Fim de jogo"); return; }
  if (v.intervalo) { pausarVivo(); aviso("Intervalo: faça trocas sem gastar parada"); return; }
  if (vermelhoMeu) { pausarVivo(); aviso("Expulsão no seu time: ajuste a formação"); folhaTatica(true); return; }
  VIVO.timer = setTimeout(tickVivo, gol ? 1800 : 520);
}
function folhaTrocas() {
  const v = VIVO.estado;
  let sai = null;
  const f = folha(`<h2>Trocas ${v.trocas}/${v.max_trocas}</h2>
    <p class="sub">${v.pode_trocar ? `Até ${v.max_trocas} trocas em no máximo ${v.max_janelas} paradas, sem contar o intervalo. Paradas usadas: ${v.janelas}.` : "Sem trocas disponíveis agora."}</p>
    <h3>Quem sai</h3><div class="cartao lista">${v.em_campo.map((j) => `<button class="item" data-sai="${j.id}"><span class="pos">${esc(j.pos)}</span><div class="cresce"><div class="nome quebra">${esc(j.nome)}</div>
      <div class="minus">fôlego ${j.condicao}% · nota ${String(j.nota).replace(".", ",")}${j.amarelo ? " · amarelado" : ""}${j.gols ? " · " + j.gols + " gol" + (j.gols > 1 ? "s" : "") : ""}</div></div>${j.ovr ? `<span class="nivel ${corOvr(j.ovr)}">${j.ovr}</span>` : ""}</button>`).join("")}</div>
    <h3>Quem entra</h3><div class="cartao lista">${v.banco.map((j) => `<button class="item" data-entra="${j.id}"><span class="pos">${esc(j.pos)}</span><div class="cresce"><div class="nome quebra">${esc(j.nome)}</div><div class="minus">fôlego ${j.condicao}%</div></div>${j.ovr ? `<span class="nivel ${corOvr(j.ovr)}">${j.ovr}</span>` : ""}</button>`).join("") || `<div class="vazio">Banco vazio.</div>`}</div>
    <button class="btn sec" id="voltarjogo" style="margin-top:12px;width:100%">Voltar ao jogo</button>`);
  f.querySelector("#voltarjogo").onclick = () => { fecharFolha(); };
  f.querySelectorAll("[data-sai]").forEach((b) => b.onclick = () => {
    sai = +b.dataset.sai;
    f.querySelectorAll("[data-sai]").forEach((x) => x.classList.toggle("sel", x === b));
  });
  f.querySelectorAll("[data-entra]").forEach((b) => b.onclick = async () => {
    if (!sai) { aviso("Escolha primeiro quem sai"); return; }
    try { const nv = await api("vivo_trocar", { sai, entra: +b.dataset.entra }); VIVO.estado = nv; desenharVivo(nv); folhaTrocas(); aviso("Troca feita"); }
    catch (e) { aviso(e.message); }
  });
}
function folhaTatica(expulsao = false) {
  const v = VIVO.estado;
  const f = folha(`<h2>${expulsao ? "Expulsão: reorganize o time" : "Formação e estilo"}</h2>
    <p class="sub">Formação atual: ${esc(v.formacao)} com ${v.jogadores} em campo.${v.jogadores < 11 ? " Com menos jogadores, a formação perde vagas no ataque primeiro." : ""}</p>
    <h3>Formação</h3><div class="grade2">${v.formacoes.map((c) => `<button class="btn ${c === v.formacao ? "" : "sec"}" data-form="${c}">${c.split("").join(" ")}</button>`).join("")}</div>
    <h3>Estilo</h3><div class="grade2">${[["posse", "Posse e pressão"], ["equilibrada", "Equilibrado"], ["contragolpe", "Contragolpe"], ["bloco_baixo", "Fechar o time"]].map(([k, n]) => `<button class="btn sec" data-est="${k}">${n}</button>`).join("")}</div>
    <button class="btn sec" id="voltarjogo" style="margin-top:12px;width:100%">Voltar ao jogo</button>`);
  f.querySelector("#voltarjogo").onclick = () => fecharFolha();
  f.querySelectorAll("[data-form]").forEach((b) => b.onclick = async () => { const nv = await api("vivo_formacao", { codigo: b.dataset.form }); VIVO.estado = nv; desenharVivo(nv); aviso("Formação: " + b.dataset.form); folhaTatica(); });
  f.querySelectorAll("[data-est]").forEach((b) => b.onclick = async () => { const nv = await api("vivo_estilo", { preset: b.dataset.est }); VIVO.estado = nv; desenharVivo(nv); aviso("Estilo trocado"); fecharFolha(); });
}
async function terminarVivo() {
  pausarVivo();
  carregando("Apito final");
  try {
    const r = await api("vivo_finalizar");
    S.estado = r.estado;
    if (r.partida) { r.partida.assistida = true; S.partida = r.partida; S.fim = r.fim_de_temporada; ir("partida"); }
    else ir("painel");
    salvarAgora(true);
  } catch (e) { aviso(e.message); ir("painel"); }
}

function centralDaPartida(p) {
  if (!(p.central || []).length) return;
  document.getElementById("depois").insertAdjacentHTML("afterbegin", `<h3>Central de notícias</h3><div class="cartao destaque lista">${p.central.map((n) => itemNoticia({ texto: n.texto, tipo: n.tipo, data: "" })).join("")}</div>`);
}
function relatorioPartida(r) {
  const c = r.casa, f = r.fora;
  const linhaEst = (rotulo, a, b, pct = false) => {
    const tot = (Number(a) || 0) + (Number(b) || 0) || 1;
    return `<div class="est"><strong>${esc(a)}${pct ? "%" : ""}</strong><div><div class="meio">${esc(rotulo)}</div>
      <div class="barra"><i style="width:${(100 * (Number(a) || 0)) / tot}%"></i></div></div><strong style="text-align:right">${esc(b)}${pct ? "%" : ""}</strong></div>`;
  };
  const xg = (v) => String(v).replace(".", ",");
  document.getElementById("depois").innerHTML = `
    <h3>Números do jogo</h3>
    <div class="cartao">${linhaEst("Posse", c.posse, f.posse, true)}${linhaEst("Finalizações", c.finalizacoes, f.finalizacoes)}
      ${linhaEst("No alvo", c.no_alvo, f.no_alvo)}${linhaEst("Gols esperados (xG)", xg(c.xg), xg(f.xg))}
      ${linhaEst("Escanteios", c.escanteios, f.escanteios)}${linhaEst("Faltas", c.faltas, f.faltas)}
      ${linhaEst("Amarelos", c.amarelos, f.amarelos)}${linhaEst("Defesas do goleiro", c.defesas, f.defesas)}</div>
    ${r.melhor ? `<p class="sub">Melhor em campo: <strong>${esc(r.melhor)}</strong></p>` : ""}
    <h3>Notas</h3>
    <div class="cartao lista">${r.jogadores.slice(0, 22).map((j) => `<div class="item"><span class="pos">${esc(j.pos)}</span><div class="cresce"><div class="nome">${esc(j.nome)}</div>
      <div class="minus">${esc(j.sigla)} · ${j.min} min${j.gols ? ` · ${j.gols} gol${j.gols > 1 ? "s" : ""}` : ""}${j.ass ? ` · ${j.ass} assist.` : ""}</div></div>
      <span class="nivel">${esc(String(j.nota).replace(".", ","))}</span></div>`).join("")}</div>
    <h3>Escalações</h3>
    ${Object.entries(r.escalacoes).map(([sigla, e]) => `<div class="cartao"><strong>${esc(sigla)} · ${esc(e.formacao)}</strong> <span class="minus">${esc(e.tatica)}</span>
      <p class="sub" style="margin-top:6px">${e.titulares.map((t) => esc(`${t.pos} ${t.nome}`)).join(" · ")}</p></div>`).join("")}`;
}

// ---------------------------------------------------------------------------
// Elenco
// ---------------------------------------------------------------------------
async function telaElenco() {
  if (!S.abaElenco) S.abaElenco = "campo";
  if (S.abaElenco === "campo") return telaCampo();
  carregando("Abrindo o vestiário");
  const el = await api("elenco");
  const grupos = {};
  el.jogadores.forEach((j) => (grupos[j.rotulo || j.pos] = grupos[j.rotulo || j.pos] || []).push(j));
  app.innerHTML = `
    <div class="entre"><h2>Elenco</h2><span class="minus">${el.jogadores.length} atletas</span></div>
    ${abasElenco()}
    <p class="minus">${fonte(el.fonte, "Elenco")} ${el.data_fonte ? "· " + esc(el.data_fonte) : ""}</p>
    ${GRUPOS_PLANTEL.filter(([p]) => grupos[p]).map(([p, titulo]) => `<h3>${titulo} (${grupos[p].length})</h3><div class="cartao lista">${grupos[p].sort((a, b) => ovr(b) - ovr(a)).map((j) => linhaJogador(j)).join("")}</div>`).join("")}
    <p class="minus">OVR de 0 a 100. Quem está no EA SPORTS FC 26 usa a nota do jogo. Quem já teve nota no FC 25 ou no FIFA 22 usa a última nota, ajustada pela idade. Os outros são estimados pela hierarquia do elenco e calibrados pelos colegas que têm nota EA. LE e LD só quando a fonte diz o lado.</p>
    ${el.emprestados.length ? `<h3>Emprestados a outros clubes</h3><div class="cartao lista">${el.emprestados.map((j) => {
      const evol = j.ovr_inicio !== null && j.ovr_inicio !== undefined ? j.ovr - j.ovr_inicio : null;
      return `<div class="item" style="display:block"><div class="linha"><span class="pos">${esc(j.pos)}</span><div class="cresce"><div class="nome">${esc(j.nome)}</div>
        <div class="minus">${esc(j.clube || "Clube fora do jogo")}${j.ate ? " · até " + esc(j.ate) : ""}</div></div>
        <div style="text-align:right"><span class="nivel">${j.ovr}</span>${evol !== null ? `<div class="minus" style="color:${evol > 0 ? "var(--verde)" : evol < 0 ? "var(--vermelho)" : "var(--giz3)"}">${evol > 0 ? "+" + evol : evol === 0 ? "=" : evol} desde a ida</div>` : ""}</div></div>
        <div class="grade2" style="margin-top:6px;grid-template-columns:repeat(3,1fr)"><div class="minus">Jogos <strong>${j.jogos}</strong></div><div class="minus">Gols <strong>${j.gols}</strong></div><div class="minus">Assist. <strong>${j.ass}</strong></div></div>
        ${j.pode_chamar ? `<button class="btn sec peq" data-volta="${j.id}" data-multa="${esc(j.multa || "")}" style="margin-top:6px;width:100%">Chamar de volta (multa ${esc(j.multa || "R$ 0")})</button>` : ""}</div>`; }).join("")}</div>
      <p class="minus">Jogos, gols e assistências na temporada. A multa é proporcional ao tempo que falta de empréstimo (estimativa do Megafut) e só vale com a janela aberta.</p>` : ""}
    <p class="minus" style="margin-top:10px">${esc(el.aviso)}</p>`;
  ligarAbasElenco();
  app.querySelectorAll("[data-j]").forEach((b) => b.onclick = () => abrirJogador(+b.dataset.j, true));
  app.querySelectorAll("[data-volta]").forEach((b) => b.onclick = async () => {
    if (!b.dataset.ok) { b.dataset.ok = "1"; b.textContent = "Toque de novo para pagar " + b.dataset.multa + " e trazer de volta"; b.classList.remove("sec"); return; }
    try { const r = await api("chamar_de_volta", { jogador: +b.dataset.volta }); aviso(r.texto); S.estado = await api("estado"); telaElenco(); }
    catch (e) { aviso(e.message); b.dataset.ok = ""; b.classList.add("sec"); b.textContent = "Chamar de volta (multa " + b.dataset.multa + ")"; }
  });
}
function abasElenco() {
  return `<div class="abas"><button class="aba ${S.abaElenco === "campo" ? "on" : ""}" data-ae="campo">Escalação</button><button class="aba ${S.abaElenco === "lista" ? "on" : ""}" data-ae="lista">Plantel</button></div>`;
}
function ligarAbasElenco() {
  app.querySelectorAll("[data-ae]").forEach((b) => b.onclick = () => { S.abaElenco = b.dataset.ae; S.esc = null; telaElenco(); });
}
async function telaCampo() {
  if (!S.esc) {
    carregando("Montando o time no campo");
    const d = await api("escalacao");
    const base = d.escolhida || d.sugestao;
    S.esc = { dados: d, vagas: base.vagas.slice(), banco: (base.banco || []).slice(0, 7), sel: null, mudou: false, manual: Boolean(d.escolhida) };
  }
  desenharCampo();
}
function sanearEscalacao(E, porId) {
  const vistos = new Set();
  E.vagas = E.vagas.map((id) => (id && porId[id] && !vistos.has(id) ? (vistos.add(id), id) : null));
  E.banco = E.banco.filter((id) => id && porId[id] && !vistos.has(id) && (vistos.add(id), true)).slice(0, 7);
}
function desenharCampo() {
  const E = S.esc, d = E.dados;
  const porId = Object.fromEntries(d.jogadores.map((x) => [x.id, x]));
  sanearEscalacao(E, porId);
  const usados = new Set([...E.vagas, ...E.banco]);
  const fora = d.jogadores.filter((x) => !usados.has(x.id));
  const sel = E.sel;
  const ehSel = (tipo, chave) => sel && sel.tipo === tipo && sel.chave === chave;
  const fichaVaga = (v, i) => {
    const jid = E.vagas[i], x = porId[jid];
    const foraPos = x && ((x.pos !== v.pos && !(x.sec || []).includes(v.pos)) || (x.lado && v.pos === "LAT" && v.sigla !== v.pos && ("L" + x.lado) !== v.sigla));
    const cls = ["ficha", !x ? "vazia" : "", x && !x.disponivel ? "indisp" : "", foraPos ? "fora" : "", ehSel("vaga", i) ? "sel" : ""].join(" ");
    return `<button class="${cls}" data-vaga="${i}" style="left:${v.x}%;top:${v.y}%"><span class="bola ${x ? corOvr(ovr(x)) : ""}">${x ? ovr(x) : "+"}</span>
      <span class="rot">${x ? esc(nomeSobrenome(x.nome)) : "Vazio"}</span><span class="vpos">${esc(v.sigla || v.pos)}${x && x.num ? " · " + x.num : ""}${x && x.lesao ? " · DM" : ""}</span></button>`;
  };
  const reserva = (x, tipo) => `<button class="reserva ${ehSel(tipo, x.id) ? "sel" : ""}" data-${tipo}="${x.id}"><span class="pos">${esc(x.rotulo || x.pos)}</span>
    <span class="n">${esc(x.nome)}<span class="d">${x.num ? "camisa " + x.num + " · " : ""}condição ${x.condicao}% · moral ${x.moral}${!x.disponivel ? (x.lesao ? ` · <b style="color:#ff8a8a">DM ${x.lesao} dias</b>` : ` · <b style="color:#ff8a8a">suspenso</b>`) : ""}</span></span>
    <span class="nivel ${corOvr(ovr(x))}">${ovr(x)}</span></button>`;
  app.innerHTML = `
    <div class="entre"><h2>Elenco</h2><span class="minus">${d.jogadores.length} atletas</span></div>
    ${abasElenco()}
    <div class="grade2"><div class="campo"><label>Formação</label><select id="form">${d.formacoes.map((f) => `<option value="${f}" ${f === d.formacao ? "selected" : ""}>${f.split("").join(" ")}</option>`).join("")}</select></div>
      <div class="campo"><label>Estilo de jogo</label><select id="estilo">${d.estilos.map(([k, n]) => `<option value="${k}" ${k === d.estilo ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div></div>
    <p class="minus" style="margin:-4px 0 8px">${esc((d.estilos.find((e) => e[0] === d.estilo) || [])[2] || "")}</p>
    <div class="gramado">
      <svg class="marcas" viewBox="0 0 68 90" preserveAspectRatio="none" fill="none" stroke="rgba(255,255,255,.55)" stroke-width=".35">
        <rect x="1.5" y="1.5" width="65" height="87"/><line x1="1.5" y1="45" x2="66.5" y2="45"/><circle cx="34" cy="45" r="7"/>
        <rect x="16" y="1.5" width="36" height="13"/><rect x="25" y="1.5" width="18" height="5"/>
        <rect x="16" y="75.5" width="36" height="13"/><rect x="25" y="83.5" width="18" height="5"/>
      </svg>
      ${d.vagas.map(fichaVaga).join("")}
    </div>
    <p class="minus" style="margin:8px 0">${sel ? "Agora toque em quem entra no lugar." : "Toque num jogador e depois em outro para trocar. Laranja: fora da posição de origem. Vermelho: indisponível."}</p>
    <h3>Banco de reservas (${E.banco.length} de 7)</h3>
    <div class="banco">${E.banco.map((id) => porId[id]).filter(Boolean).map((x) => reserva(x, "banco")).join("")}
      ${E.banco.length < 7 ? `<button class="reserva" data-bancovazio="1" style="justify-content:center;border-style:dashed">${ehSel("vazio", 0) ? "Escolha abaixo" : "+ vaga"}</button>` : ""}</div>
    <h3>Suplentes fora da lista</h3>
    <div class="banco">${fora.map((x) => reserva(x, "fora")).join("") || `<p class="minus">Todo o elenco está relacionado.</p>`}</div>
    <div style="display:grid;gap:8px;margin-top:14px">
      <button class="btn" id="salvarEsc" ${E.mudou ? "" : "disabled"}>Salvar escalação</button>
      <button class="btn sec" id="auxiliar">${E.manual ? "Deixar o auxiliar escalar" : "Auxiliar está escalando a cada jogo"}</button>
    </div>
    <p class="minus" style="margin-top:8px">Se um titular se machucar ou for suspenso antes do jogo, o auxiliar escala o substituto. Trocas durante a partida: auxiliar técnico.</p>`;
  ligarAbasElenco();
  const trocar = (alvo) => {
    if (!E.sel) { E.sel = alvo; desenharCampo(); return; }
    const a = E.sel; E.sel = null;
    const valor = (s) => s.tipo === "vaga" ? E.vagas[s.chave] : s.chave;
    // posição fixa de cada lado antes de mexer: trocar dois reservas não pode duplicar nem sumir com ninguém
    const lugar = (s) => s.tipo === "vaga" ? ["vaga", s.chave] : s.tipo === "banco" ? ["banco", E.banco.indexOf(s.chave)] : ["fora", -1];
    const la = lugar(a), lb = lugar(alvo);
    const por = (s, novo) => {
      const [tipo, i] = s === a ? la : lb;
      if (tipo === "vaga") E.vagas[i] = novo;
      else if (tipo === "banco" && i >= 0) E.banco[i] = novo;
    };
    if (a.tipo === "vazio" || alvo.tipo === "vazio") {
      const outro = a.tipo === "vazio" ? alvo : a;
      if (outro.tipo === "fora" && E.banco.length < 7) { E.banco.push(outro.chave); E.mudou = true; }
      desenharCampo(); return;
    }
    if (a.tipo === alvo.tipo && a.chave === alvo.chave) { desenharCampo(); return; }
    const va = valor(a), vb = valor(alvo);
    if (a.tipo === "fora" && alvo.tipo === "fora") { E.sel = alvo; desenharCampo(); return; }
    if (a.tipo === "fora") por(alvo, va);
    else if (alvo.tipo === "fora") por(a, vb);
    else { por(a, vb); por(alvo, va); }
    E.mudou = true;
    desenharCampo();
  };
  app.querySelectorAll("[data-vaga]").forEach((b) => b.onclick = () => trocar({ tipo: "vaga", chave: +b.dataset.vaga }));
  app.querySelectorAll("[data-banco]").forEach((b) => b.onclick = () => trocar({ tipo: "banco", chave: +b.dataset.banco }));
  app.querySelectorAll("[data-fora]").forEach((b) => b.onclick = () => trocar({ tipo: "fora", chave: +b.dataset.fora }));
  const bv = app.querySelector("[data-bancovazio]");
  if (bv) bv.onclick = () => trocar({ tipo: "vazio", chave: 0 });
  document.getElementById("form").onchange = async (ev) => {
    carregando("Mudando a formação");
    const nd = await api("formacao", { codigo: ev.target.value });
    S.esc = { dados: nd, vagas: nd.sugestao.vagas.slice(), banco: nd.sugestao.banco.slice(0, 7), sel: null, mudou: false, manual: false };
    aviso("Formação trocada. O auxiliar sugeriu os onze: ajuste e salve se quiser.");
    desenharCampo();
  };
  document.getElementById("estilo").onchange = async (ev) => {
    await api("tatica", { preset: ev.target.value });
    const nd = await api("escalacao");
    S.esc.dados = nd;
    if (nd.formacao !== d.formacao) S.esc = { dados: nd, vagas: nd.sugestao.vagas.slice(), banco: nd.sugestao.banco.slice(0, 7), sel: null, mudou: false, manual: false };
    aviso("Estilo de jogo trocado");
    desenharCampo();
  };
  document.getElementById("salvarEsc").onclick = async () => {
    if (E.vagas.some((x) => !x)) { aviso("Complete os onze"); return; }
    const r = await api("definir_escalacao", { vagas: E.vagas, banco: E.banco });
    if (r.ok) { E.mudou = false; E.manual = true; aviso(r.texto); desenharCampo(); } else aviso(r.erro);
  };
  document.getElementById("auxiliar").onclick = async () => {
    const r = await api("definir_escalacao", { vagas: [] });
    S.esc = null; aviso(r.texto); telaCampo();
  };
}
function linhaJogador(j) {
  const sinais = [];
  if (j.lesao && !j.lesao_info) sinais.push(chip(`Lesão ${j.lesao}d`, "ruim"));
  if (j.susp) sinais.push(chip("Suspenso", "ruim"));
  if (j.listado) sinais.push(chip(j.listado === "venda" ? "À venda" : "Para empréstimo", "al"));
  if (j.emprestado_por) sinais.push(chip("Emprestado", ""));
  if (j.onze) sinais.push(chip("Titular", "ok"));
  if (j.plano === "conto") sinais.push(chip("Conto com ele", "ok"));
  if (j.plano === "fora") sinais.push(chip("Liberado para sair", "al"));
  if (j.pede_saida) sinais.push(chip("Torcida pede saída", "ruim"));
  if (j.ident >= 75) sinais.push(chip("Ídolo", "ok"));
  if (j.carga_tom === "alerta" || j.carga_tom === "ruim") sinais.push(chip(`${j.carga_txt}: ${j.carga} jogos em 14 dias`, j.carga_tom === "ruim" ? "ruim" : "al"));
  const dm = j.lesao_info ? `<div class="dm">DM: ${esc(j.lesao_info.diagnostico)} · volta ${esc(j.lesao_info.volta)} · ${j.lesao_info.jogos ? "perde " + plural(j.lesao_info.jogos, "jogo", "jogos") : "sem jogos no período"}</div>` : "";
  return `<button class="item" data-j="${j.id}"><span class="pos">${esc(j.rotulo || j.pos)}</span><div class="cresce"><div class="nome quebra">${esc(j.nome)}</div>
    <div class="minus">${textoIdade(j)} · moral ${j.moral} · ${plural(j.jogos, "jogo", "jogos")}${j.gols ? ", " + plural(j.gols, "gol", "gols") : ""}</div>${dm}
    <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">${sinais.join("")}</div></div><span class="nivel ${corOvr(ovr(j))}">${ovrMostra(j)}</span></button>`;
}
async function abrirJogador(id, meu) {
  const f = folha(`<div class="vazio"><div class="anel"></div></div>`);
  const j = await api("jogador", { id });
  const attrs = j.atributos ? Object.entries(j.atributos).map(([g, v]) => `<h3>${esc(g)}</h3><div class="grade2">${Object.entries(v).map(([k, n]) => `<div class="entre"><span class="minus">${esc(k.replace(/_/g, " "))}</span><strong>${n}</strong></div>`).join("")}</div>`).join("") : "";
  f.innerHTML = `
    <div class="entre"><div><h2 style="margin:0">${esc(j.nome)}</h2><p class="sub">${esc(j.rotulo && j.rotulo !== j.pos ? j.rotulo + " · " : "")}${esc(j.posicao)}${j.sec.length ? " · também " + esc(j.sec.join(", ")) : ""}${j.pos_ok ? "" : " · posição detalhada CONFIRMAR"}</p></div>
      <div style="text-align:right"><span class="num" style="font-size:${j.conhec < 100 ? 26 : 40}px">${j.conhec < 100 ? esc(j.ovr_txt) : ovr(j)}</span><div class="minus">${j.conhec < 100 ? "OVR estimado" : "OVR"}</div></div></div>
    ${j.conhec < 100 ? `<div class="cartao"><div class="entre"><span class="sub">Conhecimento do seu clube</span><strong>${j.conhec}%</strong></div>
      <div class="barra" style="margin:4px 0"><i style="width:${j.conhec}%"></i></div>
      <div class="entre"><span class="sub">Potencial estimado</span><strong>${esc(j.pot_txt)}</strong></div>
      <p class="minus" style="margin-top:6px">${j.oculto ? "Atributos e personalidade escondidos até 70% de conhecimento. " : ""}O olheiro também erra: quanto pior a rede de observação, mais a faixa pode estar deslocada do nível real.</p>
      ${j.olheiro ? `<button class="btn sec" id="observar" style="margin-top:8px" ${j.olheiro.restam ? "" : "disabled"}>Enviar olheiro · ${esc(j.olheiro.custo)} · restam ${j.olheiro.restam} de ${j.olheiro.por_semana} nesta semana</button>` : ""}</div>` : ""}
    <div class="cartao">
      <div class="entre"><span class="sub">Clube</span><strong>${esc(j.clube ? j.clube.nome : "Sem clube")}</strong></div>
      ${j.perfil_clube ? `<div class="entre"><span class="sub">Diretoria do clube</span><strong>${esc(j.perfil_clube)}</strong></div>` : ""}
      ${j.carga_txt ? `<div class="entre"><span class="sub">Carga</span><strong>${esc(j.carga_txt)} (${plural(j.carga, "jogo", "jogos")} em 14 dias)</strong></div>` : ""}
      <div class="entre"><span class="sub">Idade</span><strong>${j.idade_ok ? j.idade + " anos" : "CONFIRMAR (sem fonte; o jogo usa ~" + j.idade + ")"}</strong></div>
      ${j.pe && j.pe !== "CONFIRMAR" ? `<div class="entre"><span class="sub">Pé</span><strong>${esc(j.pe)}</strong></div>` : ""}
      ${j.altura && j.altura !== "CONFIRMAR" ? `<div class="entre"><span class="sub">Altura e peso</span><strong>${esc(j.altura)} cm${j.peso && j.peso !== "CONFIRMAR" ? " · " + esc(j.peso) + " kg" : ""}</strong></div>` : ""}
      <div class="entre"><span class="sub">Nacionalidade</span><strong>${esc(j.nac)}</strong></div>
      <div class="entre"><span class="sub">Contrato até</span><strong>${esc(j.fim)}</strong></div>
      <div class="entre"><span class="sub">Salário</span><strong>${esc(j.salario)}</strong></div>
      <div class="entre"><span class="sub">Valor de mercado</span><strong>${esc(j.valor)}</strong></div>
      ${j.lista_clube === "venda" ? `<div class="entre"><span class="sub">Na lista de transferência</span><strong style="color:#9be8b4">pede cerca de ${esc(j.preco)}</strong></div>` : ""}
      ${j.lista_clube === "emprestimo" ? `<div class="entre"><span class="sub">Na lista de empréstimo</span><strong style="color:#ffd166">sem taxa, você paga o salário</strong></div>` : ""}
      ${j.lesao_info ? `<div class="dm" style="margin:6px 0">Departamento médico: ${esc(j.lesao_info.diagnostico)}${j.lesao_info.gravidade ? " (" + esc(j.lesao_info.gravidade) + ")" : ""}. Volta por volta de ${esc(j.lesao_info.volta)}, ${j.lesao_info.jogos ? "perde " + plural(j.lesao_info.jogos, "jogo", "jogos") : "sem jogos no período"}.</div>` : ""}
      <div class="entre"><span class="sub">Multa rescisória</span><strong>${esc(j.multa)}</strong></div>
      <div class="entre"><span class="sub">Temporada</span><strong>${plural(j.jogos, "jogo", "jogos")}, ${plural(j.gols, "gol", "gols")}, ${j.ass} assist.</strong></div>
      ${j.emprestado_por ? `<div class="entre"><span class="sub">Emprestado por</span><strong>${esc(j.emprestado_por)}</strong></div>` : ""}
      <p class="minus" style="margin-top:8px">Nível, valor, salário e contrato estimados pelo Megafut. ${esc(j.origem)}.</p>
      ${j.obs ? `<p class="minus">${esc(j.obs)}</p>` : ""}${j.fonte ? `<p class="minus">${fonte(j.fonte)}</p>` : ""}
    </div>
    ${(j.titulos || []).length ? `<h3>Títulos</h3><p class="sub">${esc(j.titulos.join(" · "))}</p>` : ""}
    ${(j.caracteristicas || []).length ? `<h3>Características principais</h3><div>${j.caracteristicas.map((c) => `<span class="traco ${c.tom}">${esc(c.texto)}</span>`).join("")}</div>
      <p class="minus" style="margin-top:6px">${j.ref && (j.ref.estilos || []).length ? "Estilos de jogo do EA SPORTS FC 26. " : "Perfil de jogo estimado pelo Megafut. "}${j.real ? "Em atletas reais o jogo não atribui pontos fracos de comportamento ou saúde." : "Atleta gerado pelo jogo."}</p>` : ""}
    ${(j.resumo || []).length ? `<h3>Resumo (1 a 20)</h3><div class="cartao">${j.resumo.map(([k, v]) => `<div class="attr"><div><div class="minus">${esc(k)}</div><div class="b"><i style="width:${v * 5}%"></i></div></div><strong style="text-align:right">${v}</strong></div>`).join("")}</div>` : ""}
    ${j.ref ? `<h3>Referência EA SPORTS FC 26</h3><div class="cartao"><div class="entre"><span class="sub">Nota no FC 26${j.ref.time ? " (" + esc(j.ref.time) + ")" : ""}</span><strong>${j.ref.ovr}</strong></div>
      ${Object.keys(j.ref.atributos || {}).length ? `<p class="sub" style="margin-top:6px">${Object.entries(j.ref.atributos).map(([k, v]) => esc(k) + " " + v).join(" · ")}</p>` : ""}
      ${(j.ref.estilos || []).length ? `<div style="margin-top:6px">${j.ref.estilos.map((e) => `<span class="traco bom">${esc(e)}</span>`).join("")}</div>` : ""}
      <p class="minus" style="margin-top:6px">${esc(j.ref.fonte)}. O OVR do Megafut é a nota EA menos 8, para ficar na mesma escala dos clubes brasileiros, que não estão no FC 26.</p></div>` : ""}
    <div id="acoes" style="display:grid;gap:8px;margin-top:12px"></div>
    ${attrs ? `<details style="margin-top:10px"><summary class="sub">Todos os atributos</summary>${attrs}</details>` : ""}`;
  const acoes = f.querySelector("#acoes");
  const obs = f.querySelector("#observar");
  if (obs) obs.onclick = async () => { const r = await api("observar", { jogador: j.id }); aviso(r.texto || r.erro); if (r.ok) abrirJogador(id, meu); };
  if (meu && j.ultra) {
    const planos = [["conto", "Conto com ele", "Ele terá minutos durante o ano"], ["", "Sem definição", "A diretoria decide sozinha"], ["fora", "Pode sair", "A diretoria pode vender ou emprestar"]];
    acoes.innerHTML = `<div class="cartao"><div class="entre"><span class="sub">Identificação com a torcida</span><strong>${esc(j.ident_txt)} (${j.ident})</strong></div>
      <div class="barra" style="margin:4px 0"><i style="width:${j.ident}%"></i></div>
      <div class="entre"><span class="sub">Momento</span><strong>${esc(j.fase)}</strong></div>
      ${j.pede_saida ? `<p class="chip ruim" style="margin-top:6px">A torcida pede a saída dele</p>` : ""}
      <p class="minus" style="margin-top:6px">A identificação é medida pelo jogo (anos e jogos pelo clube, capitania, títulos e ídolos informados). Ídolo é muito difícil de vender.${j.emprestimo_recebido ? " Ele é emprestado: a diretoria não pode vendê-lo." : ""}</p></div>
      <h3>Seus planos para ele</h3>
      ${planos.map(([v, t, d]) => `<button class="btn ${j.plano === v ? "" : "sec"}" data-plano="${v}">${t}<br><span class="minus">${d}</span></button>`).join("")}`;
    acoes.querySelectorAll("[data-plano]").forEach((b) => b.onclick = async () => {
      try { const r = await api("plano", { jogador: j.id, plano: b.dataset.plano }); aviso(r.texto); abrirJogador(id, meu); }
      catch (e) { aviso(e.message); }
    });
  } else if (meu && j.emprestimo_recebido) {
    const e = j.emprestimo_recebido;
    acoes.innerHTML = `<div class="cartao"><div class="entre"><span class="sub">Emprestado pelo</span><strong>${esc(e.dono)}</strong></div>
      <div class="entre"><span class="sub">Empréstimo até</span><strong>${esc(e.ate)}</strong></div>
      ${e.opcao ? `<div class="entre"><span class="sub">${e.obrigacao ? "Obrigação de compra" : "Opção de compra"}</span><strong>${esc(e.opcao)}</strong></div>` : ""}
      <p class="minus" style="margin-top:6px">Ele não é do seu clube: não pode ser vendido, emprestado nem ter o contrato renovado. ${e.janela ? "" : "Encerrar o empréstimo ou comprar só com a janela de transferências aberta."}</p></div>
      <button class="btn sec" data-e="manter">Manter no clube</button>
      <button class="btn sec" data-e="encerrar" ${e.janela ? "" : "disabled"}>Encerrar empréstimo · multa ${esc(e.multa)}</button>
      ${e.opcao ? `<button class="btn" data-e="comprar" ${e.janela ? "" : "disabled"}>Exercer opção de compra · ${esc(e.opcao)}</button>` : ""}`;
    let confirma = "";
    acoes.querySelectorAll("[data-e]").forEach((b) => b.onclick = async () => {
      const a = b.dataset.e;
      if (a === "manter") { fecharFolha(); return; }
      if (confirma !== a) { confirma = a; b.textContent = "Toque de novo para confirmar"; return; }
      try {
        const r = await api(a === "encerrar" ? "encerrar_emprestimo" : "opcao_de_compra", { jogador: j.id });
        aviso(r.texto); fecharFolha(); S.estado = await api("estado"); telaElenco();
      } catch (erro) { aviso(erro.message); confirma = ""; }
    });
  } else if (meu) {
    const listado = j.listado;
    acoes.innerHTML = `
      <div class="grade2"><button class="btn sec" data-a="venda">${listado === "venda" ? "Tirar da venda" : "Oferecer para venda"}</button>
      <button class="btn sec" data-a="emprestimo">${listado === "emprestimo" ? "Tirar do empréstimo" : "Oferecer por empréstimo"}</button></div>
      <div class="grade2"><button class="btn sec" data-a="renovar">Renovar contrato</button><button class="btn sec" data-a="rescindir">${j.emprestado_por ? "Devolver" : "Rescindir"}</button></div>`;
    acoes.querySelectorAll("[data-a]").forEach((b) => b.onclick = async () => {
      const a = b.dataset.a;
      if (a === "venda" || a === "emprestimo") {
        await api("listar", { jogador: j.id, modo: listado === a ? "nenhum" : a });
        aviso(listado === a ? "Tirado do mercado" : "Os clubes vão saber que ele está disponível");
        fecharFolha(); telaElenco();
      } else if (a === "renovar") {
        formRenovar(j);
      } else if (a === "rescindir") {
        const r = await api("rescindir", { jogador: j.id });
        aviso(r.texto || r.erro); fecharFolha(); S.estado = await api("estado"); telaElenco();
      }
    });
  } else {
    acoes.innerHTML = `<button class="btn" id="propor">Fazer proposta</button>${j.recompra ? `<button class="btn sec" id="recompra">Exercer recompra</button>` : ""}`;
    acoes.querySelector("#propor").onclick = () => formProposta(j);
    const rb = acoes.querySelector("#recompra");
    if (rb) rb.onclick = async () => { const r = await api("propor", { tipo: "recompra", jogador: j.id }); aviso(r.texto || r.erro); fecharFolha(); };
  }
}
function formRenovar(j) {
  const f = folha(`<h2>Renovar com ${esc(j.nome)}</h2>
    <div class="campo"><label>Salário mensal (R$)</label><input id="sal" type="number" inputmode="numeric" value="${Math.round(j.salario_num * 1.1)}"></div>
    <div class="campo"><label>Anos de contrato</label><select id="anos">${[1, 2, 3, 4, 5].map((n) => `<option ${n === 3 ? "selected" : ""}>${n}</option>`).join("")}</select></div>
    <button class="btn" id="ok">Propor renovação</button><p class="minus" id="msg" style="margin-top:8px"></p>`);
  f.querySelector("#ok").onclick = async () => {
    const r = await api("renovar", { jogador: j.id, salario: +f.querySelector("#sal").value, anos: +f.querySelector("#anos").value });
    if (r.ok) { aviso(r.texto); fecharFolha(); telaElenco(); }
    else f.querySelector("#msg").textContent = r.erro + (r.pedida ? `. Pedido: R$ ${Math.round(r.pedida).toLocaleString("pt-BR")}` : "");
  };
}

// ---------------------------------------------------------------------------
// Jogos e competições
// ---------------------------------------------------------------------------
async function telaJogos() {
  carregando("Abrindo as tabelas");
  const comps = await api("competicoes");
  if (!S.compAberta && comps.minhas.length) S.compAberta = comps.minhas[0].id;
  let html = `<h2>Competições</h2><div class="abas">${comps.minhas.map((c) => `<button class="aba cat-${c.cat} ${c.id === S.compAberta ? "on" : ""}" data-c="${esc(c.id)}">${esc(c.nome)}</button>`).join("")}
    <button class="aba ${S.compAberta === "_outras" ? "on" : ""}" data-c="_outras">Outras</button><button class="aba ${S.compAberta === "_cal" ? "on" : ""}" data-c="_cal">Calendário</button></div><div id="corpo"></div>`;
  app.innerHTML = html;
  app.querySelectorAll("[data-c]").forEach((b) => b.onclick = () => { S.compAberta = b.dataset.c; telaJogos(); });
  const corpo = document.getElementById("corpo");
  if (S.compAberta === "_cal" || S.compAberta === "_outras") temaCompeticao(null);
  if (S.compAberta === "_cal") {
    const cal = await api("calendario");
    corpo.innerHTML = cal.map((j) => cartaoJogo(j)).join("") || `<div class="vazio">Sem jogos.</div>`;
    return;
  }
  if (S.compAberta === "_outras") {
    corpo.innerHTML = comps.por_pais.map((p) => `<h3>${esc(p.pais)}</h3><div class="cartao lista">${p.competicoes.map((c) => `<button class="item" data-o="${esc(c.id)}"><span class="cat-${c.cat}" style="flex:none;width:10px;height:10px;border-radius:50%;background:var(--cat)"></span><div class="cresce"><div class="nome">${esc(c.nome)}</div><div class="minus">${c.encerrada ? "Campeão: " + esc(c.campeao) : esc(c.fase)}</div></div></button>`).join("")}</div>`).join("");
    corpo.querySelectorAll("[data-o]").forEach((b) => b.onclick = () => { S.compAberta = b.dataset.o; desenharCompeticao(document.getElementById("corpo"), b.dataset.o); });
    return;
  }
  if (S.compAberta) desenharCompeticao(corpo, S.compAberta);
}
async function desenharCompeticao(corpo, id, fase = null, rodada = null) {
  const t = await api("tabela", { comp: id, fase });
  const jogos = await api("jogos", { comp: id, fase: t.indice, rodada });
  const art = await api("artilharia", { comp: id });
  temaCompeticao(t.cat);
  corpo.className = "cat-" + t.cat;
  corpo.innerHTML = `
    <div class="faixa-comp"><div class="rotulo">${ROTULO_CAT[t.cat] || ""}</div><div class="titulo-comp">${esc(t.nome)}</div></div>
    <div class="cartao"><strong>${esc(t.nome)}</strong>${t.campeao ? ` <span class="chip al">Campeão: ${esc(t.campeao.nome)}</span>` : ""}
      <div class="abas">${t.fases.map((x) => `<button class="aba ${x.indice === t.indice ? "on" : ""}" data-f="${x.indice}" ${x.estado === "aguardando" ? "disabled" : ""}>${esc(x.nome)}</button>`).join("")}</div>
      ${t.explicacao ? `<p class="minus" style="margin-top:8px">${esc(t.explicacao)}</p>` : ""}
      ${t.premio ? `<p class="minus" style="margin-top:6px">${esc(t.premio.texto)}${t.premio.fonte ? " · " + fonte(t.premio.fonte) : ""}</p>` : ""}</div>
    ${t.grupos.map((g, i) => `<div class="cartao">${t.grupos.length > 1 ? `<p class="minus">Grupo ${i + 1}</p>` : ""}${tabelaHtml(g, t.usuario)}</div>`).join("")}
    ${t.confrontos.map((c) => `<div class="cartao"><div class="entre"><strong>${esc(c.a.nome)}</strong><span class="minus">x</span><strong>${esc(c.b ? c.b.nome : "Folga")}</strong></div>
      ${c.jogos.map((j) => `<p class="minus">${esc(j.data)}: ${esc(j.casa.sigla)} ${j.gc ?? ""} x ${j.gf ?? ""} ${esc(j.fora.sigla)}${j.pc !== null && j.pc !== undefined ? ` (pên. ${j.pc} x ${j.pf})` : ""}</p>`).join("")}
      ${c.vencedor ? `<p class="chip ok">Classificado: ${esc(c.vencedor === c.a.id ? c.a.nome : c.b.nome)}</p>` : ""}</div>`).join("")}
    ${t.tipo === "pontos" ? `<div class="entre"><button class="btn sec peq" id="ant">Rodada anterior</button><strong>Rodada ${jogos.rodada + 1} de ${jogos.total}</strong><button class="btn sec peq" id="prox">Próxima</button></div>
      ${jogos.jogos.map((j) => cartaoJogo(j)).join("")}` : ""}
    ${art.length ? `<h3>Artilharia</h3><div class="cartao lista">${art.slice(0, 10).map((a, i) => `<div class="item"><span class="pos">${i + 1}</span><div class="cresce"><div class="nome">${esc(a.nome)}</div><div class="minus">${esc(a.clube)}</div></div><span class="nivel">${a.gols}</span></div>`).join("")}</div>` : ""}
    ${t.notas.length ? `<p class="selo">${t.notas.map(esc).join("<br>")}</p>` : ""}
    ${t.fontes.length ? `<p class="minus" style="margin-top:6px">${t.fontes.slice(0, 2).map((u) => fonte(u)).join(" · ")}</p>` : ""}`;
  corpo.querySelectorAll("[data-f]").forEach((b) => b.onclick = () => desenharCompeticao(corpo, id, +b.dataset.f));
  const ant = corpo.querySelector("#ant"), prox = corpo.querySelector("#prox");
  if (ant) ant.onclick = () => desenharCompeticao(corpo, id, t.indice, Math.max(0, jogos.rodada - 1));
  if (prox) prox.onclick = () => desenharCompeticao(corpo, id, t.indice, Math.min(jogos.total - 1, jogos.rodada + 1));
}

// ---------------------------------------------------------------------------
// Mercado
// ---------------------------------------------------------------------------
async function telaDiretoria() {
  const d = await api("diretoria");
  S.pedirPos = S.pedirPos || [];
  const cartaoSug = (p, x) => `<div class="cartao"><div class="entre"><div><strong>${esc(x.nome)}</strong><div class="minus">${esc(x.rotulo || x.pos)} · ${esc(x.idade)} anos · ${esc(x.nac || "")}</div></div><span class="nivel ${corOvr(ovr(x))}">${ovr(x)}</span></div>
      <div class="entre"><span class="sub">Onde joga</span><strong>${esc(x.clube_nome)}${x.liga ? " · " + esc(x.liga) : ""}</strong></div>
      <div class="entre"><span class="sub">Temporada</span><strong>${plural(x.jogos, "jogo", "jogos")} · ${plural(x.gols, "gol", "gols")} · ${plural(x.assist, "assistência", "assistências")}${x.nota ? " · nota " + String(x.nota).replace(".", ",") : ""}</strong></div>
      <div class="entre"><span class="sub">Potencial</span><strong>${esc(x.pot_txt || "")}</strong></div>
      <div class="entre"><span class="sub">Valor estimado</span><strong>${esc(x.valor_txt)}</strong></div>
      <div style="display:flex;gap:8px;margin-top:8px;align-items:center"><button class="btn sec peq" data-ver="${x.id}">Ver ficha</button>
      ${x.neg === "negociando" ? chip("Diretoria negociando", "al") : x.neg === "concluido" ? chip("Contratado", "ok") : x.neg === "falhou" ? `<span class="minus">${esc(x.neg_obs || "Sem acordo")}</span>` : `<button class="btn peq" data-quero="${p.id}:${x.id}">Quero contar com ele</button>`}</div></div>`;
  const ESTADO = { buscando: ["Procurando", "al"], pronto: ["Nomes chegaram", "ok"], negociando: ["Negociando", "al"], concluido: ["Contratado", "ok"], falhou: ["Não deu certo", "ruim"], sem_nomes: ["Sem nomes viáveis", "ruim"], cancelado: ["Cancelado", ""] };
  app.innerHTML = `<h2>Diretoria</h2>
    <div class="cartao"><div class="entre"><span class="sub">Aprovação da torcida à diretoria</span><strong>${d.aprovacao}</strong></div>
      <div class="barra" style="margin:4px 0"><i style="width:${d.aprovacao}%;${d.aprovacao < 35 ? "background:var(--vermelho)" : ""}"></i></div>
      <p class="minus">${d.gestao > 1 ? `Esta é a ${d.gestao}ª diretoria desde a sua chegada. ` : ""}Abaixo de 25 a torcida derruba a diretoria, e você continua no cargo.</p>
      <p class="minus" style="margin-top:6px">${esc(d.regra)}</p></div>
    ${d.liberados.length ? `<div class="cartao"><strong>Reforço liberado</strong><p class="minus">A diretoria negociou alguém nestas posições: ${d.liberados.map((l) => esc(l.rotulo)).join(", ")}. Peça reforço abaixo.</p></div>` : ""}
    <h3>Pedir reforço</h3>
    <div class="abas" style="flex-wrap:wrap">${d.posicoes.map((p) => `<button class="aba ${S.pedirPos.includes(p.chave) ? "on" : ""}" data-pp="${p.chave}">${esc(p.rotulo)}</button>`).join("")}</div>
    <button class="btn" id="pedir" ${S.pedirPos.length ? "" : "disabled"}>Pedir à diretoria (${S.pedirPos.length})</button>
    <p class="minus">A diretoria leva de 3 a 6 dias e traz até 4 nomes por posição. ${d.janela ? "" : "A janela está fechada: ela pode buscar, mas só fecha quando abrir (sem clube pode assinar a qualquer hora)."}</p>
    <h3>Pedidos</h3>
    ${d.pedidos.length ? d.pedidos.map((p) => `<div class="cartao"><div class="entre"><strong>${esc(p.rotulo)}</strong>${chip(ESTADO[p.estado] ? ESTADO[p.estado][0] : p.estado, ESTADO[p.estado] ? ESTADO[p.estado][1] : "")}</div>
      ${p.estado === "buscando" ? `<p class="minus">Previsão: ${esc(p.pronto_em)}</p>` : `<p class="minus">Pode escolher mais de um nome: a diretoria negocia todos ao mesmo tempo e para quando fechar com um.</p>`}
      <button class="btn sec peq" data-cancela="${p.id}" style="margin-top:6px">Encerrar pedido</button></div>
      ${p.sugestoes.map((x) => cartaoSug(p, x)).join("")}`).join("") : `<div class="vazio">Nenhum pedido em aberto.</div>`}
    ${d.encerrados.length ? `<p class="minus" style="margin-top:8px">Encerrados: ${d.encerrados.map((x) => `${esc(x.rotulo)}, ${esc(x.resumo)}`).join(" · ")}</p>` : ""}
    <h3>Seus planos</h3>
    <div class="cartao"><p><strong>Conto com:</strong> ${d.planos.conto.map((x) => esc(x.nome)).join(", ") || "ninguém marcado"}</p>
      <p style="margin-top:6px"><strong>Podem sair:</strong> ${d.planos.fora.map((x) => esc(x.nome)).join(", ") || "ninguém marcado"}</p>
      ${d.pede_saida.length ? `<p style="margin-top:6px"><strong>Torcida pede saída:</strong> ${d.pede_saida.map(esc).join(", ")}</p>` : ""}
      <p class="minus" style="margin-top:6px">Marque na ficha de cada jogador, no Elenco.</p></div>
    <h3>Decisões da diretoria</h3>
    <div class="cartao lista">${d.decisoes.length ? d.decisoes.map(([dt, t]) => `<div class="item"><div class="cresce"><div class="minus">${esc(dt)}</div><div>${esc(t)}</div></div></div>`).join("") : `<p class="minus">Nada ainda.</p>`}</div>`;
  app.querySelectorAll("[data-pp]").forEach((b) => b.onclick = () => { const k = b.dataset.pp; S.pedirPos = S.pedirPos.includes(k) ? S.pedirPos.filter((x) => x !== k) : [...S.pedirPos, k]; telaDiretoria(); });
  document.getElementById("pedir").onclick = async () => { try { const r = await api("diretoria_pedir", { posicoes: S.pedirPos }); S.pedirPos = []; aviso(r.texto); telaDiretoria(); } catch (e) { aviso(e.message); } };
  app.querySelectorAll("[data-cancela]").forEach((b) => b.onclick = async () => { try { aviso((await api("diretoria_cancelar", { pedido: +b.dataset.cancela })).texto); telaDiretoria(); } catch (e) { aviso(e.message); } });
  app.querySelectorAll("[data-ver]").forEach((b) => b.onclick = () => abrirJogador(+b.dataset.ver, false));
  app.querySelectorAll("[data-quero]").forEach((b) => b.onclick = async () => {
    const [p, x] = b.dataset.quero.split(":").map(Number);
    try { const r = await api("diretoria_escolher", { pedido: p, jogador: x }); aviso(r.texto); S.estado = await api("estado"); telaDiretoria(); } catch (e) { aviso(e.message); }
  });
}

async function telaMercado() {
  if (S.estado && S.estado.ultra) return telaDiretoria();
  const abas = { buscar: "Buscar", propostas: "Propostas", historico: "Transferências" };
  app.innerHTML = `<h2>Mercado</h2><div class="abas">${Object.entries(abas).map(([k, v]) => `<button class="aba ${S.abaMercado === k ? "on" : ""}" data-m="${k}">${v}</button>`).join("")}</div><div id="corpo"></div>`;
  app.querySelectorAll("[data-m]").forEach((b) => b.onclick = () => { S.abaMercado = b.dataset.m; telaMercado(); });
  const corpo = document.getElementById("corpo");
  if (S.abaMercado === "propostas") return desenharPropostas(corpo);
  if (S.abaMercado === "historico") {
    const h = await api("transferencias");
    corpo.innerHTML = `<div class="cartao lista">${h.map((x) => `<div class="item" style="display:block"><div class="minus">${esc(x.data)}</div><div>${esc(x.texto)}</div></div>`).join("") || `<div class="vazio">Nenhuma transferência ainda.</div>`}</div>`;
    return;
  }
  const fl = S.filtros;
  if (!S.opcoesMercado) { const m0 = await api("mercado", { texto: "zzzz_nada" }); S.opcoesMercado = m0; }
  const op = S.opcoesMercado;
  corpo.innerHTML = `<div class="cartao">
    <div class="grade2"><div class="campo"><label>Posição</label><select id="pos"><option value="">Todas</option>${Object.entries(POS).map(([k, v]) => `<option value="${k}" ${fl.posicao === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
    <div class="campo"><label>Nome ou clube</label><input id="texto" value="${esc(fl.texto)}"></div></div>
    <div class="campo"><label>Liga</label><select id="liga"><option value="">Todas</option>${op.ligas.map(([k, n]) => `<option value="${k}" ${fl.liga === k ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
    <div class="grade2"><div class="campo"><label>País do clube</label><select id="paisf"><option value="">Todos</option>${op.paises.map((p) => `<option ${fl.pais === p ? "selected" : ""}>${esc(p)}</option>`).join("")}</select></div>
    <div class="campo"><label>Nacionalidade</label><select id="nac"><option value="">Todas</option>${op.nacionalidades.map((n) => `<option ${fl.nacionalidade === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div></div>
    <div class="grade2"><div class="campo"><label>Idade mínima</label><input id="idmin" type="number" inputmode="numeric" value="${fl.idade_min}"></div>
    <div class="campo"><label>Idade máxima</label><input id="idade" type="number" inputmode="numeric" value="${fl.idade_max}"></div></div>
    <div class="grade2"><div class="campo"><label>Preço</label><select id="faixa">${FAIXAS.map(([k, n]) => `<option value="${k}" ${fl.faixa === k ? "selected" : ""}>${n}</option>`).join("")}</select></div>
    <div class="campo"><label>OVR mínimo</label><input id="nivel" type="number" inputmode="numeric" step="1" value="${Math.round(fl.nivel_min * 5) || ""}" placeholder="0 a 100"></div></div>
    <div class="grade2"><div class="campo"><label>Situação</label><select id="situacao">${SITUACOES.map(([k, n]) => `<option value="${k}" ${fl.situacao === k ? "selected" : ""}>${n}</option>`).join("")}</select></div>
    <div class="campo"><label>Ordenar por</label><select id="ordem">${[["ovr", "Maior OVR"], ["barato", "Mais barato"], ["jovem", "Mais jovem"]].map(([k, n]) => `<option value="${k}" ${fl.ordem === k ? "selected" : ""}>${n}</option>`).join("")}</select></div></div>
    <label class="linha" style="margin:6px 0"><input id="naverba" type="checkbox" style="width:auto" ${fl.na_verba ? "checked" : ""}> Só quem cabe na minha verba</label>
    <div class="grade2"><button class="btn" id="buscar">Buscar</button><button class="btn sec" id="limpar">Limpar filtros</button></div>
    <p class="minus" style="margin-top:6px">Lista de transferência: o clube quer vender e aceita menos que o valor de mercado. Lista de empréstimo: sai sem taxa, você paga só o salário.</p></div><div id="res"></div>`;
  document.getElementById("buscar").onclick = buscarMercado;
  document.getElementById("limpar").onclick = () => { S.filtros = { posicao: "", pais: "", liga: "", nacionalidade: "", idade_min: 15, idade_max: 40, faixa: "", nivel_min: 0, situacao: "", ordem: "ovr", na_verba: false, texto: "" }; telaMercado(); };
  buscarMercado();
}
const FAIXAS = [["", "Qualquer preço", 0, 0], ["a50", "Até R$ 50 mil", 0, 50e3], ["a200", "R$ 50 mil a 200 mil", 50e3, 200e3],
  ["a500", "R$ 200 mil a 500 mil", 200e3, 500e3], ["a1m", "R$ 500 mil a 1 mi", 500e3, 1e6], ["a3m", "R$ 1 a 3 mi", 1e6, 3e6],
  ["a10m", "R$ 3 a 10 mi", 3e6, 10e6], ["a30m", "R$ 10 a 30 mi", 10e6, 30e6], ["m30", "Acima de R$ 30 mi", 30e6, 0]];
const SITUACOES = [["", "Todos"], ["venda", "Lista de transferência"], ["emprestimo", "Lista de empréstimo"], ["livres", "Sem clube"]];
async function buscarMercado() {
  const v = (id) => document.getElementById(id);
  const fl = S.filtros;
  fl.posicao = v("pos").value; fl.idade_max = +v("idade").value || 40; fl.idade_min = +v("idmin").value || 0; fl.nivel_min = (+v("nivel").value || 0) / 5;
  fl.texto = v("texto").value; fl.liga = v("liga").value; fl.pais = v("paisf").value;
  fl.nacionalidade = v("nac").value; fl.faixa = v("faixa").value; fl.situacao = v("situacao").value; fl.ordem = v("ordem").value;
  fl.na_verba = v("naverba").checked;
  const fx = FAIXAS.find((x) => x[0] === fl.faixa) || FAIXAS[0];
  const res = v("res");
  res.innerHTML = `<div class="vazio"><div class="anel"></div></div>`;
  const m = await api("mercado", { posicao: fl.posicao, pais: fl.pais, liga: fl.liga, nacionalidade: fl.nacionalidade, idade_min: fl.idade_min,
    idade_max: fl.idade_max, nivel_min: fl.nivel_min, texto: fl.texto, valor_min: fx[2], valor_max: fx[3], situacao: fl.situacao, ordem: fl.ordem,
    na_verba: fl.na_verba, livres: fl.situacao === "livres" });
  res.innerHTML = `<p class="minus" style="margin:8px 0">${m.jogadores.length} jogadores${m.jogadores.length >= 120 ? " (os 120 primeiros)" : ""} · janela ${m.janela ? "aberta" : "fechada"} · verba ${esc(m.orcamento)} · sem clube pode contratar a qualquer momento</p>
    <div class="cartao lista">${m.jogadores.map((j) => {
      const tag = j.lista_clube === "venda" ? chip("Lista de transferência", "ok") : j.lista_clube === "emprestimo" ? chip("Empréstimo: só salário", "al") : !j.clube ? chip("Sem clube", "") : "";
      const preco = j.lista_clube === "venda" ? `${esc(j.preco)} <s class="minus">${esc(j.valor)}</s>` : j.lista_clube === "emprestimo" ? `salário ${esc(j.salario)}` : esc(j.valor);
      return `<button class="item" data-j="${j.id}"><span class="pos">${esc(j.rotulo || j.pos)}</span><div class="cresce"><div class="nome quebra">${esc(j.nome)}</div>
      <div class="minus">${esc(j.clube ? j.clube.nome : "Sem clube")} · ${esc(j.nac)} · ${textoIdade(j)}</div>
      <div class="minus" style="margin-top:2px">${preco}${j.conhec < 100 ? ` · conhecido ${j.conhec}%` : ""}</div>${tag ? `<div style="margin-top:4px">${tag}</div>` : ""}</div><span class="nivel ${corOvr(ovr(j))}">${ovrMostra(j)}</span></button>`;
    }).join("") || `<div class="vazio">Ninguém com esse filtro.</div>`}</div>`;
  res.querySelectorAll("[data-j]").forEach((b) => b.onclick = () => abrirJogador(+b.dataset.j, false));
}
async function formProposta(j) {
  const meu = await api("elenco");
  const livre = !j.clube;
  const restante = j.fim && j.fim !== "Sem contrato";
  const tipos = livre ? ["livre"] : ["definitiva", "emprestimo", "troca", "multa", "pre_contrato"];
  const f = folha(`<h2>Proposta por ${esc(j.nome)}</h2>
    <p class="sub">${esc(j.clube ? j.clube.nome : "Sem clube")} · valor estimado ${esc(j.valor)} · multa ${esc(j.multa)} · contrato até ${esc(j.fim)}</p>
    <div class="campo"><label>Tipo de negócio</label><select id="tipo">${tipos.map((t) => `<option value="${t}">${TIPOS[t]}</option>`).join("")}</select></div>
    <div id="campos"></div>
    <button class="btn" id="enviar" style="margin-top:8px">Enviar proposta</button>
    <p class="minus" style="margin-top:8px">O clube responde no dia seguinte; depois o jogador avalia salário, luvas, comissão, anos e papel no elenco.</p>`);
  const campos = f.querySelector("#campos");
  const sal = Math.round(j.salario_num * 1.15);
  const desenharCampos = () => {
    const t = f.querySelector("#tipo").value;
    const pessoais = `
      <div class="grade2"><div class="campo"><label>Salário mensal (R$)</label><input id="salario" type="number" inputmode="numeric" value="${sal}"></div>
      <div class="campo"><label>Anos</label><select id="anos">${[1, 2, 3, 4, 5].map((n) => `<option ${n === 3 ? "selected" : ""}>${n}</option>`).join("")}</select></div></div>
      <div class="campo"><label>Papel prometido</label><select id="papel"><option>Titular</option><option selected>Rodízio</option><option>Reserva</option></select></div>`;
    const extras = `<div class="grade2"><div class="campo"><label>Luvas (R$)</label><input id="luvas" type="number" inputmode="numeric" value="${sal * 3}"></div>
      <div class="campo"><label>Comissão do empresário (R$)</label><input id="comissao" type="number" inputmode="numeric" value="${Math.round(sal * 12 * 3 * 0.05)}"></div></div>`;
    if (t === "definitiva") campos.innerHTML = `<div class="campo"><label>Valor oferecido ao clube (R$)</label><input id="valor" type="number" inputmode="numeric" value="${Math.round(j.valor_num)}"></div>${pessoais}`;
    else if (t === "multa") campos.innerHTML = `<p class="sub">Depositando a multa inteira (${esc(j.multa)}) o clube não pode recusar. Falta convencer o jogador.</p>${pessoais}`;
    else if (t === "livre" || t === "pre_contrato") campos.innerHTML = `${t === "pre_contrato" ? `<p class="sub">${restante ? "Só vale para quem tem seis meses ou menos de contrato. Ele chega sem custo no fim do contrato atual." : ""}</p>` : ""}${pessoais}${extras}`;
    else if (t === "emprestimo") campos.innerHTML = `
      <div class="grade2"><div class="campo"><label>Modelo</label><select id="et"><option value="seco">Empréstimo seco</option><option value="opcao">Com opção de compra</option><option value="obrigacao">Com obrigação de compra</option></select></div>
      <div class="campo"><label>Meses</label><select id="meses"><option>6</option><option selected>12</option></select></div></div>
      <div class="grade2"><div class="campo"><label>Valor de compra (R$)</label><input id="vcompra" type="number" inputmode="numeric" value="${Math.round(j.valor_num * 1.1)}"></div>
      <div class="campo"><label>Parte do salário que você paga</label><select id="pct"><option value="1">100%</option><option value="0.7">70%</option><option value="0.5">50%</option></select></div></div>
      <div class="campo"><label>Meta para a obrigação de compra</label><select id="meta"><option value="0.5">50% dos jogos</option><option value="0.7">70% dos jogos</option></select></div>`;
    else if (t === "troca") campos.innerHTML = `
      <div class="campo"><label>Dinheiro além da troca (R$)</label><input id="valor" type="number" inputmode="numeric" value="0"></div>
      <div class="campo"><label>Jogadores que vão na troca</label><div class="cartao lista" style="max-height:220px;overflow:auto">${meu.jogadores.map((x) => `<label class="item"><input type="checkbox" value="${x.id}" class="tr" style="width:auto"> <span class="pos">${esc(x.pos)}</span><span class="cresce">${esc(x.nome)}</span><span class="minus">${esc(x.valor)}</span></label>`).join("")}</div></div>
      ${pessoais}<p class="minus">Se a troca ficar muito a seu favor, o outro clube pede compensação em dinheiro.</p>`;
  };
  const dinheiro = (v) => "R$ " + Math.round(v).toLocaleString("pt-BR");
  const sugerir = async () => {
    const q = (id) => f.querySelector("#" + id);
    const t = q("tipo").value;
    const caixa = q("sugestao");
    if (!caixa) return;
    const s = await api("sugestao", { jogador: j.id, tipo: t === "multa" ? "pre_contrato_sem_luvas" : t, papel: q("papel") ? q("papel").value : "Rodízio", anos: q("anos") ? +q("anos").value : 3 });
    if (!s || !s.ok) { caixa.innerHTML = ""; return; }
    const linhas = [];
    if (s.valor_seguro && t !== "multa") linhas.push(`<li>Valor ao clube: mínimo para negociar <b>${dinheiro(s.valor_minimo)}</b>, garante o sim <b>${dinheiro(s.valor_seguro)}</b></li>`);
    linhas.push(`<li>Salário mensal: mínimo para negociar <b>${dinheiro(s.salario_minimo)}</b>, garante o sim <b>${dinheiro(s.salario_seguro)}</b></li>`);
    if (s.luvas) linhas.push(`<li>Luvas esperadas <b>${dinheiro(s.luvas)}</b> e comissão do empresário <b>${dinheiro(s.comissao)}</b></li>`);
    if (s.valor_seguro && t !== "multa") linhas.push(`<li>Sua verba de transferências: <b>${dinheiro(s.verba)}</b></li>`);
    if (t === "emprestimo") linhas.unshift(`<li>Empréstimo seco pagando 100% do salário é o caminho mais simples${s.lista === "emprestimo" ? ": esse jogador está na lista e sai sem taxa" : ""}</li>`);
    caixa.innerHTML = `<div class="cartao" style="margin:8px 0"><strong>Sugestão do diretor de futebol</strong>
      <ol class="sub" style="margin:6px 0 0 18px">${linhas.join("")}</ol>
      ${s.avisos.map((a) => `<p class="minus" style="margin-top:6px">${esc(a)}</p>`).join("")}
      <p class="minus" style="margin-top:6px">Abaixo do mínimo a resposta é recusa. Entre o mínimo e o valor que garante, pode vir contraproposta. Muda conforme papel prometido e anos de contrato.</p>
      <button class="btn sec" id="usarSug" style="margin-top:8px">Preencher com os valores que garantem</button></div>`;
    q("usarSug").onclick = () => {
      if (q("valor") && s.valor_seguro) q("valor").value = s.valor_seguro;
      if (q("salario")) q("salario").value = s.salario_seguro;
      if (q("luvas")) { q("luvas").value = s.luvas; q("comissao").value = s.comissao; }
      aviso("Valores sugeridos preenchidos.");
    };
  };
  const redesenhar = () => {
    desenharCampos();
    campos.insertAdjacentHTML("afterbegin", `<div id="sugestao"></div>`);
    ["papel", "anos"].forEach((id) => { const el = f.querySelector("#" + id); if (el) el.onchange = sugerir; });
    sugerir();
  };
  f.querySelector("#tipo").onchange = redesenhar;
  if (j.lista_clube === "emprestimo") f.querySelector("#tipo").value = "emprestimo";
  redesenhar();
  if (j.lista_clube === "emprestimo" && f.querySelector("#pct")) { f.querySelector("#pct").value = "1"; }
  if (j.lista_clube === "venda" && f.querySelector("#valor")) { f.querySelector("#valor").value = Math.round(j.preco_num); }
  f.querySelector("#enviar").onclick = async () => {
    const q = (id) => f.querySelector("#" + id);
    const t = q("tipo").value;
    const dados = { tipo: t, jogador: j.id };
    if (q("valor")) dados.valor = +q("valor").value;
    if (q("salario")) { dados.salario = +q("salario").value; dados.anos = +q("anos").value; dados.papel = q("papel").value; }
    if (q("luvas")) { dados.luvas = +q("luvas").value; dados.comissao = +q("comissao").value; }
    if (t === "multa") dados.valor = j.multa_num;
    if (t === "emprestimo") Object.assign(dados, { emprestimo_tipo: q("et").value, emprestimo_meses: +q("meses").value,
      emprestimo_valor_compra: +q("vcompra").value, emprestimo_salario_pct: +q("pct").value, emprestimo_meta: +q("meta").value });
    if (t === "troca") dados.trocas = [...f.querySelectorAll(".tr:checked")].map((x) => +x.value);
    const r = await api("propor", dados);
    if (r.ok) { aviso("Proposta enviada. A resposta chega amanhã."); fecharFolha(); S.abaMercado = "propostas"; ir("mercado"); }
    else aviso(r.erro);
  };
}
async function desenharPropostas(corpo) {
  const ps = await api("propostas");
  corpo.innerHTML = ps.length ? ps.map((p) => `<div class="cartao ${p.etapa === "aguardando_usuario" ? "destaque" : ""}">
    <div class="entre"><strong>${esc(p.jogador)}</strong>${chip(ETAPAS[p.etapa] || p.etapa, p.etapa === "concluida" ? "ok" : p.etapa === "aguardando_usuario" ? "al" : "")}</div>
    <p class="minus">${esc(TIPOS[p.tipo] || p.tipo)} · ${p.do_usuario ? "você quer" : esc(p.comprador) + " quer"} · ${esc(p.vendedor)}${p.valor_num ? " · " + esc(p.valor) : ""}</p>
    ${p.historico.slice(-4).map((h) => `<p class="sub" style="font-size:13.5px">${esc(h)}</p>`).join("")}
    ${p.etapa === "aguardando_usuario" ? botoesProposta(p) : ""}</div>`).join("") : `<div class="vazio">Nenhuma proposta ainda.</div>`;
  corpo.querySelectorAll("[data-r]").forEach((b) => b.onclick = () => responderProposta(+b.dataset.id, b.dataset.r, ps.find((p) => p.id === +b.dataset.id)));
}
function botoesProposta(p) {
  if (p.do_usuario) {
    const pedido = p.origem_contra === "clube" ? `O clube pede R$ ${Math.round(p.contra || 0).toLocaleString("pt-BR")}` :
      `O jogador pede salário de R$ ${Math.round(p.contra_salario || 0).toLocaleString("pt-BR")}`;
    return `<p class="sub"><strong>${esc(pedido)}</strong></p><div class="grade2"><button class="btn peq" data-r="melhorar" data-id="${p.id}">Responder</button><button class="btn sec peq" data-r="desistir" data-id="${p.id}">Desistir</button></div>`;
  }
  return `<p class="minus">Responda até ${esc(p.expira)}</p><div class="grade2"><button class="btn peq" data-r="aceitar" data-id="${p.id}">Aceitar</button><button class="btn sec peq" data-r="recusar" data-id="${p.id}">Recusar</button></div>
    ${p.tipo === "definitiva" ? `<button class="btn sec peq" data-r="contra" data-id="${p.id}" style="margin-top:8px;width:100%">Pedir mais</button>` : ""}`;
}
async function responderProposta(id, acao, p) {
  if (acao === "melhorar") {
    const clube = p.origem_contra === "clube";
    const f = folha(`<h2>Nova oferta</h2><div class="campo"><label>${clube ? "Valor ao clube (R$)" : "Salário mensal (R$)"}</label>
      <input id="v" type="number" inputmode="numeric" value="${Math.round(clube ? p.contra : p.contra_salario)}"></div><button class="btn" id="ok">Enviar</button>`);
    f.querySelector("#ok").onclick = async () => {
      const v = +f.querySelector("#v").value;
      const r = await api("responder", clube ? { id, decisao: "melhorar", valor: v } : { id, decisao: "melhorar", salario: v });
      aviso(r.ok ? "Oferta enviada" : r.erro); fecharFolha(); telaMercado();
    };
    return;
  }
  if (acao === "contra") {
    const f = folha(`<h2>Pedir mais</h2><div class="campo"><label>Quanto você quer (R$)</label><input id="v" type="number" inputmode="numeric" value="${Math.round(p.valor_num * 1.3)}"></div>
      <div class="campo"><label>Cláusula de recompra (R$, opcional)</label><input id="rc" type="number" inputmode="numeric" value="0"></div>
      <button class="btn" id="ok">Enviar contraproposta</button>`);
    f.querySelector("#ok").onclick = async () => {
      const r = await api("responder", { id, decisao: "contraproposta", valor: +f.querySelector("#v").value, recompra_valor: +f.querySelector("#rc").value, recompra_anos: 2 });
      aviso(r.texto || (r.resultado === "recusada" ? "O clube desistiu" : r.erro || "Enviado")); fecharFolha(); S.estado = await api("estado"); telaMercado();
    };
    return;
  }
  if (acao === "aceitar" && p.tipo === "definitiva") {
    const f = folha(`<h2>Aceitar a venda</h2><p class="sub">${esc(p.comprador)} paga ${esc(p.valor)} por ${esc(p.jogador)}.</p>
      <div class="campo"><label>Cláusula de recompra (R$, opcional)</label><input id="rc" type="number" inputmode="numeric" value="0"></div>
      <button class="btn" id="ok">Fechar negócio</button>`);
    f.querySelector("#ok").onclick = async () => {
      const r = await api("responder", { id, decisao: "aceitar", recompra_valor: +f.querySelector("#rc").value, recompra_anos: 2 });
      aviso(r.texto || r.erro); fecharFolha(); S.estado = await api("estado"); telaMercado();
    };
    return;
  }
  const r = await api("responder", { id, decisao: acao });
  aviso(r.texto || (r.ok ? "Feito" : r.erro));
  S.estado = await api("estado");
  telaMercado();
}

// ---------------------------------------------------------------------------
// Clube
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Portal do treinador
// ---------------------------------------------------------------------------
const COR_SETOR = { dm: "ruim", diretoria: "al", imprensa: "", patrocinio: "ok", base: "ok", financeiro: "al", carreira: "ok", vestiario: "al" };
async function telaPortal() {
  carregando("Abrindo o portal");
  const p = await api("portal");
  S.estado = await api("estado");
  desenharMenu("portal");
  const corRisco = p.risco === "alto" ? "ruim" : p.risco === "médio" ? "al" : "ok";
  const col = p.coletiva;
  app.innerHTML = `
    <div class="topo"><div><h1>Portal</h1><p class="sub">${esc(p.tecnico)} · ${p.clube ? esc(p.clube) : "sem clube"}</p></div></div>
    ${p.desempregado ? `<div class="cartao destaque"><strong>Você está sem clube.</strong><p class="sub" style="margin-top:4px">Escolha uma das propostas abaixo para seguir a carreira.</p></div>` : ""}
    <div class="cartao">
      <div class="entre"><span class="sub">Reputação de técnico</span><strong>${p.reputacao}</strong></div>
      ${p.desempregado ? "" : `<div class="entre" style="margin-top:6px"><span class="sub">Confiança da diretoria</span><strong>${p.confianca}%</strong></div>
      <div class="barra" style="margin:6px 0"><i style="width:${p.confianca}%"></i></div>
      <div class="entre"><span class="sub">Risco de demissão</span>${chip(p.risco, corRisco)}</div>`}
    </div>
    ${p.desempregado ? "" : `<h3 id="ancora-cal">Calendário da temporada</h3><div id="calanual"><div class="vazio">Carregando o calendário</div></div>`}
    ${p.ofertas_emprego.length ? `<h3>Propostas de emprego</h3><div class="cartao lista">${p.ofertas_emprego.map((o) => `<div class="item" style="display:block">
      <div class="entre"><strong>${esc(o.nome)}</strong><span class="nivel ${corOvr(o.forca)}">${o.forca}</span></div>
      <div class="minus">${esc(o.pais)} · reputação ${o.reputacao} · o clube ${esc(o.motivo)} · vale até ${esc(o.validade)}</div>
      <button class="btn peq" data-emprego="${o.clube}" data-nome="${esc(o.nome)}" style="margin-top:8px">Aceitar</button></div>`).join("")}</div>` : ""}
    ${col ? `<h3>Sala de imprensa</h3><div class="cartao destaque" id="coletiva"><p class="sub">Coletiva antes do jogo contra o ${esc(col.rival)} (${esc(col.comp)}${col.data ? ", " + esc(col.data) : ""}). Chance estimada de vitória: ${col.chance}%. Suas respostas mexem com o elenco, a torcida e a diretoria.</p>
      ${col.perguntas.map((q, i) => `<div style="margin-top:12px"><strong>${esc(q.texto)}</strong>${q.opcoes.map((o, k) => `<label class="linha" style="margin:6px 0;align-items:flex-start;gap:8px"><input type="radio" name="q${i}" value="${k}" style="width:auto;margin-top:3px" ${k === 1 ? "checked" : ""}><span>${esc(o.texto)}</span></label>`).join("")}</div>`).join("")}
      <button class="btn" id="responder" style="margin-top:10px">Responder</button></div>` : ""}
    <h3>Comunicações internas</h3>
    <div class="cartao lista" style="max-height:380px;overflow:auto">${p.comunicados.map((c) => `<div class="item" style="display:block"><div class="minus">${esc(c.data)} ${chip(c.setor_nome, COR_SETOR[c.setor] || "")}</div><div${c.importante ? ' style="font-weight:600"' : ""}>${esc(c.texto)}</div></div>`).join("") || `<div class="vazio">Nada por enquanto.</div>`}</div>
    ${p.metas.length ? `<h3>Metas da temporada</h3><div class="cartao lista">${p.metas.map((m) => `<div class="item" style="display:block"><div class="entre"><strong>${esc(m.comp)}</strong>${chip(m.status, m.status === "batida" ? "ok" : m.status === "não cumprida" ? "ruim" : "")}</div>
      <div class="minus">${esc(m.texto)} · bônus da diretoria ${esc(m.bonus)}${m.posicao ? " · terminou em " + m.posicao + "º" : ""}</div></div>`).join("")}</div>` : ""}
    <h3>Patrocinadores</h3>
    ${(() => { const r = p.patrocinio_resumo; return r ? `<div class="cartao"><div class="entre"><span class="sub">Patrocínio no ano</span><strong style="color:#9be8b4">${esc(r.anual)} (${String(r.pct).replace(".", ",")}% da receita)</strong></div>
      <div class="entre"><span class="sub">Cota comercial que fica vazia sem patrocínio</span><strong>${esc(r.lacuna)}</strong></div>
      <div class="entre"><span class="sub">Ganho real sobre essa cota</span><strong style="color:${r.saldo_num >= 0 ? "var(--verde)" : "var(--vermelho)"}">${r.saldo_num >= 0 ? "" : "faltam "}${esc(r.saldo.replace("negativo, ", ""))}</strong></div>
      <div class="entre"><span class="sub">Manutenção da estrutura no ano</span><strong>${esc(r.manutencao)}</strong></div>
      <p class="minus" style="margin-top:6px">${esc(r.regra)}</p></div>` : ""; })()}
    <div class="cartao lista">${p.patrocinadores.map((x) => `<div class="item" style="display:block"><div class="entre"><strong>${x.cota ? chip(x.cota, "ok") + " " : ""}${esc(x.nome)}</strong><strong style="color:#9be8b4">${esc(x.anual)}/ano</strong></div><div class="minus">até ${x.ate} · ${String(x.pct).replace(".", ",")}% da receita · ${esc(x.bonus)} por meta batida</div></div>`).join("") || `<div class="vazio">Nenhum patrocinador assinado.</div>`}</div>
    ${p.ofertas_patrocinio.length ? `<p class="sub" style="margin:8px 0">Escolha uma oferta para cada cota livre:</p><div class="cartao lista">${p.ofertas_patrocinio.map((o) => `<div class="item" style="display:block">
      <div class="entre"><strong>${o.cota ? chip(o.cota, "al") + " " : ""}${esc(o.nome)}</strong><strong>${esc(o.anual)}/ano</strong></div>
      <div class="minus">${String(o.pct).replace(".", ",")}% da receita · ${o.temporadas} temporada${o.temporadas > 1 ? "s" : ""} (até ${o.ate}) · bônus de ${esc(o.bonus)} por meta batida</div>
      <button class="btn peq" data-patro="${o.id}" style="margin-top:8px">Assinar</button></div>`).join("")}</div>` : ""}
    ${(p.bichos || []).length ? `<h3>Bichos acertados</h3><div class="cartao lista">${p.bichos.map((b) => `<div class="item" style="display:block"><div class="entre"><strong>${esc(b.rival)}</strong>${chip(b.pago ? "pago" : b.valor ? "não veio" : "sem resposta", b.pago ? "ok" : "")}</div><div class="minus">${esc(b.data)} · ${esc(b.comp)} · ${esc(b.rotulo)}${b.valor ? " · R$ " + Math.round(b.valor / 1000) + " mil" : ""}</div></div>`).join("")}</div>` : ""}
    <h3>Carreira</h3>
    <div class="cartao"><div class="entre"><span class="sub">Jogos</span><strong>${p.total.j}</strong></div>
      <div class="entre"><span class="sub">Vitórias, empates e derrotas</span><strong>${p.total.v}, ${p.total.e}, ${p.total.d}</strong></div>
      <div class="entre"><span class="sub">Aproveitamento</span><strong>${p.total.aproveitamento}%</strong></div>
      <div class="entre"><span class="sub">Títulos</span><strong>${p.total.titulos}</strong></div></div>
    <div class="cartao lista">${p.passagens.map((x) => `<div class="item" style="display:block"><div class="entre"><strong>${esc(x.nome)}</strong><span class="minus">${esc(x.inicio)} a ${esc(x.fim)}</span></div>
      <div class="minus">${x.j} jogos · ${x.v}V ${x.e}E ${x.d}D · ${x.aproveitamento}%${x.saida ? " · " + esc(x.saida) : ""}</div>
      ${x.titulos.length ? `<div style="margin-top:4px">${x.titulos.map((t) => `<span class="traco bom">${esc(t)}</span>`).join("")}</div>` : ""}</div>`).join("")}</div>
    <p class="minus">${esc(p.aviso)}</p>`;
  const cal = document.getElementById("calanual");
  if (cal) {
    try { S.agenda = await api("agenda"); abrirCalendario(S.agenda, cal); } catch (err) { cal.innerHTML = `<div class="vazio">${esc(err.message)}</div>`; }
    if (S.verCalendario) { S.verCalendario = false; document.getElementById("ancora-cal").scrollIntoView({ block: "start" }); }
  }
  app.querySelectorAll("[data-patro]").forEach((b) => b.onclick = async () => { const r = await api("patrocinio", { oferta: +b.dataset.patro }); aviso(r.texto || r.erro); telaPortal(); });
  app.querySelectorAll("[data-emprego]").forEach((b) => b.onclick = () => {
    const f = folha(`<h2>Assumir o ${b.dataset.nome}?</h2><p class="sub">${p.desempregado ? "" : "Você deixa o clube atual agora. "}O elenco, as metas e o caixa passam a ser os do novo clube. A carreira continua contando.</p>
      <div class="grade2" style="margin-top:12px"><button class="btn" id="sim">Assinar</button><button class="btn sec" id="nao">Agora não</button></div>`);
    f.querySelector("#nao").onclick = fecharFolha;
    f.querySelector("#sim").onclick = async () => { const r = await api("aceitar_emprego", { clube: +b.dataset.emprego }); fecharFolha(); aviso(r.texto || r.erro); if (r.estado) S.estado = r.estado; telaPortal(); };
  });
  const rb = app.querySelector("#responder");
  if (rb) rb.onclick = async () => {
    const respostas = col.perguntas.map((q, i) => +((app.querySelector(`input[name=q${i}]:checked`) || {}).value || 1));
    const r = await api("coletiva", { respostas });
    folha(`<h2>Coletiva encerrada</h2>${(r.consequencias || [r.texto || r.erro]).map((t) => `<p class="sub" style="margin:8px 0">• ${esc(t)}</p>`).join("")}<button class="btn" id="okc" style="margin-top:12px">Fechar</button>`).querySelector("#okc").onclick = () => { fecharFolha(); telaPortal(); };
  };
}

async function telaClube() {
  const e = S.estado = await api("estado");
  const campeoes = await api("campeoes");
  app.innerHTML = `
    <h2>${esc(e.clube.nome)}</h2>
    <div id="gestao"></div>
    <h3>Estilo de jogo</h3>
    <div class="cartao lista">${e.taticas.map(([k, nome, desc]) => `<button class="item" data-t="${k}"><div class="cresce"><div class="nome">${esc(nome)}</div><div class="minus">${esc(desc)}</div></div>${k === e.tatica ? chip("Atual", "ok") : ""}</button>`).join("")}</div>
    <h3>Finanças</h3>
    <div class="cartao"><div class="entre"><span class="sub">Caixa</span><strong>${esc(e.financas.caixa)}</strong></div>
      <div class="entre"><span class="sub">Receita anual</span><strong>${esc(e.financas.receita)}</strong></div>
      <div class="entre"><span class="sub">Folha mensal</span><strong>${esc(e.financas.folha)}</strong></div>
      <div class="entre"><span class="sub">Verba para contratar</span><strong>${esc(e.financas.orcamento)}</strong></div>
      <p class="minus" style="margin-top:6px">Estimativas do Megafut (orçamento real: CONFIRMAR).</p></div>
    ${e.reapresentacao ? `<h3>Reapresentação</h3><div class="cartao">
      ${["acima_do_peso", "sem_ritmo"].map((k) => (e.reapresentacao[k] || []).map((i) => `<p class="sub"><strong>${esc(i.nome)}</strong>: ${i.kg ? esc(String(i.kg).replace(".", ",")) + " kg acima, " : ""}${i.semanas} semanas para o ritmo. ${esc(i.acao)}</p>`).join("")).join("")}
      ${(e.reapresentacao.revelados || []).length ? `<p class="minus">Revelados da base (gerados pelo jogo): ${esc(e.reapresentacao.revelados.join(", "))}</p>` : ""}</div>` : ""}
    <h3>Campeões</h3>
    <div class="cartao lista" style="max-height:340px;overflow:auto">${campeoes.slice(0, 60).map((c) => `<div class="item" style="display:block"><strong>${esc(c.campeao)}</strong><div class="minus">${esc(c.competicao)}</div></div>`).join("") || `<div class="vazio">A temporada ainda não coroou ninguém.</div>`}</div>
    <h3>Carreira</h3>
    <div style="display:grid;gap:8px"><button class="btn" id="salvar">Salvar agora</button>
      <div class="grade2"><button class="btn sec" id="baixar">Baixar save</button><button class="btn sec" id="copiar">Copiar save</button></div>
      <button class="btn sec" id="noticias">Todas as notícias</button>
      <div class="grade2"><button class="btn sec" id="dados">Situação dos dados</button><button class="btn sec" id="inicio">Tela inicial</button></div></div>`;
  app.querySelectorAll("[data-t]").forEach((b) => b.onclick = async () => { await api("tatica", { preset: b.dataset.t }); aviso("Estilo de jogo trocado"); telaClube(); });
  const $ = (id) => document.getElementById(id);
  $("salvar").onclick = () => salvarAgora(true);
  $("copiar").onclick = async () => {
    const s = await api("salvar");
    try { await navigator.clipboard.writeText(s.texto); aviso("Save copiado. Guarde o texto para colar depois."); }
    catch (e) { const f = folha(`<h2>Save</h2><p class="sub">Selecione e copie o texto.</p><textarea style="width:100%;height:180px;margin-top:10px;background:rgba(0,0,0,.35);color:var(--giz);border-radius:10px">${esc(s.texto)}</textarea>`); }
  };
  $("baixar").onclick = async () => {
    const s = await api("salvar");
    const nome = "megafut_" + new Date().toISOString().slice(0, 10) + ".txt";
    const arquivo = new File([s.texto], nome, { type: "text/plain" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [arquivo] })) { await navigator.share({ files: [arquivo], title: "Save do Megafut" }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    const url = URL.createObjectURL(arquivo);
    const a = document.createElement("a"); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    aviso("Save baixado: " + nome);
  };
  $("noticias").onclick = async () => {
    const ns = await api("noticias");
    folha(`<h2>Central de notícias</h2><div class="cartao lista">${ns.map(itemNoticia).join("")}</div>`);
  };
  $("dados").onclick = () => ir("dados");
  $("inicio").onclick = () => ir("inicio");
  desenharGestao();
}
async function desenharGestao() {
  const alvo = document.getElementById("gestao");
  if (!alvo) return;
  const g = await api("gestao");
  const p = g.peneira;
  const fp = g.fpf;
  alvo.innerHTML = `
    ${(g.resumo || []).map((r) => `<h3>Dinheiro em ${esc(r.ano)}</h3><div class="cartao">${r.linhas.map((l) => `<div class="entre"><span class="sub">${esc(l.nome)}</span><strong style="color:${l.entrada ? "#9be8b4" : "#ff9d9d"}">${l.entrada ? "+ " : "menos "}${esc(l.valor)}</strong></div>`).join("")}
      <div class="entre" style="margin-top:6px;border-top:1px solid rgba(255,255,255,.12);padding-top:6px"><strong>Resultado</strong><strong style="color:${r.positivo ? "var(--verde)" : "var(--vermelho)"}">${r.positivo ? "+ " : "menos "}${esc(r.total)}</strong></div></div>`).join("")}
    ${(g.resumo || []).length ? `<p class="minus">Vendas e compras de jogadores entram no extrato e no resumo a partir desta versão.</p>` : ""}
    <h3>Fair Play Financeiro</h3>
    <div class="cartao">${fp.sancao ? `<p class="chip ruim">Sob sanção nesta temporada</p>` : ""}
      <div class="entre"><span class="sub">Resultado da temporada até agora</span><strong style="color:${fp.resultado_ano_num < 0 ? "var(--vermelho)" : "var(--verde)"}">${esc(fp.resultado_ano)}</strong></div>
      <div class="entre"><span class="sub">Acumulado (três temporadas)</span><strong>${esc(fp.acumulado)}</strong></div>
      <div class="entre"><span class="sub">Limite de prejuízo</span><strong>${esc(fp.limite)}</strong></div>
      <div class="barra" style="margin:4px 0"><i style="width:${Math.min(100, fp.uso)}%;${fp.uso >= 70 ? "background:var(--vermelho)" : ""}"></i></div>
      <p class="minus">${fp.uso}% do limite usado. ${esc(fp.regra)}</p>${fp.aviso ? `<p class="sub" style="margin-top:6px">${esc(fp.aviso)}</p>` : ""}
      ${fp.anteriores.length ? `<p class="minus" style="margin-top:6px">${fp.anteriores.map((a) => a.ano + ": " + esc(a.resultado)).join(" · ")}</p>` : ""}</div>
    <h3>Investimentos</h3>
    <div class="cartao"><div class="entre"><span class="sub">Caixa</span><strong>${esc(g.caixa)}</strong></div>
      <div class="entre"><span class="sub">Manutenção mensal da estrutura</span><strong>${esc(g.manutencao)}</strong></div>
      <p class="minus" style="margin-top:6px">Lesões duram ${Math.round(g.fator_dm * 100)}% do tempo normal · receita de jogo ${Math.round(g.fator_receita * 100)}% do normal · olheiros fazem ${g.olheiros.por_semana} relatórios por semana.</p></div>
    <div class="cartao lista">${g.areas.map((a) => `<div class="item" style="display:block">
      <div class="entre"><strong>${esc(a.nome)}</strong><span class="nivel">${a.nivel}<span class="minus">/10</span></span></div>
      <div class="barra" style="margin:4px 0"><i style="width:${a.nivel * 10}%"></i></div>
      <div class="minus">${esc(a.descricao)}</div>
      <div class="minus" style="margin-top:3px">Custo mensal agora ${esc(a.mensal)}${a.custo ? " · no próximo nível " + esc(a.mensal_proximo) : ""}</div>
      ${a.custo ? `<button class="btn ${a.pode ? "" : "sec"} peq" data-inv="${a.id}" style="margin-top:8px" ${a.pode ? "" : "disabled"}>Subir para ${a.nivel + 1} · ${esc(a.custo)}</button>` : `<p class="chip ok" style="margin-top:6px">Nível máximo</p>`}</div>`).join("")}</div>
    <h3>Peneira da base</h3>
    <div class="cartao"><p class="sub">Olheiros e estrutura da base decidem quantos garotos aparecem e o quanto podem crescer. Nomes gerados pelo jogo, de acordo com o país.</p>
      ${p.candidatos.length ? `<div class="lista" style="margin-top:8px">${p.candidatos.map((c) => `<div class="item"><span class="pos">${esc(c.pos)}</span><div class="cresce"><div class="nome quebra">${esc(c.nome)}</div>
        <div class="minus">${c.idade} anos · ${esc(c.pais)} · potencial ${c.pot_min} a ${c.pot_max}</div></div><span class="nivel">${c.ovr}</span>
        <button class="btn peq" data-jovem="${c.i}" style="margin-left:6px">Assinar</button></div>`).join("")}</div>
        <button class="btn sec peq" id="dispensar" style="margin-top:8px">Dispensar os que sobraram</button>` : ""}
      <button class="btn ${p.libera ? "sec" : ""}" id="peneira" style="margin-top:10px" ${p.libera ? "disabled" : ""}>${p.libera ? "Próxima peneira em " + esc(p.libera) : "Fazer peneira · " + esc(p.custo)}</button></div>
    ${g.premios.length ? `<h3>Premiações recebidas</h3><div class="cartao lista">${g.premios.map((x) => `<div class="item" style="display:block"><div class="entre"><strong>${esc(x.comp)}</strong><strong style="color:#9be8b4">${esc(x.valor)}</strong></div><div class="minus">${esc(x.colocacao)} · ${x.ano}</div></div>`).join("")}</div>` : ""}
    <h3>Extrato</h3>
    <div class="cartao lista" style="max-height:320px;overflow:auto">${g.extrato.map((x) => `<div class="item" style="display:block"><div class="entre"><span class="minus">${esc(x.data)}</span><strong style="color:${x.entrada ? "#9be8b4" : "#ff9d9d"}">${x.entrada ? "+ " : "menos "}${esc(x.valor)}</strong></div><div class="sub" style="font-size:13.5px">${esc(x.texto)}</div></div>`).join("") || `<div class="vazio">As movimentações aparecem a cada virada de mês, investimento, prêmio ou imprevisto.</div>`}</div>
    <p class="minus">${esc(g.aviso)}</p>
    <p class="minus" style="text-align:center;margin-top:10px">Versão do app: ${esc(VERSAO_APP)}</p>`;
  alvo.querySelectorAll("[data-inv]").forEach((b) => b.onclick = async () => { const r = await api("investir", { area: b.dataset.inv }); aviso(r.texto || r.erro); S.estado = await api("estado"); desenharGestao(); });
  alvo.querySelectorAll("[data-jovem]").forEach((b) => b.onclick = async () => { const r = await api("contratar_jovem", { indice: +b.dataset.jovem }); aviso(r.texto || r.erro); desenharGestao(); });
  const pb = alvo.querySelector("#peneira"); if (pb) pb.onclick = async () => { const r = await api("peneira"); aviso(r.texto || r.erro); desenharGestao(); };
  const db = alvo.querySelector("#dispensar"); if (db) db.onclick = async () => { await api("dispensar_peneira"); desenharGestao(); };
}

// ---------------------------------------------------------------------------
// Situação dos dados
// ---------------------------------------------------------------------------
async function telaDados() {
  carregando("Conferindo a pesquisa");
  const d = await api("dados");
  app.innerHTML = `
    <div class="entre"><h2>Situação dos dados</h2><button class="btn sec peq" id="volta">Voltar</button></div>
    <div class="cartao"><div class="entre"><span class="sub">Clubes no mundo</span><strong>${d.clubes}</strong></div>
      <div class="entre"><span class="sub">Com elenco real e fonte</span><strong>${d.clubes_com_elenco}</strong></div>
      <div class="entre"><span class="sub">Atletas com fonte</span><strong>${d.atletas}</strong></div></div>
    <h3>Ligas</h3>
    <div class="cartao lista">${d.ligas.map((l) => `<div class="item" style="display:block"><div class="entre"><strong>${esc(l.liga)}</strong>${chip(`${l.com_elenco} de ${l.clubes}`, l.com_elenco === l.clubes ? "ok" : "al")}</div>
      <div class="minus">${esc(l.pais)}${l.faltam.length ? " · faltam: " + esc(l.faltam.slice(0, 12).join(", ")) + (l.faltam.length > 12 ? "..." : "") : ""}</div></div>`).join("")}</div>
    <h3>Copas e estaduais 2026</h3>
    <div class="cartao lista">${d.copas.map((c) => `<div class="item"><div class="cresce"><div class="nome">${esc(c.nome)}</div><div class="minus">${esc(c.situacao)}</div></div>${chip(`${c.com_elenco} de ${c.participantes}`, c.com_elenco === c.participantes ? "ok" : "al")}</div>`).join("")}</div>
    <h3>Pesquisa pendente</h3>
    <div class="cartao lista">${d.pendencias.map((p) => `<div class="item">${esc(p)}</div>`).join("")}</div>`;
  document.getElementById("volta").onclick = () => history.length > 1 ? history.back() : ir("inicio");
}
