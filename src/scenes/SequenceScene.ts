import Phaser from "phaser";
import { COLORS, COLOR_HEX, TEXT_PRESETS, FONTS } from "../theme";
import { playTone, unlockAudio } from "../audio";
import { takeScreenshot } from "../screenshot";
import { drawDiagonalScanlines, createPulsingDot, addCornerLabel } from "../ui";
import { isTouchDevice } from "../input";

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
  frequency: number;
}

const PANELS: PanelConfig[] = [
  { id: "up",    cx: 400, cy: 108, width: 260, height: 158, arrow: "↑", frequency: 392.0 },
  { id: "right", cx: 670, cy: 300, width: 180, height: 158, arrow: "→", frequency: 523.25 },
  { id: "down",  cx: 400, cy: 492, width: 260, height: 158, arrow: "↓", frequency: 587.33 },
  { id: "left",  cx: 130, cy: 300, width: 180, height: 158, arrow: "←", frequency: 659.25 },
];

const phaseSequenceLength = (phase: number) => SEQUENCE_BASE_LENGTH + (phase - 1);
const phaseFlashMs = (phase: number) => Math.max(140, 380 - (phase - 1) * 18);
const phaseGapMs = (phase: number) => Math.max(60, 170 - (phase - 1) * 10);

export class SequenceScene extends Phaser.Scene {
  private panelBgs = new Map<PanelId, Phaser.GameObjects.Rectangle>();
  private panelArrows = new Map<PanelId, Phaser.GameObjects.Text>();

  private centerLabel!: Phaser.GameObjects.Text;
  private centerTitle!: Phaser.GameObjects.Text;
  private centerSubtitle!: Phaser.GameObjects.Text;
  private bottomHint!: Phaser.GameObjects.Text;

  private statusLabel!: Phaser.GameObjects.Text;

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

    this.drawBackground();
    this.drawPanels();
    this.drawCenterText();
    this.drawChrome();

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

    // AudioContext só pode ser destravado por gesto do usuário (autoplay policy).
    kb.on("keydown", unlockAudio);
    this.input.on("pointerdown", unlockAudio);

    // Touch: tap em qualquer lugar fora dos painéis = começar / reiniciar
    this.input.on("pointerdown", (_pointer: Phaser.Input.Pointer, targets: unknown[]) => {
      if (targets.length > 0) return; // se acertou painel, deixa o panel handler tratar
      if (this.state === "idle") this.startGame();
      else if (this.state === "gameover") this.startGame();
    });

    this.refreshStatus();
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

  // ---------- desenho ----------

  private drawBackground() {
    // bg sólido + scanlines diagonais sutis
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLOR_HEX.bg);
    drawDiagonalScanlines(this, WIDTH, HEIGHT, 15, 0.045);
  }

  private drawPanels() {
    for (const cfg of PANELS) {
      const bg = this.add.rectangle(cfg.cx, cfg.cy, cfg.width, cfg.height, COLOR_HEX.bgSoft);
      bg.setStrokeStyle(1, COLOR_HEX.border, 1);
      this.panelBgs.set(cfg.id, bg);

      // Mobile/desktop: painéis são tappáveis. Em mobile é a forma principal
      // de input; em desktop é alternativa às setas/WASD.
      bg.setInteractive({ useHandCursor: true });
      bg.on("pointerdown", () => {
        if (this.state === "input") this.handlePlayerInput(cfg.id);
      });

      const arrow = this.add
        .text(cfg.cx, cfg.cy, cfg.arrow, {
          fontFamily: FONTS.display,
          fontSize: "96px",
          color: COLORS.muted,
          fontStyle: "500",
        })
        .setOrigin(0.5)
        .setAlpha(0.6);
      this.panelArrows.set(cfg.id, arrow);
    }
  }

  private drawCenterText() {
    this.centerLabel = this.add
      .text(WIDTH / 2, 244, "", { ...TEXT_PRESETS.monoLabel, color: COLORS.muted })
      .setOrigin(0.5);

    this.centerTitle = this.add
      .text(WIDTH / 2, 296, "", TEXT_PRESETS.heroOutline)
      .setOrigin(0.5);

    this.centerSubtitle = this.add
      .text(WIDTH / 2, 358, "", TEXT_PRESETS.body)
      .setOrigin(0.5);

    this.bottomHint = this.add
      .text(WIDTH / 2, HEIGHT - 14, "", TEXT_PRESETS.hint)
      .setOrigin(0.5, 1);
  }

  private setHeroTitle(text: string, sizePx: number) {
    this.centerTitle.setFontSize(`${sizePx}px`);
    this.centerTitle.setText(text);
  }

  private drawChrome() {
    // Top-left: "/ 01" accent + "SEQUENCE" muted
    addCornerLabel(this, 22, 22, "/ 01", "SEQUENCE", false);

    // Top-right: pulsing dot + status label
    createPulsingDot(this, WIDTH - 22 - 4, 22 + 6, 4, COLOR_HEX.accent);
    this.statusLabel = this.add
      .text(WIDTH - 38, 22, "", TEXT_PRESETS.monoLabel)
      .setOrigin(1, 0);

    // Bottom-left version label
    this.add.text(22, HEIGHT - 22, "GAMEDEV.01", { ...TEXT_PRESETS.hint, color: COLORS.muted }).setOrigin(0, 1);
    // Bottom-right
    this.add.text(WIDTH - 22, HEIGHT - 22, "BRICOLAGE · GEIST", { ...TEXT_PRESETS.hint, color: COLORS.muted }).setOrigin(1, 1);
  }

  private refreshStatus() {
    const phase = String(this.currentPhase).padStart(2, "0");
    const best = String(this.bestPhase).padStart(2, "0");
    this.statusLabel.setText(`FASE ${phase} — MELHOR ${best}`);
  }

  // ---------- estados ----------

  private showIdleScreen() {
    this.state = "idle";
    this.currentPhase = 1;
    this.sequence = [];
    this.refreshStatus();
    this.centerLabel.setText("/ JORNADA GAMEDEV");
    this.setHeroTitle("SEQUENCE", 56);
    this.centerSubtitle.setText(
      this.bestPhase > 0
        ? `melhor: fase ${this.bestPhase}    ·    memorize e repita`
        : "memorize a sequência    ·    repita pra avançar",
    );
    this.bottomHint.setText(
      isTouchDevice()
        ? "TOQUE PRA COMEÇAR    ·    TOQUE OS PAINÉIS"
        : "ESPAÇO COMEÇAR    ·    ↑ ↓ ← →    ·    K SCREENSHOT",
    );
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
    this.refreshStatus();

    this.centerLabel.setText("FASE");
    this.setHeroTitle(String(this.currentPhase).padStart(2, "0"), 128);
    this.centerSubtitle.setText("memorize");
    this.bottomHint.setText("AGUARDE A SEQUÊNCIA");

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
    this.bottomHint.setText(
      isTouchDevice()
        ? "TOQUE OS PAINÉIS NA MESMA ORDEM"
        : "REPITA USANDO  ↑  ↓  ←  →    OU    W  A  S  D",
    );
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
    this.refreshStatus();

    this.state = "show";
    this.centerSubtitle.setText("certo");
    playTone(880, 110, "triangle", 0.13);
    this.time.delayedCall(110, () => playTone(1175, 160, "triangle", 0.13));

    this.time.delayedCall(700, () => {
      this.currentPhase++;
      this.beginPhase();
    });
  }

  private fail() {
    this.state = "wrong";
    const failedAtPhase = this.currentPhase;
    const completed = failedAtPhase - 1;

    playTone(170, 220, "sawtooth", 0.17);
    this.time.delayedCall(110, () => playTone(108, 380, "sawtooth", 0.15));

    this.cameras.main.shake(200, 0.006);

    this.time.delayedCall(900, () => {
      this.state = "gameover";
      this.centerLabel.setText("GAME OVER");
      this.setHeroTitle("FIM", 120);
      const summary = completed > 0
        ? `parou na fase ${failedAtPhase}    ·    completou ${completed}`
        : `parou na fase ${failedAtPhase}`;
      this.centerSubtitle.setText(summary);
      this.bottomHint.setText(
        isTouchDevice()
          ? "TOQUE PRA TENTAR DE NOVO"
          : "R TENTAR DE NOVO    ·    K SCREENSHOT",
      );
    });
  }

  private flashPanel(id: PanelId, durationMs: number) {
    const cfg = PANELS.find((p) => p.id === id)!;
    const bg = this.panelBgs.get(id)!;
    const arrow = this.panelArrows.get(id)!;

    bg.setStrokeStyle(2, COLOR_HEX.accent, 1);
    arrow.setColor(COLORS.accent);
    arrow.setAlpha(1);

    playTone(cfg.frequency, durationMs, "sine", 0.14);

    this.time.delayedCall(durationMs, () => {
      bg.setStrokeStyle(1, COLOR_HEX.border, 1);
      arrow.setColor(COLORS.muted);
      arrow.setAlpha(0.6);
    });
  }

  // ---------- persistência ----------

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
      // ignorar
    }
  }
}
