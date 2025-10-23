document.addEventListener("DOMContentLoaded", () => {
  const socket = io();
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  // Ajusta o canvas para o tamanho da janela
  canvas.width = 40;
  canvas.height = 40;

  // Guarda o estado do "meu" jogador
  let meuJogador = null;

  // --- 1. Enviar Input ---

  document.addEventListener("keydown", (e) => {
    socket.emit("updateDirecao", e.key);
  });

  // --- 2. Receber Estado e Desenhar ---

  // A função principal de desenho
  function desenhar(estado) {
    // Limpa o canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // --- LÓGICA DA CÂMERA ---
    // Encontra o "meu" jogador no estado
    meuJogador = estado.jogadores.find((j) => j.id === socket.id);

    // Salva o estado do canvas (antes de mover a câmera)
    ctx.save();

    if (meuJogador) {
      // Move a origem (0,0) do canvas para o centro da tela
      ctx.translate(canvas.width / 2, canvas.height / 2);

      // Centraliza a câmera no jogador
      // (Move o "mundo" na direção oposta do jogador)
      ctx.translate(-meuJogador.x, -meuJogador.y);
    }

    // --- Desenhar o Jogo (com a câmera transladada) ---

    // Desenhar a "comida"
    estado.comida.forEach((itemComida) => {
      ctx.fillStyle = itemComida.cor;
      ctx.fillRect(itemComida.x, itemComida.y, 1, 1);
    });

    // Desenhar os "jogadores"
    estado.jogadores.forEach((jogador) => {
      ctx.fillStyle = jogador.cor;
      ctx.fillRect(jogador.x, jogador.y, 1, 1);
    });

    // Restaura o estado do canvas (remove a translação da câmera)
    ctx.restore();
  }

  // Ouve o evento do servidor
  socket.on("estadoJogo", (estado) => {
    requestAnimationFrame(() => desenhar(estado));
  });
});
