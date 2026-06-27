import Phaser from 'phaser';

// Oppstartsscene: setter opp og går videre til innlasting.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.scene.start('Preload');
  }
}
