// Oppdragslogikk (spec kap. 27, 34). Beregner framdrift for visning i
// oppdragsloggen og HUD-sporeren. Selve framdriften lagres i profilen.
import type { ProfileData, QuestDef } from '../types';
import { Data } from '../core/DataManager';

export interface QuestStatus {
  quest: QuestDef;
  current: number;
  total: number;
  complete: boolean;
}

function total(quest: QuestDef): number {
  const o = quest.objective;
  if (o.type === 'defeat' || o.type === 'collect') return o.count;
  return 1;
}

export const QuestSystem = {
  status(profile: ProfileData, quest: QuestDef): QuestStatus {
    const prog = profile.questProgress[quest.id];
    const tot = total(quest);
    const complete = !!prog?.complete;
    const current = complete ? tot : Math.min(prog?.progress ?? 0, tot);
    return { quest, current, total: tot, complete };
  },

  all(profile: ProfileData): QuestStatus[] {
    return [...Data.quests.values()].map((q) => this.status(profile, q));
  },

  /** Første uavsluttede oppdrag, for HUD-sporeren. */
  firstActive(profile: ProfileData): QuestStatus | null {
    return this.all(profile).find((s) => !s.complete) ?? null;
  },

  label(s: QuestStatus): string {
    return `${s.current}/${s.total}`;
  },
};
