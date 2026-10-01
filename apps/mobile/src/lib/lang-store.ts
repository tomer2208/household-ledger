import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { Alert, DevSettings, I18nManager } from 'react-native';

import { applyLang, isLangChoice, langFromTags, t, type Lang, type LangChoice } from './i18n';

// P1-6 (native): the choice lives in AsyncStorage, and the layout direction in I18nManager,
// which iOS and Android apply from the next launch. The web build has its own (lang-store.web).
const KEY = 'app-language';

export const deviceLang = (): Lang => langFromTags(getLocales().map((l) => l.languageTag));
export const resolveLang = (c: LangChoice): Lang => (c === 'system' ? deviceLang() : c);

let choice: LangChoice = 'system';
export const langChoice = () => choice;

function setDirection(l: Lang) {
  const rtl = l === 'he';
  I18nManager.allowRTL(rtl);
  if (I18nManager.isRTL !== rtl) I18nManager.forceRTL(rtl);
  return I18nManager.isRTL === rtl;
}

// Native storage is asynchronous: the root layout waits for this before the first screen.
export const bootLanguageSync = () => false;
export async function bootLanguage() {
  const saved = await AsyncStorage.getItem(KEY).catch(() => null);
  choice = isLangChoice(saved) ? saved : 'system';
  const l = resolveLang(choice);
  applyLang(l);
  setDirection(l);
}

export async function setLanguageChoice(next: LangChoice) {
  choice = next;
  await AsyncStorage.setItem(KEY, next);
  const l = resolveLang(next);
  applyLang(l);
  if (__DEV__) DevSettings.reload();
  else if (!setDirection(l)) Alert.alert(t.settings.languageRestartTitle, t.settings.languageRestartBody);
}
