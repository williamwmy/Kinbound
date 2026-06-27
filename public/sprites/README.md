# Ekte kunst-assets (pixel art)

Spillet tegner alle sprites prosedyralt som standard (se `src/core/TextureFactory.ts`).
For å bruke **ekte pixel art** uten kodeendring (spec kap. 4):

1. Legg PNG-filene dine i denne mappen (`public/sprites/`).
2. Pek på dem i `manifest.json` med **samme tekstur-nøkkel** som under.
3. Last spillet på nytt. Nøkler i manifestet bruker bildet ditt; alle andre
   faller automatisk tilbake til prosedyral tekstur.

Eksempel `manifest.json`:

```json
{
  "mon_emberpup_0": "sprites/emberpup_0.png",
  "mon_emberpup_1": "sprites/infernhound.png",
  "npc_shop": "sprites/shopkeeper.png"
}
```

Filer som mangler eller feiler ved lasting hoppes trygt over (de får prosedyral tekstur).
Spilleren tegnes alltid prosedyralt fordi den bygges fra valgt utseende.

## Monstre (begge former)

| Tekstur-nøkkel | Hva | Anbefalt størrelse (px) |
| --- | --- | --- |
| `mon_emberpup_0` | Glødvalp (grunnform) | 30×30 |
| `mon_emberpup_1` | Infernohund (evolvert) | 42×42 |
| `mon_tidefin_0` | Tidvannsfinne (grunnform) | 30×30 |
| `mon_tidefin_1` | Tidvannsgap (evolvert) | 42×42 |
| `mon_stoneback_0` | Steinrygg (grunnform) | 30×30 |
| `mon_stoneback_1` | Kampestein (evolvert) | 42×42 |
| `mon_leafling_0` | Bladunge (grunnform) | 30×30 |
| `mon_leafling_1` | Torndyr (evolvert) | 42×42 |
| `mon_gustling_0` | Vindpust (grunnform) | 30×30 |
| `mon_gustling_1` | Stormvinge (evolvert) | 42×42 |
| `mon_sparkit_0` | Gnistunge (grunnform) | 30×30 |
| `mon_sparkit_1` | Voltdyr (evolvert) | 42×42 |
| `mon_lumenmoth_0` | Lysmøll (grunnform) | 30×30 |
| `mon_lumenmoth_1` | Stråleugle (evolvert) | 42×42 |
| `mon_shadepup_0` | Skyggevalp (grunnform) | 30×30 |
| `mon_shadepup_1` | Nattgap (evolvert) | 42×42 |
| `mon_mossback_0` | Moserygg (grunnform) | 30×30 |
| `mon_mossback_1` | Jordbrøl (evolvert) | 42×42 |
| `mon_frostkit_0` | Frostunge (grunnform) | 30×30 |
| `mon_frostkit_1` | Isbringer (evolvert) | 42×42 |
| `mon_cindertail_0` | Glohale (grunnform) | 30×30 |
| `mon_cindertail_1` | Magmagap (evolvert) | 42×42 |
| `mon_auraling_0` | Auraunge (grunnform) | 30×30 |
| `mon_auraling_1` | Serafyks (evolvert) | 42×42 |

## NPC-er

| Tekstur-nøkkel | Hva | Anbefalt størrelse (px) |
| --- | --- | --- |
| `npc_shop` | NPC: Kjøpmann | 28×36 |
| `npc_healer` | NPC: Helbreder | 28×36 |
| `npc_smith` | NPC: Smed | 28×36 |
| `npc_elder` | NPC: Eldste | 28×36 |
| `npc_villager` | NPC: Landsbyboer | 28×36 |

## Diverse

| Tekstur-nøkkel | Hva | Anbefalt størrelse (px) |
| --- | --- | --- |
| `projectile` | Prosjektil (piler/magi) | 10×10 |
| `slash` | Nærkamp-treff | 32×32 |
| `chest` | Kiste | 28×28 |
| `obstacle` | Hindring (krever utforskningsevne) | 40×40 |
| `exit` | Soneutgang/portal | 36×56 |
| `ground` | Bakkeflis (kan tiles sømløst) | 64×64 |

## Dekorasjoner (soneidentitet)

| Tekstur-nøkkel | Hva | Anbefalt størrelse (px) |
| --- | --- | --- |
| `deco_tree` | Tre | 48×60 |
| `deco_pine` | Furu (snø) | 48×60 |
| `deco_rock` | Stein | 40×40 |
| `deco_bush` | Busk | 40×28 |
| `deco_flower` | Blomst | 20×24 |
| `deco_reed` | Siv (sump) | 30×40 |
| `deco_lava` | Lava (vulkan) | 44×36 |
| `deco_crystal` | Krystall | 28×32 |
| `deco_pillar` | Søyle (ruiner) | 32×56 |
| `deco_banner` | Banner (slott) | 32×52 |

_Generert av `scripts/gen-sprite-keys.mjs` (kjør `node scripts/gen-sprite-keys.mjs` for å oppdatere)._
