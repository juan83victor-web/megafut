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
function nomeSobrenome(nome) {
  const p = String(nome || "").replace(/\s*\(.*?\)\s*/g, " ").trim().split(/\s+/).filter(Boolean);
  if (p.length <= 2) return p.join(" ");
  const ultimo = ["Júnior", "Junior", "Jr.", "Filho", "Neto", "Sobrinho"].includes(p[p.length - 1]) && p.length > 2 ? p.slice(-2).join(" ") : p[p.length - 1];
  return p[0] + " " + ultimo;
}
const ovr = (j) => (j.ovr ?? (j.nivel != null ? Math.round(j.nivel * 5) : "")); 

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
if (EH_APP && "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("./sw.js").then((reg) => {
    reg.addEventListener("updatefound", () => {
      const novo = reg.installing;
      if (!novo) return;
      novo.addEventListener("statechange", () => {
        if (novo.state === "installed" && navigator.serviceWorker.controller) aviso("Nova versão do Megafut baixada. Feche e abra o app para usar.");
      });
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
async function lerSaveDoBanco() {
  await Promise.race([bancoPronto, new Promise((r) => setTimeout(r, 10000))]);
  if (!banco || !usuarioId) return null;
  try {
    const col = banco.collection("data/users/" + usuarioId);
    const meta = await col.doc("megafut_meta").get();
    if (!meta.exists) return null;
    const m = meta.data();
    const partes = [];
    for (let i = 0; i < m.partes; i++) {
      const p = await col.doc("megafut_parte_" + i).get();
      if (!p.exists) return null;
      partes.push(p.data().texto);
    }
    return { texto: partes.join(""), rotulo: m.rotulo, quando: m.quando };
  } catch (e) { return null; }
}
let salvando = false;
async function gravarSave(texto, rotulo) {
  local("megafut_save", texto);
  local("megafut_rotulo", rotulo);
  const noAparelho = await idbGravar("carreira", { texto, rotulo, quando: new Date().toISOString() });
  if (EH_APP) return noAparelho;
  if (!banco || !usuarioId || salvando) return false;
  salvando = true;
  try {
    const col = banco.collection("data/users/" + usuarioId);
    const partes = [];
    for (let i = 0; i < texto.length; i += PARTE) partes.push(texto.slice(i, i + PARTE));
    for (let i = 0; i < partes.length; i++) await col.doc("megafut_parte_" + i).set({ texto: partes[i] });
    await col.doc("megafut_meta").set({ partes: partes.length, rotulo, quando: new Date().toISOString() });
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
  filtros: { posicao: "", pais: "", liga: "", nacionalidade: "", idade_min: 15, idade_max: 40, valor_min: 0, valor_max: 0, nivel_min: 0, livres: false, texto: "" }, opcoesMercado: null, saveExistente: null };
const TELAS_COM_MENU = ["painel", "elenco", "jogos", "mercado", "clube"];
function ir(nome) { if (location.hash !== "#" + nome) location.hash = nome; else desenhar(); }
window.addEventListener("hashchange", () => desenhar());
function telaAtual() { return (location.hash || "#inicio").slice(1) || "inicio"; }

const ICONES = {
  painel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  elenco: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c.8-3.4 3.2-5 6-5s5.2 1.6 6 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.3c2.4.1 4.3 1.6 5 4.7"/></svg>',
  jogos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 12h18M12 4v16"/><circle cx="12" cy="12" r="3"/></svg>',
  mercado: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h11l-3-3M20 17H9l3 3"/></svg>',
  clube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg>',
};
function desenharMenu(tela) {
  if (!S.estado || !TELAS_COM_MENU.includes(tela)) { menu.hidden = true; return; }
  menu.hidden = false;
  const nomes = { painel: "Painel", elenco: "Elenco", jogos: "Jogos", mercado: "Mercado", clube: "Clube" };
  const marca = S.estado.propostas ? " •" : "";
  menu.innerHTML = TELAS_COM_MENU.map((t) => `<button class="${t === tela ? "on" : ""}" data-ir="${t}">${ICONES[t]}<span>${nomes[t]}${t === "mercado" ? marca : ""}</span></button>`).join("");
  menu.querySelectorAll("[data-ir]").forEach((b) => b.addEventListener("click", () => ir(b.dataset.ir)));
}

async function desenhar() {
  const tela = telaAtual();
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
    if (tela === "elenco") return telaElenco();
    if (tela === "jogos") return telaJogos();
    if (tela === "mercado") return telaMercado();
    if (tela === "clube") return telaClube();
    return telaInicio();
  } catch (e) {
    app.innerHTML = `<div class="cartao"><h3>Algo deu errado</h3><p class="minus">${esc(e.message)}</p></div>`;
  }
}

async function iniciarApp() {
  try { S.inicio = await api("inicio"); } catch (e) { S.inicio = null; }
  const localTexto = local("megafut_save");
  if (localTexto) S.saveExistente = { texto: localTexto, rotulo: local("megafut_rotulo") || "Carreira salva" };
  const doAparelho = await idbLer("carreira");
  if (doAparelho && doAparelho.texto && (!S.saveExistente || doAparelho.texto.length >= S.saveExistente.texto.length || !localTexto))
    S.saveExistente = { texto: doAparelho.texto, rotulo: doAparelho.rotulo || "Carreira salva", quando: doAparelho.quando };
  desenhar();
  lerSaveDoBanco().then((s) => {
    if (s && (!S.saveExistente || s.texto.length)) { S.saveExistente = s; if (telaAtual() === "inicio" && !S.estado) desenhar(); }
  });
}

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------
function telaInicio() {
  const i = S.inicio || {};
  const save = S.saveExistente;
  app.innerHTML = `
    <div style="padding-top:28px">
      <p class="chip al">Modo carreira 2026</p>
      <h1 style="font-size:64px;margin:14px 0 6px">Mega<br>fut</h1>
      <p class="sub">${i.clubes || "..."} clubes de ${i.paises || "..."} países, todos jogando ao mesmo tempo. A temporada 2026 começa em aberto: participantes reais, resultados decididos em campo.</p>
    </div>
    ${S.estado ? `<button class="btn" id="voltar" style="margin-top:22px">Voltar para a carreira</button>` : ""}
    ${save && !S.estado ? `<div class="cartao destaque"><p class="minus">Carreira salva</p><h3 style="margin:4px 0 12px;color:var(--giz)">${esc(save.rotulo)}</h3>
      <button class="btn" id="continuar">Continuar</button></div>` : ""}
    <div class="cartao"><button class="btn ${save ? "sec" : ""}" id="nova">Nova carreira</button>
      <p class="minus" style="margin-top:10px">${i.jogaveis || 0} clubes já têm elenco real com fonte e podem ser assumidos. Os outros estão em pesquisa.</p></div>
    <div class="grade2">
      <button class="btn sec" id="dados">Situação dos dados</button>
      <button class="btn sec" id="importar">Colar um save</button>
    </div>
    <p class="minus" style="margin-top:16px">Atributos, valores, salários, contratos e orçamentos são estimativas do Megafut e aparecem marcados. Escudo oficial não é usado: cada clube aparece com um selo de giz com a sigla.</p>`;
  const $ = (id) => document.getElementById(id);
  if ($("voltar")) $("voltar").onclick = () => ir("painel");
  if ($("continuar")) $("continuar").onclick = () => carregarSave(save.texto);
  $("nova").onclick = () => {
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
      <button class="btn sec" id="ok">Carregar texto colado</button>`);
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
  try { S.estado = await api("carregar", { texto }); ir("painel"); }
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
    <div class="abas">${nomesComClube.map((n) => `<button class="aba ${n === pais ? "on" : ""}" data-pais="${esc(n)}">${esc(n)}</button>`).join("")}</div>
    <div id="ligas">${pais ? `<h2>${esc(pais)}</h2>${ligas.map((l, i) => {
      const jog = l.clubes.filter((c) => c.jogavel).length;
      return `<button class="liga" data-l="${i}"><span class="div">${l.ordem < 9 ? l.ordem : "?"}</span><span class="cresce" style="flex:1"><strong>${esc(l.nome)}</strong>
        <span class="minus" style="display:block">${l.clubes.length} clubes · ${jog} com elenco real</span></span>${jog ? chip("Jogável", "ok") : chip("Em pesquisa", "")}</button>`;
    }).join("")}` : `<div class="vazio">Escolha um país no mapa.</div>`}</div>`;
  document.getElementById("volta").onclick = () => ir("inicio");
  app.querySelectorAll("[data-pais]").forEach((b) => b.addEventListener("click", () => {
    S.paisMapa = b.dataset.pais; S.ligaAberta = null; telaEscolha();
    setTimeout(() => { const l = document.getElementById("ligas"); if (l) l.scrollIntoView({ behavior: "smooth" }); }, 60);
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
    try { S.estado = await api("nova", { chave, tecnico: S.tecnico || "" }); local("megafut_save", null); salvarAgora(true); ir("painel"); }
    catch (e) { aviso(e.message); ir("escolha"); }
  };
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------
function cartaoJogo(j, grande = false) {
  if (!j) return `<div class="cartao"><p class="sub">Sem jogo marcado agora.</p></div>`;
  const placar = j.gc !== null && j.gc !== undefined ? `${j.gc} x ${j.gf}${j.pc !== null && j.pc !== undefined ? ` <span class="minus">(${j.pc} x ${j.pf} nos pênaltis)</span>` : ""}` : "x";
  return `<div class="cartao ${grande ? "destaque" : ""}">
    <div class="entre"><span class="minus">${esc(j.competicao)}${j.fase && j.fase !== "Pontos corridos" ? " · " + esc(j.fase) : ""}${j.rodada ? " · rodada " + j.rodada : ""}</span>
      <span class="minus">${esc(j.data)}${j.adiado ? " · adiado" : ""}</span></div>
    <div class="entre" style="margin-top:10px">
      <div class="linha" style="flex:1">${escudo(j.casa.sigla, grande ? "" : "p")}<strong>${esc(j.casa.nome)}</strong></div>
      <div class="num" style="font-size:${grande ? 30 : 22}px">${placar}</div>
      <div class="linha" style="flex:1;justify-content:flex-end"><strong style="text-align:right">${esc(j.fora.nome)}</strong>${escudo(j.fora.sigla, grande ? "" : "p")}</div>
    </div>${j.neutro ? `<p class="minus" style="margin-top:6px">Campo neutro</p>` : ""}</div>`;
}
function telaPainel() {
  const e = S.estado;
  const dias = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
  const al = e.alertas || {};
  app.innerHTML = `
    <div class="entre"><div class="linha">${escudo(e.clube.sigla)}<div><h2 style="margin:0">${esc(e.clube.nome)}</h2>
      <p class="sub">${esc(e.clube.liga || "Sem liga nacional")} · técnico ${esc(e.clube.tecnico)}</p></div></div>
      <div style="text-align:right"><div class="num" style="font-size:22px">${esc(e.data)}</div><div class="minus">${dias[e.dia_semana]}</div></div></div>
    <h3>Próximo jogo</h3>
    ${cartaoJogo(e.proximo, true)}
    <div class="grade2"><button class="btn" id="avancar">${e.proximo ? "Ir para o jogo" : "Avançar"}</button><button class="btn sec" id="dia">Avançar um dia</button></div>
    ${e.propostas ? `<button class="cartao destaque item" id="props" style="margin-top:12px"><div class="cresce"><strong>${e.propostas} proposta${e.propostas > 1 ? "s" : ""} esperando resposta</strong><div class="minus">Mercado, Propostas</div></div>${chip("Ver", "al")}</button>` : ""}
    ${al.contratos ? `<div class="cartao"><strong>${al.contratos} contrato${al.contratos > 1 ? "s" : ""} terminando em 31/12</strong><p class="minus">Sem renovação, o jogador sai no fim do ano. Elenco, toque no jogador, Renovar.</p></div>` : ""}
    ${(al.lesionados || []).length ? `<p class="minus" style="margin-top:6px">No departamento médico: ${esc(al.lesionados.join(", "))}</p>` : ""}
    ${e.tabela && e.tabela.length ? `<h3>${esc(e.clube.liga)}</h3><div class="cartao">${tabelaHtml(e.tabela, e.clube.id, true)}
      <button class="btn sec peq" id="tab" style="margin-top:8px">Tabela completa</button></div>` : ""}
    <div class="grade2" style="margin-top:4px">
      <div class="cartao"><p class="minus">Torcida</p><div class="entre"><strong>${esc(e.torcida.rotulo)}</strong><span class="num" style="font-size:22px">${e.torcida.valor}</span></div><div class="barra"><i style="width:${e.torcida.valor}%"></i></div></div>
      <div class="cartao"><p class="minus">Diretoria</p><div class="entre"><strong>${esc(e.diretoria.rotulo)}</strong><span class="num" style="font-size:22px">${e.diretoria.valor}</span></div><div class="barra"><i style="width:${e.diretoria.valor}%"></i></div></div>
    </div>
    <div class="cartao"><div class="entre"><span class="sub">Objetivo</span><strong style="text-align:right">${esc(e.objetivo)}</strong></div>
      <div class="entre"><span class="sub">Caixa</span><strong>${esc(e.financas.caixa)}</strong></div>
      <div class="entre"><span class="sub">Verba para contratar</span><strong>${esc(e.financas.orcamento)}</strong></div>
      <div class="entre"><span class="sub">Janela</span><strong>${e.janela.aberta ? "Aberta até " + esc(e.janela.fim) : "Fechada" + (e.janela.proxima ? ", abre " + esc(e.janela.proxima) : "")}</strong></div>
      <p class="minus" style="margin-top:6px">Valores estimados pelo Megafut.</p></div>
    ${e.ultimos.length ? `<h3>Últimos jogos</h3>${e.ultimos.map((j) => cartaoJogo(j)).join("")}` : ""}
    <h3>Notícias</h3>
    <div class="cartao lista">${e.noticias.length ? e.noticias.map((n) => `<div class="item" style="display:block"><div class="minus">${esc(n.data)}</div><div>${esc(n.texto)}</div></div>`).join("") : `<div class="vazio">Sem notícias ainda.</div>`}</div>`;
  const $ = (id) => document.getElementById(id);
  $("avancar").onclick = () => avancar("jogo");
  $("dia").onclick = () => avancar("dia");
  if ($("props")) $("props").onclick = () => { S.abaMercado = "propostas"; ir("mercado"); };
  if ($("tab")) $("tab").onclick = () => { S.compAberta = e.liga_id; ir("jogos"); };
}
function tabelaHtml(linhas, meu, curta = false) {
  return `<table class="tabela"><tr><th>#</th><th>Clube</th><th>P</th><th>J</th>${curta ? "" : "<th>V</th><th>E</th><th>D</th>"}<th>SG</th>${curta ? "" : "<th>Últ.</th>"}</tr>
    ${linhas.map((l) => `<tr class="${l.clube.id === meu ? "eu" : ""}"><td>${l.pos}</td><td>${esc(l.clube.nome)}</td><td><strong>${l.p}</strong></td><td>${l.j}</td>
      ${curta ? "" : `<td>${l.v}</td><td>${l.e}</td><td>${l.d}</td>`}<td>${esc(sinal(l.sg))}</td>${curta ? "" : `<td style="letter-spacing:1px">${esc(l.ult)}</td>`}</tr>`).join("")}</table>`;
}
async function avancar(modo) {
  carregando(modo === "dia" ? "Um dia no mundo do futebol" : "Rodando o mundo até o seu jogo");
  try {
    const r = await api("avancar", { modo });
    S.estado = r.estado;
    if (r.partida) { S.partida = r.partida; S.fim = r.fim_de_temporada; ir("partida"); }
    else if (r.fim_de_temporada) { mostrarFimDeTemporada(r.fim_de_temporada); ir("painel"); }
    else { ir("painel"); if (r.noticias.length) aviso(r.noticias[r.noticias.length - 1]); }
    salvarAgora(Boolean(r.partida || r.fim_de_temporada));
  } catch (e) { aviso(e.message); ir("painel"); }
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
    <div class="cartao destaque" style="text-align:center">
      <p class="minus">${esc(j.competicao)}${j.fase && j.fase !== "Pontos corridos" ? " · " + esc(j.fase) : ""} · ${esc(j.data)}</p>
      <div class="entre" style="margin-top:12px">
        <div style="flex:1">${escudo(j.casa.sigla, "g")}<p style="margin-top:6px;font-weight:600">${esc(j.casa.nome)}</p></div>
        <div><div class="placar" id="placar">0 x 0</div><div class="relogio" id="relogio">0'</div></div>
        <div style="flex:1">${escudo(j.fora.sigla, "g")}<p style="margin-top:6px;font-weight:600">${esc(j.fora.nome)}</p></div>
      </div>
      ${r && r.classico ? `<p class="chip al" style="margin-top:10px">${esc(r.classico.apelido)}</p>` : ""}
    </div>
    <div class="grade2"><button class="btn sec" id="pular">Ver o final</button><button class="btn sec" id="sair">Voltar ao painel</button></div>
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
    document.getElementById("pular").remove();
    return;
  }
  const eventos = r.eventos.filter((e) => e.nivel <= 1 || e.tipo === "GOL");
  let gc = 0, gf = 0, i = 0, acabou = false;
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
  };
  document.getElementById("pular").onclick = terminar;
  setTimeout(passo, 700);
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
    <p class="minus">OVR: overall de 0 a 100, estimado pelo Megafut a partir do nível do clube e da fonte (CONFIRMAR). LE e LD só quando a fonte diz o lado.</p>
    ${el.emprestados.length ? `<h3>Emprestados a outros clubes</h3><div class="cartao lista">${el.emprestados.map((j) => `<div class="item"><span class="pos">${esc(j.pos)}</span><div class="cresce"><div class="nome">${esc(j.nome)}</div><div class="minus">${esc(j.clube || "Clube fora do jogo")}</div></div></div>`).join("")}</div>` : ""}
    <p class="minus" style="margin-top:10px">${esc(el.aviso)}</p>`;
  ligarAbasElenco();
  app.querySelectorAll("[data-j]").forEach((b) => b.onclick = () => abrirJogador(+b.dataset.j, true));
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
function desenharCampo() {
  const E = S.esc, d = E.dados;
  const porId = Object.fromEntries(d.jogadores.map((x) => [x.id, x]));
  const usados = new Set([...E.vagas, ...E.banco]);
  const fora = d.jogadores.filter((x) => !usados.has(x.id));
  const sel = E.sel;
  const ehSel = (tipo, chave) => sel && sel.tipo === tipo && sel.chave === chave;
  const fichaVaga = (v, i) => {
    const jid = E.vagas[i], x = porId[jid];
    const foraPos = x && ((x.pos !== v.pos && !(x.sec || []).includes(v.pos)) || (x.lado && v.pos === "LAT" && v.sigla !== v.pos && ("L" + x.lado) !== v.sigla));
    const cls = ["ficha", !x ? "vazia" : "", x && !x.disponivel ? "indisp" : "", foraPos ? "fora" : "", ehSel("vaga", i) ? "sel" : ""].join(" ");
    return `<button class="${cls}" data-vaga="${i}" style="left:${v.x}%;top:${v.y}%"><span class="bola">${x ? esc(x.num ?? x.pos) : "+"}</span>
      <span class="rot">${x ? esc(nomeSobrenome(x.nome)) : "Vazio"}</span><span class="vpos">${esc(v.sigla || v.pos)}${x ? " · " + ovr(x) : ""}</span></button>`;
  };
  const reserva = (x, tipo) => `<button class="reserva ${ehSel(tipo, x.id) ? "sel" : ""}" data-${tipo}="${x.id}"><span class="pos">${esc(x.rotulo || x.pos)}</span>
    <span class="n">${esc(nomeSobrenome(x.nome))}</span><span class="nivel" style="margin-left:auto">${ovr(x)}</span>${!x.disponivel ? `<span class="chip ruim">${x.lesao ? "DM" : "Susp."}</span>` : ""}</button>`;
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
    const por = (s, novo) => {
      if (s.tipo === "vaga") E.vagas[s.chave] = novo;
      else if (s.tipo === "banco") E.banco = E.banco.map((x) => (x === s.chave ? novo : x));
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
  if (j.lesao) sinais.push(chip(`Lesão ${j.lesao}d`, "ruim"));
  if (j.susp) sinais.push(chip("Suspenso", "ruim"));
  if (j.listado) sinais.push(chip(j.listado === "venda" ? "À venda" : "Para empréstimo", "al"));
  if (j.emprestado_por) sinais.push(chip("Emprestado", ""));
  if (j.onze) sinais.push(chip("Titular", "ok"));
  return `<button class="item" data-j="${j.id}"><span class="pos">${esc(j.rotulo || j.pos)}</span><div class="cresce"><div class="nome">${esc(j.nome)}</div>
    <div class="minus">${j.idade_ok ? j.idade + " anos" : "idade CONFIRMAR"} · moral ${j.moral} · ${plural(j.jogos, "jogo", "jogos")}${j.gols ? ", " + plural(j.gols, "gol", "gols") : ""}</div>
    <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">${sinais.join("")}</div></div><span class="nivel">${ovr(j)}</span></button>`;
}
async function abrirJogador(id, meu) {
  const f = folha(`<div class="vazio"><div class="anel"></div></div>`);
  const j = await api("jogador", { id });
  const attrs = j.atributos ? Object.entries(j.atributos).map(([g, v]) => `<h3>${esc(g)}</h3><div class="grade2">${Object.entries(v).map(([k, n]) => `<div class="entre"><span class="minus">${esc(k.replace(/_/g, " "))}</span><strong>${n}</strong></div>`).join("")}</div>`).join("") : "";
  f.innerHTML = `
    <div class="entre"><div><h2 style="margin:0">${esc(j.nome)}</h2><p class="sub">${esc(j.rotulo && j.rotulo !== j.pos ? j.rotulo + " · " : "")}${esc(j.posicao)}${j.sec.length ? " · também " + esc(j.sec.join(", ")) : ""}${j.pos_ok ? "" : " · posição detalhada CONFIRMAR"}</p></div>
      <div style="text-align:right"><span class="num" style="font-size:40px">${ovr(j)}</span><div class="minus">OVR</div></div></div>
    <div class="cartao">
      <div class="entre"><span class="sub">Clube</span><strong>${esc(j.clube ? j.clube.nome : "Sem clube")}</strong></div>
      <div class="entre"><span class="sub">Idade</span><strong>${j.idade_ok ? j.idade + " anos" : j.idade + " (estimada, CONFIRMAR)"}</strong></div>
      <div class="entre"><span class="sub">Nacionalidade</span><strong>${esc(j.nac)}</strong></div>
      <div class="entre"><span class="sub">Contrato até</span><strong>${esc(j.fim)}</strong></div>
      <div class="entre"><span class="sub">Salário</span><strong>${esc(j.salario)}</strong></div>
      <div class="entre"><span class="sub">Valor de mercado</span><strong>${esc(j.valor)}</strong></div>
      <div class="entre"><span class="sub">Multa rescisória</span><strong>${esc(j.multa)}</strong></div>
      <div class="entre"><span class="sub">Temporada</span><strong>${plural(j.jogos, "jogo", "jogos")}, ${plural(j.gols, "gol", "gols")}, ${j.ass} assist.</strong></div>
      ${j.emprestado_por ? `<div class="entre"><span class="sub">Emprestado por</span><strong>${esc(j.emprestado_por)}</strong></div>` : ""}
      <p class="minus" style="margin-top:8px">Nível, valor, salário e contrato estimados pelo Megafut. ${esc(j.origem)}.</p>
      ${j.obs ? `<p class="minus">${esc(j.obs)}</p>` : ""}${j.fonte ? `<p class="minus">${fonte(j.fonte)}</p>` : ""}
    </div>
    ${(j.titulos || []).length ? `<h3>Títulos</h3><p class="sub">${esc(j.titulos.join(" · "))}</p>` : ""}
    <div id="acoes" style="display:grid;gap:8px;margin-top:12px"></div>
    ${attrs}`;
  const acoes = f.querySelector("#acoes");
  if (meu) {
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
  let html = `<h2>Competições</h2><div class="abas">${comps.minhas.map((c) => `<button class="aba ${c.id === S.compAberta ? "on" : ""}" data-c="${esc(c.id)}">${esc(c.nome)}</button>`).join("")}
    <button class="aba ${S.compAberta === "_outras" ? "on" : ""}" data-c="_outras">Outras</button><button class="aba ${S.compAberta === "_cal" ? "on" : ""}" data-c="_cal">Calendário</button></div><div id="corpo"></div>`;
  app.innerHTML = html;
  app.querySelectorAll("[data-c]").forEach((b) => b.onclick = () => { S.compAberta = b.dataset.c; telaJogos(); });
  const corpo = document.getElementById("corpo");
  if (S.compAberta === "_cal") {
    const cal = await api("calendario");
    corpo.innerHTML = cal.map((j) => cartaoJogo(j)).join("") || `<div class="vazio">Sem jogos.</div>`;
    return;
  }
  if (S.compAberta === "_outras") {
    corpo.innerHTML = comps.por_pais.map((p) => `<h3>${esc(p.pais)}</h3><div class="cartao lista">${p.competicoes.map((c) => `<button class="item" data-o="${esc(c.id)}"><div class="cresce"><div class="nome">${esc(c.nome)}</div><div class="minus">${c.encerrada ? "Campeão: " + esc(c.campeao) : esc(c.fase)}</div></div></button>`).join("")}</div>`).join("");
    corpo.querySelectorAll("[data-o]").forEach((b) => b.onclick = () => { S.compAberta = b.dataset.o; desenharCompeticao(document.getElementById("corpo"), b.dataset.o); });
    return;
  }
  if (S.compAberta) desenharCompeticao(corpo, S.compAberta);
}
async function desenharCompeticao(corpo, id, fase = null, rodada = null) {
  const t = await api("tabela", { comp: id, fase });
  const jogos = await api("jogos", { comp: id, fase: t.indice, rodada });
  const art = await api("artilharia", { comp: id });
  corpo.innerHTML = `
    <div class="cartao"><strong>${esc(t.nome)}</strong>${t.campeao ? ` <span class="chip al">Campeão: ${esc(t.campeao.nome)}</span>` : ""}
      <div class="abas">${t.fases.map((x) => `<button class="aba ${x.indice === t.indice ? "on" : ""}" data-f="${x.indice}" ${x.estado === "aguardando" ? "disabled" : ""}>${esc(x.nome)}</button>`).join("")}</div>
      ${t.explicacao ? `<p class="minus" style="margin-top:8px">${esc(t.explicacao)}</p>` : ""}</div>
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
async function telaMercado() {
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
    <div class="grade2"><div class="campo"><label>Preço mínimo (R$ mi)</label><input id="vmin" type="number" inputmode="decimal" step="0.5" value="${fl.valor_min / 1e6 || ""}"></div>
    <div class="campo"><label>Preço máximo (R$ mi)</label><input id="vmax" type="number" inputmode="decimal" step="0.5" value="${fl.valor_max / 1e6 || ""}"></div></div>
    <div class="campo"><label>OVR mínimo (0 a 100)</label><input id="nivel" type="number" inputmode="numeric" step="1" value="${Math.round(fl.nivel_min * 5)}"></div>
    <label class="linha" style="margin:6px 0"><input id="livres" type="checkbox" style="width:auto" ${fl.livres ? "checked" : ""}> Só jogadores sem clube</label>
    <div class="grade2"><button class="btn" id="buscar">Buscar</button><button class="btn sec" id="limpar">Limpar filtros</button></div>
    <p class="minus" style="margin-top:6px">Preço é o valor de mercado estimado pelo Megafut. Idade sem fonte aparece como estimada.</p></div><div id="res"></div>`;
  document.getElementById("buscar").onclick = buscarMercado;
  document.getElementById("limpar").onclick = () => { S.filtros = { posicao: "", pais: "", liga: "", nacionalidade: "", idade_min: 15, idade_max: 40, valor_min: 0, valor_max: 0, nivel_min: 0, livres: false, texto: "" }; telaMercado(); };
  buscarMercado();
}
async function buscarMercado() {
  const v = (id) => document.getElementById(id);
  const fl = S.filtros;
  fl.posicao = v("pos").value; fl.idade_max = +v("idade").value || 40; fl.idade_min = +v("idmin").value || 0; fl.nivel_min = (+v("nivel").value || 0) / 5;
  fl.texto = v("texto").value; fl.livres = v("livres").checked; fl.liga = v("liga").value; fl.pais = v("paisf").value;
  fl.nacionalidade = v("nac").value; fl.valor_min = (+v("vmin").value || 0) * 1e6; fl.valor_max = (+v("vmax").value || 0) * 1e6;
  const res = v("res");
  res.innerHTML = `<div class="vazio"><div class="anel"></div></div>`;
  const m = await api("mercado", fl);
  res.innerHTML = `<p class="minus" style="margin:8px 0">${m.jogadores.length} jogadores · janela ${m.janela ? "aberta" : "fechada"} · verba ${esc(m.orcamento)} · sem clube pode contratar a qualquer momento</p>
    <div class="cartao lista">${m.jogadores.map((j) => `<button class="item" data-j="${j.id}"><span class="pos">${esc(j.rotulo || j.pos)}</span><div class="cresce"><div class="nome">${esc(j.nome)}</div>
      <div class="minus">${esc(j.clube ? j.clube.nome : "Sem clube")} · ${esc(j.nac)} · ${j.idade_ok ? j.idade + " anos" : "idade CONFIRMAR"} · ${esc(j.valor)}</div></div><span class="nivel">${ovr(j)}</span></button>`).join("") || `<div class="vazio">Ninguém com esse filtro.</div>`}</div>`;
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
    if (t === "emprestimo") { caixa.innerHTML = ""; return; }
    const s = await api("sugestao", { jogador: j.id, tipo: t === "multa" ? "pre_contrato_sem_luvas" : t, papel: q("papel") ? q("papel").value : "Rodízio", anos: q("anos") ? +q("anos").value : 3 });
    if (!s || !s.ok) { caixa.innerHTML = ""; return; }
    const linhas = [];
    if (s.valor_seguro && t !== "multa") linhas.push(`<li>Valor ao clube: mínimo para negociar <b>${dinheiro(s.valor_minimo)}</b>, garante o sim <b>${dinheiro(s.valor_seguro)}</b></li>`);
    linhas.push(`<li>Salário mensal: mínimo para negociar <b>${dinheiro(s.salario_minimo)}</b>, garante o sim <b>${dinheiro(s.salario_seguro)}</b></li>`);
    if (s.luvas) linhas.push(`<li>Luvas esperadas <b>${dinheiro(s.luvas)}</b> e comissão do empresário <b>${dinheiro(s.comissao)}</b></li>`);
    if (s.valor_seguro && t !== "multa") linhas.push(`<li>Sua verba de transferências: <b>${dinheiro(s.verba)}</b></li>`);
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
  redesenhar();
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
async function telaClube() {
  const e = S.estado = await api("estado");
  const campeoes = await api("campeoes");
  app.innerHTML = `
    <h2>${esc(e.clube.nome)}</h2>
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
    folha(`<h2>Notícias</h2><div class="cartao lista">${ns.map((n) => `<div class="item" style="display:block"><div class="minus">${esc(n.data)}</div><div>${esc(n.texto)}</div></div>`).join("")}</div>`);
  };
  $("dados").onclick = () => ir("dados");
  $("inicio").onclick = () => ir("inicio");
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
