// Rekruttering (spec kap. 14). Når et monster har lite HP kan spilleren
// forsøke å bli venn med det. Kun ett individ av hver art kan eies.
import type { ProfileData, OwnedMonster } from '../types';
import { Data } from '../core/DataManager';

export const RecruitmentSystem = {
  alreadyOwns(profile: ProfileData, speciesId: string): boolean {
    return profile.monsters.some((m) => m.speciesId === speciesId);
  },

  /** Lager et nytt eid monster og legger det til profilen. */
  recruit(profile: ProfileData, speciesId: string): OwnedMonster {
    const def = Data.monster(speciesId);
    const form = def.forms[0];
    const owned: OwnedMonster = {
      speciesId,
      level: 1,
      xp: 0,
      evolved: false,
      currentHp: form.stats.maxHp,
      currentMana: form.stats.maxMana ?? 0,
      fainted: false,
    };
    profile.monsters.push(owned);
    // legg automatisk til i laget hvis det er plass (spec kap. 15)
    if (profile.activeTeam.length < profile.teamSize) {
      profile.activeTeam.push(speciesId);
    }
    return owned;
  },
};
