import Phaser from 'phaser';
import { Localization } from '../i18n/Localization';
import { TextureFactory } from '../core/TextureFactory';
import { SaveManager } from '../save/SaveManager';

// Laster språkfiler + valgfrie kunst-assets, så bygger prosedyrale teksturer
// for alt som IKKE har ekte kunst. Slik kan ekte pixel art slippes inn uten
// kodeendring (spec kap. 4): legg PNG i public/sprites/ og pek på den i
// public/sprites/manifest.json med samme tekstur-nøkkel.
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2, 'Kinbound', { fontSize: '32px', color: '#ffffff' })
      .setOrigin(0.5);

    // Last assets-manifestet. Når det er ferdig, kø opp hvert bilde i samme
    // innlastingsfase. Manglende/feilende filer hoppes over (faller tilbake
    // til prosedyrale teksturer).
    this.load.json('sprite-manifest', 'sprites/manifest.json');
    this.load.once(
      'filecomplete-json-sprite-manifest',
      (_key: string, _type: string, data: Record<string, string>) => {
        if (!data || typeof data !== 'object') return;
        for (const [texKey, url] of Object.entries(data)) {
          if (typeof url === 'string' && url) this.load.image(texKey, url);
        }
      },
    );
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      // ufarlig: nøkkelen får en prosedyral tekstur i stedet
      console.warn(`Kunne ikke laste asset «${file.key}» (${file.url}); bruker prosedyral tekstur.`);
    });
  }

  async create(): Promise<void> {
    await Localization.load(['nb', 'en']);
    // sett språk fra aktiv profil om den finnes
    if (SaveManager.hasActive()) {
      try {
        Localization.setLanguage(SaveManager.getActive().language);
      } catch {
        /* ignorer */
      }
    }
    // Bygg prosedyrale teksturer KUN for nøkler som ikke allerede er lastet
    // som ekte kunst (build*-metodene hopper over eksisterende nøkler).
    TextureFactory.buildMonsterTextures(this);
    TextureFactory.buildMiscTextures(this);
    TextureFactory.buildEnvironmentTextures(this);
    TextureFactory.buildGroundTextures(this);
    this.scene.start('MainMenu');
  }
}
