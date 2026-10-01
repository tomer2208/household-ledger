import { getLocales } from 'expo-localization';

import { applyLang, isLangChoice, isRTL, lang, langFromTags, type Lang, type LangChoice } from './i18n';

// P1-6 (web): the choice lives in localStorage, read synchronously, so the very first render
// is already in the right language and direction. Switching reloads the page: every screen,
// header and cached label starts over in the new language, on the same URL.
const KEY = 'app-language';

export const deviceLang = (): Lang => langFromTags(getLocales().map((l) => l.languageTag));
export const resolveLang = (c: LangChoice): Lang => (c === 'system' ? deviceLang() : c);

function read(): LangChoice {
  try {
    const v = localStorage.getItem(KEY);
    return isLangChoice(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

let choice: LangChoice = 'system';
export const langChoice = () => choice;

export function bootLanguageSync() {
  choice = read();
  applyLang(resolveLang(choice));
  // The page itself: screen readers, the browser's own controls and the fallback text direction.
  document.documentElement.lang = lang();
  document.documentElement.dir = isRTL() ? 'rtl' : 'ltr';
  return true;
}
export async function bootLanguage() {
  bootLanguageSync();
}

export async function setLanguageChoice(next: LangChoice) {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Private mode: the choice holds for this visit only.
  }
  choice = next;
  window.location.reload();
}
