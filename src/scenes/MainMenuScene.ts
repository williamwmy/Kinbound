import Phaser from 'phaser';
import { t } from '../i18n/Localization';
import { SaveManager } from '../save/SaveManager';
import { Button, heading } from '../ui/widgets';

// Hovedmeny (spec kap. 32). Tilbyr Fortsett, Profiler og Ny profil.
export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super('MainMenu');
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0b0e14');
    heading(this, width / 2, height * 0.22, t('game.title')).setFontSize(48);
    this.add
      .text(width / 2, height * 0.22 + 44, t('game.subtitle'), { fontSize: '18px', color: '#8fa0c0' })
      .setOrigin(0.5);

    let y = height * 0.45;
    const gap = 70;

    if (SaveManager.hasActive()) {
      new Button(this, width / 2, y, t('menu.continue'), () => this.scene.start('World'));
      y += gap;
    }

    new Button(this, width / 2, y, t('menu.profiles'), () => this.scene.start('ProfileSelect'));
    y += gap;
    new Button(this, width / 2, y, t('menu.new_profile'), () => this.scene.start('CharacterCreation'));

    // build-ID nederst, så man kan sjekke om man kjører siste build
    this.add
      .text(width - 8, height - 6, t('ui.build', { id: __BUILD__ }), {
        fontSize: '12px',
        color: '#5a6678',
      })
      .setOrigin(1, 1);
  }
}
