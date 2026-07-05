// Spilleren (spec kap. 7). Har HP, våpen, rustning og styres direkte.
// Ingen levels - blir sterkere via hjertecontainere, våpen og rustning.
import Phaser from 'phaser';
import type { ProfileData, ElementId } from '../types';
import { Data } from '../core/DataManager';
import { SaveManager } from '../save/SaveManager';
import { EventBus, Events } from '../core/EventBus';
import type { Ally, IWorld } from './combat';
import { mitigate } from '../systems/ElementSystem';

interface Buff {
  stat: 'damage' | 'speed' | 'armor';
  amount: number;
  until: number;
}

export class Player extends Phaser.Physics.Arcade.Sprite implements Ally {
  private profile: ProfileData;
  private world: IWorld;
  private lastAttack = 0;
  private dirX = 0;
  private dirY = 1;
  private buffs: Buff[] = [];
  private invulnUntil = 0;
  private lungeUntil = 0;
  private inputX = 0;
  private inputY = 0;

  constructor(scene: Phaser.Scene, world: IWorld, x: number, y: number, textureKey: string) {
    super(scene, x, y, textureKey);
    this.world = world;
    this.profile = SaveManager.getActive();
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    this.setScale(1.6); // større figur (spec kap. 4: store sprites)
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(20, 26).setOffset(4, 9);
    this.setDepth(10);
  }

  // --- bevegelse ----------------------------------------------------------
  setMoveInput(vx: number, vy: number): void {
    // rå input lagres FØR utfalls-guarden: dytting av steiner leser intensjonen,
    // ikke faktisk fart (fysikken nuller farten mot statiske kropper)
    this.inputX = vx;
    this.inputY = vy;
    // under et angreps-utfall bærer utfallsfarten (kampfølelse)
    if (this.scene.time.now < this.lungeUntil) return;
    const speed = this.moveSpeed();
    this.setVelocity(vx * speed, vy * speed);
    if (vx !== 0 || vy !== 0) {
      const len = Math.hypot(vx, vy) || 1;
      this.dirX = vx / len;
      this.dirY = vy / len;
    }
  }

  private moveSpeed(): number {
    let s = 140;
    const armor = this.profile.equippedArmor
      ? Data.armor.get(this.profile.equippedArmor)
      : undefined;
    if (armor?.bonuses?.moveSpeed) s += armor.bonuses.moveSpeed;
    s += this.buffTotal('speed');
    return s;
  }

  // --- angrep -------------------------------------------------------------
  tryAttack(time: number): void {
    const weapon = Data.weapon(this.profile.equippedWeapon);
    if (time - this.lastAttack < weapon.attackSpeed) return;
    this.lastAttack = time;
    const dmg = weapon.damage + this.buffTotal('damage');
    const body = this.body as Phaser.Physics.Arcade.Body;
    const standing = Math.abs(body.velocity.x) < 10 && Math.abs(body.velocity.y) < 10;
    // sikte-hjelp: står du stille, vend deg automatisk mot nærmeste fiende
    // (mobil-vennlig - du slipper å finsikte med joysticken)
    const aimRange = Math.max(weapon.range * 2.2, 140);
    const near = this.world.nearestEnemy(this.x, this.y, aimRange);
    if (standing && near) {
      const len = Math.hypot(near.x - this.x, near.y - this.y) || 1;
      this.dirX = (near.x - this.x) / len;
      this.dirY = (near.y - this.y) / len;
    }
    // nærkamps-utfall: et lite byks fremover gir slagene tyngde og driv
    const melee = weapon.pattern !== 'projectile' && weapon.pattern !== 'spellburst';
    if (melee) {
      this.setVelocity(this.dirX * 240, this.dirY * 240);
      this.lungeUntil = time + 110;
    }
    this.world.spawnAttack({
      x: this.x + this.dirX * (weapon.range * 0.5),
      y: this.y + this.dirY * (weapon.range * 0.5),
      faction: 'player',
      damage: dmg,
      element: weapon.element,
      pattern: weapon.pattern,
      dirX: this.dirX,
      dirY: this.dirY,
      range: weapon.range,
      radius: weapon.pattern === 'projectile' || weapon.pattern === 'spellburst' ? 8 : weapon.range * 0.5,
    });
  }

  // --- skade & helse ------------------------------------------------------
  takeDamage(amount: number, element?: ElementId): number {
    const now = this.scene.time.now;
    if (now < this.invulnUntil || !this.isAlive()) return 0;
    const armor = this.getArmor();
    let resist: ElementId | undefined;
    const armorDef = this.profile.equippedArmor ? Data.armor.get(this.profile.equippedArmor) : undefined;
    if (armorDef?.bonuses?.resistElement) resist = armorDef.bonuses.resistElement;
    let raw = amount;
    if (resist && element === resist) raw *= 0.5;
    const dmg = mitigate(raw, armor);
    this.profile.currentHp = Math.max(0, this.profile.currentHp - dmg);
    this.invulnUntil = now + 600;
    this.flashHit();
    EventBus.emit(Events.PlayerHpChanged, this.profile.currentHp, SaveManager.computeMaxHp());
    if (this.profile.currentHp <= 0) EventBus.emit(Events.PlayerDied);
    return dmg;
  }

  heal(amount: number): void {
    const max = SaveManager.computeMaxHp();
    this.profile.currentHp = Math.min(max, this.profile.currentHp + amount);
    EventBus.emit(Events.PlayerHpChanged, this.profile.currentHp, max);
  }

  healthRatio(): number {
    return this.profile.currentHp / Math.max(1, SaveManager.computeMaxHp());
  }

  applyBuff(amount: number, durationMs: number): void {
    this.addBuff('damage', amount, durationMs);
  }

  private flashHit(): void {
    this.setTint(0xff5555);
    this.scene.time.delayedCall(120, () => this.clearTint());
  }

  isAlive(): boolean {
    return this.profile.currentHp > 0;
  }

  getElement(): ElementId | undefined {
    return Data.weapon(this.profile.equippedWeapon).element;
  }

  getArmor(): number {
    let a = 0;
    const armorDef = this.profile.equippedArmor ? Data.armor.get(this.profile.equippedArmor) : undefined;
    if (armorDef) a += armorDef.armor;
    a += this.buffTotal('armor');
    return a;
  }

  // --- buffs --------------------------------------------------------------
  addBuff(stat: 'damage' | 'speed' | 'armor', amount: number, durationMs: number): void {
    this.buffs.push({ stat, amount, until: this.scene.time.now + durationMs });
  }

  private buffTotal(stat: 'damage' | 'speed' | 'armor'): number {
    const now = this.scene.time.now;
    return this.buffs
      .filter((b) => b.stat === stat && b.until > now)
      .reduce((sum, b) => sum + b.amount, 0);
  }

  update(): void {
    const now = this.scene.time.now;
    if (this.buffs.some((b) => b.until <= now)) {
      this.buffs = this.buffs.filter((b) => b.until > now);
    }
  }

  getDir(): { x: number; y: number } {
    return { x: this.dirX, y: this.dirY };
  }

  /** Rå bevegelses-input (intensjon), uavhengig av fysikk-separasjon. */
  getMoveInput(): { x: number; y: number } {
    return { x: this.inputX, y: this.inputY };
  }
}
