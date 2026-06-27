// Gjenbrukbare UI-byggeklosser. Store knapper og trykkflater for mobil
// (spec kap. 31-32). All tekst hentes via lokalisering av kalleren.
import Phaser from 'phaser';

export interface ButtonOpts {
  width?: number;
  height?: number;
  fontSize?: number;
  bg?: number;
  bgHover?: number;
  color?: string;
}

export class Button extends Phaser.GameObjects.Container {
  private rect: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;
  private enabled = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    onClick: () => void,
    opts: ButtonOpts = {},
  ) {
    super(scene, x, y);
    const w = opts.width ?? 240;
    const h = opts.height ?? 56;
    const bg = opts.bg ?? 0x2a3550;
    const bgHover = opts.bgHover ?? 0x3a4a70;
    this.rect = scene.add
      .rectangle(0, 0, w, h, bg)
      .setStrokeStyle(2, 0x6c7fb0)
      .setInteractive({ useHandCursor: true });
    this.label = scene.add
      .text(0, 0, text, {
        fontSize: `${opts.fontSize ?? 22}px`,
        color: opts.color ?? '#ffffff',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: w - 16 },
      })
      .setOrigin(0.5);
    this.add([this.rect, this.label]);

    // Klikk utløses ved SLIPP, og avbrytes hvis fingeren dro (så drag-scrolling
    // i menyer ikke trigger knapper ved et uhell).
    let downX = 0;
    let downY = 0;
    let pressed = false;
    this.rect.on('pointerover', () => this.enabled && this.rect.setFillStyle(bgHover));
    this.rect.on('pointerout', () => {
      pressed = false;
      if (this.enabled) this.rect.setFillStyle(bg);
    });
    this.rect.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (!this.enabled) return;
      pressed = true;
      downX = ptr.x;
      downY = ptr.y;
    });
    this.rect.on('pointerup', (ptr: Phaser.Input.Pointer) => {
      if (!this.enabled || !pressed) return;
      pressed = false;
      if (Math.abs(ptr.x - downX) > 12 || Math.abs(ptr.y - downY) > 12) return; // var en drag
      scene.tweens.add({ targets: this, scale: 0.95, duration: 60, yoyo: true });
      onClick();
    });
    scene.add.existing(this);
  }

  setText(text: string): this {
    this.label.setText(text);
    return this;
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.setAlpha(enabled ? 1 : 0.45);
    return this;
  }
}

export function panel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha = 0.92,
): Phaser.GameObjects.Rectangle {
  return scene.add
    .rectangle(x, y, w, h, 0x12161f, alpha)
    .setStrokeStyle(2, 0x3a4a70)
    .setOrigin(0.5);
}

export function heading(scene: Phaser.Scene, x: number, y: number, text: string): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, { fontSize: '28px', color: '#ffffff', fontStyle: 'bold' })
    .setOrigin(0.5);
}

export function label(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size = 18,
  color = '#cfd6e6',
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, { fontSize: `${size}px`, color });
}
