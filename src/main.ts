import Phaser from "phaser";
import { SequenceScene } from "./scenes/SequenceScene";
import { COLORS, FONT_NAMES } from "./theme";

async function bootstrap() {
  // Espera fontes web carregarem antes de instanciar o Phaser, evitando flash de fallback.
  try {
    await Promise.all([
      document.fonts.load(`16px "${FONT_NAMES.mono}"`),
      document.fonts.load(`64px "${FONT_NAMES.display}"`),
    ]);
  } catch {
    // Sem rede ou Google Fonts bloqueado — segue com fontes do sistema.
  }

  new Phaser.Game({
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: COLORS.bg,
    parent: "game",
    scene: SequenceScene,
  });
}

void bootstrap();
