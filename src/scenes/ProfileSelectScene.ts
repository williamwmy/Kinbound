import Phaser from 'phaser';
import { t } from '../i18n/Localization';
import { Localization } from '../i18n/Localization';
import { SaveManager } from '../save/SaveManager';
import { Button, heading, panel } from '../ui/widgets';

// Profilvalg (spec kap. 8, 32). Flere profiler på samme enhet.
export class ProfileSelectScene extends Phaser.Scene {
  constructor() {
    super('ProfileSelect');
  }

  create(): void {
    this.render();
  }

  private render(): void {
    this.children.removeAll();
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0b0e14');
    heading(this, width / 2, 60, t('menu.profiles'));

    const profiles = SaveManager.listProfiles();
    let y = 140;
    if (profiles.length === 0) {
      this.add
        .text(width / 2, y, t('common.empty'), { fontSize: '20px', color: '#8fa0c0' })
        .setOrigin(0.5);
      y += 50;
    }

    for (const p of profiles) {
      panel(this, width / 2, y, 560, 56);
      this.add.text(width / 2 - 260, y - 12, p.name, { fontSize: '22px', color: '#ffffff' });
      new Button(
        this,
        width / 2 + 150,
        y,
        t('menu.start'),
        () => {
          const profile = SaveManager.setActive(p.id);
          Localization.setLanguage(profile.language);
          this.scene.start('World');
        },
        { width: 120, height: 44, fontSize: 18 },
      );
      new Button(
        this,
        width / 2 + 250,
        y,
        '✕',
        () => {
          SaveManager.deleteProfile(p.id);
          this.render();
        },
        { width: 44, height: 44, fontSize: 18, bg: 0x6a2030, bgHover: 0x8a2838 },
      );
      y += 70;
    }

    new Button(this, width / 2 - 130, height - 60, t('common.back'), () => this.scene.start('MainMenu'), {
      width: 200,
    });
    new Button(
      this,
      width / 2 + 130,
      height - 60,
      t('menu.new_profile'),
      () => this.scene.start('CharacterCreation'),
      { width: 200 },
    );
  }
}
