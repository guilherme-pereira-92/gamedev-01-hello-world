import Phaser from "phaser";

const WIDTH = 800;
const HEIGHT = 600;
const PLAYER_SIZE = 40;
const SPEED = 250;

class HelloScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;

  constructor() {
    super("hello");
  }

  create() {
    this.add.text(16, 16, "WASD ou setas para mover", {
      color: "#94a3b8",
      fontFamily: "monospace",
      fontSize: "14px",
    });

    this.player = this.add.rectangle(WIDTH / 2, HEIGHT / 2, PLAYER_SIZE, PLAYER_SIZE, 0x3b82f6);

    const keyboard = this.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.wasd = keyboard.addKeys("W,A,S,D") as typeof this.wasd;
  }

  update(_time: number, delta: number) {
    const dt = delta / 1000;

    let dx = 0;
    let dy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) dx -= 1;
    if (this.cursors.right.isDown || this.wasd.D.isDown) dx += 1;
    if (this.cursors.up.isDown || this.wasd.W.isDown) dy -= 1;
    if (this.cursors.down.isDown || this.wasd.S.isDown) dy += 1;

    if (dx !== 0 && dy !== 0) {
      const inv = Math.SQRT1_2;
      dx *= inv;
      dy *= inv;
    }

    this.player.x += dx * SPEED * dt;
    this.player.y += dy * SPEED * dt;

    const half = PLAYER_SIZE / 2;
    this.player.x = Phaser.Math.Clamp(this.player.x, half, WIDTH - half);
    this.player.y = Phaser.Math.Clamp(this.player.y, half, HEIGHT - half);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: "#0f172a",
  parent: "game",
  scene: HelloScene,
});
