import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import he from './he.json';
import en from './en.json';

const saved = (() => {
  try {
    return localStorage.getItem('bills-lang');
  } catch {
    return null;
  }
})();

export const applyLanguage = (lng: 'he' | 'en') => {
  document.documentElement.lang = lng;
  document.documentElement.dir = lng === 'he' ? 'rtl' : 'ltr';
  try {
    localStorage.setItem('bills-lang', lng);
  } catch {
    /* storage unavailable – ignore */
  }
};

const initial = saved === 'en' ? 'en' : 'he';
void i18n.use(initReactI18next).init({
  resources: { he: { translation: he }, en: { translation: en } },
  lng: initial,
  fallbackLng: 'he',
  interpolation: { escapeValue: false },
});
applyLanguage(initial);

export default i18n;
