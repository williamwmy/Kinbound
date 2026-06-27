import Phaser from 'phaser';
import { t, Localization } from '../i18n/Localization';
import type { Lang } from '../i18n/Localization';
import { SaveManager } from '../save/SaveManager';
import { TextureFactory } from '../core/TextureFactory';
import { PALETTES } from '../config';
import { Button, heading, label } from '../ui/widgets';
import type { Appearance } from '../types';

// Karakteropprettelse (spec kap. 8): navn, hårstil, hårfarge, hudfarge, klærfarge.
export class CharacterCreationScene extends Phaser.Scene {
  private look!: Appearance;
  private name = '';
  private lang: Lang = 'nb';
  private preview?: Phaser.GameObjects.Image;
  private nameText!: Phaser.GameObjects.Text;

  constructor() {
    super('CharacterCreation');
  }

  create(): void {
    this.look = { hairStyle: 0, hairColor: 0, skinColor: 0, clothColor: 0 };
    this.lang = Localization.getLanguage();
    this.name = t('creation.default_name');

    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0b0e14');
    heading(this, width / 2, height * 0.063, t('creation.title'));

    // forhåndsvisning - bygg teksturen først, opprett bildet, deretter oppdater.
    // (this.preview kan peke på et ødelagt bilde etter scene.restart - nullstilles.)
    this.preview = undefined;
    this.refreshPreview();
    this.preview = this.add
      .image(width / 2, height * 0.18, 'player_preview')
      .setScale(2.4)
      .setOrigin(0.5);

    // Høyde-relativ layout som får plass på enhver oppløsning (mobil = 405px,
    // PC = 540px) uten at Start-knappen havner utenfor skjermen.
    const leftX = width / 2 - 200;
    let y = height * 0.305;
    const row = height * 0.082;

    // navn (tapp for å skrive)
    label(this, leftX, y - 12, t('creation.name'));
    this.nameText = this.add
      .text(leftX + 140, y - 12, this.name, { fontSize: '20px', color: '#ffd479' })
      .setInteractive({ useHandCursor: true });
    this.nameText.on('pointerdown', () => this.editName());
    y += row;

    this.cycleRow(leftX, y, t('creation.hairstyle'), () => {
      this.look.hairStyle = (this.look.hairStyle + 1) % 4;
      this.refreshPreview();
    });
    y += row;
    this.cycleRow(leftX, y, t('creation.haircolor'), () => {
      this.look.hairColor = (this.look.hairColor + 1) % PALETTES.hair.length;
      this.refreshPreview();
    });
    y += row;
    this.cycleRow(leftX, y, t('creation.skincolor'), () => {
      this.look.skinColor = (this.look.skinColor + 1) % PALETTES.skin.length;
      this.refreshPreview();
    });
    y += row;
    this.cycleRow(leftX, y, t('creation.clothcolor'), () => {
      this.look.clothColor = (this.look.clothColor + 1) % PALETTES.cloth.length;
      this.refreshPreview();
    });
    y += row;

    // språk
    label(this, leftX, y - 12, t('ui.language'));
    const langBtn = new Button(
      this,
      leftX + 200,
      y,
      this.lang.toUpperCase(),
      () => {
        this.lang = this.lang === 'nb' ? 'en' : 'nb';
        Localization.setLanguage(this.lang);
        langBtn.setText(this.lang.toUpperCase());
        this.scene.restart();
      },
      { width: 100, height: 40, fontSize: 18 },
    );
    y += row + height * 0.05;

    new Button(this, width / 2 - 120, y, t('common.back'), () => this.scene.start('MainMenu'), {
      width: 200,
    });
    new Button(this, width / 2 + 120, y, t('creation.create'), () => this.finish(), { width: 200 });
  }

  private cycleRow(x: number, y: number, name: string, onNext: () => void): void {
    label(this, x, y - 12, name);
    new Button(this, x + 200, y, '◀ ▶', onNext, { width: 100, height: 40, fontSize: 18 });
  }

  private refreshPreview(): void {
    const resolved: Appearance = {
      hairStyle: this.look.hairStyle,
      hairColor: PALETTES.hair[this.look.hairColor],
      skinColor: PALETTES.skin[this.look.skinColor],
      clothColor: PALETTES.cloth[this.look.clothColor],
    };
    TextureFactory.buildPlayerTexture(this, 'player_preview', resolved);
    if (this.preview && this.preview.scene) this.preview.setTexture('player_preview');
  }

  private editName(): void {
    const input = window.prompt(t('creation.name'), this.name);
    if (input !== null) {
      this.name = input.slice(0, 16);
      this.nameText.setText(this.name);
    }
  }

  private finish(): void {
    const resolved: Appearance = {
      hairStyle: this.look.hairStyle,
      hairColor: PALETTES.hair[this.look.hairColor],
      skinColor: PALETTES.skin[this.look.skinColor],
      clothColor: PALETTES.cloth[this.look.clothColor],
    };
    SaveManager.createProfile(this.name, resolved, this.lang);
    this.scene.start('World');
  }
}
