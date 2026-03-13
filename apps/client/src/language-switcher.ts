import { i18n, t } from './i18n.js';

export function setupLanguageSwitcher() {
  const toggle = document.querySelector<HTMLInputElement>('#language-toggle');
  const widget = document.querySelector<HTMLElement>('#language-switcher');

  if (!toggle || !widget) {
    return;
  }

  const syncUi = () => {
    const isEnglish = i18n.getLanguage() === 'en';
    toggle.checked = isEnglish;
    toggle.setAttribute('aria-label', t('language.switchAria'));
    widget.setAttribute('aria-label', t('language.switchAria'));
    document.title = t('meta.title');
  };

  toggle.addEventListener('change', () => {
    i18n.setLanguage(toggle.checked ? 'en' : 'ru');
  });

  i18n.subscribe(syncUi);
  syncUi();
}
