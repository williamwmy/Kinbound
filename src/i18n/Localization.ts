// Lokaliseringssystem (spec kap. 33).
// All tekst hentes via t(key). Ingen tekst er hardkodet i spillkoden.
// Språkfiler ligger i /public/locales/<lang>.json og lastes ved oppstart.
import { EventBus, Events } from '../core/EventBus';

export type Lang = 'nb' | 'en';

type Dict = Record<string, string>;

class LocalizationImpl {
  private dicts: Partial<Record<Lang, Dict>> = {};
  private current: Lang = 'nb';

  /** Last alle støttede språkfiler. Kalles én gang i PreloadScene. */
  async load(langs: Lang[] = ['nb', 'en']): Promise<void> {
    await Promise.all(
      langs.map(async (lang) => {
        const res = await fetch(`locales/${lang}.json`);
        this.dicts[lang] = (await res.json()) as Dict;
      }),
    );
  }

  setLanguage(lang: Lang): void {
    if (lang === this.current) return;
    this.current = lang;
    EventBus.emit(Events.LanguageChanged, lang);
  }

  getLanguage(): Lang {
    return this.current;
  }

  /**
   * Hent oversatt tekst. Støtter {placeholder}-substitusjon.
   * Faller tilbake til engelsk, så nøkkelen selv, hvis den mangler.
   */
  t(key: string, params?: Record<string, string | number>): string {
    let str =
      this.dicts[this.current]?.[key] ??
      this.dicts.en?.[key] ??
      key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return str;
  }
}

export const Localization = new LocalizationImpl();
export const t = (key: string, params?: Record<string, string | number>): string =>
  Localization.t(key, params);
