document.addEventListener("DOMContentLoaded", () => {
  const socket = io();
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  // --- Estado Local do Cliente ---
  let jogadores = new Map();
  let comida = new Map();
  let meuSocketId = null;
  const GAME_TICK_MS = 50;

  // --- Estado de Input Local ---
  const inputs = { ArrowUp: !1, ArrowDown: !1, ArrowLeft: !1, ArrowRight: !1 };

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

  // --- 2. Enviar Inputs em Intervalo Fixo ---
  setInterval(() => {
    socket.emit("updateInputs", inputs);
  }, GAME_TICK_MS);

  // --- 3. Receber Estado ---

  socket.on("connect", () => {
    meuSocketId = socket.id;
  });

  socket.on("estadoInicial", (estado) => {
    console.log("Recebi estado inicial!");
    canvas.width = estado.config.canvasLargura;
    canvas.height = estado.config.canvasAltura;
    jogadores.clear();
    estado.jogadores.forEach((j) => {
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
        jogadores.set(m.id, m);
      },
      jogadorMoveu: (m, j) => {
        if (j) {
          j.x = m.x;
          j.y = m.y;
        }
      },
      jogadorDesconectou: (m) => {
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

  // --- 4. Desenhar (Render Loop) ---
  function desenhar() {
    if (canvas.width === 0 || canvas.height === 0) return;
    const meuJogador = jogadores.get(meuSocketId);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    if (meuJogador) {
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.translate(-meuJogador.x, -meuJogador.y);
    }

    for (const itemComida of comida.values()) {
      ctx.fillStyle = itemComida.cor;
      ctx.fillRect(itemComida.x, itemComida.y, 1, 1);
    }
    for (const jogador of jogadores.values()) {
      ctx.fillStyle = jogador.cor;
      ctx.fillRect(jogador.x, jogador.y, 1, 1);
    }

    ctx.restore();

    if (meuJogador) {
      ctx.fillStyle = "white";
      ctx.font = "3px Arial";
      ctx.textAlign = "left";
      ctx.textBaseLine = "top";
      ctx.fillText(`Pontos: ${meuJogador.pontos}`, 2, 2);
    }
  }

  function loopRenderizacao() {
    desenhar();
    requestAnimationFrame(loopRenderizacao);
  }

  loopRenderizacao();
});
