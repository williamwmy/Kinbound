import Phaser from 'phaser';
import { GAME } from './config';
import { Settings } from './core/Settings';
import { AudioManager } from './core/AudioManager';
import { SaveManager } from './save/SaveManager';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { ProfileSelectScene } from './scenes/ProfileSelectScene';
import { CharacterCreationScene } from './scenes/CharacterCreationScene';
import { WorldScene } from './scenes/WorldScene';
import { UIScene } from './scenes/UIScene';
import { MenuScene } from './scenes/MenuScene';
import { GameOverScene } from './scenes/GameOverScene';

Settings.load();
AudioManager.init();

// Phaser-spillkonfigurasjon. Skalerer for å fylle skjermen på mobil og PC.
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: GAME.backgroundColor,
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME.width,
    height: GAME.height,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [
    BootScene,
    PreloadScene,
    MainMenuScene,
    ProfileSelectScene,
    CharacterCreationScene,
    WorldScene,
    UIScene,
    MenuScene,
    GameOverScene,
  ],
});

// Eksponer for feilsøking/automatisert røyktest.
(window as unknown as { __KIN_GAME: Phaser.Game }).__KIN_GAME = game;
(window as unknown as { __KIN_AUDIO: typeof AudioManager }).__KIN_AUDIO = AudioManager;
(window as unknown as { __KIN_SAVE: typeof SaveManager }).__KIN_SAVE = SaveManager;
