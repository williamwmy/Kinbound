// DataManager (spec kap. 34).
// Laster alle datafiler (JSON) og gir typet oppslag. Spillet er datadrevet:
// nye monstre, soner, våpen osv. legges til ved å redigere JSON - ikke motoren.
import type {
  MonsterDef,
  WeaponDef,
  ArmorDef,
  ItemDef,
  NpcDef,
  ZoneDef,
  QuestDef,
  DialogueDef,
  ElementDef,
  ElementId,
} from '../types';

import elementsData from '../data/elements.json';
import monstersData from '../data/monsters.json';
import weaponsData from '../data/weapons.json';
import armorData from '../data/armor.json';
import itemsData from '../data/items.json';
import npcsData from '../data/npcs.json';
import zonesData from '../data/zones.json';
import questsData from '../data/quests.json';
import dialoguesData from '../data/dialogues.json';

function index<T extends { id: string }>(arr: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const item of arr) m.set(item.id, item);
  return m;
}

class DataManagerImpl {
  readonly elements = index(elementsData as ElementDef[]);
  readonly monsters = index(monstersData as MonsterDef[]);
  readonly weapons = index(weaponsData as WeaponDef[]);
  readonly armor = index(armorData as ArmorDef[]);
  readonly items = index(itemsData as ItemDef[]);
  readonly npcs = index(npcsData as NpcDef[]);
  readonly zones = index(zonesData as ZoneDef[]);
  readonly quests = index(questsData as QuestDef[]);
  readonly dialogues = index(dialoguesData as DialogueDef[]);

  monster(id: string): MonsterDef {
    const m = this.monsters.get(id);
    if (!m) throw new Error(`Ukjent monster: ${id}`);
    return m;
  }
  weapon(id: string): WeaponDef {
    const w = this.weapons.get(id);
    if (!w) throw new Error(`Ukjent våpen: ${id}`);
    return w;
  }
  armorDef(id: string): ArmorDef {
    const a = this.armor.get(id);
    if (!a) throw new Error(`Ukjent rustning: ${id}`);
    return a;
  }
  item(id: string): ItemDef {
    const i = this.items.get(id);
    if (!i) throw new Error(`Ukjent item: ${id}`);
    return i;
  }
  npc(id: string): NpcDef {
    const n = this.npcs.get(id);
    if (!n) throw new Error(`Ukjent NPC: ${id}`);
    return n;
  }
  zone(id: string): ZoneDef {
    const z = this.zones.get(id);
    if (!z) throw new Error(`Ukjent sone: ${id}`);
    return z;
  }
  dialogue(id: string): DialogueDef {
    const d = this.dialogues.get(id);
    if (!d) throw new Error(`Ukjent dialog: ${id}`);
    return d;
  }
  element(id: ElementId): ElementDef {
    const e = this.elements.get(id);
    if (!e) throw new Error(`Ukjent element: ${id}`);
    return e;
  }

  allMonsters(): MonsterDef[] {
    return [...this.monsters.values()];
  }
}

export const Data = new DataManagerImpl();
