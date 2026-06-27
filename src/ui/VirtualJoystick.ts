// Virtuell joystick for venstre side (spec kap. 31). Emitterer 'ctrl:move'
// med en normalisert vektor. Fungerer både med touch og mus.
import Phaser from 'phaser';
import { EventBus } from '../core/EventBus';

export class VirtualJoystick {
  private base: Phaser.GameObjects.Arc;
  private thumb: Phaser.GameObjects.Arc;
  private pointerId: number | null = null;
  private radius: number;
  private originX: number;
  private originY: number;

  constructor(scene: Phaser.Scene, x: number, y: number, radius = 64) {
    this.radius = radius;
    this.originX = x;
    this.originY = y;
    this.base = scene.add
      .circle(x, y, radius, 0x223, 0.35)
      .setScrollFactor(0)
      .setDepth(100)
      .setStrokeStyle(2, 0x6c7fb0, 0.6);
    this.thumb = scene.add
      .circle(x, y, radius * 0.45, 0x6c7fb0, 0.8)
      .setScrollFactor(0)
      .setDepth(101);

    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
  }

  private isLeftHalf(p: Phaser.Input.Pointer): boolean {
    return p.x < this.base.scene.scale.width * 0.5;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.pointerId !== null || !this.isLeftHalf(p)) return;
    this.pointerId = p.id;
    // flytt joysticken dit fingeren treffer
    this.originX = p.x;
    this.originY = p.y;
    this.base.setPosition(p.x, p.y);
    this.thumb.setPosition(p.x, p.y);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    const dx = p.x - this.originX;
    const dy = p.y - this.originY;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, this.radius);
    const ang = Math.atan2(dy, dx);
    this.thumb.setPosition(
      this.originX + Math.cos(ang) * clamped,
      this.originY + Math.sin(ang) * clamped,
    );
    const mag = clamped / this.radius;
    // dødsone
    if (mag < 0.15) EventBus.emit('ctrl:move', { x: 0, y: 0 });
    else EventBus.emit('ctrl:move', { x: Math.cos(ang) * mag, y: Math.sin(ang) * mag });
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    this.pointerId = null;
    this.base.setPosition(this.originX, this.originY);
    this.thumb.setPosition(this.originX, this.originY);
    EventBus.emit('ctrl:move', { x: 0, y: 0 });
  }
}
