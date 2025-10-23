const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORTA = 3000;

const MUNDO_LARGURA = 2000;
const MUNDO_ALTURA = 2000;
const QTD_COMIDA_INICIAL = 200;

let jogadores = new Map();
let comida = [];

function posAleatoria() {
  return {
    x: Math.floor(Math.random() * MUNDO_LARGURA),
    y: Math.floor(Math.random() * MUNDO_ALTURA),
  };
}

function updateEstadoJogo() {
  const estadoJogo = {
    jogadores: Array.from(jogadores.values()),
    comida: comida,
  };

  io.emit("estadoJogo", estadoJogo);
}

function gerarComida(quantidade) {
  for (let i = 0; i < quantidade; i++) {
    comida.push({
      id: `comida_${Date.now()}_${i}`,
      ...posAleatoria(),
      cor: `hsl(${Math.random() * 360}, 100%, 50%)`,
    });
  }

  updateEstadoJogo();
}

function checarColisao(obj1, obj2) {
  const dist = Math.hypot(obj1.x - obj2.x, obj1.y - obj2.y);
  return dist < 1;
}

io.on("connection", (socket) => {
  console.log(`Jogador ${socket.id} conectou.`);

  const novoJogador = {
    id: socket.id,
    ...posAleatoria(),
    cor: `hsl(${Math.random() * 360}, 70%, 70%)`,
  };

  jogadores.set(socket.id, novoJogador);

  socket.on("updateDirecao", (key) => {
    const jogador = jogadores.get(socket.id);
    const keys = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
    };
    const direcao = keys[key];

    if (jogador && direcao) {
      jogador.x = Math.max(0, Math.min(jogador.x + direcao.x, MUNDO_LARGURA));
      jogador.y = Math.max(0, Math.min(jogador.y + direcao.y, MUNDO_ALTURA));
    }

    for (let i = comida.length - 1; i >= 0; i--) {
      const itemComida = comida[i];
      if (checarColisao(jogador, itemComida)) {
        comida.splice(i, 1);
        gerarComida(1);
      }
    }

    updateEstadoJogo();
  });

  updateEstadoJogo();

  socket.on("disconnect", () => {
    console.log(`Jogador ${socket.id} desconectou.`);
    jogadores.delete(socket.id);
  });
});

app.use(express.static("public"));

server.listen(PORTA, () => {
  console.log(
    `Servidor rodando na porta ${PORTA}. Abra http://localhost:${PORTA}`
  );

  gerarComida(QTD_COMIDA_INICIAL);
});
