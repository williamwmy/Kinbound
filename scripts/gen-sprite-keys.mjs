// Genererer public/sprites/README.md med alle bytte-bare tekstur-nøkler, slik
// at man vet hvilke nøkler ekte pixel art kan legges på i manifest.json.
// Kjør: node scripts/gen-sprite-keys.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const monsters = read('src/data/monsters.json');
const npcs = read('src/data/npcs.json');
const nb = read('public/locales/nb.json');

// Anbefalte størrelser = de prosedyrale teksturenes mål (se TextureFactory.ts).
// Ekte kunst kan være større/skarpere, men hold samme bredde/høyde-forhold.
const monsterKeys = monsters.flatMap((m) => [
  { key: m.forms[0].sprite, what: `${nb[m.forms[0].nameKey]} (grunnform)`, size: '30×30' },
  { key: m.forms[1].sprite, what: `${nb[m.forms[1].nameKey]} (evolvert)`, size: '42×42' },
]);
const npcKeys = npcs.map((n) => ({ key: n.sprite, what: `NPC: ${nb[n.nameKey]}`, size: '28×36' }));
const miscKeys = [
  ['projectile', 'Prosjektil (piler/magi)', '10×10'],
  ['slash', 'Nærkamp-treff', '32×32'],
  ['chest', 'Kiste', '28×28'],
  ['obstacle', 'Hindring (krever utforskningsevne)', '40×40'],
  ['exit', 'Soneutgang/portal', '36×56'],
  ['ground', 'Bakkeflis (kan tiles sømløst)', '64×64'],
].map(([key, what, size]) => ({ key, what, size }));
const decoKeys = [
  ['deco_tree', 'Tre', '48×60'], ['deco_pine', 'Furu (snø)', '48×60'], ['deco_rock', 'Stein', '40×40'],
  ['deco_bush', 'Busk', '40×28'], ['deco_flower', 'Blomst', '20×24'], ['deco_reed', 'Siv (sump)', '30×40'],
  ['deco_lava', 'Lava (vulkan)', '44×36'], ['deco_crystal', 'Krystall', '28×32'], ['deco_pillar', 'Søyle (ruiner)', '32×56'],
  ['deco_banner', 'Banner (slott)', '32×52'],
].map(([key, what, size]) => ({ key, what, size }));

const table = (rows) =>
  ['| Tekstur-nøkkel | Hva | Anbefalt størrelse (px) |', '| --- | --- | --- |',
    ...rows.map((r) => `| \`${r.key}\` | ${r.what} | ${r.size} |`)].join('\n');

const md = `# Ekte kunst-assets (pixel art)

Spillet tegner alle sprites prosedyralt som standard (se \`src/core/TextureFactory.ts\`).
For å bruke **ekte pixel art** uten kodeendring (spec kap. 4):

1. Legg PNG-filene dine i denne mappen (\`public/sprites/\`).
2. Pek på dem i \`manifest.json\` med **samme tekstur-nøkkel** som under.
3. Last spillet på nytt. Nøkler i manifestet bruker bildet ditt; alle andre
   faller automatisk tilbake til prosedyral tekstur.

Eksempel \`manifest.json\`:

\`\`\`json
{
  "mon_emberpup_0": "sprites/emberpup_0.png",
  "mon_emberpup_1": "sprites/infernhound.png",
  "npc_shop": "sprites/shopkeeper.png"
}
\`\`\`

Filer som mangler eller feiler ved lasting hoppes trygt over (de får prosedyral tekstur).
Spilleren tegnes alltid prosedyralt fordi den bygges fra valgt utseende.

## Monstre (begge former)

${table(monsterKeys)}

## NPC-er

${table(npcKeys)}

## Diverse

${table(miscKeys)}

## Dekorasjoner (soneidentitet)

${table(decoKeys)}

_Generert av \`scripts/gen-sprite-keys.mjs\` (kjør \`node scripts/gen-sprite-keys.mjs\` for å oppdatere)._
`;

mkdirSync(join(root, 'public/sprites'), { recursive: true });
writeFileSync(join(root, 'public/sprites/README.md'), md);
console.log(`Skrev public/sprites/README.md (${monsterKeys.length + npcKeys.length + miscKeys.length + decoKeys.length} nøkler)`);
