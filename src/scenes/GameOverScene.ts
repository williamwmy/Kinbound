import Phaser from 'phaser';
import { t } from '../i18n/Localization';
import { SaveManager } from '../save/SaveManager';
import { Data } from '../core/DataManager';
import { monsterMaxHp } from '../systems/Progression';
import { Button, heading } from '../ui/widgets';

// Spill over (spec kap. 29). Spilleren taper når HP blir 0 og våkner i landsbyen.
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create(): void {
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);
    heading(this, width / 2, height * 0.4, t('gameover.title')).setFontSize(40);

    new Button(this, width / 2, height * 0.6, t('gameover.respawn'), () => {
      const profile = SaveManager.getActive();
      // tilbake til landsbyen, helbredet (spec kap. 30 - lagring ved landsby)
      profile.currentZone = 'village';
      profile.spawnX = 640;
      profile.spawnY = 760;
      profile.currentHp = SaveManager.computeMaxHp();
      // våkner uthvilt i landsbyen - hele laget er helbredet (kostnaden er å bli
      // sendt tilbake, ikke et lemlestet lag)
      for (const m of profile.monsters) {
        const form = Data.monster(m.speciesId).forms[m.evolved ? 1 : 0];
        m.fainted = false;
        m.currentHp = monsterMaxHp(form.stats.maxHp, m.level);
        m.currentMana = form.stats.maxMana ?? 0;
      }
      SaveManager.save();
      this.scene.stop('UI');
      this.scene.stop('World');
      this.scene.stop();
      this.scene.start('World');
    });
  }
}
