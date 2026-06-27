// Genererer én markdown-fil per kin (monster-art) inkludert evolusjonen,
// rett fra spilldataene slik at dokumentasjonen alltid stemmer.
// Kjør: node scripts/gen-kin-docs.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const monsters = read('src/data/monsters.json');
const nb = read('public/locales/nb.json');
const en = read('public/locales/en.json');

const ELEMENT_META = {
  fire: { nb: 'Ild', emoji: '🔥' },
  water: { nb: 'Vann', emoji: '💧' },
  earth: { nb: 'Jord', emoji: '🪨' },
  nature: { nb: 'Natur', emoji: '🌿' },
  wind: { nb: 'Vind', emoji: '🌬️' },
  lightning: { nb: 'Lyn', emoji: '⚡' },
  light: { nb: 'Lys', emoji: '✨' },
  dark: { nb: 'Mørke', emoji: '🌑' },
};
const ROLE_NB = {
  tank: 'Tank', bruiser: 'Bruiser', mage: 'Magiker',
  ranged: 'Avstand', healer: 'Helbreder', support: 'Støtte',
};
const SPECIAL_KIND_NB = {
  heal_ally: 'Helbreder alliert', aoe_damage: 'Områdeskade', buff_ally: 'Styrker alliert',
  debuff_enemy: 'Svekker fiende', shield_self: 'Skjold på seg selv', taunt: 'Trekker fiender',
};
const RESOURCE_NB = { cooldown: 'Cooldown', mana: 'Mana' };

const statsTable = (s, resourceSystem) => {
  const rows = [
    ['HP', s.maxHp],
    ['Skade', s.damage],
    ['Angrepsrekkevidde', `${s.attackRange} px`],
    ['Angreps-cooldown', `${s.attackCooldown} ms`],
    ['Bevegelsesfart', s.moveSpeed],
    ['Rustning', s.armor],
    ['Mana', resourceSystem === 'mana' ? (s.maxMana ?? 0) : '–'],
  ];
  return ['| Stat | Verdi |', '| --- | --- |', ...rows.map(([k, v]) => `| ${k} | ${v} |`)].join('\n');
};

const slug = (id) => id;
const docs = [];

for (const m of monsters) {
  const el = ELEMENT_META[m.element];
  const baseNb = nb[m.forms[0].nameKey];
  const evoNb = nb[m.forms[1].nameKey];
  const baseEn = en[m.forms[0].nameKey];
  const evoEn = en[m.forms[1].nameKey];
  const descNb = nb[m.descKey];
  const sp = m.special;

  const lines = [];
  lines.push(`# ${baseNb} → ${evoNb}`);
  lines.push('');
  lines.push(`> ${descNb}`);
  lines.push('');
  lines.push('| Egenskap | Verdi |');
  lines.push('| --- | --- |');
  lines.push(`| ID | \`${m.id}\` |`);
  lines.push(`| Rolle | ${ROLE_NB[m.role]} |`);
  lines.push(`| Element | ${el.emoji} ${el.nb} |`);
  lines.push(`| Ressurssystem | ${RESOURCE_NB[m.resourceSystem]} |`);
  lines.push(`| Utforskningsevne | ${nb['ability_explore.' + m.explorationAbility]} |`);
  lines.push(`| Evolusjon ved nivå | ${m.evolveLevel} |`);
  lines.push(`| XP ved nedkjemping | ${m.xpReward} |`);
  lines.push(`| Engelsk navn | ${baseEn} → ${evoEn} |`);
  if (m.revivePassive) {
    lines.push(`| Passiv | Kan gjenopplive spilleren én gang ved å ofre seg selv |`);
  }
  lines.push('');
  lines.push(`## 🌟 Spesialevne: ${nb[sp.nameKey]}`);
  lines.push('');
  lines.push(`${nb[sp.descKey]}`);
  lines.push('');
  lines.push(`- **Effekt:** ${SPECIAL_KIND_NB[sp.kind]}`);
  lines.push(`- **Kraft:** ${sp.power}`);
  if (sp.radius) lines.push(`- **Radius/rekkevidde:** ${sp.radius} px`);
  lines.push(`- **Nedkjøling:** ${sp.cooldownMs} ms`);
  if (m.resourceSystem === 'mana') lines.push(`- **Mana-kostnad:** ${sp.cost}`);
  lines.push('');
  lines.push('## Former');
  lines.push('');
  lines.push(`### Grunnform — ${baseNb}`);
  lines.push('');
  lines.push(statsTable(m.forms[0].stats, m.resourceSystem));
  lines.push('');
  lines.push(`### Evolvert form — ${evoNb}`);
  lines.push('');
  lines.push(`Utvikler seg fra **${baseNb}** ved nivå **${m.evolveLevel}**.`);
  lines.push('');
  lines.push(statsTable(m.forms[1].stats, m.resourceSystem));
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('_Generert fra `src/data/monsters.json` av `scripts/gen-kin-docs.mjs`._');
  lines.push('');

  const file = `docs/kin/${slug(m.id)}.md`;
  mkdirSync(join(root, 'docs/kin'), { recursive: true });
  writeFileSync(join(root, file), lines.join('\n'));
  docs.push({ id: m.id, baseNb, evoNb, el, role: m.role, file: `${slug(m.id)}.md` });
}

// indeksfil
const idx = [];
idx.push('# Kin — monsterarter i Kinbound');
idx.push('');
idx.push(`${docs.length} arter, hver med én evolusjon (totalt ${docs.length * 2} former).`);
idx.push('');
idx.push('| Kin | Element | Rolle | Detaljer |');
idx.push('| --- | --- | --- | --- |');
for (const d of docs) {
  idx.push(`| ${d.baseNb} → ${d.evoNb} | ${d.el.emoji} ${d.el.nb} | ${ROLE_NB[d.role]} | [${d.file}](${d.file}) |`);
}
idx.push('');
idx.push('_Generert av `scripts/gen-kin-docs.mjs` (kjør `node scripts/gen-kin-docs.mjs` for å oppdatere)._');
idx.push('');
writeFileSync(join(root, 'docs/kin/README.md'), idx.join('\n'));

console.log(`Skrev ${docs.length} kin-filer + indeks til docs/kin/`);
