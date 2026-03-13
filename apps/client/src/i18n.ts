import en from './i18n/en.json' with { type: 'json' };
import ru from './i18n/ru.json' with { type: 'json' };

export type AppLanguage = 'en' | 'ru';

interface TranslationTree {
  [key: string]: string | TranslationTree;
}
type TranslationParams = Record<string, string | number>;

const STORAGE_KEY = 'acatgame.language';
const dictionaries: Record<AppLanguage, TranslationTree> = {
  en,
  ru,
};

class I18nService {
  private readonly listeners = new Set<() => void>();
  private language: AppLanguage = this.detectLanguage();

  constructor() {
    this.applyDocumentLanguage();
  }

  getLanguage(): AppLanguage {
    return this.language;
  }

  setLanguage(language: AppLanguage) {
    if (this.language === language) {
      return;
    }

    this.language = language;
    window.localStorage.setItem(STORAGE_KEY, language);
    this.applyDocumentLanguage();
    this.emit();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  has(key: string): boolean {
    return typeof this.resolveValue(key) === 'string';
  }

  t(key: string, params: TranslationParams = {}) {
    const template = this.resolveValue(key);

    if (typeof template !== 'string') {
      return key;
    }

    return template.replace(/\{(\w+)\}/g, (_match, token: string) => String(params[token] ?? `{${token}}`));
  }

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private applyDocumentLanguage() {
    document.documentElement.lang = this.language;
  }

  private detectLanguage(): AppLanguage {
    const stored = this.normalizeLanguage(window.localStorage.getItem(STORAGE_KEY));
    if (stored) {
      return stored;
    }

    const candidates = [...(navigator.languages ?? []), navigator.language];
    for (const candidate of candidates) {
      const language = this.normalizeLanguage(candidate);
      if (language) {
        return language;
      }
    }

    return 'en';
  }

  private normalizeLanguage(value: string | null | undefined): AppLanguage | null {
    if (!value) {
      return null;
    }

    const normalized = value.toLowerCase();
    if (normalized.startsWith('ru')) {
      return 'ru';
    }

    if (normalized.startsWith('en')) {
      return 'en';
    }

    return null;
  }

  private resolveValue(key: string): string | TranslationTree | undefined {
    const segments = key.split('.');
    let current: string | TranslationTree | undefined = dictionaries[this.language];

    for (const segment of segments) {
      if (!current || typeof current === 'string') {
        return undefined;
      }

      current = current[segment];
    }

    return current;
  }
}

export const i18n = new I18nService();

export const t = (key: string, params?: TranslationParams) => i18n.t(key, params);
