// Datadrevet integritetssjekk (spec kap. 34): kryss-sjekker alle referanser
// mellom JSON-filene slik at nytt innhold kan legges til uten å bryte motoren.
// Feiler (exit 1) hvis en monster-/sone-/loot-/evne-/lokaliserings-id ikke finnes.
//
//   node scripts/validate-data.mjs   (eller: npm run validate)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const monsters = load('src/data/monsters.json');
const weapons = load('src/data/weapons.json');
const armor = load('src/data/armor.json');
const items = load('src/data/items.json');
const npcs = load('src/data/npcs.json');
const zones = load('src/data/zones.json');
const quests = load('src/data/quests.json');
const dialogues = load('src/data/dialogues.json');
const elements = load('src/data/elements.json');
const nb = load('public/locales/nb.json');
const en = load('public/locales/en.json');

const errors = [];
const err = (ctx, msg) => errors.push(`[${ctx}] ${msg}`);

// --- id-sett ---------------------------------------------------------------
const ids = (arr) => new Set(arr.map((x) => x.id));
const monsterIds = ids(monsters);
const weaponIds = ids(weapons);
const armorIds = ids(armor);
const itemIds = ids(items);
const npcIds = ids(npcs);
const zoneIds = ids(zones);
const dialogueIds = ids(dialogues);
const elementIds = ids(elements);
const lootSets = { item: itemIds, weapon: weaponIds, armor: armorIds };

// Gyldige evner/roller er selve sannheten i lokaliseringen (hver må ha en etikett).
const validAbilities = new Set(
  Object.keys(nb).filter((k) => k.startsWith('ability_explore.')).map((k) => k.slice('ability_explore.'.length)),
);
const validRoles = new Set(Object.keys(nb).filter((k) => k.startsWith('role.')).map((k) => k.slice('role.'.length)));
const validWeaponTypes = new Set(['sword', 'axe', 'hammer', 'spear', 'bow', 'staff']);
const validResource = new Set(['cooldown', 'mana']);
const validAggro = new Set(['sight', 'sound', 'always']);
const validTerrain = new Set(['water', 'lava', 'gap', 'hedge', 'wall']);

// --- hjelpere --------------------------------------------------------------
const loc = (ctx, key) => {
  if (key == null) return;
  if (!(key in nb)) err(ctx, `mangler lokaliseringsnøkkel i nb.json: "${key}"`);
  if (!(key in en)) err(ctx, `mangler lokaliseringsnøkkel i en.json: "${key}"`);
};
const ref = (ctx, value, set, what) => {
  if (value == null) return;
  if (!set.has(value)) err(ctx, `ukjent ${what}: "${value}"`);
};
const dupCheck = (ctx, arr) => {
  const seen = new Set();
  for (const x of arr) {
    if (seen.has(x.id)) err(ctx, `duplikat id: "${x.id}"`);
    seen.add(x.id);
  }
};

// --- monstre ---------------------------------------------------------------
dupCheck('monsters', monsters);
for (const m of monsters) {
  const c = `monster:${m.id}`;
  ref(c, m.element, elementIds, 'element');
  if (!validRoles.has(m.role)) err(c, `ukjent rolle: "${m.role}"`);
  if (!validResource.has(m.resourceSystem)) err(c, `ukjent resourceSystem: "${m.resourceSystem}"`);
  if (!validAbilities.has(m.explorationAbility)) err(c, `ukjent explorationAbility: "${m.explorationAbility}"`);
  if (!(m.evolveLevel > 0)) err(c, `evolveLevel må være > 0 (fikk ${m.evolveLevel})`);
  loc(c, m.nameKey); loc(c, m.descKey);
  if (m.special) { loc(c, m.special.nameKey); loc(c, m.special.descKey); }
  if (!Array.isArray(m.forms) || m.forms.length !== 2) err(c, `forventer nøyaktig 2 forms (spec kap. 13)`);
  (m.forms || []).forEach((f, i) => { loc(`${c}.form${i}`, f.nameKey); if (!f.sprite) err(c, `form${i} mangler sprite-nøkkel`); });
}

// --- våpen / rustning / items ----------------------------------------------
dupCheck('weapons', weapons);
for (const w of weapons) {
  const c = `weapon:${w.id}`;
  if (!validWeaponTypes.has(w.type)) err(c, `ukjent våpentype: "${w.type}"`);
  ref(c, w.element, elementIds, 'element');
  loc(c, w.nameKey); loc(c, w.descKey);
}
dupCheck('armor', armor);
for (const a of armor) {
  const c = `armor:${a.id}`;
  if (a.bonuses?.resistElement) ref(c, a.bonuses.resistElement, elementIds, 'resistElement');
  loc(c, a.nameKey); loc(c, a.descKey);
}
dupCheck('items', items);
for (const it of items) {
  const c = `item:${it.id}`;
  loc(c, it.nameKey); loc(c, it.descKey);
  if (it.effect?.resistElement) ref(c, it.effect.resistElement, elementIds, 'resistElement');
}

// --- NPC-er ----------------------------------------------------------------
dupCheck('npcs', npcs);
for (const n of npcs) {
  const c = `npc:${n.id}`;
  loc(c, n.nameKey);
  ref(c, n.dialogue, dialogueIds, 'dialog');
  for (const s of n.shopItems || []) {
    if (!(weaponIds.has(s) || armorIds.has(s) || itemIds.has(s))) err(c, `shopItem finnes ikke som våpen/rustning/item: "${s}"`);
  }
}

// --- soner -----------------------------------------------------------------
dupCheck('zones', zones);
const allChestIds = new Set();
for (const z of zones) {
  const c = `zone:${z.id}`;
  loc(c, z.nameKey);
  if (z.dungeon) ref(c, z.dungeon, zoneIds, 'dungeon-sone');
  for (const s of z.spawns || []) {
    ref(`${c}.spawn`, s.monster, monsterIds, 'monster');
    if (s.ai?.aggro && !validAggro.has(s.ai.aggro)) err(`${c}.spawn`, `ukjent ai.aggro: "${s.ai.aggro}"`);
  }
  for (const e of z.exits || []) {
    ref(`${c}.exit`, e.to, zoneIds, 'mål-sone');
    if (e.requiresItem) ref(`${c}.exit`, e.requiresItem, itemIds, 'requiresItem-nøkkel');
  }
  for (const p of z.npcs || []) ref(`${c}.npc`, p.npc, npcIds, 'npc');
  const checkChest = (ctx, ch) => {
    if (allChestIds.has(ch.id)) err(ctx, `duplikat kiste-id: "${ch.id}"`);
    allChestIds.add(ch.id);
    const set = lootSets[ch.lootKind];
    if (!set) err(ctx, `ukjent lootKind: "${ch.lootKind}"`);
    else ref(ctx, ch.loot, set, `${ch.lootKind}-loot`);
    if (ch.requires && !validAbilities.has(ch.requires)) err(ctx, `ukjent requires-evne: "${ch.requires}"`);
    if (ch.requiresItem) ref(ctx, ch.requiresItem, itemIds, 'requiresItem-item');
  };
  for (const ch of z.chests || []) checkChest(`${c}.chest`, ch);
  for (const o of z.obstacles || []) {
    if (!validAbilities.has(o.requires)) err(`${c}.obstacle`, `ukjent requires-evne: "${o.requires}"`);
    loc(`${c}.obstacle`, o.hintKey);
  }
  for (const tr of z.terrain || []) {
    if (!validTerrain.has(tr.type)) err(`${c}.terrain`, `ukjent terreng-type: "${tr.type}"`);
    // requires er valgfritt: uten det er regionen alltid solid (en vegg)
    if (tr.requires && !validAbilities.has(tr.requires)) err(`${c}.terrain`, `ukjent requires-evne: "${tr.requires}"`);
  }
  for (const pz of z.puzzles || []) {
    const pc = `${c}.puzzle:${pz.id}`;
    if (!pz.gate) err(pc, 'puslespill mangler gate');
    if (pz.type === 'blocks') {
      // dyttestein-gåte: steiner + plater, ingen switches
      if (!Array.isArray(pz.plates) || pz.plates.length === 0) err(pc, 'blocks-gåte mangler plates');
      if (!Array.isArray(pz.blocks) || (pz.blocks?.length ?? 0) < (pz.plates?.length ?? 0))
        err(pc, 'blocks-gåte trenger minst like mange blocks som plates');
    } else {
      if (!Array.isArray(pz.switches) || pz.switches.length === 0) err(pc, 'puslespill mangler switches');
      for (const sw of pz.switches || []) if (sw.requires && !validAbilities.has(sw.requires)) err(pc, `ukjent switch requires-evne: "${sw.requires}"`);
    }
    if (pz.reward) checkChest(`${pc}.reward`, pz.reward);
  }
}

// --- oppdrag ---------------------------------------------------------------
dupCheck('quests', quests);
for (const q of quests) {
  const c = `quest:${q.id}`;
  loc(c, q.titleKey); loc(c, q.descKey);
  ref(c, q.giver, npcIds, 'giver-npc');
  const o = q.objective || {};
  if (o.type === 'recruit' || o.type === 'defeat') ref(c, o.target, monsterIds, 'mål-monster');
  else if (o.type === 'reach_zone') ref(c, o.zone, zoneIds, 'mål-sone');
  else err(c, `ukjent objective.type: "${o.type}"`);
  if (q.reward?.item) ref(c, q.reward.item, itemIds, 'belønnings-item');
}

// --- dialoger / elementer --------------------------------------------------
dupCheck('dialogues', dialogues);
for (const d of dialogues) for (const ln of d.lines || []) loc(`dialogue:${d.id}`, ln.textKey);
for (const e of elements) {
  const c = `element:${e.id}`;
  loc(c, e.nameKey);
  for (const s of e.strongAgainst || []) ref(c, s, elementIds, 'strongAgainst-element');
  for (const w of e.weakAgainst || []) ref(c, w, elementIds, 'weakAgainst-element');
}

// --- progresjons-/soft-lock-sjekk ------------------------------------------
// Soneporter (requires) og dungeon-puslespill-brytere gater FRAMDRIFT/vault, så
// evnene de krever MÅ kunne skaffes innen man kommer dit. (Hindringer og
// hemmelige kister kan kreve senere evner = bevisst «kom tilbake»-innhold.)
const MAIN_ORDER = ['village', 'forest', 'mountain', 'swamp', 'volcano', 'snow', 'ruins', 'castle'];
const abilityOf = Object.fromEntries(monsters.map((m) => [m.id, m.explorationAbility]));
const zoneById = new Map(zones.map((z) => [z.id, z]));
const zoneAbilities = (zid) => {
  const set = new Set();
  for (const id of [zid, `${zid}_dungeon`]) {
    const z = zoneById.get(id);
    if (z) for (const s of z.spawns || []) if (!s.boss && abilityOf[s.monster]) set.add(abilityOf[s.monster]);
  }
  return set;
};
const obtainableBy = {};
const cum = new Set();
for (const zid of MAIN_ORDER) {
  for (const a of zoneAbilities(zid)) cum.add(a);
  obtainableBy[zid] = new Set(cum);
}
for (const zid of MAIN_ORDER) {
  const reachable = obtainableBy[zid];
  const ov = zoneById.get(zid);
  for (const e of ov.exits || []) {
    if (e.requires && !reachable.has(e.requires)) err(`progresjon:${zid}.exit->${e.to}`, `SOFT-LOCK: porten krever "${e.requires}" som ikke kan skaffes innen ${zid}`);
  }
  const dun = zoneById.get(`${zid}_dungeon`);
  for (const pz of dun?.puzzles || []) {
    for (const sw of pz.switches || []) {
      if (sw.requires && !reachable.has(sw.requires)) err(`progresjon:${zid}_dungeon.puzzle`, `SOFT-LOCK: bryter krever "${sw.requires}" som ikke kan skaffes innen ${zid} (vault uoppnåelig)`);
    }
  }
}

// --- rapport ---------------------------------------------------------------
const counts = `${monsters.length} monstre, ${weapons.length} våpen, ${armor.length} rustninger, ${items.length} items, ${npcs.length} NPC-er, ${zones.length} soner, ${quests.length} oppdrag, ${dialogues.length} dialoger, ${elements.length} elementer`;
if (errors.length === 0) {
  console.log(`✓ Dataintegritet OK — alle referanser gyldige (${counts}).`);
  process.exit(0);
} else {
  console.error(`✗ Fant ${errors.length} dataproblem(er):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
