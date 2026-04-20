import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as SecureStore from "expo-secure-store";
import en from "./locales/en.json";
import es from "./locales/es.json";

const LANGUAGE_KEY = "donna_app_language";

export async function getStoredLanguage(): Promise<string> {
  try {
    const lang = await SecureStore.getItemAsync(LANGUAGE_KEY);
    return lang ?? "en";
  } catch {
    return "en";
  }
}

export async function setStoredLanguage(lang: string): Promise<void> {
  await SecureStore.setItemAsync(LANGUAGE_KEY, lang);
  await i18n.changeLanguage(lang);
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

// Load stored language on startup
getStoredLanguage().then((lang) => {
  if (lang !== i18n.language) {
    i18n.changeLanguage(lang);
  }
});

export default i18n;
