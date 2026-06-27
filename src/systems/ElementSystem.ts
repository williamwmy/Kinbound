// Elementsystem (spec kap. 22).
// Elementer påvirker skade og motstand. Enkel sterk/svak-modell.
import type { ElementId } from '../types';
import { Data } from '../core/DataManager';

const STRONG_MULT = 1.5;
const WEAK_MULT = 0.66;

// Rustning gir prosentvis skadereduksjon (vanlig spillprinsipp) i stedet for
// flat fratrekk. Flat fratrekk gjorde svake våpen ubrukelige mot pansrede
// fiender (8 skade - 7 rustning = 1). Med armor/(armor+K) skalerer det jevnt.
const ARMOR_K = 18;

/** Endelig skade etter prosentvis rustningsreduksjon. Minst 1 ved treff. */
export function mitigate(raw: number, armor: number): number {
  const reduction = armor > 0 ? armor / (armor + ARMOR_K) : 0;
  return Math.max(1, Math.round(raw * (1 - reduction)));
}

/**
 * Skademultiplikator når et angrep av `attacker`-element treffer en
 * forsvarer av `defender`-element.
 */
export function elementMultiplier(
  attacker: ElementId | undefined,
  defender: ElementId | undefined,
): number {
  if (!attacker || !defender) return 1;
  const atk = Data.elements.get(attacker);
  if (!atk) return 1;
  if (atk.strongAgainst.includes(defender)) return STRONG_MULT;
  if (atk.weakAgainst.includes(defender)) return WEAK_MULT;
  return 1;
}

/** Endelig skade etter element og rustning. Minst 1 ved treff. */
export function computeDamage(
  baseDamage: number,
  attackerElement: ElementId | undefined,
  defenderElement: ElementId | undefined,
  defenderArmor: number,
  resistElement?: ElementId,
): number {
  let dmg = baseDamage * elementMultiplier(attackerElement, defenderElement);
  // rustning som motstår angrepets element halverer skaden
  if (resistElement && attackerElement === resistElement) dmg *= 0.5;
  return mitigate(dmg, defenderArmor);
}
