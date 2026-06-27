Kinbound
Game Design Specification (v1.0)
1. Konsept

Kinbound er et action-RPG sett ovenfra og ned hvor spilleren utforsker en stor verden, bekjemper monstre og rekrutterer dem som permanente følgesvenner.

Monsterne kjemper automatisk sammen med spilleren og gir samtidig unike evner som åpner nye områder av verden.

Spillet fokuserer på:

Utforskning
Sanntidskamp
Små strategiske valg
Monsterlag
Oppdagelse
Progresjon uten grinding
2. Designfilosofi

Kinbound skal være:

Lett å lære.
Vanskelig å mestre.
Belønne utforskning fremfor grinding.
Belønne kreativ lagsammensetning.
Ha høy gjenspillingsverdi.
Passe både korte og lange spilløkter.
Føles naturlig på mobil.
3. Plattform

Primærplattform:

Android
iPhone

Sekundærplattform:

PC (nettleser)

Teknologi:

Phaser 4
TypeScript
Tiled
JSON-konfigurasjon
4. Grafikk
Pixel art i søt «kawaii»-stil: runde, lubne chibi-proporsjoner med store glansøyne, rosa kinn og lite smil.
Ovenfra-og-ned.
Moderne lyssetting: en vignett rammer inn synet, sterkere i dungeons, lysere i trygge soner.
Myke animasjoner: rolig idle-«pust» på alle vesener, og sprite som vender seg etter bevegelsesretning.
Store sprites tilpasset mobil – figurene er skalert opp så de leses tydelig.
Hver sone har unik grafisk identitet: eget flislagt bakketema, egne dekorasjoner og fargepalett.
Spilleren bygges fra utseende (hår/hud/klær) og viser utstyret sitt – mer rustning og våpen = en mer utrustet helt.
Tydelige, glødende portaler mellom soner, merket med målsonens navn.
5. Lyd
Rolig fantasy-musikk.
Ulike lydspor per sone (eget skala/humør per sonetema).
Dynamisk bossmusikk (mørkere og raskere når en boss er nær).
Unike lydeffekter for alle monstre (element-farget klang).
Musikk og lydeffekter kan slås av/på i innstillinger.
6. Historie

Historien er enkel.

Spilleren våkner i en liten landsby.

Verden er full av monstre og gamle ruiner.

Gjennom utforskning lærer spilleren mer om verden, men historien skal aldri overskygge gameplay.

7. Spilleren

Spilleren har:

HP
Våpen
Rustning
Aktivt monsterlag

Spilleren har ingen levels.

8. Karakteropprettelse

Ved oppstart kan spilleren lage en ny profil.

Spilleren velger:

Navn
Hårstil
Hårfarge
Hudfarge
Klærfarge

Flere profiler kan eksistere på samme mobil.

Hver profil har:

Egen lagring
Egne monstre
Eget utstyr
Egen progresjon
9. Progresjon

Spilleren blir sterkere ved å finne:

Hjertecontainere
Våpen
Rustninger

Ingen erfaring.

Ingen levelsystem.

10. Våpen

Kun ett våpen kan brukes om gangen.

Våpentyper:

Sverd
Øks
Hammer
Spyd
Bue
Magisk stav

Alle våpen:

Har ulik rekkevidde.
Har ulik angrepshastighet.
Har ulike angrepsmønstre.
Har ingen holdbarhet.
11. Rustning

Rustning gir:

Armor
Eventuelle spesialbonuser
12. Forbruksvarer

Eksempler:

Helsedrikk
Monsterhealing
Manapotion
Midlertidige buffs
13. Monstre

Ved lansering:

Ca. 12 arter.

Alle har:

Én evolusjon.
Én rolle.
Ett element.
Én unik utforskningsevne.

Totalt:

24 monsterformer.

Ingen sjeldenhetsgrader.

14. Rekruttering

Når et monster har lite HP kan spilleren forsøke å bli venn med det.

Hvis monsteret blir beseiret må spilleren finne et nytt.

Etter rekruttering eies monsteret permanent.

Kun ett individ av hver art kan eies.

15. Aktivt monsterlag

Start:

1 monster.

Midt i spillet:

2 monstre.

Slutten:

3 monstre.

Monsterlaget velges fra menyen.

16. Monsterroller

Eksempler:

Tank

Trekker fiender.
Høy HP.

Bruiser

Høy nærkampskade.

Mage

Elementskade.
Områdeskade.

Ranged

Holder avstand.

Healer

Helbreder.

Support

Buffs og debuffs.
17. Monster-AI

Monsterne styres automatisk.

Hvert monster har egen AI.

Eksempel:

Tank:

Går først inn.

Mage:

Holder avstand.

Healer:

Prioriterer healing.

Support:

Prioriterer buffs.
18. Monsterprogresjon

Monsterne får erfaring.

Monsterne går opp i level.

Ved bestemte levels:

Automatisk evolusjon.

Evolusjon gir:

Nye sprites.
Bedre stats.
Nye animasjoner.
Forbedrede evner.
19. Monsterhelse

Monsterne har egen HP.

Ved 0 HP:

Monsteret besvimer.

Besvimte monstre:

Kan ikke brukes.
Må helbredes.

Hvis andre monstre finnes kan de brukes.

20. Monsterressurser

Noen monstre bruker:

Cooldowns.

Andre bruker:

Mana.

Hvert monster bruker kun ett system.

21. Utforskningsevner

Alle monsterarter har én unik evne.

Eksempler:

Knuse steiner.
Tenne fakler.
Avsløre skjulte vegger.
Aktivere maskiner.
Lage broer.
Grave tunneler.
Hoppe over vann.
Finne skjulte skatter.

Ingen evner deles mellom monstre.

22. Elementer

Spillet bruker et enkelt elementsystem.

Elementer:

Ild
Vann
Jord
Natur
Vind
Lyn
Lys
Mørke

Elementer påvirker skade og motstand.

23. Kamp

Sanntidskamp.

Spilleren styrer kun helten.

Monsterne:

Følger spilleren.
Angriper automatisk.
Bruker AI.

Kamp handler om:

Timing.
Posisjonering.
Valg av monsterlag.
Våpensynergier.
24. Bosskamper

Bossene har:

Flere faser.
Egne mekanikker.
Svake punkter.
Store arenaer.

Riktig monster gjør kampen lettere.

Ingen boss krever ett bestemt monster.

25. Verdensdesign

Verden består av sammenhengende soner.

Eksempel:

Landsby
Skog
Fjell
Sump
Vulkan
Snø
Ruiner
Slottområde

Hver sone har:

Egne fiender.
Egne bosser.
Egne hemmeligheter.
Egne skatter.

Kun én sone er lastet inn om gangen.

26. Dungeons

Hver sone inneholder minst én dungeon.

Dungeons inneholder:

Puslespill.
Kamper.
Miniboss.
Boss.
Kister.

Utforskningsevner brukes aktivt.

27. NPC-er

Eksempler:

Butikk
Healer
Smed
Oppdragsgiver

Dialogene er korte.

28. Utstyr

Butikker selger:

Vanlige våpen.
Vanlig rustning.
Forbruksvarer.

Sjeldent utstyr finnes gjennom:

Utforskning.
Kister.
Hemmelige områder.
Bosser.
29. Spill over

Spilleren taper når HP blir 0.

Noen spesielle monstre kan ha en passiv evne som gjenoppliver spilleren én gang ved å ofre seg selv.

30. Lagring

Automatisk lagring ved:

Ny sone.
Landsby.
Boss beseiret.
Viktige hendelser.

Flere profiler støttes.

31. Mobilkontroller

Venstre side:

Virtuell joystick.

Høyre side:

Angrep.
Handlingsknapp.
Gjenstand.
Meny.

Store knapper.

Store trykkflater.

32. Brukergrensesnitt

Skal være enkelt.

Menyer:

Inventar
Monsterliste
Utstyr
Kart
Innstillinger
Profilvalg
33. Lokalisering

Spillet skal støtte flere språk.

Ved lansering:

Norsk
Engelsk

Alle tekster skal ligge i egne språkfiler.

Eksempel:

/locales
    nb.json
    en.json

Ingen tekst skal hardkodes.

All tekst hentes via et lokaliseringssystem.

34. Datastruktur

Spillet skal være datadrevet.

Separate JSON-filer for:

Monstre
Våpen
Rustninger
NPC-er
Soner
Items
Oppdrag
Dialoger

Nye monstre og områder skal kunne legges til uten å endre spillmotoren.

35. Fremtidige utvidelser

Arkitekturen skal gjøre det enkelt å legge til:

Nye monsterarter.
Nye soner.
Nye dungeons.
Nye våpen.
Nye rustninger.
Nye språk.
Nye bosser.
36. Kjerneopplevelse

Hvert nytt område skal gi spilleren noe spennende å oppdage.

Hvert nytt monster skal føles som en ny venn, en ny kampstil og et nytt verktøy for utforskning.

Hver kiste skal være verdt å åpne.

Hvert valg av våpen og monsterlag skal ha betydning.

Målet er å skape et spill som er enkelt å forstå, tilfredsstillende å mestre og fullt av små øyeblikk der spilleren tenker:

"Nå kan jeg endelig komme meg inn dit jeg så tidligere."

37. Kunst og assets

Stil

Søt «kawaii»/chibi pixel art:

Runde, lubne kropper.
Store glansøyne med lyspunkt.
Rosa kinn og lite smil.
Lett glitter.
Evolverte former er større og mer forseggjorte enn grunnformen.

Pipeline

Assets er datadrevne og byttbare uten kodeendring:

Alle sprites genereres prosedyralt som standard, så spillet kjører uten eksterne filer.
Ekte pixel art legges i /public/sprites og kobles i manifest.json med samme tekstur-nøkkel.
Nøkler som mangler eller feiler faller automatisk tilbake til prosedyral grafikk.

Tekstur-nøkler

monster: mon_<art>_0 (grunnform), mon_<art>_1 (evolvert)
NPC: npc_<rolle>
diverse: chest, exit, projectile, slash, obstacle, ground
dekorasjoner: deco_* (tre, busk, stein, krystall, lava ...)
bakkefliser per tema: ground_<tema>

Lyd

Syntetiseres med Web Audio (ingen lydfiler) og kan erstattes med innspilte spor senere.

Animasjon

Lette, prosedyrale animasjoner (idle-«pust», retningsvending) som kan erstattes med sprite-ark.

Kart

Soner er datadrevne i JSON. Kan utvides til håndtegnede Tiled-kart (.tmj) per sone uten å endre spilllogikken.