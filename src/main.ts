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

// På berøringsenheter (mobil) renderer vi på en lavere intern oppløsning slik at
// FIT skalerer ALT opp (figurer, skrift, UI) ~1,33× = mer lesbart på liten
// skjerm (spec kap. 31). PC beholder full oppløsning med mer synlig verden.
const isTouch =
  typeof window !== 'undefined' &&
  (('ontouchstart' in window) || (navigator.maxTouchPoints ?? 0) > 0);
const renderWidth = isTouch ? 720 : GAME.width;
const renderHeight = isTouch ? 405 : GAME.height;

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
    width: renderWidth,
    height: renderHeight,
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

// Re-tilpass lerretet når iOS-verktøylinjen kollapser eller orientering endres,
// så toppen/bunnen ikke havner utenfor synlig område (FIT + CENTER_BOTH).
const refit = (): void => {
  game.scale.refresh();
};
window.addEventListener('resize', refit);
window.addEventListener('orientationchange', () => window.setTimeout(refit, 120));
window.visualViewport?.addEventListener('resize', refit);

// Eksponer for feilsøking/automatisert røyktest.
(window as unknown as { __KIN_GAME: Phaser.Game }).__KIN_GAME = game;
(window as unknown as { __KIN_AUDIO: typeof AudioManager }).__KIN_AUDIO = AudioManager;
(window as unknown as { __KIN_SAVE: typeof SaveManager }).__KIN_SAVE = SaveManager;
