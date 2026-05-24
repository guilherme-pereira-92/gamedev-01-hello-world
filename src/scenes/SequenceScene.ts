import Phaser from "phaser";
import { COLORS, COLOR_HEX, FONTS, FONT_SIZES } from "../theme";
import { playTone, unlockAudio } from "../audio";
import { takeScreenshot } from "../screenshot";

type PanelId = "up" | "right" | "down" | "left";
type GameState = "idle" | "show" | "input" | "wrong" | "gameover";

const WIDTH = 800;
const HEIGHT = 600;
const HIGHSCORE_KEY = "gamedev-01-sequence-best-phase";
const SEQUENCE_BASE_LENGTH = 3;

interface PanelConfig {
  id: PanelId;
  cx: number;
  cy: number;
  width: number;
  height: number;
  arrow: string;
  color: number;
  colorHex: string;
  frequency: number;
}

const PANELS: PanelConfig[] = [
  { id: "up",    cx: 400, cy: 120, width: 240, height: 170, arrow: "↑", color: COLOR_HEX.accent,    colorHex: COLORS.accent,    frequency: 392.0 },
  { id: "right", cx: 640, cy: 300, width: 240, height: 170, arrow: "→", color: COLOR_HEX.fg,        colorHex: COLORS.fg,        frequency: 523.25 },
  { id: "down",  cx: 400, cy: 480, width: 240, height: 170, arrow: "↓", color: COLOR_HEX.amber,    colorHex: COLORS.amber,    frequency: 587.33 },
  { id: "left",  cx: 160, cy: 300, width: 240, height: 170, arrow: "←", color: COLOR_HEX.secondary, colorHex: COLORS.secondary, frequency: 659.25 },
];

const phaseSequenceLength = (phase: number) => SEQUENCE_BASE_LENGTH + (phase - 1);
const phaseFlashMs = (phase: number) => Math.max(140, 380 - (phase - 1) * 18);
const phaseGapMs = (phase: number) => Math.max(60, 170 - (phase - 1) * 10);

export class SequenceScene extends Phaser.Scene {
  private panelRects = new Map<PanelId, Phaser.GameObjects.Rectangle>();
  private panelArrows = new Map<PanelId, Phaser.GameObjects.Text>();
  private centerTitle!: Phaser.GameObjects.Text;
  private centerSubtitle!: Phaser.GameObjects.Text;
  private centerHint!: Phaser.GameObjects.Text;
  private scoreLabel!: Phaser.GameObjects.Text;
  private bestLabel!: Phaser.GameObjects.Text;

  private state: GameState = "idle";
  private sequence: PanelId[] = [];
  private playerIndex = 0;
  private currentPhase = 1;
  private bestPhase = 0;

  private keys!: Record<
    "UP" | "DOWN" | "LEFT" | "RIGHT" | "W" | "A" | "S" | "D" | "SPACE" | "R" | "K",
    Phaser.Input.Keyboard.Key
  >;

  constructor() {
    super("sequence");
  }

  create() {
    this.bestPhase = this.loadBest();

    this.drawGridBackground();
    this.drawPanels();
    this.drawCenterTextStack();
    this.drawTopLabels();

    const kb = this.input.keyboard!;
    this.keys = {
      UP: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      DOWN: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      LEFT: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      RIGHT: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      SPACE: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      R: kb.addKey(Phaser.Input.Keyboard.KeyCodes.R),
      K: kb.addKey(Phaser.Input.Keyboard.KeyCodes.K),
    };

    // Navegadores bloqueiam AudioContext até gesto do usuário — unlock no primeiro keydown.
    kb.on("keydown", unlockAudio);

    this.refreshTopLabels();
    this.showIdleScreen();
  }

  update() {
    const justDown = Phaser.Input.Keyboard.JustDown;

    if (justDown(this.keys.K)) {
      takeScreenshot(this.game, "gamedev-01-sequence");
    }

    if (this.state === "idle" && justDown(this.keys.SPACE)) {
      this.startGame();
      return;
    }

    if (this.state === "gameover" && justDown(this.keys.R)) {
      this.startGame();
      return;
    }

    if (this.state === "input") {
      let pressed: PanelId | null = null;
      if (justDown(this.keys.UP) || justDown(this.keys.W)) pressed = "up";
      else if (justDown(this.keys.DOWN) || justDown(this.keys.S)) pressed = "down";
      else if (justDown(this.keys.LEFT) || justDown(this.keys.A)) pressed = "left";
      else if (justDown(this.keys.RIGHT) || justDown(this.keys.D)) pressed = "right";

      if (pressed) this.handlePlayerInput(pressed);
    }
  }

  private startGame() {
    this.currentPhase = 1;
    this.sequence = [];
    this.beginPhase();
  }

  private beginPhase() {
    this.playerIndex = 0;
    while (this.sequence.length < phaseSequenceLength(this.currentPhase)) {
      this.sequence.push(this.randomPanelId());
    }
    this.refreshTopLabels();

    this.centerTitle.setText(`FASE ${this.currentPhase}`);
    this.centerSubtitle.setText("memorize a sequência");
    this.centerHint.setText("");

    this.playSequence();
  }

  private randomPanelId(): PanelId {
    return PANELS[Phaser.Math.Between(0, PANELS.length - 1)].id;
  }

  private playSequence() {
    this.state = "show";
    const flash = phaseFlashMs(this.currentPhase);
    const gap = phaseGapMs(this.currentPhase);

    let elapsed = 650;
    for (const panelId of this.sequence) {
      this.time.delayedCall(elapsed, () => this.flashPanel(panelId, flash));
      elapsed += flash + gap;
    }
    this.time.delayedCall(elapsed + 80, () => this.beginPlayerInput());
  }

  private beginPlayerInput() {
    this.state = "input";
    this.centerSubtitle.setText("sua vez");
    this.centerHint.setText("repita usando  ↑ ↓ ← →  (ou WASD)");
  }

  private handlePlayerInput(pressed: PanelId) {
    this.flashPanel(pressed, 180);

    const expected = this.sequence[this.playerIndex];
    if (pressed !== expected) {
      this.fail();
      return;
    }

    this.playerIndex++;
    if (this.playerIndex >= this.sequence.length) {
      this.succeed();
    }
  }

  private succeed() {
    if (this.currentPhase > this.bestPhase) {
      this.bestPhase = this.currentPhase;
      this.saveBest();
    }
    this.refreshTopLabels();

    this.state = "show";
    this.centerSubtitle.setText("certo!");
    this.centerHint.setText("");
    playTone(880, 120, "triangle", 0.14);
    this.time.delayedCall(120, () => playTone(1175, 180, "triangle", 0.14));

    this.cameras.main.flash(180, 122, 209, 122, false);

    this.time.delayedCall(700, () => {
      this.currentPhase++;
      this.beginPhase();
    });
  }

  private fail() {
    this.state = "wrong";
    const failedAtPhase = this.currentPhase;
    const completed = failedAtPhase - 1;

    playTone(180, 220, "sawtooth", 0.18);
    this.time.delayedCall(120, () => playTone(110, 380, "sawtooth", 0.16));

    this.cameras.main.shake(220, 0.008);
    this.cameras.main.flash(160, 220, 40, 40, false);

    this.time.delayedCall(900, () => {
      this.state = "gameover";
      this.centerTitle.setText("FIM");
      const summary = completed > 0
        ? `parou na fase ${failedAtPhase} · completou ${completed}`
        : `parou na fase ${failedAtPhase}`;
      this.centerSubtitle.setText(summary);
      this.centerHint.setText("R para tentar de novo  ·  K para screenshot");
    });
  }

  private flashPanel(id: PanelId, durationMs: number) {
    const cfg = PANELS.find((p) => p.id === id)!;
    const rect = this.panelRects.get(id)!;
    const arrow = this.panelArrows.get(id)!;

    rect.setFillStyle(cfg.color, 0.95);
    rect.setStrokeStyle(2, cfg.color, 1);
    arrow.setAlpha(1).setColor(COLORS.bg);
    playTone(cfg.frequency, durationMs, "sine", 0.15);

    this.time.delayedCall(durationMs, () => {
      rect.setFillStyle(cfg.color, 0.16);
      rect.setStrokeStyle(2, cfg.color, 0.4);
      arrow.setAlpha(0.45).setColor(cfg.colorHex);
    });
  }

  private drawGridBackground() {
    const g = this.add.graphics();
    g.lineStyle(1, COLOR_HEX.border, 0.6);
    for (let x = 40; x < WIDTH; x += 40) {
      g.lineBetween(x, 0, x, HEIGHT);
    }
    for (let y = 40; y < HEIGHT; y += 40) {
      g.lineBetween(0, y, WIDTH, y);
    }
  }

  private drawPanels() {
    for (const cfg of PANELS) {
      const rect = this.add.rectangle(cfg.cx, cfg.cy, cfg.width, cfg.height, cfg.color, 0.16);
      rect.setStrokeStyle(2, cfg.color, 0.4);
      this.panelRects.set(cfg.id, rect);

      const arrow = this.add
        .text(cfg.cx, cfg.cy, cfg.arrow, {
          fontFamily: FONTS.display,
          fontSize: "96px",
          color: cfg.colorHex,
        })
        .setOrigin(0.5)
        .setAlpha(0.45);
      this.panelArrows.set(cfg.id, arrow);
    }
  }

  private drawCenterTextStack() {
    this.centerTitle = this.add
      .text(WIDTH / 2, 268, "", {
        fontFamily: FONTS.display,
        fontSize: FONT_SIZES.title,
        color: COLORS.fg,
      })
      .setOrigin(0.5);

    this.centerSubtitle = this.add
      .text(WIDTH / 2, 322, "", {
        fontFamily: FONTS.mono,
        fontSize: FONT_SIZES.body,
        color: COLORS.muted,
      })
      .setOrigin(0.5);

    this.centerHint = this.add
      .text(WIDTH / 2, HEIGHT - 14, "", {
        fontFamily: FONTS.mono,
        fontSize: FONT_SIZES.small,
        color: COLORS.muted,
      })
      .setOrigin(0.5, 1);
  }

  private drawTopLabels() {
    this.scoreLabel = this.add.text(20, 14, "", {
      fontFamily: FONTS.mono,
      fontSize: FONT_SIZES.ui,
      color: COLORS.muted,
    });
    this.bestLabel = this.add
      .text(WIDTH - 20, 14, "", {
        fontFamily: FONTS.mono,
        fontSize: FONT_SIZES.ui,
        color: COLORS.muted,
      })
      .setOrigin(1, 0);
  }

  private refreshTopLabels() {
    this.scoreLabel.setText(`FASE  ${String(this.currentPhase).padStart(2, "0")}`);
    this.bestLabel.setText(`MELHOR  ${String(this.bestPhase).padStart(2, "0")}`);
  }

  private showIdleScreen() {
    this.state = "idle";
    this.currentPhase = 1;
    this.sequence = [];
    this.refreshTopLabels();
    this.centerTitle.setText("SEQUENCE");
    this.centerSubtitle.setText(
      this.bestPhase > 0 ? `melhor: fase ${this.bestPhase}` : "memorize e repita",
    );
    this.centerHint.setText("ESPAÇO para começar  ·  K para screenshot");
  }

  private loadBest(): number {
    try {
      const raw = localStorage.getItem(HIGHSCORE_KEY);
      const n = raw ? parseInt(raw, 10) : 0;
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
      return 0;
    }
  }

  private saveBest() {
    try {
      localStorage.setItem(HIGHSCORE_KEY, String(this.bestPhase));
    } catch {
      // localStorage indisponível — ignora
    }
  }
}
