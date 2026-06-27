// Utforskningsevner (spec kap. 21). Hver art har én unik evne som åpner
// nye områder. Evnene knyttes til monstrene i det aktive laget.
import type { ProfileData, ExplorationAbilityId } from '../types';
import { Data } from '../core/DataManager';

export const ExplorationSystem = {
  /** Alle utforskningsevner laget rår over akkurat nå. */
  teamAbilities(profile: ProfileData): Set<ExplorationAbilityId> {
    const set = new Set<ExplorationAbilityId>();
    for (const id of profile.activeTeam) {
      const owned = profile.monsters.find((m) => m.speciesId === id);
      if (owned && !owned.fainted) {
        set.add(Data.monster(id).explorationAbility);
      }
    }
    return set;
  },

  hasAbility(profile: ProfileData, ability: ExplorationAbilityId): boolean {
    return this.teamAbilities(profile).has(ability);
  },

  /** Hvilket monster i laget gir evnen (for melding "X brukte Y"). */
  providerOf(profile: ProfileData, ability: ExplorationAbilityId): string | null {
    for (const id of profile.activeTeam) {
      if (Data.monster(id).explorationAbility === ability) return id;
    }
    return null;
  },
};
