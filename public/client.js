document.addEventListener("DOMContentLoaded", () => {
  const socket = io();
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  const scoreDisplay = document.getElementById("score-display");

  let jogadores = new Map();
  let comida = new Map();
  let meuSocketId = null;
  const GAME_TICK_MS = 50; // Tem que ser o mesmo valor do servidor

  let config = {
    mundoLargura: 2000,
    mundoAltura: 2000,
    velocidadeJogador: 1,
  };

  const LERP_FACTOR = 0.2; // Fator de interpolação

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
    // console.log(`[CLIENT] Recebi ${mudancas.length} deltas.`); // Log "barulhento"

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
            // Posição de destino para interpolação
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
        // Agora deve funcionar!
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

  // --- 3. Lógica do Jogo (Roda em Ticks fixos) ---

  function aplicarPredicaoEInputs() {
    const jogador = jogadores.get(meuSocketId);
    if (!jogador) return;

    // Garante que a posição é um número
    if (isNaN(jogador.x)) {
      jogador.x = canvas.width / 2;
    }
    if (isNaN(jogador.y)) {
      jogador.y = canvas.height / 2;
    }

    // 1. Reconciliação (Corrige desvios)
    if (
      typeof jogador.server_x === "number" &&
      typeof jogador.server_y === "number"
    ) {
      const distX = jogador.server_x - jogador.x;
      const distY = jogador.server_y - jogador.y;

      // O desvio agora deve ser MÍNIMO, só ocorrendo se houver lag.
      if (Math.abs(distX) > 0.1 || Math.abs(distY) > 0.1) {
        console.log(
          `[CLIENT] RECONCILIAÇÃO: Desvio de ${distX.toFixed(
            2
          )}, ${distY.toFixed(2)}. Corrigindo...`
        );
        // Aplica uma correção (LERP)
        jogador.x += distX * LERP_FACTOR;
        jogador.y += distY * LERP_FACTOR;
      } else {
        // Trava na posição e limpa
        jogador.x = jogador.server_x;
        jogador.y = jogador.server_y;
        jogador.server_x = undefined;
        jogador.server_y = undefined;
      }
    }

    // 2. Predição (Aplica movimento local)
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

  /**
   * Esta é a nova função principal do "Game Tick" do cliente.
   * Roda no mesmo ritmo do servidor.
   */
  function gameTick() {
    // 1. Processa a lógica do nosso jogador (predição/reconciliação)
    aplicarPredicaoEInputs();

    // 2. Envia os inputs para o servidor
    socket.emit("updateInputs", inputs);
  }

  // --- 4. Renderização (Roda o mais rápido possível) ---

  function aplicarInterpolacao() {
    for (const jogador of jogadores.values()) {
      if (jogador.id === meuSocketId) {
        continue; // Não interpolamos nosso próprio jogador
      }

      // Garante que temos posições válidas
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

      // Interpola a posição de *desenho* (interp_x)
      // em direção à posição de *lógica* (x)
      jogador.interp_x += (jogador.x - jogador.interp_x) * LERP_FACTOR;
      jogador.interp_y += (jogador.y - jogador.interp_y) * LERP_FACTOR;
    }
  }

  function desenhar() {
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
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.translate(-meuJogador.x, -meuJogador.y);
    }

    for (const itemComida of comida.values()) {
      ctx.fillStyle = itemComida.cor;
      ctx.fillRect(itemComida.x, itemComida.y, 1, 1);
    }

    for (const jogador of jogadores.values()) {
      ctx.fillStyle = jogador.cor;
      let drawX, drawY;

      if (jogador.id === meuSocketId) {
        drawX = jogador.x; // Nosso jogador usa a posição predita
        drawY = jogador.y;
      } else {
        drawX = jogador.interp_x; // Outros usam a posição interpolada
        drawY = jogador.interp_y;
      }

      if (!isNaN(drawX) && !isNaN(drawY)) {
        ctx.fillRect(drawX, drawY, 1, 1);
      }
    }
    ctx.restore();
  }

  // --- 5. Iniciar Loops ---

  // Loop de Lógica (Sincronizado com o Servidor)
  setInterval(gameTick, GAME_TICK_MS);

  // Loop de Renderização (O mais rápido possível)
  function loopRenderizacao() {
    aplicarInterpolacao(); // Interpola outros jogadores
    desenhar();
    requestAnimationFrame(loopRenderizacao);
  }
  requestAnimationFrame(loopRenderizacao); // Inicia o loop de renderização
});
