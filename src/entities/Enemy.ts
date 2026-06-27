// Fiendemonster i verden. Vandrer, jager spilleren og angriper automatisk.
// Når HP er lav kan det rekrutteres (spec kap. 14). Bosser er kraftigere
// og bruker sin evolverte form (spec kap. 24).
import Phaser from 'phaser';
import type { MonsterDef, ElementId, SpawnPoint, EnemyAI } from '../types';
import type { Damageable, IWorld } from './combat';
import { mitigate } from '../systems/ElementSystem';

const RECRUIT_THRESHOLD = 0.3;

export class Enemy extends Phaser.Physics.Arcade.Sprite implements Damageable {
  readonly def: MonsterDef;
  readonly level: number;
  readonly isBoss: boolean;
  /** sjeldent utstyr bossen slipper (spec kap. 28) */
  readonly loot?: SpawnPoint['loot'];
  maxHp: number;
  hp: number;
  private dmg: number;
  private atkRange: number;
  private atkCd: number;
  private speed: number;
  private armor: number;
  private world: IWorld;
  private lastAttack = 0;
  private nextWander = 0;
  private wanderX = 0;
  private wanderY = 0;
  private slowUntil = 0;
  private hpBar: Phaser.GameObjects.Graphics;
  /** boss-fase 1..n, øker når HP krysser terskler */
  private phase = 1;
  // bossmekanikk (spec kap. 24): spesialangrep med varsel og svakt punkt
  private nextSpecial = 0;
  private vulnerableUntil = 0;
  private casting = false;
  // bevegelses-/oppdagelses-AI (spec kap. 17)
  private aggroMode: 'sight' | 'sound' | 'always';
  private detectRange: number;
  private patrol: { x: number; y: number }[];
  private patrolIdx = 0;
  private guard: boolean;
  private leash: number;
  private homeX: number;
  private homeY: number;
  private alerted = false;

  constructor(
    scene: Phaser.Scene,
    world: IWorld,
    x: number,
    y: number,
    def: MonsterDef,
    level: number,
    boss = false,
    loot?: SpawnPoint['loot'],
    ai?: EnemyAI,
  ) {
    const formIndex = boss ? 1 : 0;
    super(scene, x, y, def.forms[formIndex].sprite);
    this.def = def;
    this.world = world;
    this.level = level;
    this.isBoss = boss;
    this.loot = loot;
    const base = def.forms[formIndex].stats;
    // HP skalerer jevnt med nivå.
    const hpScale = 1 + (level - 1) * 0.12;
    // Skade har en MYK tidlig kurve: fienden er tunet for monster-mot-monster,
    // men treffer en skjør helt, så lave nivåer chipper i stedet for å one-shotte.
    // Bosser bruker evolvert form (høyere base), så multiplikatorene holdes lave.
    // L1 ≈ 0.35x, L3 ≈ 0.54x, L6 ≈ 0.83x, L10 ≈ 1.2x, L15 ≈ 1.68x, L20 ≈ 2.16x.
    const dmgScale = 0.35 + (level - 1) * 0.095;
    const bossScale = boss ? 2.0 : 1;
    this.maxHp = Math.round(base.maxHp * hpScale * bossScale);
    this.hp = this.maxHp;
    this.dmg = Math.round(base.damage * dmgScale * (boss ? 1.25 : 1));
    this.atkRange = base.attackRange;
    this.atkCd = base.attackCooldown;
    this.speed = base.moveSpeed * (boss ? 0.9 : 1);
    this.armor = base.armor;

    // AI-standarder: boss jakter alltid langt; vanlige ser deg på avstand.
    this.aggroMode = ai?.aggro ?? (boss ? 'always' : 'sight');
    this.detectRange = ai?.range ?? (boss ? 600 : 320);
    this.patrol = ai?.patrol ?? [];
    this.guard = ai?.guard ?? false;
    this.leash = ai?.leash ?? 360;
    this.homeX = x;
    this.homeY = y;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setScale(boss ? 2.1 : 1.5); // større figurer
    this.setCollideWorldBounds(true);
    this.setDepth(8);
    this.hpBar = scene.add.graphics().setDepth(9);
    if (boss) this.nextSpecial = scene.time.now + 3500;
  }

  getElement(): ElementId | undefined {
    return this.def.element;
  }
  getSpecies(): string {
    return this.def.id;
  }
  getArmor(): number {
    return this.armor;
  }
  isAlive(): boolean {
    return this.hp > 0 && this.active;
  }
  isRecruitable(): boolean {
    return this.isAlive() && this.hp / this.maxHp <= RECRUIT_THRESHOLD && !this.isBoss;
  }
  healthRatio(): number {
    return this.maxHp > 0 ? this.hp / this.maxHp : 0;
  }
  /** Bossens svake punkt er åpent (1.6x skade) - brukes til visuell feedback. */
  isVulnerable(): boolean {
    return this.isBoss && this.scene.time.now < this.vulnerableUntil;
  }

  takeDamage(amount: number, element?: ElementId): number {
    if (!this.isAlive()) return 0;
    // elementmultiplikator påføres i WorldScene; her trekkes rustning fra
    void element;
    // svakt punkt: bossen tar ekstra skade rett etter spesialangrepet (spec kap. 24)
    const weak = this.isBoss && this.scene.time.now < this.vulnerableUntil;
    let dmg = mitigate(amount, this.armor);
    if (weak) dmg = Math.round(dmg * 1.6);
    this.hp = Math.max(0, this.hp - dmg);
    this.setTint(weak ? 0xffe066 : 0xffffff);
    this.scene.time.delayedCall(80, () => this.active && this.clearTint());
    if (this.isBoss) this.updateBossPhase();
    return dmg;
  }

  private updateBossPhase(): void {
    const ratio = this.hp / this.maxHp;
    const newPhase = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
    if (newPhase > this.phase) {
      this.phase = newPhase;
      // ny fase: raseri som øker hastighet og tilkaller hjelpere (spec kap. 24)
      this.speed *= 1.15;
      this.atkCd = Math.max(400, this.atkCd * 0.85);
      this.nextSpecial = this.scene.time.now + 1200;
      this.world.summonMinions(this.def.id, this.x, this.y, Math.max(1, this.level - 3), 2);
    }
  }

  applySlow(percent: number, durationMs: number): void {
    this.slowUntil = this.scene.time.now + durationMs;
    this.slowFactor = 1 - percent / 100;
  }
  private slowFactor = 1;
  private knockedUntil = 0;

  /** Kast fienden bakover et øyeblikk (slagkraft). */
  applyKnockback(dx: number, dy: number, power: number): void {
    this.setVelocity(dx * power, dy * power);
    this.knockedUntil = this.scene.time.now + 130;
  }

  update(time: number): void {
    if (!this.isAlive()) return;
    // mens den er kastet bakover lar vi knockback-farten bære (slagkraft)
    if (time < this.knockedUntil) {
      this.drawHpBar();
      return;
    }
    // velg mål blant spiller + følgesvenner (tanks trekker aggro, spec kap. 16-17)
    const target = this.world.enemyTarget(this.x, this.y);
    const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    const homeDist = Phaser.Math.Distance.Between(this.x, this.y, this.homeX, this.homeY);
    const speed = time < this.slowUntil ? this.speed * this.slowFactor : this.speed;

    // oppdagelse etter AI-modus (spec kap. 17)
    if (!this.alerted && this.detects(dist)) this.alerted = true;
    // vakt slipper aggro hvis den lokkes for langt fra postområdet sitt
    if (this.alerted && this.guard && homeDist > this.leash) this.alerted = false;

    if (this.casting) {
      this.setVelocity(0, 0);
      this.drawHpBar();
      return;
    }
    if (this.isBoss && this.alerted && time > this.nextSpecial) {
      this.bossSpecial(time);
      this.drawHpBar();
      return;
    }

    if (this.alerted && !(this.guard && homeDist > this.leash)) {
      // jag målet
      const ang = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
      if (dist > this.atkRange * 0.8) {
        this.setVelocity(Math.cos(ang) * speed, Math.sin(ang) * speed);
      } else {
        this.setVelocity(0, 0);
        this.attack(time);
      }
    } else if (this.guard && homeDist > 24) {
      // vend tilbake til postområdet
      const ang = Phaser.Math.Angle.Between(this.x, this.y, this.homeX, this.homeY);
      this.setVelocity(Math.cos(ang) * speed * 0.7, Math.sin(ang) * speed * 0.7);
    } else if (this.patrol.length > 0) {
      this.patrolStep(speed);
    } else if (!this.guard) {
      // rolig vandring
      if (time > this.nextWander) {
        this.nextWander = time + 1500 + Math.floor(time % 1000);
        this.wanderX = Math.cos(time) * speed * 0.4;
        this.wanderY = Math.sin(time * 1.3) * speed * 0.4;
      }
      this.setVelocity(this.wanderX, this.wanderY);
    } else {
      this.setVelocity(0, 0); // vakt i ro på posten
    }
    this.drawHpBar();
  }

  /** Avgjør om fienden oppdager spilleren denne rammen, etter aggro-modus. */
  private detects(dist: number): boolean {
    if (dist <= 36) return true; // alltid oppdaget på kloss hold
    if (dist > this.detectRange) return false;
    if (this.aggroMode === 'sound') return this.world.playerMoving();
    return true; // sight / always
  }

  /** Følg den faste patruljeruten; gå til neste punkt når et er nådd. */
  private patrolStep(speed: number): void {
    const wp = this.patrol[this.patrolIdx];
    const d = Phaser.Math.Distance.Between(this.x, this.y, wp.x, wp.y);
    if (d < 16) {
      this.patrolIdx = (this.patrolIdx + 1) % this.patrol.length;
    } else {
      const ang = Phaser.Math.Angle.Between(this.x, this.y, wp.x, wp.y);
      this.setVelocity(Math.cos(ang) * speed * 0.55, Math.sin(ang) * speed * 0.55);
    }
  }

  private attack(time: number): void {
    if (time - this.lastAttack < this.atkCd) return;
    this.lastAttack = time;
    const target = this.world.enemyTarget(this.x, this.y);
    const ang = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
    this.world.spawnAttack({
      x: this.x + Math.cos(ang) * this.atkRange * 0.5,
      y: this.y + Math.sin(ang) * this.atkRange * 0.5,
      faction: 'enemy',
      damage: this.dmg,
      element: this.def.element,
      pattern: this.atkRange > 120 ? 'projectile' : 'slash',
      dirX: Math.cos(ang),
      dirY: Math.sin(ang),
      range: this.atkRange,
      radius: this.atkRange > 120 ? 8 : this.atkRange * 0.5,
    });
  }

  /**
   * Bossens spesialangrep (spec kap. 24): varsler en stor AoE rundt seg,
   * detonerer etter et øyeblikk, og er deretter sårbar (svakt punkt).
   */
  private bossSpecial(time: number): void {
    this.casting = true;
    const radius = 150;
    // varselring som vokser
    const ring = this.scene.add.circle(this.x, this.y, 20, 0xff3333, 0.18).setDepth(7);
    ring.setStrokeStyle(3, 0xff5555, 0.9);
    this.scene.tweens.add({
      targets: ring,
      radius,
      alpha: 0.35,
      duration: 650,
      onUpdate: () => ring.setPosition(this.x, this.y),
    });
    this.scene.time.delayedCall(680, () => {
      // sonen kan ha blitt revet ned (soneovergang) mens bossen ladet
      if (!this.active || !this.scene) return;
      ring.destroy();
      if (!this.isAlive()) {
        this.casting = false;
        return;
      }
      // detonasjon: AoE-treff rundt bossen
      this.world.spawnAttack({
        x: this.x,
        y: this.y,
        faction: 'enemy',
        damage: Math.round(this.dmg * 1.3),
        element: this.def.element,
        pattern: 'smash',
        dirX: 0,
        dirY: 0,
        range: radius,
        radius,
      });
      const burst = this.scene.add.circle(this.x, this.y, radius, 0xff6633, 0.3).setDepth(7);
      this.scene.tweens.add({ targets: burst, alpha: 0, duration: 300, onComplete: () => burst.destroy() });
      // svakt punkt åpnes
      this.vulnerableUntil = time + 1800;
      this.casting = false;
      // neste spesial raskere i senere faser
      this.nextSpecial = this.scene.time.now + Math.max(3800, 7000 - this.phase * 900);
    });
  }

  private drawHpBar(): void {
    const w = this.isBoss ? 48 : 28;
    const x = this.x - w / 2;
    const y = this.y - this.displayHeight / 2 - 8;
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.5).fillRect(x - 1, y - 1, w + 2, 5);
    const ratio = this.hp / this.maxHp;
    const weak = this.isBoss && this.scene.time.now < this.vulnerableUntil;
    const color = weak ? 0xffe066 : this.isRecruitable() ? 0x66ff99 : 0xff5566;
    this.hpBar.fillStyle(color, 1).fillRect(x, y, w * ratio, 3);
  }

  destroy(fromScene?: boolean): void {
    this.hpBar?.destroy();
    super.destroy(fromScene);
  }
}
