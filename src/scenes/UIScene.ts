import Phaser from 'phaser';
import { t } from '../i18n/Localization';
import { EventBus, Events } from '../core/EventBus';
import { SaveManager } from '../save/SaveManager';
import { Data } from '../core/DataManager';
import { QuestSystem } from '../systems/QuestSystem';
import { VirtualJoystick } from '../ui/VirtualJoystick';

// HUD og mobilkontroller (spec kap. 31-32). Kjører parallelt med WorldScene.
export class UIScene extends Phaser.Scene {
  private hpBar!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private teamBox!: Phaser.GameObjects.Container;
  private questText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private dialogueBox!: Phaser.GameObjects.Container;
  private dialogueLines: string[] = [];
  private dialogueIndex = 0;
  private fadeOverlay!: Phaser.GameObjects.Rectangle;
  private travelLabel!: Phaser.GameObjects.Text;
  private bossBar!: Phaser.GameObjects.Graphics;
  private bossName!: Phaser.GameObjects.Text;
  private unbinders: Array<() => void> = [];

  constructor() {
    super('UI');
  }

  create(): void {
    const { width, height } = this.scale;

    // HP-stolpe
    this.hpBar = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.hpText = this.add
      .text(20, 16, '', { fontSize: '14px', color: '#ffffff', fontStyle: 'bold' })
      .setScrollFactor(0)
      .setDepth(101);
    this.goldText = this.add
      .text(20, 44, '', { fontSize: '14px', color: '#ffd479' })
      .setScrollFactor(0)
      .setDepth(101);

    // lag-portretter
    this.teamBox = this.add.container(0, 0).setScrollFactor(0).setDepth(101);

    // oppdragssporer (spec kap. 27, 34)
    this.questText = this.add
      .text(width / 2, 16, '', { fontSize: '14px', color: '#ffd479', align: 'center' })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(101);

    // joystick (venstre)
    new VirtualJoystick(this, 110, height - 110);

    // handlingsknapper (høyre)
    this.makeButton(width - 80, height - 80, 52, t('controls.attack'), 0x9b2d30, {
      onDown: () => EventBus.emit('ctrl:attack', true),
      onUp: () => EventBus.emit('ctrl:attack', false),
    });
    this.makeButton(width - 180, height - 70, 40, t('controls.action'), 0x2f8f5b, {
      onDown: () => EventBus.emit('ctrl:action'),
    });
    this.makeButton(width - 80, height - 190, 36, t('controls.item'), 0x3b6ea5, {
      onDown: () => EventBus.emit('ctrl:item'),
    });
    this.makeButton(width - 44, 44, 30, t('controls.menu'), 0x444b56, {
      onDown: () => EventBus.emit('ctrl:menu'),
    });

    // toast
    this.toastText = this.add
      .text(width / 2, height - 150, '', {
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: '#000000aa',
        padding: { x: 10, y: 6 },
        align: 'center',
        wordWrap: { width: width - 200 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(120)
      .setAlpha(0);

    // kontekst-følsom handlingstekst (rekruttering, snakk, åpne) over knappene
    this.promptText = this.add
      .text(width / 2, height - 130, '', {
        fontSize: '17px',
        color: '#ffffff',
        backgroundColor: '#000000bb',
        padding: { x: 10, y: 5 },
        align: 'center',
        wordWrap: { width: width - 280 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(115)
      .setVisible(false);

    // build-ID (diagnostikk) i hjørnet
    this.add
      .text(6, height - 4, t('ui.build', { id: __BUILD__ }), { fontSize: '11px', color: '#566' })
      .setOrigin(0, 1)
      .setScrollFactor(0)
      .setDepth(102)
      .setAlpha(0.6);

    // dialogboks
    this.buildDialogueBox();

    // Boss-helsestolpe (spec kap. 24): prominent navn + HP øverst, skjult til en boss er nær.
    this.bossName = this.add
      .text(width / 2, 56, '', { fontSize: '16px', color: '#ffd0d0', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(103)
      .setVisible(false);
    this.bossBar = this.add.graphics().setScrollFactor(0).setDepth(103).setVisible(false);

    // Reise-overlegg (spec kap. 25): kort fade mellom soner i stedet for instant hopp.
    // Ligger over alt (HUD + kontroller) og fanger trykk mens overgangen pågår.
    // Starter SVART og fader inn: gir en jevn «ankomst» i hver sone (også etter
    // at UIScene gjenskapes ved soneskifte), uavhengig av timing.
    this.fadeOverlay = this.add
      .rectangle(0, 0, width, height, 0x000000, 1)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(300)
      .setAlpha(1);
    this.travelLabel = this.add
      .text(width / 2, height / 2, '', { fontSize: '20px', color: '#bfe9ff', fontStyle: 'bold', align: 'center' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(301)
      .setAlpha(0);

    this.bindEvents();

    // fade inn i sonen
    this.tweens.add({ targets: this.fadeOverlay, alpha: 0, duration: 450, ease: 'Sine.InOut' });
    this.refreshHp(SaveManager.getActive().currentHp, SaveManager.computeMaxHp());
    this.refreshGold(SaveManager.getActive().gold);
    this.refreshTeam();
    this.refreshQuest();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unbinders.forEach((u) => u()));
  }

  private bindEvents(): void {
    const on = (e: string, fn: (...a: unknown[]) => void) => this.unbinders.push(EventBus.on(e, fn));
    on(Events.PlayerHpChanged, (hp, max) => this.refreshHp(hp as number, max as number));
    on(Events.PlayerGoldChanged, (g) => this.refreshGold(g as number));
    on(Events.TeamChanged, () => this.refreshTeam());
    on(Events.MonsterFainted, () => this.refreshTeam());
    on(Events.MonsterRecruited, () => this.refreshTeam());
    on(Events.Toast, (msg) => this.showToast(msg as string));
    on(Events.Dialogue, (lines) => this.showDialogue(lines as string[]));
    on(Events.LanguageChanged, () => this.scene.restart());
    on('quest:updated', () => this.refreshQuest());
    on(Events.ZoneChanged, () => this.refreshQuest());
    on('prompt:set', (text) => {
      const s = text as string;
      this.promptText.setText(s).setVisible(!!s);
    });
    // Reise-overgang: fade til svart med målsone-navn, så fade inn i ny sone.
    on('zone:travel-out', (dest) => this.travelFade(true, dest as string));
    on('zone:travel-in', () => this.travelFade(false));
    // Boss-helsestolpe
    on('boss:update', (d) => this.drawBossBar(d as { name: string; ratio: number; weak: boolean }));
    on('boss:hide', () => { this.bossBar?.setVisible(false); this.bossName?.setVisible(false); });
  }

  private drawBossBar(d: { name: string; ratio: number; weak: boolean }): void {
    if (!this.bossBar) return;
    const { width } = this.scale;
    const w = 380;
    const h = 16;
    const x = width / 2 - w / 2;
    const y = 70;
    const r = Phaser.Math.Clamp(d.ratio, 0, 1);
    this.bossName.setText(d.name).setVisible(true);
    this.bossBar.clear().setVisible(true);
    this.bossBar.fillStyle(0x000000, 0.55).fillRoundedRect(x - 3, y - 3, w + 6, h + 6, 4); // ramme
    this.bossBar.fillStyle(0x331016, 1).fillRect(x, y, w, h); // tom-spor
    this.bossBar.fillStyle(d.weak ? 0xffe066 : 0xcc3344, 1).fillRect(x, y, w * r, h); // fyll (gul = svakt punkt åpent)
    this.bossBar.lineStyle(2, 0x10070a, 1).strokeRect(x, y, w, h);
  }

  /** Fade reise-overlegget inn (ut av sonen) eller ut (inn i ny sone). */
  private travelFade(out: boolean, dest = ''): void {
    if (!this.fadeOverlay) return;
    this.tweens.killTweensOf([this.fadeOverlay, this.travelLabel]); // unngå stablede fades
    this.fadeOverlay.setDepth(300);
    if (out) {
      this.travelLabel.setText(t('ui.traveling', { zone: dest }));
      this.fadeOverlay.setInteractive(); // blokker trykk under overgangen
    }
    this.tweens.add({ targets: [this.fadeOverlay, this.travelLabel], alpha: out ? 1 : 0, duration: out ? 420 : 450, ease: 'Sine.InOut' });
    if (!out) this.time.delayedCall(450, () => this.fadeOverlay?.disableInteractive());
  }

  private refreshQuest(): void {
    const active = QuestSystem.firstActive(SaveManager.getActive());
    if (!active) {
      this.questText.setText('');
      return;
    }
    this.questText.setText(
      t('quest.tracker', { title: t(active.quest.titleKey), progress: QuestSystem.label(active) }),
    );
  }

  private makeButton(
    x: number,
    y: number,
    r: number,
    text: string,
    color: number,
    handlers: { onDown?: () => void; onUp?: () => void },
  ): void {
    const circle = this.add
      .circle(x, y, r, color, 0.85)
      .setScrollFactor(0)
      .setDepth(100)
      .setStrokeStyle(2, 0xffffff, 0.6)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(x, y, text, { fontSize: '13px', color: '#ffffff', fontStyle: 'bold', align: 'center' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(101);
    circle.on('pointerdown', () => {
      circle.setScale(0.92);
      handlers.onDown?.();
    });
    circle.on('pointerup', () => {
      circle.setScale(1);
      handlers.onUp?.();
    });
    circle.on('pointerout', () => {
      circle.setScale(1);
      handlers.onUp?.();
    });
  }

  private refreshHp(hp: number, max: number): void {
    this.hpBar.clear();
    const w = 180;
    const ratio = Phaser.Math.Clamp(hp / Math.max(1, max), 0, 1);
    this.hpBar.fillStyle(0x000000, 0.5).fillRect(18, 14, w + 4, 18);
    this.hpBar.fillStyle(0x9b2d30, 1).fillRect(20, 16, w, 14);
    this.hpBar.fillStyle(0x44d07a, 1).fillRect(20, 16, w * ratio, 14);
    this.hpText.setText(`${t('ui.hp')} ${hp}/${max}`);
  }

  private refreshGold(gold: number): void {
    this.goldText.setText(`${t('common.gold')}: ${gold}`);
  }

  private refreshTeam(): void {
    this.teamBox.removeAll(true);
    const profile = SaveManager.getActive();
    let i = 0;
    for (const id of profile.activeTeam) {
      const owned = profile.monsters.find((m) => m.speciesId === id);
      if (!owned) continue;
      const def = Data.monster(id);
      const form = def.forms[owned.evolved ? 1 : 0];
      const x = 24 + i * 56;
      const y = 76;
      const icon = this.add.image(x, y, form.sprite).setScrollFactor(0).setScale(0.9);
      if (owned.fainted) icon.setTint(0x444444);
      const maxHp = form.stats.maxHp;
      const bar = this.add.graphics().setScrollFactor(0);
      bar.fillStyle(0x000000, 0.5).fillRect(x - 20, y + 18, 40, 5);
      bar.fillStyle(owned.fainted ? 0x666666 : 0x44d07a, 1)
        .fillRect(x - 19, y + 19, 38 * Phaser.Math.Clamp(owned.currentHp / maxHp, 0, 1), 3);
      // mana-stolpe for mana-monstre (spec kap. 20)
      if (def.resourceSystem === 'mana' && form.stats.maxMana) {
        bar.fillStyle(0x000000, 0.5).fillRect(x - 20, y + 24, 40, 4);
        bar.fillStyle(0x4aa3ff, 1)
          .fillRect(x - 19, y + 25, 38 * Phaser.Math.Clamp(owned.currentMana / form.stats.maxMana, 0, 1), 2);
      }
      const lvl = this.add
        .text(x, y - 22, `${owned.level}`, { fontSize: '11px', color: '#ffd479' })
        .setOrigin(0.5)
        .setScrollFactor(0);
      this.teamBox.add([icon, bar, lvl]);
      i++;
    }
  }

  private showToast(msg: string): void {
    this.toastText.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.toastText);
    this.tweens.add({
      targets: this.toastText,
      alpha: 0,
      delay: 1600,
      duration: 600,
    });
  }

  // --- dialog -------------------------------------------------------------
  private buildDialogueBox(): void {
    const { width, height } = this.scale;
    const bg = this.add
      .rectangle(width / 2, height - 80, width - 60, 110, 0x0b0e14, 0.95)
      .setStrokeStyle(2, 0x6c7fb0)
      .setScrollFactor(0);
    const txt = this.add
      .text(width / 2 - (width - 100) / 2, height - 120, '', {
        fontSize: '18px',
        color: '#ffffff',
        wordWrap: { width: width - 100 },
      })
      .setScrollFactor(0);
    const hint = this.add
      .text(width / 2, height - 36, `▼ ${t('ui.continue')}`, { fontSize: '13px', color: '#8fa0c0' })
      .setOrigin(0.5)
      .setScrollFactor(0);
    this.dialogueBox = this.add.container(0, 0, [bg, txt, hint]).setDepth(130).setVisible(false);
    this.dialogueBox.setData('txt', txt);
    bg.setInteractive().on('pointerdown', () => this.advanceDialogue());
  }

  private showDialogue(lines: string[]): void {
    this.dialogueLines = lines;
    this.dialogueIndex = 0;
    this.dialogueBox.setVisible(true);
    this.renderDialogue();
  }

  private renderDialogue(): void {
    const txt = this.dialogueBox.getData('txt') as Phaser.GameObjects.Text;
    txt.setText(this.dialogueLines[this.dialogueIndex] ?? '');
  }

  private advanceDialogue(): void {
    this.dialogueIndex++;
    if (this.dialogueIndex >= this.dialogueLines.length) {
      this.dialogueBox.setVisible(false);
    } else {
      this.renderDialogue();
    }
  }
}
