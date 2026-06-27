// Monsterprogresjon (spec kap. 18). Felles formel for erfaring som kreves
// for neste nivå, brukt både av Companion-logikken og monstermenyen.
export function xpForNext(level: number): number {
  return level * 15;
}

/** Nivåskalering av stats (må matche Companion.scaledStats). */
export function statScale(level: number): number {
  return 1 + (level - 1) * 0.08;
}

/** Et monsters faktiske maks-HP for et gitt nivå (basis-HP skalert). */
export function monsterMaxHp(baseMaxHp: number, level: number): number {
  return Math.round(baseMaxHp * statScale(level));
}
