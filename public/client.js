document.addEventListener("DOMContentLoaded", () => {
  const loginScreen = document.getElementById("login-screen");
  const gameContainer = document.getElementById("game-container");
  const nameInput = document.getElementById("player-name-input");
  const startButton = document.getElementById("start-game-button");

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  const scoreDisplay = document.getElementById("score-display");
  const leaderboardList = document.getElementById("leaderboard-list");

  let socket = null;

  let jogadores = new Map();
  let comida = new Map();
  let meuSocketId = null;
  const GAME_TICK_MS = 50;

  let config = {
    mundoLargura: 120,
    mundoAltura: 120,
    velocidadeJogador: 1,
  };

  const LERP_FACTOR = 0.6;
  const inputs = { ArrowUp: !1, ArrowDown: !1, ArrowLeft: !1, ArrowRight: !1 };

  // --- Lógica de Login ---
  startButton.addEventListener("click", () => {
    let nome = nameInput.value.trim();
    if (nome.length === 0) {
      nome = "Anônimo";
    }

    loginScreen.style.display = "none";
    gameContainer.style.display = "block";

    // Inicia o jogo
    iniciarJogo(nome);
  });

  // --- Função principal de inicialização ---

  function iniciarJogo(nomeDoJogador) {
    // 1. Conecta ao socket
    socket = io();

    // 2. Configura todos os ouvintes
    configurarSocket(nomeDoJogador);

    // 3. Inicia os loops de jogo e renderização
    setInterval(gameTick, GAME_TICK_MS);
    requestAnimationFrame(loopRenderizacao);
  }

  function configurarSocket(nome) {
    // --- 1. Capturar Input ---
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

      console.log(`[CLIENT] Entrando no jogo como: ${nome}`);
      socket.emit("entrarNoJogo", { nome: nome });
    });

    socket.on("estadoInicial", (estado) => {
      console.log("[CLIENT] Recebi estadoInicial!", estado);

      config.mundoLargura = estado.config.mundoLargura || config.mundoLargura;
      config.mundoAltura = estado.config.mundoAltura || config.mundoAltura;
      config.velocidadeJogador =
        estado.config.velocidadeJogador || config.velocidadeJogador;

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
          console.log(`[CLIENT] Novo jogador apareceu: ${m.nome} (${m.id})`);
          m.interp_x = m.x;
          m.interp_y = m.y;
          jogadores.set(m.id, m);
        },
        jogadorMoveu: (m, j) => {
          if (j) {
            j.x = m.x;
            j.y = m.y;
          }
        },
        jogadorDesconectou: (m) => {
          const j = jogadores.get(m.id);
          const nome = j ? j.nome : m.id;
          console.log(`[CLIENT] Jogador desconectou: ${nome}`);
          jogadores.delete(m.id);
        },
        comidaAdicionada: (m) => {
          comida.set(m.id, m);
        },
        comidaRemovida: (m) => {
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

    // Ouvinte do Placar
    socket.on("leaderboardUpdate", (top10) => {
      if (!leaderboardList) return;
      leaderboardList.innerHTML = "";
      top10.forEach((jogador) => {
        const li = document.createElement("li");

        // Usa o nome, com o ID como fallback
        const nome = jogador.nome || jogador.id.substring(0, 5);

        li.textContent = `${nome} - P: ${jogador.pontos} (X: ${jogador.x}, Y: ${jogador.y})`;
        if (jogador.id === meuSocketId) {
          li.className = "me";
        }
        leaderboardList.appendChild(li);
      });
    });
  }

  // --- 3. Lógica do Jogo ---

  function gameTick() {
    // Não faz nada se o socket não estiver conectado
    if (!socket) return;
    socket.emit("updateInputs", inputs);
  }

  // --- 4. Renderização ---

  function aplicarInterpolacao() {
    for (const jogador of jogadores.values()) {
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
    if (canvas.width === 0 || canvas.height === 0) return;
    const meuJogador = jogadores.get(meuSocketId);

    ctx.fillStyle = "#222"; // Cor do vazio
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();

    if (meuJogador) {
      if (isNaN(meuJogador.interp_x) || isNaN(meuJogador.interp_y)) {
        meuJogador.interp_x = config.mundoLargura / 2;
        meuJogador.interp_y = config.mundoAltura / 2;
      }
      const camX = Math.floor(meuJogador.interp_x);
      const camY = Math.floor(meuJogador.interp_y);
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.translate(-camX, -camY);
    } else {
      // Se o jogo não começou, apenas centraliza
      ctx.translate(canvas.width / 2, canvas.height / 2);
    }

    // Desenha o chão
    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, config.mundoLargura, config.mundoAltura);

    // Desenha comida
    for (const itemComida of comida.values()) {
      ctx.fillStyle = itemComida.cor;
      ctx.fillRect(Math.floor(itemComida.x), Math.floor(itemComida.y), 1, 1);
    }

    // Desenha jogadores
    for (const jogador of jogadores.values()) {
      ctx.fillStyle = jogador.cor;
      const drawX = jogador.interp_x;
      const drawY = jogador.interp_y;

      if (!isNaN(drawX) && !isNaN(drawY)) {
        ctx.fillRect(Math.floor(drawX), Math.floor(drawY), 1, 1);
      }
    }
    ctx.restore();
  }

  // --- 5. Iniciar Loops ---
  function loopRenderizacao() {
    if (socket) {
      aplicarInterpolacao();
      desenhar();
    }
    requestAnimationFrame(loopRenderizacao);
  }
  requestAnimationFrame(loopRenderizacao);
});
