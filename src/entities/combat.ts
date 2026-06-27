// Felles kamptyper og grensesnitt. Holder entiteter løst koblet fra WorldScene.
import type { ElementId, AttackPattern } from '../types';

export type Faction = 'player' | 'ally' | 'enemy';

export interface AttackRequest {
  x: number;
  y: number;
  faction: Faction;
  damage: number;
  element?: ElementId;
  pattern: AttackPattern;
  /** retning (normalisert) for prosjektiler og rekkevidde-plassering */
  dirX: number;
  dirY: number;
  range: number;
  /** treffradius for nærkamp / prosjektil */
  radius: number;
}

/** Alt som kan ta skade. Returnerer faktisk påført skade (0 hvis immun/død). */
export interface Damageable {
  takeDamage(amount: number, element?: ElementId): number;
  isAlive(): boolean;
  getElement(): ElementId | undefined;
  getArmor(): number;
  x: number;
  y: number;
}

/** Allierte (spiller + monstre) kan helbredes og buffes. */
export interface Ally extends Damageable {
  heal(amount: number): void;
  healthRatio(): number;
  applyBuff(amount: number, durationMs: number): void;
}

/** Grensesnittet entiteter bruker mot verdenen (implementeres av WorldScene). */
export interface IWorld {
  spawnAttack(req: AttackRequest): void;
  /** nærmeste levende fiende fra et punkt, innen maks rekkevidde */
  nearestEnemy(x: number, y: number, maxRange?: number): Damageable | null;
  /** alle levende fiender innen radius */
  enemiesInRadius(x: number, y: number, radius: number): Damageable[];
  /** den allierte (spiller/monster) med lavest HP-andel, for healere */
  lowestHealthAlly(x: number, y: number, maxRange: number): Ally | null;
  /** alle levende allierte innen radius, for support-buffs */
  alliesInRadius(x: number, y: number, radius: number): Ally[];
  /** spillerens posisjon */
  playerPos(): { x: number; y: number };
  /** beveger spilleren seg nå? (for fiender som aggroer på lyd) */
  playerMoving(): boolean;
  /**
   * Hvilken alliert en fiende ved (x,y) skal jage (spec kap. 16-17).
   * Tanks trekker mer aggro; en aktiv taunt overstyrer. Faller tilbake til
   * spilleren når ingen alliert er innen rekkevidde.
   */
  enemyTarget(x: number, y: number): { x: number; y: number };
  /** en tank registrerer at den trekker fiender til seg (taunt) */
  registerTaunt(ally: Ally, radius: number, durationMs: number): void;
  /** bosser tilkaller hjelpere (spec kap. 24) */
  summonMinions(speciesId: string, x: number, y: number, level: number, count: number): void;
}
