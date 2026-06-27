# Kinbound

Et action-RPG sett ovenfra og ned hvor du utforsker en verden, bekjemper monstre og
rekrutterer dem som permanente følgesvenner. Bygget etter [spec.md](spec.md).

**Teknologi:** Phaser 4 · TypeScript · Vite · datadrevet JSON · localStorage

## Kom i gang

```bash
npm install
npm run dev        # utviklingsserver på http://localhost:5173
npm run build      # typecheck + produksjonsbygg til dist/
npm run typecheck  # kun typesjekk
```

Spillet er laget for mobil (Android/iOS via web) først, og fungerer også i nettleser på PC.
Bruk virtuell joystick (venstre) og handlingsknapper (høyre) på touch, eller
WASD/piltaster + `Space` (angrep), `E`/`F` (handling), `I` (gjenstand), `M` (meny) på tastatur.

## Arkitektur

Spillet er **datadrevet**: alt innhold ligger i JSON, og motoren leser det. Nye monstre,
soner, våpen osv. legges til ved å redigere data – ikke koden (spec kap. 34–35).

```
src/
  data/            All spilldata som JSON (spec kap. 34)
    elements.json    8 elementer med sterk/svak-relasjoner
    monsters.json    12 arter × 2 former = 24 monsterformer
    weapons.json     6 våpentyper + sjeldne varianter
    armor.json       rustninger med spesialbonuser
    items.json       forbruksvarer, hjertecontainere
    npcs.json        butikk, healer, smed, oppdragsgiver, landsbyboer
    zones.json       8 soner + dungeon, koblet sammen
    quests.json      oppdrag
    dialogues.json   dialoglinjer (kun nøkler – tekst i locales)
  i18n/            Lokaliseringssystem – henter all tekst via t(key)
  core/            DataManager, EventBus, TextureFactory, Settings
  save/            SaveManager – flere profiler i localStorage
  systems/         ElementSystem, RecruitmentSystem, ExplorationSystem
  entities/        Player, Companion (rolle-AI), Enemy/Boss, combat-grensesnitt
  ui/              VirtualJoystick, gjenbrukbare widgets
  scenes/          Boot → Preload → MainMenu → ProfileSelect →
                   CharacterCreation → World (+ UI-overlegg) → Menu / GameOver
public/locales/    nb.json, en.json – ingen tekst er hardkodet (spec kap. 33)
```

## Spec-dekning

Alle 36 kapitler i spec.md er implementert som kjørende systemer:

- **Utforskning & verden** – 8 sammenhengende soner (kun én lastet om gangen), hver med
  egne fiender, boss, hemmeligheter, kister og utforskningshindringer. Dungeon med puslespill.
- **Sanntidskamp** – spilleren styrer helten; monstrene følger, angriper automatisk og
  bruker rolle-AI (tank/bruiser/mage/ranged/healer/support).
- **Monstre** – 12 arter, hver med én evolusjon, én rolle, ett element, én unik
  utforskningsevne og enten mana eller cooldown. Erfaring → nivå → automatisk evolusjon.
- **Rekruttering** – bli venn med svekkede monstre; ett individ per art, permanent eierskap.
- **Aktivt lag** – velges fra meny, vokser 1 → 2 → 3.
- **Elementer** – 8 elementer påvirker skade og motstand.
- **Bosskamper** – flere faser, større/sterkere, ingen boss krever ett bestemt monster.
- **Spilleren** – HP, våpen, rustning, lag; ingen levels. Sterkere via hjertecontainere/utstyr.
- **Karakteropprettelse & profiler** – navn, hår, hud, klær; flere profiler med egen lagring.
- **NPC-er & butikk** – kjøp våpen/rustning/forbruksvarer; sjeldent utstyr fra kister/bosser.
- **Spill over & gjenoppliving** – tap ved 0 HP; visse monstre (f.eks. Auraunge) ofrer seg.
- **Lagring** – autolagring ved ny sone, landsby og beseiret boss.
- **Mobilkontroller & UI** – joystick + store knapper; menyer for inventar, monstre, utstyr,
  kart, innstillinger og profil.
- **Lokalisering** – norsk og engelsk, all tekst i språkfiler.

## Placeholder-lag (klart for ekte assets)

For at spillet skal kjøre uten eksterne filer er tre ting prosedyrale/forenklede.
Arkitekturen er laget for å bytte dem inn uten å endre spilllogikken:

- **Grafikk:** sprites genereres prosedyralt i `TextureFactory` (distinkte former per rolle,
  farge per element). Ekte pixel art lastes inn på samme tekstur-nøkler i `PreloadScene`.
- **Lyd:** innstillinger (musikk/lyd av/på) finnes; lydspor og effekter kobles til via
  `PreloadScene` når lydfiler legges til.
- **Tiled-kart:** soner er definert i `zones.json` i stedet for Tiled-filer. `WorldScene`
  kan utvides til å laste `.tmj`-kart per sone; sonedataene er allerede separert per sone.

Én dungeon (`forest_dungeon`) er fullt bygget som eksempel; flere legges til som ren data.
