import Phaser from 'phaser';
import type { ProfileData, ZoneDef, ElementId, PuzzleDef } from '../types';
import { Data } from '../core/DataManager';
import { SaveManager } from '../save/SaveManager';
import { TextureFactory, THEME_DECOR } from '../core/TextureFactory';
import { addIdleBob, faceByVelocity } from '../core/anim';
import { EventBus, Events } from '../core/EventBus';
import { t } from '../i18n/Localization';
import { Player } from '../entities/Player';
import { Companion } from '../entities/Companion';
import { Enemy } from '../entities/Enemy';
import type { Ally, AttackRequest, Damageable, IWorld } from '../entities/combat';
import { elementMultiplier } from '../systems/ElementSystem';
import { RecruitmentSystem } from '../systems/RecruitmentSystem';
import { ExplorationSystem } from '../systems/ExplorationSystem';
import { monsterMaxHp } from '../systems/Progression';

// Beseirede monstre respawner ikke umiddelbart når man zoner fram og tilbake;
// de holdes borte i dette tidsrommet (spec kap. 24).
const RESPAWN_MS = 3 * 60 * 1000;

// Verdensscenen (spec kap. 23-26). Sanntidskamp, kun én sone lastet om gangen.
export class WorldScene extends Phaser.Scene implements IWorld {
  private profile!: ProfileData;
  private zone!: ZoneDef;
  private player!: Player;
  private companions: Companion[] = [];
  private enemies!: Phaser.Physics.Arcade.Group;
  private offense!: Phaser.Physics.Arcade.Group;
  private hostile!: Phaser.Physics.Arcade.Group;
  private allyGroup!: Phaser.Physics.Arcade.Group;
  private interactables: { sprite: Phaser.GameObjects.Sprite; kind: string; data: unknown; label?: Phaser.GameObjects.Text }[] = [];
  private moveVec = { x: 0, y: 0 };
  private attackHeld = false;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private paused = false;
  private exitCooldownUntil = 0;
  private exitBuilding = false; // mens bygge-animasjon ved en gated utgang spilles
  private lastExitHint = 0;
  private exitBarriers = new Map<string, Phaser.GameObjects.Sprite>(); // barriere-sprite per gated utgang (nøkkel = exit.to)
  private unbinders: Array<() => void> = [];
  private bossMusic = false;
  private bossBarVisible = false;
  private musicCheckAcc = 0;
  private terrainColliders: Phaser.Physics.Arcade.Collider[] = [];
  private terrainObjs: Phaser.GameObjects.GameObject[] = [];
  private terrainBlocks?: Phaser.Physics.Arcade.StaticGroup;
  private lastTerrainHint = 0;
  // Krysninger (bro/trinn/is) som "bygges" med animasjon første gang man når dem.
  private terrainReveals: { key: string; cx: number; cy: number; requires: string; objs: Phaser.GameObjects.Shape[]; revealed: boolean }[] = [];
  // "Ny!"-merker som følger ueide kin rundt i verden.
  private newKinBadges: { enemy: Enemy; obj: Phaser.GameObjects.Text }[] = [];
  // Puslespill i dungeons (spec kap. 26).
  private puzzles: {
    def: PuzzleDef;
    active: boolean[];
    labels: Phaser.GameObjects.GameObject[];
    switchSprites: Phaser.GameObjects.Sprite[];
    gate?: Phaser.Physics.Arcade.Sprite;
    gateCollider?: Phaser.Physics.Arcade.Collider;
    solved: boolean;
  }[] = [];

  constructor() {
    super('World');
  }

  create(): void {
    this.profile = SaveManager.getActive();
    this.zone = Data.zone(this.profile.currentZone);
    this.paused = false;

    // Nullstill scene-tilstand: instansen gjenbrukes ved scene.restart, så felter
    // ville ellers peke på ødelagte objekter fra forrige sone (krasj/lekkasjer).
    this.interactables = [];
    this.companions = [];
    this.terrainBlocks = undefined;
    this.terrainColliders = [];
    this.terrainObjs = [];
    this.terrainReveals = [];
    this.newKinBadges = [];
    this.puzzles = [];
    this.exitBuilding = false;
    this.exitBarriers = new Map();
    this.taunt = null;
    this.lastPrompt = '';
    this.bossMusic = false;
    this.bossBarVisible = false;

    // verdens-grenser & bakgrunn
    this.cameras.main.setBackgroundColor(Phaser.Display.Color.IntegerToColor(this.zone.bgColor).rgba);
    this.physics.world.setBounds(0, 0, this.zone.width, this.zone.height);
    this.cameras.main.setBounds(0, 0, this.zone.width, this.zone.height);
    // flislagt bakke per tema; dungeons får mørkt hule-steingulv (spec kap. 26)
    const floorTheme = this.zone.id.includes('dungeon') ? 'cave' : this.zone.theme;
    const groundKey = this.textures.exists(`ground_${floorTheme}`) ? `ground_${floorTheme}` : 'ground';
    this.add.tileSprite(0, 0, this.zone.width, this.zone.height, groundKey).setOrigin(0).setDepth(0);
    this.scatterDecor();
    this.addLighting();

    // grupper
    this.enemies = this.physics.add.group();
    this.offense = this.physics.add.group();
    this.hostile = this.physics.add.group();
    this.allyGroup = this.physics.add.group();

    // spiller
    this.rebuildPlayerTexture();
    this.player = new Player(this, this, this.profile.spawnX, this.profile.spawnY, 'player_active');
    this.allyGroup.add(this.player);
    addIdleBob(this, this.player);
    this.cameras.main.startFollow(this.player, true, 0.16, 0.16);

    this.spawnCompanions();
    this.spawnZoneContents();
    this.setupOverlaps();
    this.addBoundaries();
    this.buildTerrain();
    this.setupInput();

    // UI-overlegg
    this.scene.launch('UI');

    // autosave ved ny sone / landsby (spec kap. 30)
    this.autosave();
    // bakgrunnsmusikk for sonen (spec kap. 5)
    this.bossMusic = false;
    EventBus.emit('music:play', this.zone.theme, false);
    EventBus.emit(Events.ZoneChanged, this.zone.id);
    EventBus.emit(Events.PlayerHpChanged, this.profile.currentHp, SaveManager.computeMaxHp());
    EventBus.emit(Events.PlayerGoldChanged, this.profile.gold);

    // oppdaterer reach_zone-oppdrag
    this.progressReachZone(this.zone.id);

    // fade inn i den nye sonen (reise-overlegget er svart fra forrige sone)
    this.time.delayedCall(40, () => EventBus.emit('zone:travel-in'));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
  }

  // --- oppsett ------------------------------------------------------------
  private spawnCompanions(): void {
    this.companions = [];
    let i = 0;
    for (const speciesId of this.profile.activeTeam) {
      const owned = this.profile.monsters.find((m) => m.speciesId === speciesId);
      if (!owned || owned.fainted) continue;
      const comp = new Companion(
        this,
        this,
        this.player.x - 40 - i * 20,
        this.player.y + 20,
        owned,
      );
      this.companions.push(comp);
      if (this.allyGroup) this.allyGroup.add(comp);
      addIdleBob(this, comp);
      i++;
    }
  }

  // Deterministisk pseudo-tilfeldig (mulberry32) sådd fra sone-id, så
  // dekorasjoner ligger likt hver gang man besøker sonen.
  private makeRng(): () => number {
    let h = 1779033703 ^ this.zone.id.length;
    for (let i = 0; i < this.zone.id.length; i++) {
      h = Math.imul(h ^ this.zone.id.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Spre dekorasjoner for sonens grafiske identitet (spec kap. 4).
  private scatterDecor(): void {
    const keys = THEME_DECOR[this.zone.theme];
    if (!keys || keys.length === 0) return;
    const rng = this.makeRng();
    const count = Phaser.Math.Clamp(Math.floor((this.zone.width * this.zone.height) / 70000), 6, 40);
    for (let i = 0; i < count; i++) {
      const key = keys[Math.floor(rng() * keys.length)];
      const x = 40 + rng() * (this.zone.width - 80);
      const y = 40 + rng() * (this.zone.height - 80);
      this.add
        .image(x, y, key)
        .setOrigin(0.5, 1)
        .setDepth(1)
        .setAlpha(0.96)
        .setScale(0.85 + rng() * 0.5);
      // ingen idle-bob på kulisser - kun levende vesener "puster" (mindre visuell støy)
    }
  }

  // Moderne lyssetting: vignett som rammer inn synet, mørkere i dungeons (spec kap. 4).
  private addLighting(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    TextureFactory.buildVignette(this, 'vignette', w, h);
    const isDungeon = this.zone.id.includes('dungeon');
    const strength = isDungeon ? 0.62 : this.zone.safe ? 0.22 : 0.42;
    this.add
      .image(w / 2, h / 2, 'vignette')
      .setScrollFactor(0)
      .setDepth(50)
      .setAlpha(strength)
      .setDisplaySize(w, h);
  }

  // Gjør det umulig å gå utenfor verdenen: usynlige kollisjonsvegger langs
  // kantene + en synlig ring av trær/steiner som "mur" (spec kap. 4, 25).
  private addBoundaries(): void {
    const W = this.zone.width;
    const H = this.zone.height;
    const t = 40;
    const walls = this.physics.add.staticGroup();
    const wall = (x: number, y: number, w: number, h: number) => {
      const s = walls.create(x, y, 'pixel') as Phaser.Physics.Arcade.Sprite;
      s.setVisible(false).setDisplaySize(w, h).refreshBody();
    };
    wall(W / 2, -t / 2, W + 2 * t, t); // topp
    wall(W / 2, H + t / 2, W + 2 * t, t); // bunn
    wall(-t / 2, H / 2, t, H); // venstre
    wall(W + t / 2, H / 2, t, H); // høyre
    this.physics.add.collider(this.allyGroup, walls);
    this.physics.add.collider(this.enemies, walls);
    // belte og bukseseler: hold også verdensgrensene aktive på spilleren
    (this.player.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);
    this.addEdgeDecor();
  }

  // Synlig kant-ring av temadekorasjoner som gir inntrykk av en naturlig mur.
  private addEdgeDecor(): void {
    const keys = THEME_DECOR[this.zone.theme];
    if (!keys || keys.length === 0) return;
    const W = this.zone.width;
    const H = this.zone.height;
    const rng = this.makeRng();
    const exits = this.zone.exits.map((e) => ({ x: e.x, y: e.y }));
    const nearExit = (x: number, y: number) =>
      exits.some((e) => Phaser.Math.Distance.Between(x, y, e.x, e.y) < 70);
    const place = (x: number, y: number) => {
      if (nearExit(x, y)) return; // hold utganger åpne
      const k = keys[Math.floor(rng() * keys.length)];
      this.add
        .image(x, y, k)
        .setOrigin(0.5, 1)
        .setDepth(1)
        .setAlpha(0.96)
        .setScale(0.9 + rng() * 0.4);
    };
    const step = 60;
    for (let x = 20; x < W; x += step) {
      place(x, 30);
      place(x, H - 6);
    }
    for (let y = 40; y < H; y += step) {
      place(14, y);
      place(W - 6, y);
    }
  }

  private spawnZoneContents(): void {
    const now = Date.now();
    const defeated = this.profile.defeatedSpawns ?? {};
    // fiender - hopp robust over ukjente art-id-er i stedet for å krasje sonen
    this.zone.spawns.forEach((s, i) => {
      if (!Data.monsters.has(s.monster)) {
        console.warn(`Hopper over spawn med ukjent art: ${s.monster} i sone ${this.zone.id}`);
        return;
      }
      // nylig beseiret? hopp over til nedkjølingen er ute (respawner ikke straks)
      const key = `${this.zone.id}#${i}`;
      const at = defeated[key];
      if (at && now - at < RESPAWN_MS) return;
      const def = Data.monster(s.monster);
      const enemy = new Enemy(this, this, s.x, s.y, def, s.level, !!s.boss, s.loot, s.ai);
      enemy.setData('spawnKey', key);
      if (s.finalBoss) enemy.setData('finalBoss', true);
      this.enemies.add(enemy);
      addIdleBob(this, enemy);
      // tydelig merke over kin man ikke eier fra før (spec kap. 14)
      if (!s.boss && !this.ownsSpecies(def.id)) this.addNewKinBadge(enemy);
    });
    // NPC-er
    for (const p of this.zone.npcs) {
      const def = Data.npc(p.npc);
      const sprite = this.add.sprite(p.x, p.y, def.sprite).setDepth(7).setScale(1.5);
      addIdleBob(this, sprite);
      this.add
        .text(p.x, p.y - 38, t(def.nameKey), { fontSize: '13px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 })
        .setOrigin(0.5)
        .setDepth(7);
      this.interactables.push({ sprite, kind: 'npc', data: def });
    }
    // kister (spec kap. 26-28)
    for (const c of this.zone.chests) {
      if (this.profile.openedChests.includes(c.id)) continue;
      // Skjult skatt (spec kap. 21): kister som krever find_treasure er usynlige
      // til en skatte-snuser (cindertail) er i laget, og dukker da opp med glitter.
      const hidden = c.requires === 'find_treasure';
      if (hidden && !ExplorationSystem.hasAbility(this.profile, 'find_treasure')) continue;
      const sprite = this.add.sprite(c.x, c.y, 'chest').setDepth(6).setScale(1.5);
      if (hidden) {
        this.tweens.add({ targets: sprite, alpha: { from: 0.6, to: 1 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        this.recruitEffect(c.x, c.y); // gjenbruk glitter-effekten som «funnet!»-blink
      }
      this.interactables.push({ sprite, kind: 'chest', data: c });
    }
    // hindringer som krever utforskningsevner (spec kap. 21, 26)
    const cleared = this.profile.clearedObstacles ?? [];
    for (const o of this.zone.obstacles) {
      if (cleared.includes(o.id)) continue; // ryddet permanent - ikke gjenskap
      // Hindringen tegnes som det den ER (ødelagt bro, steiner, klippe ...) slik
      // at situasjonen leses visuelt uten tekst (spec kap. 4, 21).
      const texKey = this.textures.exists(`obs_${o.requires}`) ? `obs_${o.requires}` : 'obstacle';
      const sprite = this.physics.add.staticSprite(o.x, o.y, texKey).setDepth(6).setScale(1.5);
      sprite.refreshBody(); // kollisjonskroppen følger den oppskalerte størrelsen
      this.physics.add.collider(this.player, sprite);
      this.interactables.push({ sprite, kind: 'obstacle', data: o });
    }
    // utganger - tydelige overganger med mål-etikett (spec kap. 25, 26).
    // Dungeon-mål ("..._dungeon") tegnes som en HULEINNGANG (mørk åpning i stein),
    // vanlige soneoverganger som en glødende portal.
    for (const ex of this.zone.exits) {
      const doorKey = `${this.zone.id}:${ex.to}`;
      const alreadyUnlocked = (this.profile.unlockedDoors ?? []).includes(doorKey);
      const lockedByItem = !!ex.requiresItem && !alreadyUnlocked && !this.profile.inventory.some((e) => e.id === ex.requiresItem && e.count > 0);
      const gated = (!!ex.requires && !ExplorationSystem.hasAbility(this.profile, ex.requires)) || lockedByItem;
      const isCave = ex.to.includes('dungeon');
      const sprite = this.add.sprite(ex.x, ex.y, isCave ? 'cave' : 'exit').setDepth(5);
      if (lockedByItem) {
        // låst med nøkkel (Zelda-stil): demp + hengelås-ikon over inngangen
        sprite.setAlpha(0.4);
        this.add.text(ex.x, ex.y, '🔒', { fontSize: '22px' }).setOrigin(0.5).setDepth(7);
      } else if (gated) {
        // veien er sperret: demp overgangen, ingen lokkende effekt
        sprite.setAlpha(0.35);
      } else if (isCave) {
        // varm, flimrende fakkelglød fra dypet av hulen
        const glow = this.add.circle(ex.x, ex.y + 6, 9, 0xffb060, 0.3).setDepth(5);
        this.tweens.add({ targets: glow, alpha: { from: 0.14, to: 0.34 }, scale: { from: 0.85, to: 1.2 }, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      } else {
        // pulserende glød så det leses som en aktiv portal
        this.tweens.add({ targets: sprite, scale: { from: 1, to: 1.1 }, alpha: { from: 0.85, to: 1 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      }
      const destName = Data.zones.has(ex.to) ? t(Data.zone(ex.to).nameKey) : ex.to;
      this.add
        .text(ex.x, ex.y - 46, t('ui.portal', { zone: destName }), {
          fontSize: '13px', color: '#bfe9ff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(6);
      // Gated utgang: tegn barrieren som det den ER (ødelagt bro, steiner ...) foran
      // portalen, så man SER at veien er sperret og hva som trengs (brukerkrav).
      if (ex.requires) {
        const texKey = this.textures.exists(`obs_${ex.requires}`) ? `obs_${ex.requires}` : 'obstacle';
        const barrier = this.add.sprite(ex.x, ex.y, texKey).setDepth(6).setScale(1.6);
        this.exitBarriers.set(ex.to, barrier);
      }
      this.interactables.push({ sprite, kind: 'exit', data: ex });
    }
    this.spawnPuzzles();
  }

  // Puslespill: aktiver alle rune-bryterne for å åpne en forsegling og avdekke
  // en belønningskiste (spec kap. 26). Løsningen lagres permanent.
  private spawnPuzzles(): void {
    const solvedIds = this.profile.solvedPuzzles ?? [];
    for (const pz of this.zone.puzzles ?? []) {
      const already = solvedIds.includes(pz.id);
      const state: (typeof this.puzzles)[number] = {
        def: pz,
        active: pz.switches.map(() => already),
        labels: [],
        switchSprites: [],
        solved: already,
      };
      // ordnede puslespill viser hva runen ER (stein/lianer ...) + et rekkefølge-tall
      const swTex = (sw: import('../types').PuzzleSwitch) =>
        pz.ordered && sw.requires && this.textures.exists(`obs_${sw.requires}`) ? `obs_${sw.requires}` : 'rune';
      if (already) {
        // allerede løst: vis lyse runer + avdekket belønning (om uåpnet)
        for (const sw of pz.switches) this.add.sprite(sw.x, sw.y, swTex(sw)).setDepth(5).setScale(1.1).setTint(0x66ff99);
        this.spawnRewardChest(pz);
      } else {
        // forsegling som blokkerer ally-bevegelse til puslespillet er løst
        const gx = pz.gate.x + pz.gate.w / 2;
        const gy = pz.gate.y + pz.gate.h / 2;
        const gate = this.physics.add.staticSprite(gx, gy, 'gate').setDepth(6);
        gate.setDisplaySize(pz.gate.w, pz.gate.h).refreshBody();
        state.gate = gate;
        state.gateCollider = this.physics.add.collider(this.allyGroup, gate);
        this.physics.add.collider(this.enemies, gate);
        // bryterne
        pz.switches.forEach((sw, si) => {
          const sprite = this.add.sprite(sw.x, sw.y, swTex(sw)).setDepth(5).setScale(pz.ordered ? 1.2 : 1.3);
          this.tweens.add({ targets: sprite, alpha: { from: 0.7, to: 1 }, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
          state.switchSprites.push(sprite);
          this.interactables.push({ sprite, kind: 'switch', data: { puzzle: this.puzzles.length, sw: si } });
          if (sw.requires) state.labels.push(this.addRequirementLabel(sw.x, sw.y - 30, sw.requires));
          // rekkefølge-tall for ordnede puslespill (knus/dyrk i riktig rekkefølge)
          if (pz.ordered) {
            state.labels.push(
              this.add.text(sw.x, sw.y, String(si + 1), { fontSize: '20px', color: '#ffe066', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5).setDepth(8),
            );
          }
        });
      }
      this.puzzles.push(state);
    }
  }

  private spawnRewardChest(pz: PuzzleDef): void {
    if (!pz.reward || this.profile.openedChests.includes(pz.reward.id)) return;
    const c = pz.reward;
    const sprite = this.add.sprite(c.x, c.y, 'chest').setDepth(6).setScale(1.5);
    this.interactables.push({ sprite, kind: 'chest', data: c });
  }

  private tryPuzzleSwitch(ref: { puzzle: number; sw: number }, sprite: Phaser.GameObjects.Sprite): void {
    const pz = this.puzzles[ref.puzzle];
    if (!pz || pz.solved || pz.active[ref.sw]) return;
    const sw = pz.def.switches[ref.sw];
    if (sw.requires && !ExplorationSystem.hasAbility(this.profile, sw.requires)) {
      EventBus.emit(Events.Toast, t('exploration.need_ability', { ability: t(`ability_explore.${sw.requires}`) }));
      return;
    }
    // Ordnet puslespill: må knuses/dyrkes i riktig rekkefølge (1,2,3). Feil -> nullstill.
    if (pz.def.ordered) {
      const expected = pz.active.filter(Boolean).length; // neste forventede indeks
      if (ref.sw !== expected) {
        pz.active = pz.active.map(() => false);
        pz.switchSprites.forEach((s) => s.clearTint());
        EventBus.emit(Events.Toast, t('puzzle.wrong_order'));
        EventBus.emit('sfx', 'hit');
        return;
      }
      pz.active[ref.sw] = true;
      sprite.setTint(0x66ff99);
      this.exploreEffect(sprite.x, sprite.y, sw.requires ?? 'charge_runes');
      EventBus.emit('sfx', 'explore');
      const litO = pz.active.filter(Boolean).length;
      if (litO < pz.active.length) EventBus.emit(Events.Toast, t('puzzle.activated', { lit: litO, total: pz.active.length }));
      else this.solvePuzzle(ref.puzzle);
      return;
    }
    pz.active[ref.sw] = true;
    sprite.setTint(0x66ff99);
    this.exploreEffect(sprite.x, sprite.y, sw.requires ?? 'charge_runes');
    EventBus.emit('sfx', 'explore');
    this.interactables = this.interactables.filter((i) => i.sprite !== sprite);
    const lit = pz.active.filter(Boolean).length;
    if (lit < pz.active.length) {
      EventBus.emit(Events.Toast, t('puzzle.activated', { lit, total: pz.active.length }));
    } else {
      this.solvePuzzle(ref.puzzle);
    }
  }

  private solvePuzzle(i: number): void {
    const pz = this.puzzles[i];
    if (!pz || pz.solved) return;
    pz.solved = true;
    if (pz.gateCollider) this.physics.world.removeCollider(pz.gateCollider);
    if (pz.gate) {
      const g = pz.gate;
      this.tweens.add({ targets: g, alpha: 0, y: g.y - 24, duration: 420, onComplete: () => g.destroy() });
    }
    pz.labels.forEach((l) => l.destroy());
    this.profile.solvedPuzzles = this.profile.solvedPuzzles ?? [];
    if (!this.profile.solvedPuzzles.includes(pz.def.id)) this.profile.solvedPuzzles.push(pz.def.id);
    this.spawnRewardChest(pz.def);
    EventBus.emit(Events.Toast, t('puzzle.solved'));
    EventBus.emit('sfx', 'chest');
    this.autosave();
  }

  private setupOverlaps(): void {
    // offensive angrep treffer fiender
    this.physics.add.overlap(this.offense, this.enemies, (atk, enemyObj) => {
      this.applyHit(atk as Phaser.GameObjects.GameObject, enemyObj as unknown as Damageable);
    });
    // fiendtlige angrep treffer spiller og følgesvenner
    this.physics.add.overlap(this.hostile, this.allyGroup, (atk, allyObj) => {
      this.applyHit(atk as Phaser.GameObjects.GameObject, allyObj as unknown as Damageable);
    });
  }

  private applyHit(atkObj: Phaser.GameObjects.GameObject, target: Damageable): void {
    const atk = atkObj as Phaser.GameObjects.Sprite;
    if (!atk.active || !target.isAlive()) return;
    const hitSet = atk.getData('hits') as Set<Damageable> | undefined;
    if (hitSet?.has(target)) return;
    const base = atk.getData('damage') as number;
    const element = atk.getData('element') as ElementId | undefined;
    const mult = elementMultiplier(element, target.getElement());
    const dealt = target.takeDamage(base * mult, element);
    const faction = atk.getData('faction') as string | undefined;
    if (dealt > 0) {
      // flytende skadetall (rødt på spilleren, hvitt på fiender) - kampfeedback
      const color = target === this.player ? '#ff7066' : '#ffffff';
      this.floatText(target.x, target.y - 16, String(dealt), color);
      // SLAGKRAFT: kast fienden bakover + lite kameraskjelv på spillerens treff
      if (target instanceof Enemy && !target.isBoss) {
        const ang = Phaser.Math.Angle.Between(atk.x, atk.y, target.x, target.y);
        const kb = faction === 'player' ? 170 : 130;
        target.applyKnockback(Math.cos(ang), Math.sin(ang), kb);
      }
      if (faction === 'player') this.cameras.main.shake(70, 0.004);
    }
    EventBus.emit('sfx', 'hit', element);
    if (hitSet) hitSet.add(target);
    // prosjektiler forsvinner ved første treff
    if (atk.getData('projectile')) atk.destroy();
  }

  /** Kort flytende tekst (skadetall o.l.) som stiger og falmer. */
  private floatText(x: number, y: number, text: string, color: string): void {
    const t = this.add
      .text(x, y, text, { fontSize: '14px', color, fontStyle: 'bold', stroke: '#000000', strokeThickness: 2 })
      .setOrigin(0.5)
      .setDepth(20);
    this.tweens.add({ targets: t, y: y - 18, alpha: 0, duration: 600, onComplete: () => t.destroy() });
  }

  private setupInput(): void {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,SPACE,E,F,I,M') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
    this.keys.E.on('down', () => this.onAction());
    this.keys.F.on('down', () => this.onAction());
    this.keys.I.on('down', () => this.onItem());
    this.keys.M.on('down', () => this.openMenu());

    // kontroller fra UI-scenen (mobil)
    const bind = (event: string, fn: (...a: unknown[]) => void) => {
      this.unbinders.push(EventBus.on(event, fn));
    };
    bind('ctrl:move', (v) => {
      const vec = v as { x: number; y: number };
      this.moveVec = vec;
    });
    bind('ctrl:attack', (down) => {
      this.attackHeld = !!down;
    });
    bind('ctrl:action', () => this.onAction());
    bind('ctrl:item', () => this.onItem());
    bind('ctrl:menu', () => this.openMenu());

    this.unbinders.push(EventBus.on(Events.PlayerDied, () => this.onPlayerDied()));
    this.unbinders.push(
      EventBus.on('menu:closed', () => {
        this.paused = false;
        this.physics.resume();
        // utstyr/lag kan ha endret seg - oppdater spillersprite og terreng
        this.rebuildPlayerTexture();
        this.buildTerrain();
      }),
    );
    this.unbinders.push(
      EventBus.on('world:rebuild-team', () => {
        this.respawnCompanions();
        this.buildTerrain();
      }),
    );
    this.unbinders.push(
      EventBus.on('player:buff', (b) => {
        const buff = b as { stat: 'damage' | 'speed' | 'armor'; amount: number; durationMs: number };
        this.player.addBuff(buff.stat, buff.amount, buff.durationMs);
      }),
    );
  }

  // --- IWorld -------------------------------------------------------------
  spawnAttack(req: AttackRequest): void {
    const isProjectile = req.pattern === 'projectile' || req.pattern === 'spellburst';
    const texture = isProjectile ? 'projectile' : 'slash';
    const group = req.faction === 'enemy' ? this.hostile : this.offense;
    const sprite = group.create(req.x, req.y, texture) as Phaser.Physics.Arcade.Sprite;
    sprite.setDepth(11);
    sprite.setData('damage', req.damage);
    sprite.setData('element', req.element);
    sprite.setData('faction', req.faction);
    sprite.setData('hits', new Set<Damageable>());
    this.tintByElement(sprite, req.element);
    EventBus.emit('sfx', 'attack', req.element);

    if (isProjectile) {
      sprite.setData('projectile', true);
      const speed = 360;
      sprite.setVelocity(req.dirX * speed, req.dirY * speed);
      const life = Math.min(1200, (req.range / speed) * 1000 + 200);
      this.time.delayedCall(life, () => sprite.active && sprite.destroy());
    } else {
      // nærkamp: kort levetid, skaler treffsone etter rekkevidde
      const scale = Math.max(0.6, req.radius / 16);
      sprite.setScale(scale);
      sprite.setAlpha(0.6);
      (sprite.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
      this.tweens.add({ targets: sprite, alpha: 0, duration: 160 });
      this.time.delayedCall(160, () => sprite.active && sprite.destroy());
    }
  }

  private tintByElement(sprite: Phaser.GameObjects.Sprite, element?: ElementId): void {
    if (element) sprite.setTint(Data.element(element).color);
  }

  nearestEnemy(x: number, y: number, maxRange = Infinity): Damageable | null {
    let best: Enemy | null = null;
    let bestD = maxRange;
    for (const obj of this.enemies.getChildren()) {
      const e = obj as Enemy;
      if (!e.isAlive()) continue;
      const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
      if (d <= bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  enemiesInRadius(x: number, y: number, radius: number): Damageable[] {
    const out: Damageable[] = [];
    for (const obj of this.enemies.getChildren()) {
      const e = obj as Enemy;
      if (e.isAlive() && Phaser.Math.Distance.Between(x, y, e.x, e.y) <= radius) out.push(e);
    }
    return out;
  }

  private allies(): Ally[] {
    return [this.player, ...this.companions.filter((c) => c.isAlive())];
  }

  lowestHealthAlly(x: number, y: number, maxRange: number): Ally | null {
    let best: Ally | null = null;
    let bestRatio = Infinity;
    for (const a of this.allies()) {
      if (Phaser.Math.Distance.Between(x, y, a.x, a.y) > maxRange) continue;
      const r = a.healthRatio();
      if (r < bestRatio) {
        bestRatio = r;
        best = a;
      }
    }
    return best;
  }

  alliesInRadius(x: number, y: number, radius: number): Ally[] {
    return this.allies().filter((a) => Phaser.Math.Distance.Between(x, y, a.x, a.y) <= radius);
  }

  playerPos(): { x: number; y: number } {
    return { x: this.player.x, y: this.player.y };
  }

  playerMoving(): boolean {
    const b = this.player.body as Phaser.Physics.Arcade.Body;
    return Math.abs(b.velocity.x) + Math.abs(b.velocity.y) > 12;
  }

  // Bygg ufremkommelig terreng (vann/lava/kløft) som kan krysses med riktig
  // utforskningsevne (spec kap. 21, 23). Bygges om når laget endres.
  private buildTerrain(): void {
    this.terrainColliders.forEach((c) => this.physics.world.removeCollider(c));
    this.terrainColliders = [];
    this.terrainObjs.forEach((o) => o.destroy());
    this.terrainObjs = [];
    this.terrainReveals = []; // unngå stale referanser ved ombygging (lagendring)
    this.terrainBlocks?.clear(true, true);
    const regions = this.zone.terrain;
    if (!regions || regions.length === 0) return;
    if (!this.terrainBlocks) this.terrainBlocks = this.physics.add.staticGroup();
    const built = this.profile.clearedTerrain ?? [];

    regions.forEach((t, idx) => {
      const cx = t.x + t.w / 2;
      const cy = t.y + t.h / 2;
      // Stein-vegg (dungeon-korridorer, spec kap. 26): alltid solid, grå med fuger.
      if (t.type === 'wall') {
        this.terrainObjs.push(this.add.rectangle(cx, cy, t.w, t.h, 0x4a4650, 1).setDepth(3));
        this.terrainObjs.push(this.add.rectangle(cx, cy - t.h / 2 + 4, t.w, 8, 0x5f5a68, 1).setDepth(3)); // lysere topp
        this.terrainObjs.push(this.add.rectangle(cx, cy + t.h / 2 - 3, t.w, 6, 0x35323c, 1).setDepth(3)); // skygge-base
        // murstein-fuger
        for (let mx = t.x + 24; mx < t.x + t.w - 8; mx += 48) this.terrainObjs.push(this.add.rectangle(mx, cy, 2, t.h, 0x35323c, 0.8).setDepth(3));
        for (let my = t.y + 18; my < t.y + t.h - 8; my += 24) this.terrainObjs.push(this.add.rectangle(cx, my, t.w, 2, 0x35323c, 0.6).setDepth(3));
        const wblock = this.terrainBlocks!.create(cx, cy, 'pixel') as Phaser.Physics.Arcade.Sprite;
        wblock.setVisible(false).setDisplaySize(t.w, t.h).refreshBody();
        return;
      }
      // Hekk-vegg (labyrint, spec kap. 25): frodig busk-tekstur (tilbar) + mørk kant.
      if (t.type === 'hedge') {
        this.terrainObjs.push(this.add.tileSprite(cx, cy, t.w, t.h, 'hedge_tile').setDepth(3));
        this.terrainObjs.push(this.add.rectangle(cx, cy, t.w, t.h).setStrokeStyle(3, 0x16300d, 0.85).setDepth(3)); // kant
        const hblock = this.terrainBlocks!.create(cx, cy, 'pixel') as Phaser.Physics.Arcade.Sprite;
        hblock.setVisible(false).setDisplaySize(t.w, t.h).refreshBody();
        return;
      }
      const fill = t.type === 'water' ? 0x3a6ea5 : t.type === 'lava' ? 0xc4471f : 0x14161c;
      this.terrainObjs.push(this.add.rectangle(cx, cy, t.w, t.h, fill, t.type === 'gap' ? 0.92 : 0.8).setDepth(2));
      this.terrainObjs.push(
        this.add.rectangle(cx, cy - t.h * 0.2, t.w * 0.7, t.h * 0.22, 0xffffff, 0.12).setDepth(2),
      );
      // Bygd permanent tidligere -> krysningen blir, uavhengig av om kin er i laget nå.
      const key = `${this.zone.id}:T${idx}`;
      const alreadyBuilt = built.includes(key);
      // Uten `requires` er regionen alltid solid (selve elva utenom brostedet).
      const passable = !!t.requires && (alreadyBuilt || ExplorationSystem.hasAbility(this.profile, t.requires));
      if (passable) {
        // Krysningsgrafikken tegnes skjult og "bygges" med animasjon når man når den.
        const cross: Phaser.GameObjects.Shape[] = [];
        if (t.requires === 'build_bridges') {
          // Bro-DEKK som dekker HELE krysningen (ikke en tynn planke over vann),
          // så man tydelig går på broen og ikke i vannet.
          cross.push(this.add.rectangle(cx, cy, t.w, t.h, 0x8a5a2b, 1).setDepth(3));
          const along = t.w >= t.h; // bro spenner langs den lengste aksen
          if (along) for (let px = t.x + 8; px < t.x + t.w - 4; px += 16) cross.push(this.add.rectangle(px, cy, 2, t.h, 0x6e4620, 1).setDepth(3));
          else for (let py = t.y + 8; py < t.y + t.h - 4; py += 16) cross.push(this.add.rectangle(cx, py, t.w, 2, 0x6e4620, 1).setDepth(3));
          // sidekanter (rekkverk) langs bredden
          cross.push(this.add.rectangle(cx, t.y + 3, t.w, 5, 0x9a6a3b, 1).setDepth(3));
          cross.push(this.add.rectangle(cx, t.y + t.h - 3, t.w, 5, 0x9a6a3b, 1).setDepth(3));
        } else if (t.requires === 'freeze_water') {
          cross.push(this.add.rectangle(cx, cy, t.w, t.h, 0xcfeeff, 0.7).setDepth(3));
        } else {
          for (let i = 0; i < 3; i++) {
            const sx = t.x + (t.w / 4) * (i + 1);
            cross.push(this.add.circle(sx, cy, 8, 0x8a8e7a, 0.96).setDepth(3));
          }
        }
        this.terrainObjs.push(...cross);
        if (alreadyBuilt) {
          // allerede bygd: vis ferdig krysning uten ny animasjon
          this.terrainReveals.push({ key, cx, cy, requires: t.requires!, objs: cross, revealed: true });
        } else {
          cross.forEach((o) => o.setAlpha(0));
          this.terrainReveals.push({ key, cx, cy, requires: t.requires!, objs: cross, revealed: false });
        }
      } else {
        const block = this.terrainBlocks!.create(cx, cy, 'pixel') as Phaser.Physics.Arcade.Sprite;
        block.setVisible(false).setDisplaySize(t.w, t.h).refreshBody();
        block.setData('requires', t.requires);
        // Terrenget skal lese seg selv (spec kap. 4, 21): vannet/lavaen ER barrieren.
        // For bygge-bro-terreng tegnes en ØDELAGT bro (planke-stubber + gap) i stedet for tekst.
        if (t.requires === 'build_bridges') {
          const plankH = Math.min(t.h, 20);
          const stubW = t.w * 0.3;
          this.terrainObjs.push(this.add.rectangle(t.x + stubW / 2, cy, stubW, plankH, 0x8a5a2b, 0.96).setDepth(3));
          this.terrainObjs.push(this.add.rectangle(t.x + t.w - stubW / 2, cy, stubW, plankH, 0x8a5a2b, 0.96).setDepth(3));
          // frynsete taustumper inn mot det manglende midtpartiet
          for (const sx of [t.x + stubW, t.x + t.w - stubW]) {
            this.terrainObjs.push(this.add.rectangle(sx, cy - plankH * 0.28, 6, 2, 0xcfc0a0, 0.9).setDepth(3));
            this.terrainObjs.push(this.add.rectangle(sx, cy + plankH * 0.28, 6, 2, 0xcfc0a0, 0.9).setDepth(3));
          }
        }
      }
    });

    const blocks = this.terrainBlocks;
    this.terrainColliders.push(
      this.physics.add.collider(this.allyGroup, blocks, undefined, (_ally, b) => {
        this.terrainHint((b as Phaser.GameObjects.GameObject).getData('requires') as string);
        return true;
      }),
    );
    this.terrainColliders.push(this.physics.add.collider(this.enemies, blocks));
  }

  private ownsSpecies(id: string): boolean {
    return this.profile.monsters.some((m) => m.speciesId === id);
  }

  /** Flytende "Ny!"-merke over en kin man ikke eier fra før (spec kap. 14). */
  private addNewKinBadge(enemy: Enemy): void {
    const badge = this.add
      .text(enemy.x, enemy.y - 46, t('ui.new_kin'), {
        fontSize: '13px', color: '#ffe066', stroke: '#5a3d00', strokeThickness: 4, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(20);
    this.tweens.add({ targets: badge, scaleX: 1.18, scaleY: 1.18, yoyo: true, repeat: -1, duration: 540, ease: 'Sine.InOut' });
    this.newKinBadges.push({ enemy, obj: badge });
  }

  /** Alltid synlig merke som viser hvilken evne et hinder/terreng krever. */
  private addRequirementLabel(x: number, y: number, requires: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, `🔒 ${t('ability_explore.' + requires)}`, {
        fontSize: '12px', color: '#ffd479', stroke: '#000000', strokeThickness: 3,
        backgroundColor: '#00000066', padding: { x: 5, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(15);
  }

  // "Bygg" krysningen med animasjon når laget når den (spec kap. 21, 23).
  private checkTerrainReveal(): void {
    if (this.terrainReveals.length === 0) return;
    for (const r of this.terrainReveals) {
      if (r.revealed) continue;
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, r.cx, r.cy) > 120) continue;
      r.revealed = true;
      // bygg permanent: kin trengs ikke neste gang man passerer (engangs)
      this.profile.clearedTerrain = this.profile.clearedTerrain ?? [];
      if (!this.profile.clearedTerrain.includes(r.key)) {
        this.profile.clearedTerrain.push(r.key);
        this.autosave();
      }
      this.exploreEffect(r.cx, r.cy, r.requires);
      EventBus.emit('sfx', 'explore');
      for (const o of r.objs) {
        o.setScale(0.4);
        this.tweens.add({ targets: o, alpha: 1, scaleX: 1, scaleY: 1, duration: 360, ease: 'Back.Out' });
      }
    }
  }

  private terrainHint(req: string | undefined): void {
    if (!req) return; // solid vann/lava uten krav - barrieren er åpenbar, ingen hint
    const now = this.time.now;
    if (now - this.lastTerrainHint < 1800) return;
    this.lastTerrainHint = now;
    EventBus.emit(Events.Toast, t('exploration.need_ability', { ability: t(`ability_explore.${req}`) }));
  }

  // Tegn spilleren på nytt fra utseende + utstyrt rustning (spec kap. 8, 11).
  private rebuildPlayerTexture(): void {
    const look = this.profile.equippedArmor
      ? Data.armorDef(this.profile.equippedArmor).look
      : undefined;
    const wdef = Data.weapon(this.profile.equippedWeapon);
    const weapon = {
      type: wdef.type,
      color: wdef.element ? Data.element(wdef.element).color : 0xc8ccd6,
    };
    TextureFactory.buildPlayerTexture(this, 'player_active', this.profile.appearance, look, weapon);
    // .scene er undefined på et ødelagt sprite etter scene.restart - unngå det
    if (this.player && this.player.scene) this.player.setTexture('player_active');
  }

  /**
   * Garanterer at en entitet aldri forlater verdenen. Klamper den arkade-fysiske
   * kroppen (autoritær over sprite-posisjon) per akse, så glidning langs kanten
   * fortsatt fungerer. Mer pålitelig enn collideWorldBounds i denne Phaser 4-en.
   */
  // Prominent boss-helsestolpe (spec kap. 24): vis navn + HP når en levende boss
  // er i nærheten, så bosskampen leses som en bosskamp. Skjules ellers.
  private updateBossBar(): void {
    let boss: Enemy | null = null;
    for (const o of this.enemies.getChildren()) {
      const e = o as Enemy;
      if (e.isBoss && e.isAlive() && Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y) < 560) {
        boss = e;
        break;
      }
    }
    if (boss) {
      this.bossBarVisible = true;
      EventBus.emit('boss:update', {
        name: t(boss.def.forms[1].nameKey),
        ratio: boss.healthRatio(),
        weak: boss.isVulnerable(),
      });
    } else if (this.bossBarVisible) {
      this.bossBarVisible = false;
      EventBus.emit('boss:hide');
    }
  }

  // Hold følgesvenner fra å stå oppå hverandre: mykt skyv overlappende par fra
  // hverandre hver frame, så de går ved siden av hverandre (brukerkrav).
  private separateCompanions(): void {
    const cs = this.companions.filter((c) => c.active && c.isAlive());
    if (cs.length < 2) return;
    const min = 44; // ønsket senter-til-senter-avstand (~spritebredde)
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) {
        const a = cs[i];
        const b = cs[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= min) continue;
        if (d < 0.01) { dx = (i % 2 === 0 ? 1 : -1); dy = 0; d = 1; } // helt oppå hverandre
        const push = (min - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        a.x -= ux * push; a.y -= uy * push;
        b.x += ux * push; b.y += uy * push;
      }
    }
  }

  private clampToWorld(sprite: Phaser.Physics.Arcade.Sprite): void {
    const b = sprite.body as Phaser.Physics.Arcade.Body;
    const maxX = this.zone.width - b.width;
    const maxY = this.zone.height - b.height;
    let dx = 0;
    let dy = 0;
    if (b.x < 0) { dx = -b.x; if (b.velocity.x < 0) b.velocity.x = 0; }
    else if (b.x > maxX) { dx = maxX - b.x; if (b.velocity.x > 0) b.velocity.x = 0; }
    if (b.y < 0) { dy = -b.y; if (b.velocity.y < 0) b.velocity.y = 0; }
    else if (b.y > maxY) { dy = maxY - b.y; if (b.velocity.y > 0) b.velocity.y = 0; }
    // flytt BÅDE kropp og sprite med samme delta - korrekt uansett skala/origin
    if (dx !== 0 || dy !== 0) {
      b.x += dx; b.y += dy;
      sprite.x += dx; sprite.y += dy;
    }
  }

  // --- aggro / mål-valg (spec kap. 16-17) ---------------------------------
  private taunt: { ally: Ally; radius: number; until: number } | null = null;

  registerTaunt(ally: Ally, radius: number, durationMs: number): void {
    this.taunt = { ally, radius, until: this.time.now + durationMs };
  }

  /** Aggro-vekt: tanks trekker fiender, bruisere litt; spiller/andre normalt. */
  private aggroWeight(a: Ally): number {
    if (a instanceof Companion) {
      if (a.def.role === 'tank') return 2.6;
      if (a.def.role === 'bruiser') return 1.5;
    }
    return 1;
  }

  enemyTarget(x: number, y: number): { x: number; y: number } {
    // aktiv taunt overstyrer hvis taunteren lever og er innen sin radius
    if (this.taunt && this.time.now < this.taunt.until && this.taunt.ally.isAlive()) {
      const a = this.taunt.ally;
      if (Phaser.Math.Distance.Between(x, y, a.x, a.y) <= this.taunt.radius) {
        return { x: a.x, y: a.y };
      }
    }
    // ellers velg alliert etter vekt og nærhet
    let best: Ally | null = null;
    let bestScore = -1;
    for (const a of this.allies()) {
      const d = Phaser.Math.Distance.Between(x, y, a.x, a.y);
      const score = this.aggroWeight(a) / (d + 40);
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    }
    return best ? { x: best.x, y: best.y } : this.playerPos();
  }

  summonMinions(speciesId: string, x: number, y: number, level: number, count: number): void {
    if (!Data.monsters.has(speciesId)) return;
    const def = Data.monster(speciesId);
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count;
      const mx = Phaser.Math.Clamp(x + Math.cos(ang) * 70, 40, this.zone.width - 40);
      const my = Phaser.Math.Clamp(y + Math.sin(ang) * 70, 40, this.zone.height - 40);
      const minion = new Enemy(this, this, mx, my, def, level, false);
      this.enemies.add(minion);
      addIdleBob(this, minion);
    }
  }

  // --- spillerhandlinger --------------------------------------------------
  private onAction(): void {
    if (this.paused) return;
    // 1) rekruttering (spec kap. 14)
    const recruit = this.findNearestRecruitable();
    if (recruit) {
      this.tryRecruit(recruit);
      return;
    }
    // 2) nærmeste interaksjon (NPC, kiste, hindring, utgang)
    const near = this.findNearestInteractable(70);
    if (!near) return;
    if (near.kind === 'npc') this.interactNpc(near.data as ReturnType<typeof Data.npc>);
    else if (near.kind === 'chest') this.openChest(near);
    else if (near.kind === 'obstacle') this.tryObstacle(near);
    else if (near.kind === 'switch') this.tryPuzzleSwitch(near.data as { puzzle: number; sw: number }, near.sprite);
    else if (near.kind === 'exit') this.tryExit(near.data as ZoneDef['exits'][number]);
  }

  private onItem(): void {
    if (this.paused) return;
    // hurtigbruk: første helsedrikk i inventaret
    const entry = this.profile.inventory.find((e) => e.id === 'health_potion' && e.count > 0);
    if (!entry) {
      EventBus.emit(Events.Toast, t('common.empty'));
      return;
    }
    const item = Data.item('health_potion');
    if (item.effect?.type === 'heal') {
      this.player.heal(item.effect.amount);
      entry.count -= 1;
      if (entry.count <= 0) this.profile.inventory = this.profile.inventory.filter((e) => e.count > 0);
      EventBus.emit(Events.Toast, t('item.health_potion.name'));
    }
  }

  private openMenu(): void {
    if (this.paused) return;
    this.paused = true;
    this.physics.pause();
    this.scene.launch('Menu', { type: 'main' });
  }

  // Kontekst-følsom handlingstekst nær spilleren (gjør kjernemekanikker
  // synlige: rekruttering kap. 14, NPC-er kap. 27, kister kap. 26).
  private lastPrompt = '';
  private updateActionPrompt(): void {
    let text = '';
    const rec = this.findNearestRecruitable();
    if (rec) {
      text = t('combat.recruit_prompt', { name: t(rec.def.nameKey) });
    } else {
      const near = this.findNearestInteractable(70);
      if (near?.kind === 'npc') text = t('ui.interact');
      else if (near?.kind === 'chest') text = t('ui.open');
      else if (near?.kind === 'obstacle') text = t('controls.action');
      else if (near?.kind === 'switch') text = t('puzzle.activate');
    }
    if (text !== this.lastPrompt) {
      this.lastPrompt = text;
      EventBus.emit('prompt:set', text);
    }
  }

  // --- rekruttering -------------------------------------------------------
  private findNearestRecruitable(): Enemy | null {
    let best: Enemy | null = null;
    let bestD = 70;
    for (const obj of this.enemies.getChildren()) {
      const e = obj as Enemy;
      if (!e.isRecruitable()) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
      if (d <= bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private findNearestInteractable(
    maxDist: number,
  ): { sprite: Phaser.GameObjects.Sprite; kind: string; data: unknown } | null {
    let best: (typeof this.interactables)[number] | null = null;
    let bestD = maxDist;
    for (const it of this.interactables) {
      if (it.kind === 'exit') continue; // utganger håndteres ved kollisjon
      if (!it.sprite.active) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, it.sprite.x, it.sprite.y);
      if (d <= bestD) {
        bestD = d;
        best = it;
      }
    }
    return best;
  }

  private tryRecruit(enemy: Enemy): void {
    const name = t(enemy.def.nameKey);
    if (RecruitmentSystem.alreadyOwns(this.profile, enemy.def.id)) {
      EventBus.emit(Events.Toast, t('combat.already_owned', { name }));
      return;
    }
    RecruitmentSystem.recruit(this.profile, enemy.def.id);
    EventBus.emit(Events.Toast, t('combat.recruit_success', { name }));
    EventBus.emit(Events.MonsterRecruited, enemy.def.id);
    this.progressRecruit(enemy.def.id);
    this.markSpawnDefeated(enemy); // rekruttert kin respawner ikke straks
    this.recruitEffect(enemy.x, enemy.y); // "ny venn"-øyeblikk (spec kap. 36)
    enemy.destroy();
    this.respawnCompanions();
    this.autosave();
  }

  private respawnCompanions(): void {
    for (const c of this.companions) c.destroy();
    this.spawnCompanions();
    EventBus.emit(Events.TeamChanged);
  }

  // --- interaksjoner ------------------------------------------------------
  private interactNpc(def: ReturnType<typeof Data.npc>): void {
    if (def.role === 'healer') {
      this.healEverything();
      EventBus.emit(Events.Toast, t('npc.healer.name'));
      this.startDialogue(def.dialogue);
      this.autosave();
      return;
    }
    if ((def.role === 'shop' || def.role === 'smith') && def.shopItems) {
      this.paused = true;
      this.physics.pause();
      this.scene.launch('Menu', { type: 'shop', npc: def.id });
      return;
    }
    if (def.role === 'questgiver') {
      // oppdragsgiver: åpne oppdragsloggen (spec kap. 27)
      this.paused = true;
      this.physics.pause();
      this.scene.launch('Menu', { type: 'quests', npc: def.id });
      return;
    }
    this.startDialogue(def.dialogue);
  }

  private startDialogue(dialogueId: string): void {
    const dlg = Data.dialogue(dialogueId);
    EventBus.emit(
      Events.Dialogue,
      dlg.lines.map((l) => t(l.textKey)),
    );
  }

  private healEverything(): void {
    this.profile.currentHp = SaveManager.computeMaxHp();
    for (const m of this.profile.monsters) {
      m.fainted = false;
      const def = Data.monster(m.speciesId);
      m.currentHp = monsterMaxHp(def.forms[m.evolved ? 1 : 0].stats.maxHp, m.level);
      m.currentMana = def.forms[m.evolved ? 1 : 0].stats.maxMana ?? 0;
    }
    EventBus.emit(Events.PlayerHpChanged, this.profile.currentHp, SaveManager.computeMaxHp());
    this.respawnCompanions();
  }

  private openChest(entry: { sprite: Phaser.GameObjects.Sprite; data: unknown }): void {
    const chest = entry.data as ZoneDef['chests'][number];
    if (chest.requires && !ExplorationSystem.hasAbility(this.profile, chest.requires)) {
      EventBus.emit(Events.Toast, t('exploration.need_ability', { ability: t(`ability_explore.${chest.requires}`) }));
      return;
    }
    // låst kiste som krever (og forbruker) en gjenstand, f.eks. dungeon-nøkkel
    if (chest.requiresItem) {
      const held = this.profile.inventory.find((e) => e.id === chest.requiresItem && e.count > 0);
      if (!held) {
        EventBus.emit(Events.Toast, t('chest.locked', { item: t(Data.item(chest.requiresItem).nameKey) }));
        return;
      }
      held.count -= 1;
      this.profile.inventory = this.profile.inventory.filter((e) => e.count > 0);
    }
    this.grantLoot(chest.loot, chest.lootKind);
    EventBus.emit('sfx', 'chest');
    this.profile.openedChests.push(chest.id);
    entry.sprite.destroy();
    this.interactables = this.interactables.filter((i) => i.sprite !== entry.sprite);
    this.autosave();
  }

  private grantLoot(id: string, kind: 'item' | 'weapon' | 'armor'): void {
    const got = (name: string) => EventBus.emit(Events.Toast, t('ui.got_loot', { item: name }));
    if (kind === 'weapon') {
      if (!this.profile.ownedWeapons.includes(id)) this.profile.ownedWeapons.push(id);
      got(t(Data.weapon(id).nameKey));
    } else if (kind === 'armor') {
      if (!this.profile.ownedArmor.includes(id)) this.profile.ownedArmor.push(id);
      got(t(Data.armorDef(id).nameKey));
    } else {
      const item = Data.item(id);
      if (item.kind === 'heart_container') {
        this.profile.heartContainers += 1;
        this.profile.maxHp += 4;
        this.profile.currentHp = SaveManager.computeMaxHp();
        EventBus.emit(Events.PlayerHpChanged, this.profile.currentHp, SaveManager.computeMaxHp());
        got(t('item.heart_container.name'));
      } else if (item.kind === 'team_slot') {
        this.expandTeam();
      } else {
        this.addItem(id, 1);
        got(t(item.nameKey));
      }
    }
  }

  private addItem(id: string, count: number): void {
    const entry = this.profile.inventory.find((e) => e.id === id);
    if (entry) entry.count += count;
    else this.profile.inventory.push({ id, count });
  }

  // Utvider det aktive laget 1 -> 2 -> 3 (spec kap. 15).
  private expandTeam(): void {
    if (this.profile.teamSize >= 3) {
      EventBus.emit(Events.Toast, t('team.max'));
      return;
    }
    this.profile.teamSize += 1;
    // fyll den nye plassen med et eid, ikke-besvimt monster utenfor laget
    const bench = this.profile.monsters.find(
      (m) => !m.fainted && !this.profile.activeTeam.includes(m.speciesId),
    );
    if (bench && this.profile.activeTeam.length < this.profile.teamSize) {
      this.profile.activeTeam.push(bench.speciesId);
    }
    EventBus.emit(Events.Toast, t('team.expanded', { size: this.profile.teamSize }));
    EventBus.emit(Events.TeamChanged);
    this.respawnCompanions();
  }

  private tryObstacle(entry: { sprite: Phaser.GameObjects.Sprite; data: unknown; label?: Phaser.GameObjects.Text }): void {
    const ob = entry.data as ZoneDef['obstacles'][number];
    if (!ExplorationSystem.hasAbility(this.profile, ob.requires)) {
      EventBus.emit(Events.Toast, t('exploration.need_ability', { ability: t(`ability_explore.${ob.requires}`) }));
      return;
    }
    const provider = ExplorationSystem.providerOf(this.profile, ob.requires);
    const monName = provider ? t(Data.monster(provider).nameKey) : '';
    EventBus.emit(Events.Toast, t('exploration.used', { monster: monName, ability: t(`ability_explore.${ob.requires}`) }));
    EventBus.emit('sfx', 'explore');
    // monsteret som har evnen «kaster» den (effekt ved monsteret), så ryddes hindringen
    const caster = this.companions.find((c) => c.isAlive() && c.owned.speciesId === provider);
    if (caster) this.exploreEffect(caster.x, caster.y - 10, ob.requires);
    this.exploreEffect(entry.sprite.x, entry.sprite.y, ob.requires);
    // rydd hindringen permanent (engangs, som bro-bygging) + lagre
    this.profile.clearedObstacles = this.profile.clearedObstacles ?? [];
    if (!this.profile.clearedObstacles.includes(ob.id)) this.profile.clearedObstacles.push(ob.id);
    this.autosave();
    // animer hindringen vekk i stedet for å forsvinne brått
    const s = entry.sprite;
    this.interactables = this.interactables.filter((i) => i.sprite !== s);
    if (entry.label) this.tweens.add({ targets: entry.label, alpha: 0, duration: 280, onComplete: () => entry.label!.destroy() });
    this.tweens.add({ targets: s, alpha: 0, scale: s.scale * 0.4, duration: 320, onComplete: () => s.destroy() });
  }

  /** Ability-spesifikk visuell effekt når et monster bruker utforskningsevnen. */
  // Vennskaps-effekt når et monster rekrutteres (spec kap. 14, 36): myk rosa glød,
  // svevende hjerter og glitter - et lite "ny venn"-øyeblikk.
  /**
   * Selvoppofrings-gjenoppliving (spec kap. 29, 36 «små øyeblikk»): følgesvennen
   * brister i gyllent lys ved sin egen posisjon, og helten blinker gyllent
   * tilbake til live. Speiler recruit/evolve/victory-effektene.
   */
  private reviveEffect(rx: number, ry: number): void {
    // gyllent offer-brak ved følgesvennen
    const burst = this.add.circle(rx, ry, 30, 0xffe066, 0.7).setDepth(20).setScale(0.3);
    this.tweens.add({ targets: burst, scale: 2.2, alpha: 0, duration: 620, ease: 'Cubic.Out', onComplete: () => burst.destroy() });
    // sjel som stiger oppover
    const soul = this.add.circle(rx, ry, 7, 0xfff4c2, 0.95).setDepth(21);
    this.tweens.add({ targets: soul, y: ry - 64, alpha: 0, scale: 0.4, duration: 760, ease: 'Sine.Out', onComplete: () => soul.destroy() });
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI * 2 * i) / 10 + Math.random() * 0.3;
      const spark = this.add.circle(rx, ry, 2 + Math.random() * 2, 0xffe89a, 1).setDepth(21);
      this.tweens.add({
        targets: spark, x: rx + Math.cos(a) * (30 + Math.random() * 22), y: ry + Math.sin(a) * (30 + Math.random() * 22),
        alpha: 0, scale: 0.2, duration: 600, ease: 'Cubic.Out', onComplete: () => spark.destroy(),
      });
    }
    // helten blinker gyllent tilbake til live + en gyllen puls-ring
    this.player.setTint(0xffe066);
    this.time.delayedCall(420, () => this.player.clearTint());
    const ring = this.add.circle(this.player.x, this.player.y, 22, 0xffe066, 0).setDepth(19).setStrokeStyle(3, 0xffe066, 0.9);
    this.tweens.add({ targets: ring, scale: 2.6, alpha: 0, duration: 560, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
  }

  private recruitEffect(x: number, y: number): void {
    // rosa glød-ring
    const ring = this.add.circle(x, y, 40, 0xff9ab0, 0.5).setDepth(16).setScale(0.3);
    this.tweens.add({ targets: ring, scale: 1.4, alpha: 0, duration: 560, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
    // svevende hjerter
    for (let i = 0; i < 5; i++) {
      const hx = x + (i - 2) * 12 + (Math.random() * 8 - 4);
      const heart = this.add.image(hx, y, 'heart').setDepth(18).setScale(0.6 + Math.random() * 0.5);
      this.tweens.add({
        targets: heart, y: y - 46 - Math.random() * 26, alpha: 0, duration: 720 + Math.random() * 260,
        delay: i * 70, ease: 'Sine.Out', onComplete: () => heart.destroy(),
      });
    }
    // glitter
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8 + Math.random() * 0.4;
      const spark = this.add.circle(x, y, 2 + Math.random() * 2, 0xffe0ee, 1).setDepth(17);
      this.tweens.add({
        targets: spark, x: x + Math.cos(a) * (26 + Math.random() * 18), y: y + Math.sin(a) * (26 + Math.random() * 18),
        alpha: 0, scale: 0.2, duration: 520, ease: 'Cubic.Out', onComplete: () => spark.destroy(),
      });
    }
  }

  private exploreEffect(x: number, y: number, ability: string): void {
    const burst = (color: number, n: number, spread: number) => {
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + Math.random() * 0.6;
        const dot = this.add.circle(x, y, 3 + Math.random() * 2, color, 1).setDepth(16);
        this.tweens.add({
          targets: dot, x: x + Math.cos(a) * spread, y: y + Math.sin(a) * spread,
          alpha: 0, scale: 0.3, duration: 380, onComplete: () => dot.destroy(),
        });
      }
    };
    const rise = (color: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const dx = (i - (n - 1) / 2) * 8;
        const dot = this.add.circle(x + dx, y + 8, 3, color, 1).setDepth(16);
        this.tweens.add({ targets: dot, y: y - 26 - Math.random() * 12, alpha: 0, duration: 460, delay: i * 40, onComplete: () => dot.destroy() });
      }
    };
    const ring = (color: number) => {
      const r = this.add.circle(x, y, 8, color, 0.35).setStrokeStyle(2, color, 0.9).setDepth(16);
      this.tweens.add({ targets: r, scale: 5, alpha: 0, duration: 420, onComplete: () => r.destroy() });
    };
    switch (ability) {
      case 'smash_rocks': burst(0x9a9aa4, 8, 34); break; // steinsplinter
      case 'dig_tunnels': burst(0x8a6a3a, 8, 30); break; // jordsprut
      case 'build_bridges': burst(0x8a5a2b, 6, 28); ring(0xbfe9ff); break; // planker + vindkast
      case 'grow_vines': rise(0x6cc34a, 6); break; // lianer spirer
      case 'light_torches': rise(0xffa83a, 5); ring(0xffd24a); break; // flamme
      case 'jump_water': burst(0x4aa3ff, 8, 30); break; // vannsprut
      case 'freeze_water': burst(0xcfeeff, 8, 26); break; // isbiter
      case 'reveal_walls': ring(0xffffff); break; // skjult vegg avsløres
      case 'illuminate_dark': ring(0xfff3a0); ring(0xffffff); break; // lys
      case 'activate_machines': burst(0x6cd0ff, 6, 26); ring(0x6cd0ff); break; // maskin-gnister
      case 'charge_runes': rise(0xb088ff, 5); ring(0xb088ff); break; // runeglød
      case 'find_treasure': rise(0xffd479, 6); break; // gullglitter
      default: ring(0xffffff);
    }
  }

  private tryExit(exit: ZoneDef['exits'][number]): void {
    if (this.time.now < this.exitCooldownUntil || this.exitBuilding) return;
    // Nøkkel-låst inngang (Zelda-stil): forbruker en nøkkel ÉN gang, så forblir åpen.
    if (exit.requiresItem) {
      const doorKey = `${this.zone.id}:${exit.to}`;
      this.profile.unlockedDoors = this.profile.unlockedDoors ?? [];
      if (!this.profile.unlockedDoors.includes(doorKey)) {
        const held = this.profile.inventory.find((e) => e.id === exit.requiresItem && e.count > 0);
        if (!held) {
          if (this.time.now - this.lastExitHint > 1800) {
            this.lastExitHint = this.time.now;
            EventBus.emit(Events.Toast, t('chest.locked', { item: t(Data.item(exit.requiresItem).nameKey) }));
          }
          return;
        }
        held.count -= 1;
        this.profile.inventory = this.profile.inventory.filter((e) => e.count > 0);
        this.profile.unlockedDoors.push(doorKey); // permanent åpen
        EventBus.emit(Events.Toast, t('ui.unlocked', { item: t(Data.item(exit.requiresItem).nameKey) }));
      }
    }
    if (exit.requires && !ExplorationSystem.hasAbility(this.profile, exit.requires)) {
      // veien er sperret - vis hva som trengs (men ikke spam toasten hvert frame)
      if (this.time.now - this.lastExitHint > 1800) {
        this.lastExitHint = this.time.now;
        EventBus.emit(Events.Toast, t('exploration.need_ability', { ability: t(`ability_explore.${exit.requires}`) }));
      }
      return;
    }
    // Gated utgang man KAN passere: spill bygge-/rydde-animasjon før kryssing,
    // så man ser at følgesvennen f.eks. bygger en bro (brukerkrav).
    if (exit.requires) {
      this.exitBuilding = true;
      const provider = ExplorationSystem.providerOf(this.profile, exit.requires);
      const monName = provider ? t(Data.monster(provider).nameKey) : '';
      EventBus.emit(Events.Toast, t('exploration.used', { monster: monName, ability: t(`ability_explore.${exit.requires}`) }));
      EventBus.emit('sfx', 'explore');
      const caster = this.companions.find((c) => c.isAlive() && c.owned.speciesId === provider);
      if (caster) this.exploreEffect(caster.x, caster.y - 10, exit.requires);
      this.exploreEffect(exit.x, exit.y, exit.requires);
      const barrier = this.exitBarriers.get(exit.to);
      if (barrier) this.tweens.add({ targets: barrier, alpha: 0, scaleX: barrier.scaleX * 1.1, scaleY: barrier.scaleY * 1.1, duration: 520 });
      this.exitCooldownUntil = this.time.now + 1200; // unngå at kollisjonen re-trigger under animasjonen
      this.time.delayedCall(620, () => this.doExit(exit));
      return;
    }
    this.doExit(exit);
  }

  private doExit(exit: ZoneDef['exits'][number]): void {
    // Kort reise-overgang i stedet for instant hopp (spec kap. 25): fade til svart
    // med målsone-navn, frys verden, og bytt sone når skjermen er svart.
    const destName = Data.zones.has(exit.to) ? t(Data.zone(exit.to).nameKey) : exit.to;
    EventBus.emit('zone:travel-out', destName);
    this.paused = true;
    this.exitCooldownUntil = this.time.now + 1400; // hindre re-trigger under fade
    this.time.delayedCall(460, () => {
      this.exitBuilding = false;
      this.profile.currentZone = exit.to;
      this.profile.spawnX = exit.spawnX;
      this.profile.spawnY = exit.spawnY;
      SaveManager.save();
      this.scene.restart();
    });
  }

  // --- oppdrag (spec kap. 34) ---------------------------------------------
  private progressRecruit(speciesId: string): void {
    for (const q of Data.quests.values()) {
      if (q.objective.type === 'recruit' && q.objective.target === speciesId) {
        this.completeQuest(q.id, q.reward);
      }
    }
  }
  private progressReachZone(zoneId: string): void {
    // avdekk sonen på verdenskartet (spec kap. 32)
    this.profile.visitedZones = this.profile.visitedZones ?? [];
    if (!this.profile.visitedZones.includes(zoneId)) {
      this.profile.visitedZones.push(zoneId);
      this.autosave();
    }
    for (const q of Data.quests.values()) {
      if (q.objective.type === 'reach_zone' && q.objective.zone === zoneId) {
        this.completeQuest(q.id, q.reward);
      }
    }
  }
  private progressDefeat(speciesId: string): void {
    for (const q of Data.quests.values()) {
      if (q.objective.type !== 'defeat' || q.objective.target !== speciesId) continue;
      const prog = this.profile.questProgress[q.id] ?? { complete: false, progress: 0 };
      if (prog.complete) continue;
      prog.progress += 1;
      if (prog.progress >= q.objective.count) this.completeQuest(q.id, q.reward);
      else {
        this.profile.questProgress[q.id] = prog;
        EventBus.emit('quest:updated');
      }
    }
  }
  private completeQuest(id: string, reward: { gold?: number; item?: string }): void {
    const prog = this.profile.questProgress[id];
    if (prog?.complete) return;
    this.profile.questProgress[id] = { complete: true, progress: 1 };
    if (reward.gold) {
      this.profile.gold += reward.gold;
      EventBus.emit(Events.PlayerGoldChanged, this.profile.gold);
    }
    if (reward.item) this.addItem(reward.item, 1);
    EventBus.emit(Events.Toast, t(Data.quests.get(id)!.titleKey));
    EventBus.emit('quest:updated');
  }

  // --- fiendedød ----------------------------------------------------------
  private handleEnemyDeath(enemy: Enemy): void {
    // liten "poff" i elementfarge når fienden beseires (kampfeedback)
    const poof = this.add.circle(enemy.x, enemy.y, enemy.isBoss ? 26 : 14, Data.element(enemy.def.element).color, 0.5).setDepth(7);
    this.tweens.add({ targets: poof, scale: 1.8, alpha: 0, duration: 320, onComplete: () => poof.destroy() });
    const xp = enemy.def.xpReward * (enemy.isBoss ? 4 : 1);
    for (const c of this.companions) c.gainXp(xp);
    EventBus.emit(Events.Toast, t('combat.xp_gained', { xp }));
    this.progressDefeat(enemy.def.id);
    if (enemy.isBoss) {
      EventBus.emit(Events.Toast, t('combat.boss_defeated', { name: t(enemy.def.forms[1].nameKey) }));
      // bossbelønning: gull + sjeldent utstyr (spec kap. 28) + autosave (spec kap. 30)
      this.profile.gold += 50;
      EventBus.emit(Events.PlayerGoldChanged, this.profile.gold);
      if (enemy.loot) this.grantLoot(enemy.loot.id, enemy.loot.kind);
      // Seiers-øyeblikk når den siste bossen faller (spec kap. 36)
      if (enemy.getData('finalBoss') && !this.profile.victory) {
        this.profile.victory = true;
        EventBus.emit('victory');
      }
      this.autosave();
    }
    this.markSpawnDefeated(enemy);
    enemy.destroy();
  }

  /** Marker en spawn som beseiret slik at den ikke respawner straks (spec kap. 24). */
  private markSpawnDefeated(enemy: Enemy): void {
    const key = enemy.getData('spawnKey') as string | undefined;
    if (!key) return;
    this.profile.defeatedSpawns = this.profile.defeatedSpawns ?? {};
    this.profile.defeatedSpawns[key] = Date.now();
    this.autosave();
  }

  // --- død & gjenoppliving (spec kap. 29) ---------------------------------
  private onPlayerDied(): void {
    const reviver = this.companions.find(
      (c) => c.isAlive() && Data.monster(c.owned.speciesId).revivePassive,
    );
    if (reviver) {
      const rx = reviver.x;
      const ry = reviver.y;
      reviver.takeDamage(99999);
      this.profile.currentHp = Math.round(SaveManager.computeMaxHp() * 0.5);
      EventBus.emit(Events.PlayerHpChanged, this.profile.currentHp, SaveManager.computeMaxHp());
      EventBus.emit(Events.Toast, t('gameover.revive', { name: t(reviver.def.nameKey) }));
      this.reviveEffect(rx, ry);
      EventBus.emit('player:revived'); // stigende «andre vind»-jingle (spec kap. 29, 36)
      return;
    }
    this.paused = true;
    this.physics.pause();
    this.scene.launch('GameOver');
  }

  // --- lagring ------------------------------------------------------------
  private autosave(): void {
    // Stille autolagring (spec kap. 30): en diskret lyd, men INGEN toast - den
    // skjedde hvert soneskifte/kiste/boss og overskygget viktige meldinger
    // (loot, rekruttering, lagvekst). Lyden via Events.Saved er nok feedback.
    SaveManager.save();
    EventBus.emit(Events.Saved);
  }

  private cleanup(): void {
    for (const u of this.unbinders) u();
    this.unbinders = [];
    EventBus.emit('music:stop');
    SaveManager.save();
  }

  // --- hovedløkke ---------------------------------------------------------
  update(time: number, delta: number): void {
    if (this.paused || !this.player.isAlive()) return;

    // bevegelse: tastatur overstyrer hvis brukt, ellers joystick
    let vx = 0;
    let vy = 0;
    if (this.cursors.left.isDown || this.keys.A.isDown) vx = -1;
    else if (this.cursors.right.isDown || this.keys.D.isDown) vx = 1;
    if (this.cursors.up.isDown || this.keys.W.isDown) vy = -1;
    else if (this.cursors.down.isDown || this.keys.S.isDown) vy = 1;
    if (vx === 0 && vy === 0) {
      vx = this.moveVec.x;
      vy = this.moveVec.y;
    }
    this.player.setMoveInput(vx, vy);
    this.player.update();
    this.clampToWorld(this.player);
    faceByVelocity(this.player);
    this.updateActionPrompt();
    this.checkTerrainReveal();

    if (this.attackHeld || this.keys.SPACE.isDown) this.player.tryAttack(time);

    for (const c of this.companions) {
      c.update(time, delta);
      this.clampToWorld(c);
      faceByVelocity(c);
    }
    this.separateCompanions();

    // dynamisk bossmusikk: bytt tema når en levende boss er i nærheten (spec kap. 5)
    this.musicCheckAcc += delta;
    if (this.musicCheckAcc >= 800) {
      this.musicCheckAcc = 0;
      const bossNear = this.enemies.getChildren().some((o) => {
        const e = o as Enemy;
        return (
          e.isBoss &&
          e.isAlive() &&
          Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y) < 520
        );
      });
      if (bossNear !== this.bossMusic) {
        this.bossMusic = bossNear;
        EventBus.emit('music:play', this.zone.theme, bossNear);
      }
    }

    // fiender + dødssjekk
    for (const obj of this.enemies.getChildren()) {
      const e = obj as Enemy;
      if (e.isAlive()) {
        e.update(time);
        this.clampToWorld(e);
        faceByVelocity(e);
      } else if (e.active) this.handleEnemyDeath(e);
    }
    this.updateBossBar();

    // "Ny!"-merker følger ueide kin; fjernes når de dør/rekrutteres/eies
    for (let i = this.newKinBadges.length - 1; i >= 0; i--) {
      const b = this.newKinBadges[i];
      if (!b.enemy.active || !b.enemy.isAlive() || this.ownsSpecies(b.enemy.getSpecies())) {
        b.obj.destroy();
        this.newKinBadges.splice(i, 1);
        continue;
      }
      b.obj.setPosition(b.enemy.x, b.enemy.y - 46);
    }

    // utgangskollisjon
    for (const it of this.interactables) {
      if (it.kind !== 'exit') continue;
      const ex = it.data as ZoneDef['exits'][number];
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, it.sprite.x, it.sprite.y) < 32) {
        this.tryExit(ex);
        break;
      }
    }
  }
}
