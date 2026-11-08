// Worker do Megafut: roda o motor Python (Pyodide) fora da tela, para o app não travar.
import { loadPyodide } from "./pyodide.mjs";

let chamar = null;
let fila = [];

function avisar(texto, parte) {
  postMessage({ tipo: "progresso", texto, parte });
}

async function iniciar() {
  try {
    avisar("Ligando os refletores", 0.1);
    const base = new URL("./", import.meta.url).href;
    const py = await loadPyodide({ indexURL: base, stdLibURL: base + "python_stdlib.wasm" });
    avisar("Abrindo os almanaques", 0.55);
    const resposta = await fetch(new URL("./pacote.json", import.meta.url));
    const pacote = await resposta.json();
    const raiz = "/home/pyodide/megafut_projeto/";
    for (const [caminho, texto] of Object.entries(pacote.arquivos)) {
      const completo = raiz + caminho;
      py.FS.mkdirTree(completo.substring(0, completo.lastIndexOf("/")));
      py.FS.writeFile(completo, texto);
    }
    avisar("Escalando os clubes", 0.8);
    py.runPython(
      "import sys\nsys.path.insert(0, '/home/pyodide/megafut_projeto')\nfrom megafut.api_web import chamar as _chamar"
    );
    chamar = py.globals.get("_chamar");
    avisar("Pronto", 1);
    postMessage({ tipo: "pronto" });
    const pendentes = fila;
    fila = [];
    for (const item of pendentes) responder(item);
  } catch (erro) {
    postMessage({ tipo: "falha", texto: String(erro && erro.message ? erro.message : erro) });
  }
}

function responder({ id, pedido }) {
  let resposta;
  try {
    resposta = chamar(pedido);
  } catch (erro) {
    resposta = JSON.stringify({ ok: false, erro: String(erro && erro.message ? erro.message : erro) });
  }
  postMessage({ tipo: "resposta", id, resposta });
}

onmessage = (evento) => {
  const dados = evento.data || {};
  if (dados.tipo !== "pedido") return;
  if (!chamar) {
    fila.push(dados);
    return;
  }
  responder(dados);
};

iniciar();
