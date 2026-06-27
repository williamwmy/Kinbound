import Phaser from 'phaser';

// Oppstartsscene: setter opp og går videre til innlasting.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    // Flerberøring: la venstre tommel styre joysticken mens høyre tommel
    // bruker angreps-/handlingsknappene samtidig (spec kap. 31). Phaser sporer
    // bare én berøring som standard, så vi legger til ekstra pekere.
    this.input.addPointer(2);
    this.scene.start('Preload');
  }
}
