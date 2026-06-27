// Vedvarende spillinnstillinger (lyd, språk). Spec kap. 5, 32, 33.
import { Localization } from '../i18n/Localization';
import type { Lang } from '../i18n/Localization';

const KEY = 'kinbound.settings';

interface SettingsData {
  music: boolean;
  sfx: boolean;
}

class SettingsImpl {
  private data: SettingsData = { music: true, sfx: true };

  load(): void {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = { ...this.data, ...JSON.parse(raw) };
    } catch {
      /* bruk standard */
    }
  }

  private save(): void {
    localStorage.setItem(KEY, JSON.stringify(this.data));
  }

  get music(): boolean {
    return this.data.music;
  }
  get sfx(): boolean {
    return this.data.sfx;
  }
  toggleMusic(): boolean {
    this.data.music = !this.data.music;
    this.save();
    return this.data.music;
  }
  toggleSfx(): boolean {
    this.data.sfx = !this.data.sfx;
    this.save();
    return this.data.sfx;
  }
  setLanguage(lang: Lang): void {
    Localization.setLanguage(lang);
  }
}

export const Settings = new SettingsImpl();
