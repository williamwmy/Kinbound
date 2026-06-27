// Lagring & profiler (spec kap. 8, 30).
// Flere profiler kan eksistere på samme enhet, hver med egen lagring, monstre,
// utstyr og progresjon. Lagring skjer i localStorage.
import type { Appearance, ProfileData } from '../types';
import { Data } from '../core/DataManager';

const INDEX_KEY = 'kinbound.profiles';
const PROFILE_PREFIX = 'kinbound.profile.';
const ACTIVE_KEY = 'kinbound.active';

interface ProfileSummary {
  id: string;
  name: string;
}

function uid(): string {
  // Date.now/Math.random kan være sandboksbegrenset i enkelte kontekster,
  // men i nettleseren er de tilgjengelige. Fall tilbake til teller ved behov.
  try {
    return `p_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
  } catch {
    return `p_${Math.floor(performance.now()).toString(36)}`;
  }
}

class SaveManagerImpl {
  private activeId: string | null = null;
  private cache: ProfileData | null = null;

  // ---- profil-indeks -----------------------------------------------------
  listProfiles(): ProfileSummary[] {
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      return raw ? (JSON.parse(raw) as ProfileSummary[]) : [];
    } catch {
      return [];
    }
  }

  private writeIndex(list: ProfileSummary[]): void {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list));
  }

  hasProfiles(): boolean {
    return this.listProfiles().length > 0;
  }

  // ---- opprett ny profil -------------------------------------------------
  createProfile(name: string, appearance: Appearance, language: 'nb' | 'en'): ProfileData {
    const id = uid();
    const now = Date.now();
    // Startutstyr og første monster gis ikke automatisk - spilleren rekrutterer
    // sitt første monster (spec kap. 14-15). Starter med tresverd.
    const profile: ProfileData = {
      id,
      name: name.trim() || 'Hero',
      appearance,
      language,
      maxHp: 24,
      currentHp: 24,
      gold: 30,
      equippedWeapon: 'wooden_sword',
      equippedArmor: 'cloth_tunic',
      ownedWeapons: ['wooden_sword'],
      ownedArmor: ['cloth_tunic'],
      inventory: [{ id: 'health_potion', count: 3 }],
      monsters: [],
      activeTeam: [],
      teamSize: 1,
      currentZone: 'village',
      spawnX: 640,
      spawnY: 760,
      openedChests: [],
      clearedObstacles: [],
      clearedTerrain: [],
      solvedPuzzles: [],
      visitedZones: ['village'],
      unlockedDoors: [],
      victory: false,
      defeatedSpawns: {},
      questProgress: {},
      heartContainers: 0,
      buyback: [],
      createdAt: now,
      updatedAt: now,
      balanceV: 2,
    };
    this.persist(profile);
    const index = this.listProfiles();
    index.push({ id, name: profile.name });
    this.writeIndex(index);
    this.setActive(id);
    return profile;
  }

  deleteProfile(id: string): void {
    localStorage.removeItem(PROFILE_PREFIX + id);
    this.writeIndex(this.listProfiles().filter((p) => p.id !== id));
    if (this.activeId === id) {
      this.activeId = null;
      this.cache = null;
    }
  }

  // ---- aktiv profil ------------------------------------------------------
  setActive(id: string): ProfileData {
    const profile = this.loadProfile(id);
    this.migrate(profile);
    this.activeId = id;
    this.cache = profile;
    localStorage.setItem(ACTIVE_KEY, id);
    return profile;
  }

  /** Oppgrader eldre lagringer til ny balanse (høyere grunn-HP). */
  private migrate(profile: ProfileData): void {
    if ((profile.balanceV ?? 1) < 2) {
      // grunn-HP økte fra 12 til 24; løft eksisterende helter tilsvarende
      profile.maxHp += 12;
      profile.currentHp = Math.min(profile.maxHp, profile.currentHp + 12);
      profile.balanceV = 2;
      this.persist(profile);
    }
  }

  getActive(): ProfileData {
    if (!this.cache) {
      const id = this.activeId ?? localStorage.getItem(ACTIVE_KEY);
      if (!id) throw new Error('Ingen aktiv profil');
      return this.setActive(id);
    }
    return this.cache;
  }

  getActiveId(): string | null {
    return this.activeId ?? localStorage.getItem(ACTIVE_KEY);
  }

  hasActive(): boolean {
    const id = this.getActiveId();
    return !!id && !!localStorage.getItem(PROFILE_PREFIX + id);
  }

  private loadProfile(id: string): ProfileData {
    const raw = localStorage.getItem(PROFILE_PREFIX + id);
    if (!raw) throw new Error(`Fant ikke profil ${id}`);
    return JSON.parse(raw) as ProfileData;
  }

  // ---- lagring -----------------------------------------------------------
  private persist(profile: ProfileData): void {
    localStorage.setItem(PROFILE_PREFIX + profile.id, JSON.stringify(profile));
  }

  /** Automatisk lagring (spec kap. 30). */
  save(): void {
    if (!this.cache) return;
    this.cache.updatedAt = Date.now();
    this.persist(this.cache);
    // hold navn i indeks synkronisert
    const index = this.listProfiles();
    const entry = index.find((p) => p.id === this.cache!.id);
    if (entry && entry.name !== this.cache.name) {
      entry.name = this.cache.name;
      this.writeIndex(index);
    }
  }

  // ---- hjelpere for spillogikk ------------------------------------------
  /** Total maks HP inkludert hjertecontainere og rustningsbonus. */
  computeMaxHp(profile: ProfileData = this.getActive()): number {
    let hp = profile.maxHp;
    const armor = profile.equippedArmor ? Data.armor.get(profile.equippedArmor) : undefined;
    if (armor?.bonuses?.maxHp) hp += armor.bonuses.maxHp;
    return hp;
  }
}

export const SaveManager = new SaveManagerImpl();
