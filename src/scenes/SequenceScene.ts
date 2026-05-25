import Phaser from "phaser";
import { COLORS, COLOR_HEX, TEXT_PRESETS, FONTS } from "../theme";
import { playTone, unlockAudio } from "../audio";
import { takeScreenshot } from "../screenshot";
import { drawDiagonalScanlines, createPulsingDot, addCornerLabel } from "../ui";
import { isTouchDevice } from "../input";

type PanelId = "up" | "right" | "down" | "left";
type GameState = "idle" | "show" | "input" | "wrong" | "gameover";

const HIGHSCORE_KEY = "gamedev-01-sequence-best-phase";
const SEQUENCE_BASE_LENGTH = 3;

interface PanelLayout {
  id: PanelId;
  cx: number;
  cy: number;
  width: number;
  height: number;
  arrow: string;
  frequency: number;
}

const PANEL_ARROWS: Record<PanelId, string> = { up: "↑", down: "↓", left: "←", right: "→" };
const PANEL_FREQS: Record<PanelId, number> = { up: 392.0, right: 523.25, down: 587.33, left: 659.25 };

const phaseSequenceLength = (phase: number) => SEQUENCE_BASE_LENGTH + (phase - 1);
const phaseFlashMs = (phase: number) => Math.max(140, 380 - (phase - 1) * 18);
const phaseGapMs = (phase: number) => Math.max(60, 170 - (phase - 1) * 10);

export class SequenceScene extends Phaser.Scene {
  private bg!: Phaser.GameObjects.Rectangle;
  private scanlines!: Phaser.GameObjects.Graphics;
  private panelBgs = new Map<PanelId, Phaser.GameObjects.Rectangle>();
  private panelArrows = new Map<PanelId, Phaser.GameObjects.Text>();

  private centerLabel!: Phaser.GameObjects.Text;
  private centerTitle!: Phaser.GameObjects.Text;
  private centerSubtitle!: Phaser.GameObjects.Text;
  private bottomHint!: Phaser.GameObjects.Text;
  private statusLabel!: Phaser.GameObjects.Text;
  private dot!: { dot: Phaser.GameObjects.Arc; glow: Phaser.GameObjects.Arc };
  private bottomLeftLabel!: Phaser.GameObjects.Text;
  private bottomRightLabel!: Phaser.GameObjects.Text;
  private topLeftAccent!: Phaser.GameObjects.Text | null;
  private topLeftMain!: Phaser.GameObjects.Text;

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

    const W = this.scale.width;
    const H = this.scale.height;

    this.bg = this.add.rectangle(W / 2, H / 2, W, H, COLOR_HEX.bg);
    this.scanlines = drawDiagonalScanlines(this, W, H, 15, 0.045);

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

    kb.on("keydown", unlockAudio);
    this.input.on("pointerdown", unlockAudio);

    this.input.on("pointerdown", (_pointer: Phaser.Input.Pointer, targets: unknown[]) => {
      if (targets.length > 0) return;
      if (this.state === "idle" || this.state === "gameover") this.startGame();
    });

    this.refreshStatus();
    this.showIdleScreen();

    this.scale.on("resize", this.onResize, this);
    this.events.on("shutdown", () => this.scale.off("resize", this.onResize, this));
  }

  // Layout: cross com 4 painéis ao redor do centro, escalado pra viewport.
  // - Portrait (H>W): painéis verticais (↑↓) maiores, horizontais (←→) menores
  // - Landscape (W>H): inverso
  private computePanelLayouts(): PanelLayout[] {
    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const cy = H / 2;

    // Panel sizes adaptados ao menor eixo do viewport
    const baseSize = Math.min(W, H);
    const verticalPanelW = Math.min(W * 0.5, baseSize * 0.55);
    const verticalPanelH = Math.min(H * 0.18, baseSize * 0.28);
    const horizontalPanelW = Math.min(W * 0.22, baseSize * 0.3);
    const horizontalPanelH = Math.min(H * 0.32, baseSize * 0.42);

    // Espaçamento do centro: distance do centro até cada painel
    const verticalDistance = H * 0.32;
    const horizontalDistance = W * 0.32;

    return [
      { id: "up", cx, cy: cy - verticalDistance, width: verticalPanelW, height: verticalPanelH, arrow: PANEL_ARROWS.up, frequency: PANEL_FREQS.up },
      { id: "right", cx: cx + horizontalDistance, cy, width: horizontalPanelW, height: horizontalPanelH, arrow: PANEL_ARROWS.right, frequency: PANEL_FREQS.right },
      { id: "down", cx, cy: cy + verticalDistance, width: verticalPanelW, height: verticalPanelH, arrow: PANEL_ARROWS.down, frequency: PANEL_FREQS.down },
      { id: "left", cx: cx - horizontalDistance, cy, width: horizontalPanelW, height: horizontalPanelH, arrow: PANEL_ARROWS.left, frequency: PANEL_FREQS.left },
    ];
  }

  private drawPanels() {
    // Destroy existing if recreating on resize
    this.panelBgs.forEach((r) => r.destroy());
    this.panelArrows.forEach((t) => t.destroy());
    this.panelBgs.clear();
    this.panelArrows.clear();

    const layouts = this.computePanelLayouts();
    const arrowSize = Math.max(48, Math.min(120, this.scale.width * 0.1));

    for (const cfg of layouts) {
      const bg = this.add.rectangle(cfg.cx, cfg.cy, cfg.width, cfg.height, COLOR_HEX.bgSoft);
      bg.setStrokeStyle(1, COLOR_HEX.border, 1);
      this.panelBgs.set(cfg.id, bg);

      bg.setInteractive({ useHandCursor: true });
      bg.on("pointerdown", () => {
        if (this.state === "input") this.handlePlayerInput(cfg.id);
      });

      const arrow = this.add
        .text(cfg.cx, cfg.cy, cfg.arrow, {
          fontFamily: FONTS.display,
          fontSize: `${arrowSize}px`,
          color: COLORS.muted,
          fontStyle: "500",
        })
        .setOrigin(0.5)
        .setAlpha(0.6);
      this.panelArrows.set(cfg.id, arrow);
    }
  }

  private drawCenterText() {
    const W = this.scale.width;
    const H = this.scale.height;

    if (this.centerLabel) this.centerLabel.destroy();
    if (this.centerTitle) this.centerTitle.destroy();
    if (this.centerSubtitle) this.centerSubtitle.destroy();
    if (this.bottomHint) this.bottomHint.destroy();

    this.centerLabel = this.add
      .text(W / 2, H / 2 - 50, "", { ...TEXT_PRESETS.monoLabel, color: COLORS.muted })
      .setOrigin(0.5);

    this.centerTitle = this.add
      .text(W / 2, H / 2, "", TEXT_PRESETS.heroOutline)
      .setOrigin(0.5)
      .setFontSize(this.titleSize());

    this.centerSubtitle = this.add
      .text(W / 2, H / 2 + 48, "", TEXT_PRESETS.body)
      .setOrigin(0.5);

    this.bottomHint = this.add
      .text(W / 2, H - 18, "", TEXT_PRESETS.hint)
      .setOrigin(0.5, 1);
  }

  private titleSize(): string {
    const base = Math.min(this.scale.width, this.scale.height);
    return `${Math.max(48, Math.min(110, Math.floor(base * 0.16)))}px`;
  }

  private setHeroTitle(text: string) {
    this.centerTitle.setText(text).setFontSize(this.titleSize());
  }

  private drawChrome() {
    const W = this.scale.width;
    const H = this.scale.height;

    if (this.topLeftAccent) this.topLeftAccent.destroy();
    if (this.topLeftMain) this.topLeftMain.destroy();
    if (this.statusLabel) this.statusLabel.destroy();
    if (this.bottomLeftLabel) this.bottomLeftLabel.destroy();
    if (this.bottomRightLabel) this.bottomRightLabel.destroy();
    if (this.dot) { this.dot.dot.destroy(); this.dot.glow.destroy(); }

    const labels = addCornerLabel(this, 22, 22, "/ 01", "SEQUENCE", false);
    this.topLeftAccent = labels.accentText;
    this.topLeftMain = labels.mainText;

    this.dot = createPulsingDot(this, W - 22 - 4, 22 + 6, 4, COLOR_HEX.accent);
    this.statusLabel = this.add
      .text(W - 38, 22, "", TEXT_PRESETS.monoLabel)
      .setOrigin(1, 0);

    this.bottomLeftLabel = this.add.text(22, H - 22, "GAMEDEV.01", TEXT_PRESETS.hint).setOrigin(0, 1);
    this.bottomRightLabel = this.add.text(W - 22, H - 22, "BRICOLAGE · GEIST", TEXT_PRESETS.hint).setOrigin(1, 1);
  }

  private onResize(gameSize: Phaser.Structs.Size) {
    const W = gameSize.width;
    const H = gameSize.height;
    this.bg.setPosition(W / 2, H / 2).setSize(W, H);
    this.scanlines.destroy();
    this.scanlines = drawDiagonalScanlines(this, W, H, 15, 0.045);
    this.drawPanels();
    this.drawCenterText();
    this.drawChrome();
    this.refreshStatus();
    // Re-display current screen
    if (this.state === "idle") this.showIdleScreen();
    else if (this.state === "gameover") {
      this.centerLabel.setText("GAME OVER");
      this.setHeroTitle("FIM");
      this.bottomHint.setText(isTouchDevice() ? "TOQUE PRA TENTAR DE NOVO" : "R TENTAR DE NOVO");
    }
  }

  update() {
    const justDown = Phaser.Input.Keyboard.JustDown;
    if (justDown(this.keys.K)) takeScreenshot(this.game, "gamedev-01-sequence");
    if (this.state === "idle" && justDown(this.keys.SPACE)) { this.startGame(); return; }
    if (this.state === "gameover" && justDown(this.keys.R)) { this.startGame(); return; }
    if (this.state === "input") {
      let pressed: PanelId | null = null;
      if (justDown(this.keys.UP) || justDown(this.keys.W)) pressed = "up";
      else if (justDown(this.keys.DOWN) || justDown(this.keys.S)) pressed = "down";
      else if (justDown(this.keys.LEFT) || justDown(this.keys.A)) pressed = "left";
      else if (justDown(this.keys.RIGHT) || justDown(this.keys.D)) pressed = "right";
      if (pressed) this.handlePlayerInput(pressed);
    }
  }

  private refreshStatus() {
    const phase = String(this.currentPhase).padStart(2, "0");
    const best = String(this.bestPhase).padStart(2, "0");
    this.statusLabel.setText(`FASE ${phase} — MELHOR ${best}`);
  }

  private showIdleScreen() {
    this.state = "idle";
    this.currentPhase = 1;
    this.sequence = [];
    this.refreshStatus();
    this.centerLabel.setText("/ JORNADA GAMEDEV");
    this.setHeroTitle("SEQUENCE");
    this.centerSubtitle.setText(
      this.bestPhase > 0
        ? `melhor: fase ${this.bestPhase}    ·    memorize e repita`
        : "memorize a sequência    ·    repita pra avançar",
    );
    this.bottomHint.setText(
      isTouchDevice()
        ? "TOQUE PRA COMEÇAR  ·  TOQUE OS PAINÉIS"
        : "ESPAÇO COMEÇAR  ·  ↑ ↓ ← →  ·  K SCREENSHOT",
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
    this.setHeroTitle(String(this.currentPhase).padStart(2, "0"));
    this.centerSubtitle.setText("memorize");
    this.bottomHint.setText("AGUARDE A SEQUÊNCIA");
    this.playSequence();
  }

  private randomPanelId(): PanelId {
    const ids: PanelId[] = ["up", "right", "down", "left"];
    return ids[Phaser.Math.Between(0, ids.length - 1)];
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
        : "REPITA USANDO ↑ ↓ ← → OU W A S D",
    );
  }

  private handlePlayerInput(pressed: PanelId) {
    this.flashPanel(pressed, 180);
    const expected = this.sequence[this.playerIndex];
    if (pressed !== expected) { this.fail(); return; }
    this.playerIndex++;
    if (this.playerIndex >= this.sequence.length) this.succeed();
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
    this.time.delayedCall(700, () => { this.currentPhase++; this.beginPhase(); });
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
      this.setHeroTitle("FIM");
      const summary = completed > 0
        ? `parou na fase ${failedAtPhase}  ·  completou ${completed}`
        : `parou na fase ${failedAtPhase}`;
      this.centerSubtitle.setText(summary);
      this.bottomHint.setText(isTouchDevice() ? "TOQUE PRA TENTAR DE NOVO" : "R TENTAR DE NOVO  ·  K SCREENSHOT");
    });
  }

  private flashPanel(id: PanelId, durationMs: number) {
    const cfg = this.computePanelLayouts().find((p) => p.id === id)!;
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

  private loadBest(): number {
    try {
      const raw = localStorage.getItem(HIGHSCORE_KEY);
      const n = raw ? parseInt(raw, 10) : 0;
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch { return 0; }
  }

  private saveBest() {
    try { localStorage.setItem(HIGHSCORE_KEY, String(this.bestPhase)); } catch {}
  }
}
