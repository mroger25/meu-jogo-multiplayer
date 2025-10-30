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

// --- Otimização de Grid (Spatial Hashing) ---
const GRID_CELL_SIZE = VIEWPORT_LARGURA;
let grid = new Map();

let jogadores = new Map();
let comida = new Map();
let mudancas = [];

// --- LOG: Adicionado ---
function logInfo(mensagem) {
  console.log(`[INFO] ${new Date().toLocaleTimeString()} - ${mensagem}`);
}
function logDebug(mensagem) {
  // Comente esta linha para reduzir logs "barulhentos"
  console.log(`[DEBUG] ${new Date().toLocaleTimeString()} - ${mensagem}`);
}

function posAleatoria() {
  return {
    x: Math.floor(Math.random() * MUNDO_LARGURA),
    y: Math.floor(Math.random() * MUNDO_ALTURA),
  };
}

// --- Funções Auxiliares do Grid ---
function getGridKey(x, y) {
  const cellX = Math.floor(x / GRID_CELL_SIZE);
  const cellY = Math.floor(y / GRID_CELL_SIZE);
  return `${cellX}:${cellY}`;
}
function addToGrid(entity) {
  const key = getGridKey(entity.x, entity.y);
  if (!grid.has(key)) {
    grid.set(key, new Set());
  }
  grid.get(key).add(entity);
  entity.gridKey = key;
}
function removeFromGrid(entity) {
  if (entity.gridKey && grid.has(entity.gridKey)) {
    grid.get(entity.gridKey).delete(entity);
    if (grid.get(entity.gridKey).size === 0) {
      grid.delete(entity.gridKey);
    }
  }
  entity.gridKey = null;
}
function updateGridPosition(entity) {
  const newKey = getGridKey(entity.x, entity.y);
  if (entity.gridKey !== newKey) {
    removeFromGrid(entity);
    addToGrid(entity);
  }
}
function getEntitiesInVicinity(entity) {
  const entities = new Set();
  const cellX = Math.floor(entity.x / GRID_CELL_SIZE);
  const cellY = Math.floor(entity.y / GRID_CELL_SIZE);
  for (let x = cellX - 1; x <= cellX + 1; x++) {
    for (let y = cellY - 1; y <= cellY + 1; y++) {
      const key = `${x}:${y}`;
      if (grid.has(key)) {
        for (const e of grid.get(key)) {
          entities.add(e);
        }
      }
    }
  }
  return entities;
}
// --- Fim das Funções do Grid ---

function gerarComida(quantidade) {
  for (let i = 0; i < quantidade; i++) {
    const id = `comida_${Date.now()}_${i}`;
    const novaComida = {
      id,
      ...posAleatoria(),
      cor: `hsl(${Math.random() * 360}, 100%, 50%)`,
    };
    comida.set(id, novaComida);
    addToGrid(novaComida);
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
      updateGridPosition(jogador);
      mudancas.push({
        tipo: "jogadorMoveu",
        id: jogador.id,
        x: jogador.x,
        y: jogador.y,
      });

      const inVicinity = getEntitiesInVicinity(jogador);
      for (const entity of inVicinity) {
        if (!comida.has(entity.id)) continue;
        const itemComida = entity;
        if (checarColisao(jogador, itemComida)) {
          comida.delete(itemComida.id);
          removeFromGrid(itemComida);
          mudancas.push({
            tipo: "comidaRemovida",
            id: itemComida.id,
            x: itemComida.x,
            y: itemComida.y,
          });
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

  if (mudancas.length === 0) {
    return;
  }

  const mudancasPorJogador = new Map();

  function getOrCreateMudancas(jogadorId) {
    if (!mudancasPorJogador.has(jogadorId)) {
      mudancasPorJogador.set(jogadorId, []);
    }
    return mudancasPorJogador.get(jogadorId);
  }

  for (const m of mudancas) {
    if (m.tipo === "pontuacaoAtualizada") {
      const mudancasDoJogador = getOrCreateMudancas(m.id);
      mudancasDoJogador.push(m);
    } else if (m.x !== undefined && m.y !== undefined) {
      const playersInVicinity = getEntitiesInVicinity(m);
      for (const entity of playersInVicinity) {
        if (!jogadores.has(entity.id)) continue;
        const jogador = entity;
        const minX = jogador.x - VIEWPORT_LARGURA / 2;
        const maxX = jogador.x + VIEWPORT_LARGURA / 2;
        const minY = jogador.y - VIEWPORT_ALTURA / 2;
        const maxY = jogador.y + VIEWPORT_ALTURA / 2;
        if (m.x >= minX && m.x <= maxX && m.y >= minY && m.y <= maxY) {
          const mudancasDoJogador = getOrCreateMudancas(jogador.id);
          mudancasDoJogador.push(m);
        }
      }
    }
  }

  for (const [jogadorId, mudancasVisiveis] of mudancasPorJogador) {
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
  logInfo(`Jogador ${socket.id} conectou.`); // --- LOG: Modificado ---

  const novoJogador = {
    id: socket.id,
    ...posAleatoria(),
    cor: `hsl(${Math.random() * 360}, 70%, 70%)`,
    inputs: { ArrowUp: !1, ArrowDown: !1, ArrowLeft: !1, ArrowRight: !1 },
    pontos: 0,
  };

  jogadores.set(socket.id, novoJogador);
  addToGrid(novoJogador);

  socket.emit("estadoInicial", {
    jogadores: Array.from(jogadores.values()),
    comida: Array.from(comida.values()),
    config: {
      canvasLargura: CLIENT_CANVAS_LARGURA,
      canvasAltura: CLIENT_CANVAS_ALTURA,
      // --- ADIÇÃO NECESSÁRIA para PREDIÇÃO ---
      mundoLargura: MUNDO_LARGURA,
      mundoAltura: MUNDO_ALTURA,
      velocidadeJogador: VELOCIDADE_JOGADOR,
    },
  });

  mudancas.push({
    tipo: "jogadorNovo",
    ...novoJogador,
  });

  socket.on("updateInputs", (inputs) => {
    const jogador = jogadores.get(socket.id);
    if (jogador) {
      // Validação básica
      if (typeof inputs === "object" && inputs !== null) {
        jogador.inputs = inputs;
      } else {
        logInfo(`Inputs inválidos recebidos de ${socket.id}`);
      }
    }
  });

  socket.on("disconnect", () => {
    logInfo(`Jogador ${socket.id} desconectou.`); // --- LOG: Modificado ---
    const jogador = jogadores.get(socket.id);
    if (jogador) {
      removeFromGrid(jogador);
      jogadores.delete(socket.id);
      mudancas.push({
        tipo: "jogadorDesconectou",
        id: socket.id,
        x: jogador.x,
        y: jogador.y,
      });
    }
  });
});

app.use(express.static("public"));

server.listen(PORTA, () => {
  logInfo(`Servidor rodando na porta ${PORTA}. Abra http://localhost:${PORTA}`); // --- LOG: Modificado ---
  gerarComida(QTD_COMIDA_INICIAL);
  setInterval(() => gameLoop(), GAME_TICK_MS);
});
