const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORTA = 3000;

const MUNDO_LARGURA = 2000;
const MUNDO_ALTURA = 2000;
const QTD_COMIDA_INICIAL = 2500;
const GAME_TICK_MS = 50;
const VELOCIDADE_JOGADOR = 1;

const CLIENT_CANVAS_LARGURA = 40;
const CLIENT_CANVAS_ALTURA = 40;

const VIEWPORT_LARGURA = CLIENT_CANVAS_LARGURA + 20;
const VIEWPORT_ALTURA = CLIENT_CANVAS_ALTURA + 20;

let jogadores = new Map();
let comida = new Map();
let mudancas = [];

function posAleatoria() {
  return {
    x: Math.floor(Math.random() * MUNDO_LARGURA),
    y: Math.floor(Math.random() * MUNDO_ALTURA),
  };
}

function gerarComida(quantidade) {
  for (let i = 0; i < quantidade; i++) {
    const id = `comida_${Date.now()}_${i}`;
    const novaComida = {
      id,
      ...posAleatoria(),
      cor: `hsl(${Math.random() * 360}, 100%, 50%)`,
    };
    comida.set(id, novaComida);
    mudancas.push({ tipo: "comidaAdicionada", ...novaComida });
  }
}

function checarColisao(obj1, obj2) {
  return obj1.x === obj2.x && obj1.y === obj2.y;
}

function gameLoop() {
  for (const [jogadorId, jogador] of jogadores) {
    if (!jogador.inputs) continue;
    let dx = 0;
    let dy = 0;
    if (jogador.inputs.ArrowUp) dy -= 1;
    if (jogador.inputs.ArrowDown) dy += 1;
    if (jogador.inputs.ArrowLeft) dx -= 1;
    if (jogador.inputs.ArrowRight) dx += 1;
    if (dx !== 0 || dy !== 0) {
      jogador.x = Math.max(
        0,
        Math.min(jogador.x + dx * VELOCIDADE_JOGADOR, MUNDO_LARGURA)
      );
      jogador.y = Math.max(
        0,
        Math.min(jogador.y + dy * VELOCIDADE_JOGADOR, MUNDO_ALTURA)
      );

      mudancas.push({
        tipo: "jogadorMoveu",
        id: jogador.id,
        x: jogador.x,
        y: jogador.y,
      });

      for (const [comidaId, itemComida] of comida) {
        if (checarColisao(jogador, itemComida)) {
          comida.delete(comidaId);
          mudancas.push({ tipo: "comidaRemovida", id: comidaId });
          jogador.pontos += 1;
          mudancas.push({
            tipo: "pontuacaoAtualizada",
            id: jogador.id,
            pontos: jogador.pontos,
          });
          gerarComida(1);
          break;
        }
      }
    }
  }
  if (mudancas.length === 0) return;
  for (const [jogadorId, jogador] of jogadores) {
    const minX = jogador.x - VIEWPORT_LARGURA / 2;
    const maxX = jogador.x + VIEWPORT_LARGURA / 2;
    const minY = jogador.y - VIEWPORT_ALTURA / 2;
    const maxY = jogador.y + VIEWPORT_ALTURA / 2;

    const mudancasVisiveis = mudancas.filter((m) => {
      if (m.tipo === "pontuacaoAtualizada") return true;

      return m.x !== undefined && m.y !== undefined
        ? m.x >= minX && m.x <= maxX && m.y >= minY && m.y <= maxY
        : true;
    });

    if (mudancasVisiveis.length > 0) {
      const socket = io.sockets.sockets.get(jogadorId);
      if (socket) {
        socket.emit("estadoDelta", mudancasVisiveis);
      }
    }
  }
  mudancas = [];
}

io.on("connection", (socket) => {
  console.log(`Jogador ${socket.id} conectou.`);

  const novoJogador = {
    id: socket.id,
    ...posAleatoria(),
    cor: `hsl(${Math.random() * 360}, 70%, 70%)`,
    inputs: { ArrowUp: !1, ArrowDown: !1, ArrowLeft: !1, ArrowRight: !1 },
    pontos: 0,
  };

  jogadores.set(socket.id, novoJogador);

  socket.emit("estadoInicial", {
    jogadores: Array.from(jogadores.values()),
    comida: Array.from(comida.values()),
    config: {
      canvasLargura: CLIENT_CANVAS_LARGURA,
      canvasAltura: CLIENT_CANVAS_ALTURA,
    },
  });

  mudancas.push({
    tipo: "jogadorNovo",
    ...novoJogador,
  });

  socket.on("updateInputs", (inputs) => {
    const jogador = jogadores.get(socket.id);
    if (jogador) {
      jogador.inputs = inputs;
    }
  });

  socket.on("disconnect", () => {
    console.log(`Jogador ${socket.id} desconectou.`);
    jogadores.delete(socket.id);
    mudancas.push({
      tipo: "jogadorDesconectou",
      id: socket.id,
    });
  });
});

app.use(express.static("public"));

server.listen(PORTA, () => {
  console.log(
    `Servidor rodando na porta ${PORTA}. Abra http://localhost:${PORTA}`
  );
  gerarComida(QTD_COMIDA_INICIAL);
  setInterval(() => gameLoop(), GAME_TICK_MS);
});
