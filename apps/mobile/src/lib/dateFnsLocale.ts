import { enUS, es } from "date-fns/locale";
import type { Locale } from "date-fns";
import i18n from "@/src/i18n";

const localeMap: Record<string, Locale> = {
  en: enUS,
  es: es,
};

export function getDateFnsLocale(): Locale {
  return localeMap[i18n.language] ?? enUS;
}
