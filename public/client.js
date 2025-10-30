document.addEventListener("DOMContentLoaded", () => {
  const socket = io();
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  const scoreDisplay = document.getElementById("score-display");
  // NOVO: Referência para a lista do placar
  const leaderboardList = document.getElementById("leaderboard-list");

  let jogadores = new Map();
  let comida = new Map();
  let meuSocketId = null;
  const GAME_TICK_MS = 50;

  let config = {
    mundoLargura: 2000,
    mundoAltura: 2000,
    velocidadeJogador: 1,
  };

  const LERP_FACTOR = 0.2;

  const inputs = { ArrowUp: !1, ArrowDown: !1, ArrowLeft: !1, ArrowRight: !1 };

  // --- 1. Capturar Input (Sem mudanças) ---
  const teclasPermitidas = new Set(Object.keys(inputs));
  document.addEventListener("keydown", (e) => {
    if (teclasPermitidas.has(e.key)) {
      inputs[e.key] = !0;
      e.preventDefault();
    }
  });
  document.addEventListener("keyup", (e) => {
    if (teclasPermitidas.has(e.key)) {
      inputs[e.key] = !1;
      e.preventDefault();
    }
  });

  // --- 2. Receber Estado ---

  socket.on("connect", () => {
    meuSocketId = socket.id;
    console.log(`[CLIENT] Conectado ao servidor com ID: ${meuSocketId}`);

    // REMOVIDO: Log de Posição (substituído pelo placar)
    // setInterval(() => { ... }, 1000);
  });

  socket.on("estadoInicial", (estado) => {
    console.log("[CLIENT] Recebi estadoInicial!", estado);

    config.mundoLargura = estado.config.mundoLargura || config.mundoLargura;
    config.mundoAltura = estado.config.mundoAltura || config.mundoAltura;
    config.velocidadeJogador =
      estado.config.velocidadeJogador || config.velocidadeJogador;

    console.log("[CLIENT] Configurações do mundo recebidas:", config);

    canvas.width = estado.config.canvasLargura;
    canvas.height = estado.config.canvasAltura;

    jogadores.clear();
    estado.jogadores.forEach((j) => {
      j.interp_x = j.x;
      j.interp_y = j.y;
      jogadores.set(j.id, j);
    });

    comida.clear();
    estado.comida.forEach((c) => {
      comida.set(c.id, c);
    });
  });

  socket.on("estadoDelta", (mudancas) => {
    const tipos = {
      jogadorNovo: (m) => {
        m.interp_x = m.x;
        m.interp_y = m.y;
        jogadores.set(m.id, m);
      },
      jogadorMoveu: (m, j) => {
        if (j) {
          if (m.id === meuSocketId) {
            j.server_x = m.x;
            j.server_y = m.y;
          } else {
            j.x = m.x;
            j.y = m.y;
          }
        }
      },
      jogadorDesconectou: (m) => {
        jogadores.delete(m.id);
      },
      comidaAdicionada: (m) => {
        comida.set(m.id, m);
      },
      comidaRemovida: (m) => {
        console.log(`[CLIENT] Removendo comida ${m.id}`);
        comida.delete(m.id);
      },
      pontuacaoAtualizada: (m, j) => {
        if (j) {
          j.pontos = m.pontos;
          if (j.id === meuSocketId && scoreDisplay) {
            scoreDisplay.textContent = `Pontos: ${j.pontos}`;
          }
        }
      },
    };
    mudancas.forEach((m) => {
      const j = jogadores.get(m.id);
      if (tipos[m.tipo]) {
        tipos[m.tipo](m, j);
      }
    });
  });

  // NOVO: Ouvinte para o Placar de Líderes
  socket.on("leaderboardUpdate", (top10) => {
    if (!leaderboardList) return;

    // 1. Limpa a lista antiga
    leaderboardList.innerHTML = "";

    // 2. Cria os novos itens da lista
    top10.forEach((jogador) => {
      const li = document.createElement("li");

      // Encurta o ID para exibição
      const shortId = jogador.id.substring(0, 5);

      li.textContent = `ID: ${shortId}... P: ${jogador.pontos} (X: ${jogador.x}, Y: ${jogador.y})`;

      // Destaca o jogador atual
      if (jogador.id === meuSocketId) {
        li.className = "me";
      }

      leaderboardList.appendChild(li);
    });
  });

  // --- 3. Lógica do Jogo (Roda em Ticks fixos) ---

  function aplicarPredicaoEInputs() {
    // ... (função sem mudanças)
    const jogador = jogadores.get(meuSocketId);
    if (!jogador) return;

    if (isNaN(jogador.x)) {
      jogador.x = canvas.width / 2;
    }
    if (isNaN(jogador.y)) {
      jogador.y = canvas.height / 2;
    }

    if (
      typeof jogador.server_x === "number" &&
      typeof jogador.server_y === "number"
    ) {
      const distX = jogador.server_x - jogador.x;
      const distY = jogador.server_y - jogador.y;

      if (Math.abs(distX) > 0.1 || Math.abs(distY) > 0.1) {
        // console.log(`[CLIENT] RECONCILIAÇÃO: Desvio de ${distX.toFixed(2)}, ${distY.toFixed(2)}. Corrigindo...`);
        jogador.x += distX * LERP_FACTOR;
        jogador.y += distY * LERP_FACTOR;
      } else {
        jogador.x = jogador.server_x;
        jogador.y = jogador.server_y;
        jogador.server_x = undefined;
        jogador.server_y = undefined;
      }
    }

    let dx = 0;
    let dy = 0;
    if (inputs.ArrowUp) dy -= 1;
    if (inputs.ArrowDown) dy += 1;
    if (inputs.ArrowLeft) dx -= 1;
    if (inputs.ArrowRight) dx += 1;

    if (dx !== 0 || dy !== 0) {
      jogador.x = Math.max(
        0,
        Math.min(jogador.x + dx * config.velocidadeJogador, config.mundoLargura)
      );
      jogador.y = Math.max(
        0,
        Math.min(jogador.y + dy * config.velocidadeJogador, config.mundoAltura)
      );
    }
  }

  function gameTick() {
    aplicarPredicaoEInputs();
    socket.emit("updateInputs", inputs);
  }

  // --- 4. Renderização (Roda o mais rápido possível) ---

  function aplicarInterpolacao() {
    // ... (função sem mudanças)
    for (const jogador of jogadores.values()) {
      if (jogador.id === meuSocketId) {
        continue;
      }
      if (isNaN(jogador.x)) {
        jogador.x = canvas.width / 2;
      }
      if (isNaN(jogador.y)) {
        jogador.y = canvas.height / 2;
      }
      if (isNaN(jogador.interp_x)) {
        jogador.interp_x = jogador.x;
      }
      if (isNaN(jogador.interp_y)) {
        jogador.interp_y = jogador.y;
      }
      jogador.interp_x += (jogador.x - jogador.interp_x) * LERP_FACTOR;
      jogador.interp_y += (jogador.y - jogador.interp_y) * LERP_FACTOR;
    }
  }

  function desenhar() {
    // ... (função sem mudanças)
    if (canvas.width === 0 || canvas.height === 0) return;
    const meuJogador = jogadores.get(meuSocketId);

    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();

    if (meuJogador) {
      if (isNaN(meuJogador.x) || isNaN(meuJogador.y)) {
        console.error(
          "[CLIENT] ERRO GRAVE: Posição do meuJogador é NaN!",
          meuJogador.x,
          meuJogador.y
        );
        meuJogador.x = config.mundoLargura / 2;
        meuJogador.y = config.mundoAltura / 2;
      }
      const camX = Math.floor(meuJogador.x);
      const camY = Math.floor(meuJogador.y);
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.translate(-camX, -camY);
    }

    for (const itemComida of comida.values()) {
      ctx.fillStyle = itemComida.cor;
      ctx.fillRect(Math.floor(itemComida.x), Math.floor(itemComida.y), 1, 1);
    }

    for (const jogador of jogadores.values()) {
      ctx.fillStyle = jogador.cor;
      let drawX;
      if (jogador.id === meuSocketId) {
        drawX = jogador.x;
      } else {
        drawX = jogador.interp_x;
      }
      let drawY;
      if (jogador.id === meuSocketId) {
        drawY = jogador.y;
      } else {
        drawY = jogador.interp_y;
      }
      if (!isNaN(drawX) && !isNaN(drawY)) {
        ctx.fillRect(Math.floor(drawX), Math.floor(drawY), 1, 1);
      }
    }
    ctx.restore();
  }

  // --- 5. Iniciar Loops (Sem mudanças) ---

  setInterval(gameTick, GAME_TICK_MS);

  function loopRenderizacao() {
    aplicarInterpolacao();
    desenhar();

    // REMOVIDO: O log barulhento de "Outro Jogador"

    requestAnimationFrame(loopRenderizacao);
  }
  requestAnimationFrame(loopRenderizacao);
});
