// Enkel global hendelsesbuss for løs kobling mellom scener og systemer.
// F.eks. brukes for å oppdatere UI når spillerens HP endres.
type Handler = (...args: unknown[]) => void;

class EventBusImpl {
  private listeners = new Map<string, Set<Handler>>();

  on(event: string, handler: Handler): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return () => this.off(event, handler);
  }

  off(event: string, handler: Handler): void {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((h) => h(...args));
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const EventBus = new EventBusImpl();

// Kjente hendelsesnavn samlet ett sted.
export const Events = {
  PlayerHpChanged: 'player:hp-changed',
  PlayerGoldChanged: 'player:gold-changed',
  PlayerDied: 'player:died',
  TeamChanged: 'team:changed',
  MonsterFainted: 'monster:fainted',
  MonsterRecruited: 'monster:recruited',
  MonsterEvolved: 'monster:evolved',
  ZoneChanged: 'zone:changed',
  Saved: 'game:saved',
  Toast: 'ui:toast',
  OpenMenu: 'ui:open-menu',
  CloseMenu: 'ui:close-menu',
  Dialogue: 'ui:dialogue',
  LanguageChanged: 'i18n:language-changed',
} as const;
