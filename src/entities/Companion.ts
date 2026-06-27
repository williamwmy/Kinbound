// Følgesvenn-monster (spec kap. 15-20). Styres automatisk av egen rolle-AI,
// følger spilleren, angriper fiender og bruker spesialevner. Bruker enten
// mana eller cooldown. Får erfaring, går opp i nivå og evolusjonerer.
import Phaser from 'phaser';
import type { OwnedMonster, MonsterDef, ElementId, MonsterStats } from '../types';
import { Data } from '../core/DataManager';
import { EventBus, Events } from '../core/EventBus';
import { t } from '../i18n/Localization';
import type { Ally, Damageable, IWorld } from './combat';
import { Enemy } from './Enemy';
import { xpForNext } from '../systems/Progression';
import { mitigate } from '../systems/ElementSystem';

export class Companion extends Phaser.Physics.Arcade.Sprite implements Ally {
  readonly owned: OwnedMonster;
  readonly def: MonsterDef;
  private world: IWorld;
  private stats: MonsterStats;
  maxHp: number;
  private lastAttack = 0;
  private lastSpecial = 0;
  private manaRegenAcc = 0;
  private buffUntil = 0;
  private buffAmount = 0;
  private hpBar: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, world: IWorld, x: number, y: number, owned: OwnedMonster) {
    const def = Data.monster(owned.speciesId);
    const form = def.forms[owned.evolved ? 1 : 0];
    super(scene, x, y, form.sprite);
    this.owned = owned;
    this.def = def;
    this.world = world;
    this.stats = this.scaledStats(form.stats, owned.level);
    this.maxHp = this.stats.maxHp;
    if (owned.currentHp <= 0) owned.currentHp = this.maxHp;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    this.setScale(1.5); // større figur
    this.setDepth(9);
    this.hpBar = scene.add.graphics().setDepth(9);
  }

  private scaledStats(base: MonsterStats, level: number): MonsterStats {
    const s = 1 + (level - 1) * 0.08;
    return {
      maxHp: Math.round(base.maxHp * s),
      damage: Math.round(base.damage * s),
      attackRange: base.attackRange,
      attackCooldown: base.attackCooldown,
      moveSpeed: base.moveSpeed,
      armor: base.armor,
      maxMana: base.maxMana,
    };
  }

  // --- Ally-grensesnitt ---------------------------------------------------
  getElement(): ElementId | undefined {
    return this.def.element;
  }
  getArmor(): number {
    return this.stats.armor;
  }
  isAlive(): boolean {
    return !this.owned.fainted && this.owned.currentHp > 0 && this.active;
  }
  healthRatio(): number {
    return this.owned.currentHp / this.maxHp;
  }

  takeDamage(amount: number, _element?: ElementId): number {
    void _element;
    if (!this.isAlive()) return 0;
    const dmg = mitigate(amount, this.stats.armor);
    this.owned.currentHp = Math.max(0, this.owned.currentHp - dmg);
    this.setTint(0xff8888);
    this.scene.time.delayedCall(100, () => this.active && this.clearTint());
    if (this.owned.currentHp <= 0) this.faint();
    return dmg;
  }

  heal(amount: number): void {
    if (this.owned.fainted) return;
    this.owned.currentHp = Math.min(this.maxHp, this.owned.currentHp + amount);
  }

  applyBuff(amount: number, durationMs: number): void {
    this.buffAmount = amount;
    this.buffUntil = this.scene.time.now + durationMs;
  }

  private faint(): void {
    // Ved 0 HP besvimer monsteret (spec kap. 19).
    this.owned.fainted = true;
    this.owned.currentHp = 0;
    EventBus.emit(Events.MonsterFainted, this.owned.speciesId);
    EventBus.emit(Events.Toast, t('combat.monster_fainted', { name: t(this.def.nameKey) }));
    this.setVisible(false);
    (this.body as Phaser.Physics.Arcade.Body).enable = false;
    this.hpBar.clear();
  }

  // --- erfaring & evolusjon (spec kap. 18) --------------------------------
  gainXp(amount: number): void {
    if (this.owned.fainted) return;
    this.owned.xp += amount;
    let need = xpForNext(this.owned.level);
    while (this.owned.xp >= need) {
      this.owned.xp -= need;
      this.owned.level += 1;
      this.recompute();
      need = xpForNext(this.owned.level);
    }
    if (!this.owned.evolved && this.owned.level >= this.def.evolveLevel) {
      this.evolve();
    }
  }

  private recompute(): void {
    const form = this.def.forms[this.owned.evolved ? 1 : 0];
    const prevMax = this.maxHp;
    this.stats = this.scaledStats(form.stats, this.owned.level);
    this.maxHp = this.stats.maxHp;
    // behold HP-andel ved oppgradering
    this.owned.currentHp = Math.round((this.owned.currentHp / prevMax) * this.maxHp);
  }

  private evolve(): void {
    const fromName = t(this.def.forms[0].nameKey);
    this.owned.evolved = true;
    this.recompute();
    this.owned.currentHp = this.maxHp;
    const form = this.def.forms[1];
    this.setTexture(form.sprite);
    this.evolveEffect();
    EventBus.emit(Events.MonsterEvolved, this.owned.speciesId);
    EventBus.emit(Events.Toast, t('combat.evolved', { from: fromName, to: t(form.nameKey) }));
  }

  /** Synlig evolusjons-animasjon (spec kap. 18): glød, skala-pop og glitter. */
  private evolveEffect(): void {
    const s = this.scene;
    if (!s) return;
    const baseScale = this.scaleX;
    // ekspanderende glød-ring
    const ring = s.add.circle(this.x, this.y, 46, 0xffffff, 0.5).setDepth(16).setScale(0.2);
    s.tweens.add({ targets: ring, scale: 1.5, alpha: 0, duration: 620, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
    // hvit «forvandlings»-blits + skala-pop, så tilbake til normal
    this.setTint(0xffffff);
    s.tweens.add({
      targets: this, scaleX: baseScale * 1.55, scaleY: baseScale * 1.55, duration: 220, yoyo: true, ease: 'Sine.InOut',
      onComplete: () => { if (this.scene) this.clearTint(); },
    });
    // glitter-burst (søtt/kawaii-tema)
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 * i) / 12 + Math.random() * 0.4;
      const dist = 30 + Math.random() * 24;
      const spark = s.add.circle(this.x, this.y, 2 + Math.random() * 2, 0xfff3a0, 1).setDepth(17);
      s.tweens.add({
        targets: spark, x: this.x + Math.cos(a) * dist, y: this.y + Math.sin(a) * dist - 10,
        alpha: 0, scale: 0.2, duration: 520 + Math.random() * 200, ease: 'Cubic.Out',
        onComplete: () => spark.destroy(),
      });
    }
  }

  // --- AI -----------------------------------------------------------------
  update(time: number, delta: number): void {
    if (!this.isAlive()) return;
    this.regenMana(delta);
    this.syncMana();

    const player = this.world.playerPos();
    // Hold laget samlet: engasjer kun fiender nær SPILLEREN (leash), ellers følg.
    let enemy = this.world.nearestEnemy(this.x, this.y, 360);
    if (enemy && Phaser.Math.Distance.Between(player.x, player.y, enemy.x, enemy.y) > 260) {
      enemy = null;
    }
    const speed = this.stats.moveSpeed;

    switch (this.def.role) {
      case 'tank':
      case 'bruiser':
        this.behaveMelee(enemy, player, speed, time);
        break;
      case 'mage':
      case 'ranged':
        this.behaveRanged(enemy, player, speed, time);
        break;
      case 'healer':
        this.behaveHealer(enemy, player, speed, time);
        break;
      case 'support':
        this.behaveSupport(enemy, player, speed, time);
        break;
    }
    this.trySpecial(time);
    this.drawHpBar();
  }

  private behaveMelee(enemy: Damageable | null, player: { x: number; y: number }, speed: number, time: number): void {
    if (enemy) {
      const d = Phaser.Math.Distance.Between(this.x, this.y, enemy.x, enemy.y);
      if (d > this.stats.attackRange * 0.8) this.moveToward(enemy.x, enemy.y, speed);
      else {
        this.setVelocity(0, 0);
        this.attack(enemy, time);
      }
    } else this.followPlayer(player, speed);
  }

  private behaveRanged(enemy: Damageable | null, player: { x: number; y: number }, speed: number, time: number): void {
    if (enemy) {
      const d = Phaser.Math.Distance.Between(this.x, this.y, enemy.x, enemy.y);
      if (d < this.stats.attackRange * 0.5) {
        // hold avstand (spec kap. 16-17)
        this.moveToward(2 * this.x - enemy.x, 2 * this.y - enemy.y, speed);
      } else if (d > this.stats.attackRange) {
        this.moveToward(enemy.x, enemy.y, speed * 0.6);
      } else {
        this.setVelocity(0, 0);
      }
      this.attack(enemy, time);
    } else this.followPlayer(player, speed);
  }

  private behaveHealer(enemy: Damageable | null, player: { x: number; y: number }, speed: number, time: number): void {
    this.followPlayer(player, speed);
    if (enemy && Phaser.Math.Distance.Between(this.x, this.y, enemy.x, enemy.y) <= this.stats.attackRange) {
      this.attack(enemy, time);
    }
  }

  private behaveSupport(enemy: Damageable | null, player: { x: number; y: number }, speed: number, time: number): void {
    this.followPlayer(player, speed);
    if (enemy && Phaser.Math.Distance.Between(this.x, this.y, enemy.x, enemy.y) <= this.stats.attackRange) {
      this.attack(enemy, time);
    }
  }

  private followPlayer(player: { x: number; y: number }, speed: number): void {
    const d = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    // raskere innhenting jo lengre bak den er, så laget holder seg samlet
    if (d > 56) this.moveToward(player.x, player.y, d > 180 ? speed * 2.4 : d > 100 ? speed * 1.5 : speed);
    else this.setVelocity(0, 0);
  }

  private moveToward(tx: number, ty: number, speed: number): void {
    const ang = Phaser.Math.Angle.Between(this.x, this.y, tx, ty);
    this.setVelocity(Math.cos(ang) * speed, Math.sin(ang) * speed);
  }

  private attack(target: Damageable, time: number): void {
    if (time - this.lastAttack < this.stats.attackCooldown) return;
    this.lastAttack = time;
    const buff = time < this.buffUntil ? this.buffAmount : 0;
    const ang = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
    const ranged = this.def.role === 'mage' || this.def.role === 'ranged';
    this.world.spawnAttack({
      x: this.x + Math.cos(ang) * this.stats.attackRange * 0.5,
      y: this.y + Math.sin(ang) * this.stats.attackRange * 0.5,
      faction: 'ally',
      damage: this.stats.damage + buff,
      element: this.def.element,
      pattern: ranged ? 'projectile' : 'slash',
      dirX: Math.cos(ang),
      dirY: Math.sin(ang),
      range: this.stats.attackRange,
      radius: ranged ? 8 : this.stats.attackRange * 0.5,
    });
  }

  // --- spesialevne --------------------------------------------------------
  private trySpecial(time: number): void {
    const sp = this.def.special;
    if (time - this.lastSpecial < sp.cooldownMs) return;
    if (this.def.resourceSystem === 'mana' && this.owned.currentMana < sp.cost) return;

    let used = false;
    switch (sp.kind) {
      case 'heal_ally': {
        const ally = this.world.lowestHealthAlly(this.x, this.y, sp.radius);
        if (ally && ally.healthRatio() < 0.85) {
          ally.heal(sp.power);
          this.spawnEffect(ally.x, ally.y, 0x66ff99, sp.radius * 0.4);
          used = true;
        }
        break;
      }
      case 'aoe_damage': {
        const foes = this.world.enemiesInRadius(this.x, this.y, sp.radius);
        if (foes.length > 0) {
          for (const f of foes) f.takeDamage(sp.power, this.def.element);
          this.spawnEffect(this.x, this.y, Data.element(this.def.element).color, sp.radius);
          used = true;
        }
        break;
      }
      case 'buff_ally': {
        const allies = this.world.alliesInRadius(this.x, this.y, sp.radius);
        if (allies.length > 0) {
          for (const a of allies) a.applyBuff(sp.power * 0.3, 6000);
          this.spawnEffect(this.x, this.y, 0xffffaa, sp.radius);
          used = true;
        }
        break;
      }
      case 'taunt': {
        // tank trekker fiender til seg (spec kap. 16-17) + en kort brems
        const foes = this.world.enemiesInRadius(this.x, this.y, sp.radius);
        if (foes.length > 0) {
          this.world.registerTaunt(this, sp.radius, 3500);
          for (const f of foes) if (f instanceof Enemy) f.applySlow(25, 1500);
          this.spawnEffect(this.x, this.y, 0x66ccff, sp.radius);
          used = true;
        }
        break;
      }
      case 'debuff_enemy': {
        // bremser nærliggende fiender (crowd control)
        const foes = this.world.enemiesInRadius(this.x, this.y, sp.radius);
        if (foes.length > 0) {
          for (const f of foes) if (f instanceof Enemy) f.applySlow(sp.power || 40, 3000);
          this.spawnEffect(this.x, this.y, 0x9b6ad0, sp.radius);
          used = true;
        }
        break;
      }
      case 'shield_self': {
        // midlertidig rustning + helse-skall
        this.heal(sp.power);
        this.spawnEffect(this.x, this.y, 0xaaaaff, 30);
        used = true;
        break;
      }
    }

    if (used) {
      this.lastSpecial = time;
      if (this.def.resourceSystem === 'mana') {
        this.owned.currentMana = Math.max(0, this.owned.currentMana - sp.cost);
      }
    }
  }

  private spawnEffect(x: number, y: number, color: number, radius: number): void {
    const fx = this.scene.add.circle(x, y, radius, color, 0.35).setDepth(7);
    this.scene.tweens.add({
      targets: fx,
      alpha: 0,
      scale: 1.4,
      duration: 350,
      onComplete: () => fx.destroy(),
    });
  }

  private regenMana(delta: number): void {
    if (this.def.resourceSystem !== 'mana' || !this.stats.maxMana) return;
    this.manaRegenAcc += delta;
    if (this.manaRegenAcc >= 1000) {
      const ticks = Math.floor(this.manaRegenAcc / 1000);
      this.manaRegenAcc -= ticks * 1000;
      this.owned.currentMana = Math.min(this.stats.maxMana, this.owned.currentMana + ticks * 5);
    }
  }

  private syncMana(): void {
    if (this.def.resourceSystem === 'mana' && this.stats.maxMana && this.owned.currentMana > this.stats.maxMana) {
      this.owned.currentMana = this.stats.maxMana;
    }
  }

  private drawHpBar(): void {
    const w = 26;
    const x = this.x - w / 2;
    const y = this.y - this.displayHeight / 2 - 7;
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.5).fillRect(x - 1, y - 1, w + 2, 4);
    this.hpBar.fillStyle(0x66ccff, 1).fillRect(x, y, w * this.healthRatio(), 2);
  }

  destroy(fromScene?: boolean): void {
    this.hpBar?.destroy();
    super.destroy(fromScene);
  }
}
