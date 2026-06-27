// Kinbound - sentrale typedefinisjoner.
// Disse speiler den datadrevne strukturen (se spec.md kap. 34).
// Alt innhold lastes fra JSON, så typene her er kontrakten mellom data og motor.

// ---------------------------------------------------------------------------
// Elementer (spec kap. 22)
// ---------------------------------------------------------------------------
export type ElementId =
  | 'fire'
  | 'water'
  | 'earth'
  | 'nature'
  | 'wind'
  | 'lightning'
  | 'light'
  | 'dark';

export interface ElementDef {
  id: ElementId;
  /** lokaliseringsnøkkel for visningsnavn */
  nameKey: string;
  color: number;
  /** elementer denne er sterk mot (gir økt skade) */
  strongAgainst: ElementId[];
  /** elementer denne er svak mot (gir redusert skade) */
  weakAgainst: ElementId[];
}

// ---------------------------------------------------------------------------
// Våpen (spec kap. 10)
// ---------------------------------------------------------------------------
export type WeaponType = 'sword' | 'axe' | 'hammer' | 'spear' | 'bow' | 'staff';

/** Angrepsmønster avgjør hvordan treffsonen genereres. */
export type AttackPattern = 'slash' | 'thrust' | 'smash' | 'projectile' | 'spellburst';

export interface WeaponDef {
  id: string;
  type: WeaponType;
  nameKey: string;
  descKey: string;
  damage: number;
  /** rekkevidde i piksler */
  range: number;
  /** angrepshastighet: tid mellom angrep i ms */
  attackSpeed: number;
  pattern: AttackPattern;
  element?: ElementId;
  /** kjøpspris i butikk (0 = ikke i butikk) */
  price: number;
  rarity: 'common' | 'rare';
}

// ---------------------------------------------------------------------------
// Rustning (spec kap. 11)
// ---------------------------------------------------------------------------
/** Hvordan rustningen vises på spillerspriten (spec kap. 8 + 11). */
export interface ArmorLook {
  type: 'cloth' | 'light' | 'plate';
  /** hovedfarge på platen/vesten */
  color?: number;
  /** kantfarge (gull/sølv-detaljer) */
  trim?: number;
  /** sjelden: gir krone/horn-detaljer */
  rare?: boolean;
}

export interface ArmorDef {
  id: string;
  nameKey: string;
  descKey: string;
  armor: number;
  look?: ArmorLook;
  /** valgfrie spesialbonuser, f.eks. { hp: 2, element: 'fire' } */
  bonuses?: Partial<{
    maxHp: number;
    moveSpeed: number;
    resistElement: ElementId;
  }>;
  price: number;
  rarity: 'common' | 'rare';
}

// ---------------------------------------------------------------------------
// Items / forbruksvarer (spec kap. 12)
// ---------------------------------------------------------------------------
export type ItemKind = 'heart_container' | 'consumable' | 'key' | 'team_slot';

export type ConsumableEffect =
  | { type: 'heal'; amount: number }
  | { type: 'heal_monster'; amount: number }
  | { type: 'restore_mana'; amount: number }
  | { type: 'buff'; stat: 'damage' | 'speed' | 'armor'; amount: number; durationMs: number };

export interface ItemDef {
  id: string;
  kind: ItemKind;
  nameKey: string;
  descKey: string;
  effect?: ConsumableEffect;
  price: number;
  stackable: boolean;
}

// ---------------------------------------------------------------------------
// Monstre (spec kap. 13-21)
// ---------------------------------------------------------------------------
export type MonsterRole = 'tank' | 'bruiser' | 'mage' | 'ranged' | 'healer' | 'support';
export type ResourceSystem = 'cooldown' | 'mana';

// Alle 12 arter har én unik utforskningsevne (spec kap. 21).
// Ingen evner deles mellom monstre.
export type ExplorationAbilityId =
  | 'smash_rocks'
  | 'light_torches'
  | 'reveal_walls'
  | 'activate_machines'
  | 'build_bridges'
  | 'dig_tunnels'
  | 'jump_water'
  | 'find_treasure'
  | 'freeze_water'
  | 'grow_vines'
  | 'illuminate_dark'
  | 'charge_runes';

export interface MonsterStats {
  maxHp: number;
  damage: number;
  /** angrepsrekkevidde i piksler */
  attackRange: number;
  /** angrep per sekund styres via attackCooldown ms */
  attackCooldown: number;
  moveSpeed: number;
  armor: number;
  maxMana?: number;
}

export interface MonsterForm {
  /** sprite-nøkkel for denne formen */
  sprite: string;
  nameKey: string;
  stats: MonsterStats;
}

export interface MonsterSpecialAbility {
  nameKey: string;
  descKey: string;
  /** ressurskostnad (mana) eller cooldown i ms */
  cost: number;
  cooldownMs: number;
  kind: 'heal_ally' | 'aoe_damage' | 'buff_ally' | 'debuff_enemy' | 'shield_self' | 'taunt';
  power: number;
  /** rekkevidde/radius i piksler */
  radius: number;
}

export interface MonsterDef {
  id: string;
  nameKey: string;
  descKey: string;
  role: MonsterRole;
  element: ElementId;
  resourceSystem: ResourceSystem;
  explorationAbility: ExplorationAbilityId;
  special: MonsterSpecialAbility;
  /** xp som kreves for å evolusjonere */
  evolveLevel: number;
  /** xp gitt når dette monsteret beseires som fiende */
  xpReward: number;
  /** passiv: kan gjenopplive spilleren én gang ved å ofre seg (spec kap. 29) */
  revivePassive?: boolean;
  /** [grunnform, evolvert form] - alle arter har én evolusjon (spec kap. 13) */
  forms: [MonsterForm, MonsterForm];
}

// ---------------------------------------------------------------------------
// NPC-er & dialog (spec kap. 27)
// ---------------------------------------------------------------------------
export type NpcRole = 'shop' | 'healer' | 'smith' | 'questgiver' | 'villager';

export interface NpcDef {
  id: string;
  nameKey: string;
  role: NpcRole;
  sprite: string;
  /** dialog-id som starter ved interaksjon */
  dialogue: string;
  /** for butikker: liste over vare-id-er som selges */
  shopItems?: string[];
}

export interface DialogueLine {
  /** lokaliseringsnøkkel for replikken */
  textKey: string;
}

export interface DialogueDef {
  id: string;
  lines: DialogueLine[];
}

// ---------------------------------------------------------------------------
// Oppdrag (spec kap. 34)
// ---------------------------------------------------------------------------
export interface QuestDef {
  id: string;
  titleKey: string;
  descKey: string;
  giver: string;
  objective:
    | { type: 'defeat'; target: string; count: number }
    | { type: 'recruit'; target: string }
    | { type: 'reach_zone'; zone: string }
    | { type: 'collect'; item: string; count: number };
  reward: { gold?: number; item?: string };
}

// ---------------------------------------------------------------------------
// Soner & verden (spec kap. 25-26)
// ---------------------------------------------------------------------------
/**
 * Bevegelses- og oppdagelsesmønster for en fiende (spec kap. 17).
 * - sight: oppdager spilleren innen `range` (synsfelt)
 * - sound: oppdager spilleren KUN når hen beveger seg, innen `range` (hørsel)
 * - always: jakter alltid innen `range` (aggressiv)
 * patrol gir en fast rute den følger til den oppdager noe; guard holder den
 * nær spawn-punktet og trekker den tilbake hvis den lokkes for langt (leash).
 */
export interface EnemyAI {
  aggro?: 'sight' | 'sound' | 'always';
  range?: number;
  patrol?: { x: number; y: number }[];
  guard?: boolean;
  leash?: number;
}

export interface SpawnPoint {
  monster: string;
  x: number;
  y: number;
  /** monster-level for fienden */
  level: number;
  /** true = boss/miniboss */
  boss?: boolean;
  /** sjeldent utstyr som slippes når bossen beseires (spec kap. 28) */
  loot?: { id: string; kind: 'item' | 'weapon' | 'armor' };
  /** bevegelses-/oppdagelsesmønster (spec kap. 17) */
  ai?: EnemyAI;
}

export interface NpcPlacement {
  npc: string;
  x: number;
  y: number;
}

export interface ZoneExit {
  /** id på sone det fører til */
  to: string;
  x: number;
  y: number;
  /** spawn-posisjon i målsonen */
  spawnX: number;
  spawnY: number;
  /** utforskningsevne som kreves for å passere */
  requires?: ExplorationAbilityId;
}

export interface ChestDef {
  id: string;
  x: number;
  y: number;
  /** item-id eller weapon/armor-id */
  loot: string;
  lootKind: 'item' | 'weapon' | 'armor';
  requires?: ExplorationAbilityId;
  /** item-id som kreves og forbrukes for å åpne (f.eks. dungeon_key) */
  requiresItem?: string;
}

/** Hindringer i verden som krever en utforskningsevne for å fjerne/aktivere. */
export interface ObstacleDef {
  id: string;
  x: number;
  y: number;
  requires: ExplorationAbilityId;
  /** lokaliseringsnøkkel som beskriver hindringen */
  hintKey: string;
}

/**
 * Ufremkommelig terreng (vann/lava/kløft) som blokkerer bevegelse, men kan
 * krysses med riktig utforskningsevne (spec kap. 21, 23). Plasseres i åpne
 * områder slik at man alltid kan gå rundt - aldri en obligatorisk sperre.
 */
export interface TerrainRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  type: 'water' | 'lava' | 'gap';
  requires: ExplorationAbilityId;
}

export interface ZoneDef {
  id: string;
  nameKey: string;
  /** tema/grafisk identitet (spec kap. 4) */
  theme: 'village' | 'forest' | 'mountain' | 'swamp' | 'volcano' | 'snow' | 'ruins' | 'castle';
  /** bakgrunnsfarge (placeholder for tilemap) */
  bgColor: number;
  music: string;
  width: number;
  height: number;
  /** true = trygg sone (landsby) med autosave */
  safe: boolean;
  npcs: NpcPlacement[];
  spawns: SpawnPoint[];
  chests: ChestDef[];
  obstacles: ObstacleDef[];
  /** ufremkommelig terreng som kan krysses med en evne (valgfritt) */
  terrain?: TerrainRegion[];
  exits: ZoneExit[];
  /** dungeon i sonen (spec kap. 26) */
  dungeon?: string;
  /** puslespill i sonen (spec kap. 26) */
  puzzles?: PuzzleDef[];
  /** rutenett-koordinat på verdenskartet (spec kap. 32); kun hovedsoner */
  mapX?: number;
  mapY?: number;
}

/** Én rune-bryter i et puslespill. Kan kreve en utforskningsevne å aktivere. */
export interface PuzzleSwitch {
  x: number;
  y: number;
  /** valgfri evne som kreves for å aktivere (f.eks. light_torches) */
  requires?: ExplorationAbilityId;
}

/**
 * Puslespill i en dungeon (spec kap. 26): aktiver alle rune-bryterne for å åpne
 * en port som sperrer veien (typisk til boss eller skattekiste). Løsningen lagres.
 */
export interface PuzzleDef {
  id: string;
  type: 'switches';
  switches: PuzzleSwitch[];
  /** porten/forseglingen som åpnes når alle bryterne er aktive */
  gate: { x: number; y: number; w: number; h: number };
  /** belønningskiste som avdekkes når puslespillet løses */
  reward?: ChestDef;
  /** lokaliseringsnøkkel for et hint om puslespillet */
  hintKey?: string;
}

// ---------------------------------------------------------------------------
// Profil & lagring (spec kap. 8, 30)
// ---------------------------------------------------------------------------
export interface Appearance {
  hairStyle: number;
  hairColor: number;
  skinColor: number;
  clothColor: number;
}

export interface OwnedMonster {
  /** art-id (kun ett individ per art - spec kap. 14) */
  speciesId: string;
  level: number;
  xp: number;
  /** evolvert? */
  evolved: boolean;
  currentHp: number;
  currentMana: number;
  /** besvimt (0 hp) - må helbredes (spec kap. 19) */
  fainted: boolean;
}

export interface InventoryEntry {
  id: string;
  count: number;
}

export interface ProfileData {
  id: string;
  name: string;
  appearance: Appearance;
  language: 'nb' | 'en';
  // Progresjon (spec kap. 7, 9)
  maxHp: number;
  currentHp: number;
  gold: number;
  equippedWeapon: string;
  equippedArmor: string | null;
  ownedWeapons: string[];
  ownedArmor: string[];
  inventory: InventoryEntry[];
  monsters: OwnedMonster[];
  /** aktive monstre i laget, art-id-er (spec kap. 15) */
  activeTeam: string[];
  /** maks lagstørrelse, vokser gjennom spillet 1 -> 2 -> 3 */
  teamSize: number;
  currentZone: string;
  spawnX: number;
  spawnY: number;
  /** id-er på åpnede kister */
  openedChests: string[];
  /** id-er på hindringer som er ryddet permanent (spec kap. 21) */
  clearedObstacles?: string[];
  /** nøkler (`sone:Tindex`) på terreng-krysninger som er bygd permanent */
  clearedTerrain?: string[];
  /** id-er på puslespill som er løst permanent (spec kap. 26) */
  solvedPuzzles?: string[];
  /** id-er på soner spilleren har besøkt (avdekker verdenskartet, spec kap. 32) */
  visitedZones?: string[];
  /** spawn-nøkkel (`sone#index`) -> tidspunkt beseiret, for respawn-nedkjøling */
  defeatedSpawns?: Record<string, number>;
  /** quest-id -> framdrift */
  questProgress: Record<string, { complete: boolean; progress: number }>;
  /** antall hjertecontainere funnet */
  heartContainers: number;
  /** nylig solgte ting som kan kjøpes tilbake (for feilsalg, spec kap. 28) */
  buyback?: { id: string; kind: 'item' | 'weapon' | 'armor'; price: number }[];
  createdAt: number;
  updatedAt: number;
  /** balanseversjon for migrering av eldre lagringer (udefinert = v1) */
  balanceV?: number;
}
