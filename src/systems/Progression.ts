// Monsterprogresjon (spec kap. 18). Felles formel for erfaring som kreves
// for neste nivå, brukt både av Companion-logikken og monstermenyen.
export function xpForNext(level: number): number {
  return level * 15;
}
