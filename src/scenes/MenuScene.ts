import Phaser from 'phaser';
import { t, Localization } from '../i18n/Localization';
import { Data } from '../core/DataManager';
import { SaveManager } from '../save/SaveManager';
import { Settings } from '../core/Settings';
import { AudioManager } from '../core/AudioManager';
import { EventBus, Events } from '../core/EventBus';
import { Button, panel, heading, label } from '../ui/widgets';
import { QuestSystem } from '../systems/QuestSystem';
import { xpForNext, monsterMaxHp } from '../systems/Progression';
import type { ProfileData } from '../types';

type MenuType = 'main' | 'shop' | 'quests';
type Tab = 'inventory' | 'monsters' | 'equipment' | 'map' | 'settings' | 'profile';

// Nodefarger per sonetema på verdenskartet (spec kap. 32).
const MAP_THEME_COLOR: Record<string, number> = {
  village: 0x8fae6a,
  forest: 0x4a9e5a,
  mountain: 0x8a8e9a,
  swamp: 0x5a7a4a,
  volcano: 0xc4471f,
  snow: 0xbfe0f0,
  ruins: 0xb0a080,
  castle: 0x9a86c0,
};

interface MenuData {
  type: MenuType;
  npc?: string;
}

// Menysystem (spec kap. 32). Inventar, monstre, utstyr, kart, innstillinger,
// profil - samt butikk (spec kap. 28).
export class MenuScene extends Phaser.Scene {
  private profile!: ProfileData;
  private tab: Tab = 'inventory';
  private menuType: MenuType = 'main';
  private npcId?: string;
  private content!: Phaser.GameObjects.Container;

  constructor() {
    super('Menu');
  }

  create(data: MenuData): void {
    this.profile = SaveManager.getActive();
    this.menuType = data.type;
    this.npcId = data.npc;
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6);
    // Nær-fullskjerm-panel: dekker verden + HUD i margene, og rommer alt innhold
    // (faner, lukk-knapp, rader) som er lagt ut i full skjermbredde (spec kap. 32).
    panel(this, width / 2, height / 2, width - 12, height - 12, 0.98);

    this.content = this.add.container(0, 0);
    this.setupScroll();

    // lukk-knapp
    new Button(this, width - 60, 50, t('common.close'), () => this.close(), {
      width: 90,
      height: 40,
      fontSize: 16,
    });

    if (this.menuType === 'shop') {
      heading(this, width / 2, 50, t('ui.shop'));
      this.renderShop();
      this.updateScrollBounds();
    } else if (this.menuType === 'quests') {
      heading(this, width / 2, 50, t('ui.quests'));
      this.renderQuests();
      this.updateScrollBounds();
    } else {
      this.renderTabs();
      this.renderTab();
    }
  }

  // --- rulling i lange lister (mobil drag + hjul) -------------------------
  private scrollMin = 0;
  private viewTop = 0;
  private viewBottom = 0;

  private setupScroll(): void {
    const { width, height } = this.scale;
    this.viewTop = this.menuType === 'shop' || this.menuType === 'quests' ? 96 : 122;
    this.viewBottom = height - 26;
    // klippemaske så innhold utenfor listeområdet ikke vises over faner/knapper
    const maskG = this.make.graphics({ x: 0, y: 0 }, false);
    maskG.fillRect(0, this.viewTop, width, this.viewBottom - this.viewTop);
    this.content.setMask(maskG.createGeometryMask());
    // dra for å rulle (touch/mus)
    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (!ptr.isDown || this.scrollMin >= 0) return;
      const dy = ptr.position.y - ptr.prevPosition.y;
      this.content.y = Phaser.Math.Clamp(this.content.y + dy, this.scrollMin, 0);
      this.cullContent();
    });
    // musehjul
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      if (this.scrollMin >= 0) return;
      this.content.y = Phaser.Math.Clamp(this.content.y - dy * 0.5, this.scrollMin, 0);
      this.cullContent();
    });
  }

  // Skjul + deaktiver input på listeelementer som er rullet utenfor det synlige
  // området, så rader/knapper ikke vises over fanene eller under panelet, og
  // skjulte knappers treffområder ikke ligger «bak» andre knapper (brukerkrav).
  private cullContent(): void {
    const cy = this.content.y;
    for (const child of this.content.list as Phaser.GameObjects.GameObject[]) {
      const gy = cy + ((child as unknown as { y: number }).y ?? 0);
      const vis = gy >= this.viewTop - 80 && gy <= this.viewBottom + 30; // maske finpusser kantene
      (child as unknown as { setVisible?: (v: boolean) => void }).setVisible?.(vis);
      if (child instanceof Button) child.setHitEnabled(gy >= this.viewTop && gy <= this.viewBottom);
    }
  }

  /** Beregn rulle-grenser etter at en liste er rendret. */
  private updateScrollBounds(): void {
    this.content.y = 0;
    const b = this.content.getBounds();
    // hvor langt innholdet stikker under synlig bunn
    this.scrollMin = Math.min(0, this.viewBottom - (b.y + b.height) - 12);
    // vis "rull ned"-hint kun når det faktisk er mer under
    if (this.scrollMin < 0 && !this.scrollHint) {
      this.scrollHint = this.add
        .text(this.scale.width / 2, this.viewBottom - 2, '▾ ' + t('common.next'), { fontSize: '13px', color: '#9fb0d0' })
        .setOrigin(0.5, 1)
        .setDepth(5);
      this.tweens.add({ targets: this.scrollHint, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
    } else if (this.scrollMin >= 0 && this.scrollHint) {
      this.scrollHint.destroy();
      this.scrollHint = undefined;
    }
    this.cullContent();
  }

  private scrollHint?: Phaser.GameObjects.Text;

  // --- oppdragslogg (spec kap. 27, 34) -----------------------------------
  private renderQuests(): void {
    const { width } = this.scale;
    let y = this.listTop();
    const all = QuestSystem.all(this.profile);
    if (all.length === 0) {
      this.content.add(label(this, width / 2 - 100, y, t('ui.no_quests')));
      return;
    }
    for (const s of all) {
      const titleColor = s.complete ? '#7fd98a' : '#ffd479';
      this.content.add(label(this, width / 2 - 330, y, t(s.quest.titleKey), 18, titleColor));
      this.content.add(label(this, width / 2 - 330, y + 22, t(s.quest.descKey), 13, '#8fa0c0'));
      const statusTxt = s.complete
        ? `✓ ${t('quest.status.complete')}`
        : `${t('quest.status.active')} · ${QuestSystem.label(s)}`;
      this.content.add(label(this, width / 2 + 150, y + 4, statusTxt, 14, s.complete ? '#7fd98a' : '#cfd6e6'));
      // belønning
      const r = s.quest.reward;
      const rewardTxt = [r.gold ? `${r.gold} ${t('common.gold')}` : '', r.item ? t(Data.item(r.item).nameKey) : '']
        .filter(Boolean)
        .join(' · ');
      if (rewardTxt) this.content.add(label(this, width / 2 + 150, y + 26, `${t('quest.reward')}: ${rewardTxt}`, 11, '#8fa0c0'));
      y += 64;
    }
  }

  private close(): void {
    SaveManager.save();
    EventBus.emit('menu:closed');
    this.scene.stop();
  }

  // --- faner --------------------------------------------------------------
  private renderTabs(): void {
    const tabs: Tab[] = ['inventory', 'monsters', 'equipment', 'map', 'settings', 'profile'];
    const labels: Record<Tab, string> = {
      inventory: t('ui.inventory'),
      monsters: t('ui.monsters'),
      equipment: t('ui.equipment'),
      map: t('ui.map'),
      settings: t('ui.settings'),
      profile: t('ui.profile'),
    };
    const { width } = this.scale;
    const startX = width / 2 - 350;
    tabs.forEach((tab, i) => {
      new Button(
        this,
        startX + i * 118,
        96,
        labels[tab],
        () => {
          this.tab = tab;
          this.renderTab();
        },
        { width: 110, height: 40, fontSize: 15, bg: this.tab === tab ? 0x3a4a70 : 0x222a3c },
      );
    });
  }

  private renderTab(): void {
    this.content.removeAll(true);
    switch (this.tab) {
      case 'inventory':
        this.renderInventory();
        break;
      case 'monsters':
        this.renderMonsters();
        break;
      case 'equipment':
        this.renderEquipment();
        break;
      case 'map':
        this.renderMap();
        break;
      case 'settings':
        this.renderSettings();
        break;
      case 'profile':
        this.renderProfile();
        break;
    }
    this.updateScrollBounds();
  }

  private listTop(): number {
    return 150;
  }

  // --- inventar -----------------------------------------------------------
  private renderInventory(): void {
    const { width } = this.scale;
    let y = this.listTop();
    if (this.profile.inventory.length === 0) {
      this.content.add(label(this, width / 2 - 100, y, t('common.empty')));
      return;
    }
    for (const entry of this.profile.inventory) {
      const item = Data.item(entry.id);
      const name = `${t(item.nameKey)}  x${entry.count}`;
      this.content.add(label(this, width / 2 - 330, y + 8, name, 18));
      this.content.add(label(this, width / 2 - 330, y + 30, t(item.descKey), 13, '#8fa0c0'));
      if (item.kind === 'consumable') {
        const btn = new Button(this, width / 2 + 260, y + 16, t('ui.use'), () => this.useItem(entry.id), {
          width: 110,
          height: 40,
          fontSize: 16,
        });
        this.content.add(btn);
      }
      y += 64;
    }
  }

  private useItem(id: string): void {
    const item = Data.item(id);
    const entry = this.profile.inventory.find((e) => e.id === id);
    if (!entry || entry.count <= 0 || !item.effect) return;
    const eff = item.effect;
    if (eff.type === 'heal') this.profile.currentHp = Math.min(SaveManager.computeMaxHp(), this.profile.currentHp + eff.amount);
    else if (eff.type === 'heal_monster') {
      // Prioriter å gjenopplive et besvimt monster (hovedpoenget, spec kap. 19),
      // ellers helbred det mest skadde monsteret i laget.
      const maxHpOf = (mm: typeof this.profile.monsters[number]) => monsterMaxHp(Data.monster(mm.speciesId).forms[mm.evolved ? 1 : 0].stats.maxHp, mm.level);
      const ratio = (mm: typeof this.profile.monsters[number]) => mm.currentHp / maxHpOf(mm);
      const target =
        this.profile.monsters.find((mm) => mm.fainted) ??
        [...this.profile.monsters].filter((mm) => ratio(mm) < 1).sort((a, b) => ratio(a) - ratio(b))[0];
      if (!target) return; // ingenting å helbrede
      target.currentHp = Math.min(maxHpOf(target), target.currentHp + eff.amount);
      if (target.currentHp > 0) target.fainted = false; // gjenopplivet
    } else if (eff.type === 'restore_mana') {
      const m = this.profile.monsters.find((mm) => Data.monster(mm.speciesId).resourceSystem === 'mana');
      if (m) {
        const maxMana = Data.monster(m.speciesId).forms[m.evolved ? 1 : 0].stats.maxMana ?? 0;
        m.currentMana = Math.min(maxMana, m.currentMana + eff.amount);
      }
    } else if (eff.type === 'buff') {
      // buffen påføres den levende spilleren i WorldScene
      EventBus.emit('player:buff', { stat: eff.stat, amount: eff.amount, durationMs: eff.durationMs });
    }
    entry.count -= 1;
    this.profile.inventory = this.profile.inventory.filter((e) => e.count > 0);
    EventBus.emit(Events.PlayerHpChanged, this.profile.currentHp, SaveManager.computeMaxHp());
    EventBus.emit(Events.TeamChanged);
    this.renderTab();
  }

  // --- monstre ------------------------------------------------------------
  private renderMonsters(): void {
    const { width } = this.scale;
    let y = this.listTop();
    if (this.profile.monsters.length === 0) {
      this.content.add(label(this, width / 2 - 100, y, t('common.empty')));
      return;
    }
    for (const owned of this.profile.monsters) {
      const def = Data.monster(owned.speciesId);
      const form = def.forms[owned.evolved ? 1 : 0];
      const inTeam = this.profile.activeTeam.includes(owned.speciesId);
      // tydelig markering av monstre som er i det aktive laget
      if (inTeam) {
        this.content.add(this.add.rectangle(width / 2 - 40, y + 24, 700, 66, 0x44d07a, 0.13));
        this.content.add(this.add.rectangle(width / 2 - 346, y + 24, 5, 62, 0x44d07a));
      }
      const icon = this.add.image(width / 2 - 330, y + 20, form.sprite).setScale(0.9);
      if (owned.fainted) icon.setTint(0x555555);
      this.content.add(icon);
      const nameTxt = (inTeam ? '★ ' : '') + `${t(form.nameKey)}  ${t('ui.level', { n: owned.level })}`;
      this.content.add(label(this, width / 2 - 300, y, nameTxt, 18, inTeam ? '#7fd98a' : '#ffffff'));
      const meta = `${t('role.' + def.role)} · ${t('element.' + def.element)} · ${t('ability_explore.' + def.explorationAbility)}`;
      this.content.add(label(this, width / 2 - 300, y + 24, meta, 13, '#8fa0c0'));
      // HP / XP / ressurs (spec kap. 18, 20)
      if (owned.fainted) {
        this.content.add(label(this, width / 2 - 300, y + 42, t('ui.fainted'), 13, '#ff7777'));
      } else {
        const resource =
          def.resourceSystem === 'mana'
            ? `${t('ui.mana')} ${owned.currentMana}/${form.stats.maxMana ?? 0}`
            : t('ui.cooldown');
        const maxHp = monsterMaxHp(form.stats.maxHp, owned.level);
        const status =
          `${t('ui.hp')} ${Math.min(owned.currentHp, maxHp)}/${maxHp}` +
          ` · ${t('ui.xp')} ${owned.xp}/${xpForNext(owned.level)}` +
          ` · ${resource}`;
        this.content.add(label(this, width / 2 - 300, y + 42, status, 13, '#9fe0b0'));
      }

      const btn = new Button(
        this,
        width / 2 + 280,
        y + 24,
        inTeam ? t('ui.remove_from_team') : t('ui.add_to_team'),
        () => this.toggleTeam(owned.speciesId),
        { width: 150, height: 44, fontSize: 13, bg: inTeam ? 0x6a2030 : 0x2f8f5b },
      );
      this.content.add(btn);
      y += 74;
    }
  }

  private toggleTeam(speciesId: string): void {
    const team = this.profile.activeTeam;
    const idx = team.indexOf(speciesId);
    if (idx >= 0) {
      team.splice(idx, 1); // fjern fra lag
    } else if (team.length < this.profile.teamSize) {
      team.push(speciesId); // ledig plass
    } else {
      // laget er fullt - bytt automatisk når valget er entydig (spec-vennlig UX):
      // 1) erstatt en besvimt plass, 2) ellers erstatt den eneste plassen.
      const faintedSlot = team.findIndex((id) => this.profile.monsters.find((m) => m.speciesId === id)?.fainted);
      if (faintedSlot >= 0) {
        team[faintedSlot] = speciesId;
      } else if (this.profile.teamSize === 1) {
        team[0] = speciesId;
      } else {
        // flere friske å velge mellom - da må spilleren fjerne en selv
        EventBus.emit(Events.Toast, t('ui.team_full'));
        return;
      }
    }
    EventBus.emit(Events.TeamChanged);
    EventBus.emit('world:rebuild-team');
    this.renderTab();
  }

  // --- utstyr -------------------------------------------------------------
  private renderEquipment(): void {
    const { width } = this.scale;
    let y = this.listTop();
    this.content.add(label(this, width / 2 - 330, y - 26, t('ui.equipment'), 20, '#ffd479'));
    const markEquipped = (eq: boolean) => {
      if (!eq) return;
      this.content.add(this.add.rectangle(width / 2 - 40, y + 10, 700, 50, 0x44d07a, 0.13));
      this.content.add(this.add.rectangle(width / 2 - 346, y + 10, 5, 46, 0x44d07a));
    };
    for (const id of this.profile.ownedWeapons) {
      const w = Data.weapon(id);
      const equipped = this.profile.equippedWeapon === id;
      markEquipped(equipped);
      this.content.add(label(this, width / 2 - 330, y, `${equipped ? '✓ ' : '⚔ '}${t(w.nameKey)}`, 17, equipped ? '#7fd98a' : '#ffffff'));
      this.content.add(
        label(this, width / 2 - 330, y + 20, `${t('ui.damage')} ${w.damage} · ${t('ui.range')} ${w.range}`, 12, '#8fa0c0'),
      );
      this.content.add(
        new Button(this, width / 2 + 280, y + 10, equipped ? t('ui.equipped') : t('ui.equip'), () => {
          this.profile.equippedWeapon = id;
          this.renderTab();
        }, { width: 130, height: 40, fontSize: 14, bg: equipped ? 0x2f8f5b : 0x2a3550 }),
      );
      y += 56;
    }
    for (const id of this.profile.ownedArmor) {
      const a = Data.armorDef(id);
      const equipped = this.profile.equippedArmor === id;
      markEquipped(equipped);
      this.content.add(label(this, width / 2 - 330, y, `${equipped ? '✓ ' : '🛡 '}${t(a.nameKey)}`, 17, equipped ? '#7fd98a' : '#ffffff'));
      this.content.add(label(this, width / 2 - 330, y + 20, `${t('ui.armor')} ${a.armor}`, 12, '#8fa0c0'));
      this.content.add(
        new Button(this, width / 2 + 280, y + 10, equipped ? t('ui.equipped') : t('ui.equip'), () => {
          this.profile.equippedArmor = id;
          EventBus.emit(Events.PlayerHpChanged, this.profile.currentHp, SaveManager.computeMaxHp());
          this.renderTab();
        }, { width: 130, height: 40, fontSize: 14, bg: equipped ? 0x2f8f5b : 0x2a3550 }),
      );
      y += 56;
    }
  }

  // --- kart ---------------------------------------------------------------
  // Visuelt verdenskart som avdekkes ved utforskning (spec kap. 32, 36).
  // Besøkte soner vises i temafarge og koblet sammen; uutforskede nabosoner
  // vises som «???» (frampek), og helt ukjente soner skjules.
  private renderMap(): void {
    const { width } = this.scale;
    const cx = width / 2;
    const main = [...Data.zones.values()].filter((z) => z.mapX !== undefined && z.mapY !== undefined);
    const byId = new Map(main.map((z) => [z.id, z]));
    const visited = new Set(this.profile.visitedZones ?? ['village']);
    const neighbors = (id: string) => (byId.get(id)?.exits ?? []).map((e) => e.to).filter((to) => byId.has(to));
    const isFrontier = (z: (typeof main)[number]) => !visited.has(z.id) && neighbors(z.id).some((n) => visited.has(n));
    const shown = (z: (typeof main)[number]) => visited.has(z.id) || isFrontier(z);
    const px = (z: (typeof main)[number]) => cx - 240 + (z.mapX ?? 0) * 160;
    const py = (z: (typeof main)[number]) => 215 + (z.mapY ?? 0) * 150;

    this.content.add(label(this, cx - 330, 124, t('ui.map'), 20, '#ffd479'));

    // forbindelseslinjer (bak nodene)
    const drawn = new Set<string>();
    for (const z of main) {
      if (!shown(z)) continue;
      for (const nId of neighbors(z.id)) {
        const nz = byId.get(nId)!;
        if (!shown(nz)) continue;
        const key = [z.id, nId].sort().join('|');
        if (drawn.has(key)) continue;
        drawn.add(key);
        const line = this.add.line(0, 0, px(z), py(z), px(nz), py(nz), 0x5a6480, 0.85).setOrigin(0, 0).setLineWidth(3);
        this.content.add(line);
      }
    }

    // noder
    for (const z of main) {
      if (!shown(z)) continue;
      const x = px(z);
      const y = py(z);
      if (visited.has(z.id)) {
        const cur = z.id === this.profile.currentZone;
        if (cur) this.content.add(this.add.circle(x, y, 33, 0xffd479, 0.9));
        this.content.add(this.add.circle(x, y, 27, MAP_THEME_COLOR[z.theme] ?? 0x8fa0c0, 1).setStrokeStyle(2, 0x101018));
        const name = this.add
          .text(x, y + 40, `${cur ? '➤ ' : ''}${t(z.nameKey)}`, { fontSize: '14px', color: cur ? '#ffd479' : '#e8ecf4', fontStyle: cur ? 'bold' : 'normal' })
          .setOrigin(0.5);
        this.content.add(name);
      } else {
        // uutforsket nabosone - frampek til mer å oppdage
        this.content.add(this.add.circle(x, y, 25, 0x2a2f3c, 1).setStrokeStyle(2, 0x4a5060));
        this.content.add(this.add.text(x, y, '?', { fontSize: '22px', color: '#8a90a0', fontStyle: 'bold' }).setOrigin(0.5));
        this.content.add(this.add.text(x, y + 40, t('ui.undiscovered'), { fontSize: '13px', color: '#7a8090' }).setOrigin(0.5));
      }
    }
  }

  // --- innstillinger ------------------------------------------------------
  private renderSettings(): void {
    const { width } = this.scale;
    let y = this.listTop();
    // språk
    this.content.add(label(this, width / 2 - 330, y, t('ui.language'), 18));
    this.content.add(
      new Button(this, width / 2 + 100, y + 10, Localization.getLanguage().toUpperCase(), () => {
        const next = Localization.getLanguage() === 'nb' ? 'en' : 'nb';
        Settings.setLanguage(next);
        this.profile.language = next;
        SaveManager.save();
        this.scene.restart({ type: 'main' });
      }, { width: 100, height: 40, fontSize: 16 }),
    );
    y += 60;
    // musikk
    this.content.add(label(this, width / 2 - 330, y, t('ui.music'), 18));
    const musicBtn = new Button(this, width / 2 + 100, y + 10, Settings.music ? t('ui.on') : t('ui.off'), () => {
      const on = Settings.toggleMusic();
      musicBtn.setText(on ? t('ui.on') : t('ui.off'));
      AudioManager.refreshFromSettings();
      if (on) EventBus.emit('music:play', Data.zone(this.profile.currentZone).theme, false);
    }, { width: 100, height: 40, fontSize: 16 });
    this.content.add(musicBtn);
    y += 60;
    // lydeffekter
    this.content.add(label(this, width / 2 - 330, y, t('ui.sfx'), 18));
    const sfxBtn = new Button(this, width / 2 + 100, y + 10, Settings.sfx ? t('ui.on') : t('ui.off'), () => {
      const on = Settings.toggleSfx();
      sfxBtn.setText(on ? t('ui.on') : t('ui.off'));
    }, { width: 100, height: 40, fontSize: 16 });
    this.content.add(sfxBtn);
  }

  // --- profil -------------------------------------------------------------
  private renderProfile(): void {
    const { width } = this.scale;
    let y = this.listTop();
    this.content.add(label(this, width / 2 - 330, y, `${t('creation.name')}: ${this.profile.name}`, 20));
    y += 36;
    this.content.add(label(this, width / 2 - 330, y, `${t('item.heart_container.name')}: ${this.profile.heartContainers}`, 16, '#8fa0c0'));
    y += 30;
    this.content.add(label(this, width / 2 - 330, y, `${t('ui.monsters')}: ${this.profile.monsters.length}/${Data.allMonsters().length}`, 16, '#8fa0c0'));
    y += 50;
    this.content.add(
      new Button(this, width / 2 - 200, y, t('menu.profiles'), () => {
        SaveManager.save();
        EventBus.emit('menu:closed');
        this.scene.stop('UI');
        this.scene.stop('World');
        this.scene.stop();
        this.scene.start('ProfileSelect');
      }, { width: 220 }),
    );
  }

  // --- butikk: kjøp / selg / kjøp tilbake (spec kap. 28) ------------------
  private shopMode: 'buy' | 'sell' = 'buy';

  private refreshShop(): void {
    this.content.removeAll(true);
    this.renderShop();
    this.updateScrollBounds();
  }

  private renderShop(): void {
    const { width } = this.scale;
    if (!this.profile.buyback) this.profile.buyback = [];
    let y = this.listTop();
    this.content.add(label(this, width / 2 - 330, y - 32, `${t('common.gold')}: ${this.profile.gold}`, 18, '#ffd479'));
    // Kjøp / Selg-modus
    this.content.add(
      new Button(this, width / 2 + 70, y - 26, t('ui.buy'), () => { this.shopMode = 'buy'; this.refreshShop(); },
        { width: 110, height: 36, fontSize: 15, bg: this.shopMode === 'buy' ? 0x3a4a70 : 0x222a3c }),
    );
    this.content.add(
      new Button(this, width / 2 + 200, y - 26, t('ui.sell'), () => { this.shopMode = 'sell'; this.refreshShop(); },
        { width: 110, height: 36, fontSize: 15, bg: this.shopMode === 'sell' ? 0x3a4a70 : 0x222a3c }),
    );
    if (this.shopMode === 'buy') this.renderBuy(y);
    else this.renderSell(y);
  }

  private shopName(kind: 'item' | 'weapon' | 'armor', id: string): string {
    if (kind === 'weapon') return t(Data.weapon(id).nameKey);
    if (kind === 'armor') return t(Data.armorDef(id).nameKey);
    return t(Data.item(id).nameKey);
  }

  /** Stat-/effektlinje vist før kjøp/salg (spec kap. 28). */
  private shopStats(kind: 'item' | 'weapon' | 'armor', id: string): string {
    if (kind === 'weapon') {
      const w = Data.weapon(id);
      const el = w.element ? ` · ${t('element.' + w.element)}` : '';
      return `${t('ui.damage')} ${w.damage} · ${t('ui.range')} ${w.range}${el}`;
    }
    if (kind === 'armor') {
      const a = Data.armorDef(id);
      const hp = a.bonuses?.maxHp ? ` · +${a.bonuses.maxHp} ${t('ui.hp')}` : '';
      const sp = a.bonuses?.moveSpeed ? ` · +${a.bonuses.moveSpeed} ${t('ui.speed')}` : '';
      const res = a.bonuses?.resistElement ? ` · ${t('element.' + a.bonuses.resistElement)}` : '';
      return `${t('ui.armor')} ${a.armor}${hp}${sp}${res}`;
    }
    return t(Data.item(id).descKey);
  }

  private renderBuy(y: number): void {
    const { width } = this.scale;
    const npc = Data.npc(this.npcId!);
    for (const id of npc.shopItems ?? []) {
      const kind = Data.weapons.has(id) ? 'weapon' : Data.armor.has(id) ? 'armor' : 'item';
      const price = kind === 'weapon' ? Data.weapon(id).price : kind === 'armor' ? Data.armorDef(id).price : Data.item(id).price;
      this.content.add(label(this, width / 2 - 330, y, this.shopName(kind, id), 17));
      this.content.add(label(this, width / 2 - 330, y + 19, this.shopStats(kind, id), 12, '#8fa0c0'));
      this.content.add(label(this, width / 2 - 330, y + 37, `${price} ${t('common.gold')}`, 13, '#ffd479'));
      this.content.add(
        new Button(this, width / 2 + 280, y + 16, t('ui.buy'), () => this.buy(id, kind, price), { width: 120, height: 40, fontSize: 16 }),
      );
      y += 66;
    }
    // Kjøp tilbake (feilsalg)
    const bb = this.profile.buyback ?? [];
    if (bb.length > 0) {
      this.content.add(label(this, width / 2 - 330, y + 6, t('ui.buyback'), 16, '#9fb0d0'));
      y += 34;
      bb.forEach((e, i) => {
        this.content.add(label(this, width / 2 - 330, y, this.shopName(e.kind, e.id), 17));
        this.content.add(label(this, width / 2 - 330, y + 19, this.shopStats(e.kind, e.id), 12, '#8fa0c0'));
        this.content.add(label(this, width / 2 - 330, y + 37, `${e.price} ${t('common.gold')}`, 13, '#ffd479'));
        this.content.add(
          new Button(this, width / 2 + 280, y + 16, t('ui.buyback'), () => this.buyBack(i), { width: 140, height: 40, fontSize: 14, bg: 0x3a5a40 }),
        );
        y += 66;
      });
    }
  }

  private sellValue(kind: 'item' | 'weapon' | 'armor', id: string): number {
    const price = kind === 'weapon' ? Data.weapon(id).price : kind === 'armor' ? Data.armorDef(id).price : Data.item(id).price;
    return price > 0 ? Math.max(3, Math.floor(price * 0.5)) : 50; // sjeldne ting (pris 0) gir fast verdi
  }

  private renderSell(y: number): void {
    const { width } = this.scale;
    const rows: Array<{ kind: 'item' | 'weapon' | 'armor'; id: string; suffix?: string }> = [];
    for (const e of this.profile.inventory) {
      if (Data.item(e.id).kind === 'consumable') rows.push({ kind: 'item', id: e.id, suffix: ` x${e.count}` });
    }
    for (const id of this.profile.ownedWeapons) if (id !== this.profile.equippedWeapon) rows.push({ kind: 'weapon', id });
    for (const id of this.profile.ownedArmor) if (id !== this.profile.equippedArmor) rows.push({ kind: 'armor', id });
    if (rows.length === 0) {
      this.content.add(label(this, width / 2 - 330, y, t('ui.nothing_to_sell'), 16, '#8fa0c0'));
      return;
    }
    for (const r of rows) {
      const val = this.sellValue(r.kind, r.id);
      this.content.add(label(this, width / 2 - 330, y, this.shopName(r.kind, r.id) + (r.suffix ?? ''), 17));
      this.content.add(label(this, width / 2 - 330, y + 19, this.shopStats(r.kind, r.id), 12, '#8fa0c0'));
      this.content.add(label(this, width / 2 - 330, y + 37, `${val} ${t('common.gold')}`, 13, '#ffd479'));
      this.content.add(
        new Button(this, width / 2 + 280, y + 16, t('ui.sell'), () => this.sell(r.kind, r.id), { width: 120, height: 40, fontSize: 16, bg: 0x6a4a2a }),
      );
      y += 66;
    }
  }

  private buy(id: string, kind: 'item' | 'weapon' | 'armor', price: number): void {
    if (this.profile.gold < price) {
      EventBus.emit(Events.Toast, t('ui.not_enough_gold'));
      return;
    }
    this.profile.gold -= price;
    if (kind === 'weapon') {
      if (!this.profile.ownedWeapons.includes(id)) this.profile.ownedWeapons.push(id);
    } else if (kind === 'armor') {
      if (!this.profile.ownedArmor.includes(id)) this.profile.ownedArmor.push(id);
    } else {
      const entry = this.profile.inventory.find((e) => e.id === id);
      if (entry) entry.count += 1;
      else this.profile.inventory.push({ id, count: 1 });
    }
    EventBus.emit(Events.PlayerGoldChanged, this.profile.gold);
    EventBus.emit('sfx', 'buy');
    EventBus.emit(Events.Toast, this.shopName(kind, id));
    this.refreshShop();
  }

  private sell(kind: 'item' | 'weapon' | 'armor', id: string): void {
    const val = this.sellValue(kind, id);
    if (kind === 'item') {
      const entry = this.profile.inventory.find((e) => e.id === id);
      if (!entry) return;
      entry.count -= 1;
      this.profile.inventory = this.profile.inventory.filter((e) => e.count > 0);
    } else if (kind === 'weapon') {
      const i = this.profile.ownedWeapons.indexOf(id);
      if (i < 0) return;
      this.profile.ownedWeapons.splice(i, 1);
    } else {
      const i = this.profile.ownedArmor.indexOf(id);
      if (i < 0) return;
      this.profile.ownedArmor.splice(i, 1);
    }
    this.profile.gold += val;
    this.profile.buyback = this.profile.buyback ?? [];
    this.profile.buyback.unshift({ id, kind, price: val });
    if (this.profile.buyback.length > 12) this.profile.buyback.pop();
    EventBus.emit(Events.PlayerGoldChanged, this.profile.gold);
    EventBus.emit('sfx', 'buy');
    EventBus.emit(Events.Toast, t('ui.sold', { name: this.shopName(kind, id), gold: val }));
    this.refreshShop();
  }

  private buyBack(index: number): void {
    const bb = this.profile.buyback ?? [];
    const e = bb[index];
    if (!e) return;
    if (this.profile.gold < e.price) {
      EventBus.emit(Events.Toast, t('ui.not_enough_gold'));
      return;
    }
    this.profile.gold -= e.price;
    if (e.kind === 'weapon') {
      if (!this.profile.ownedWeapons.includes(e.id)) this.profile.ownedWeapons.push(e.id);
    } else if (e.kind === 'armor') {
      if (!this.profile.ownedArmor.includes(e.id)) this.profile.ownedArmor.push(e.id);
    } else {
      const entry = this.profile.inventory.find((x) => x.id === e.id);
      if (entry) entry.count += 1;
      else this.profile.inventory.push({ id: e.id, count: 1 });
    }
    bb.splice(index, 1);
    EventBus.emit(Events.PlayerGoldChanged, this.profile.gold);
    EventBus.emit('sfx', 'buy');
    EventBus.emit(Events.Toast, this.shopName(e.kind, e.id));
    this.refreshShop();
  }
}
