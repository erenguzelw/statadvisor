/**
 * Hafif çeviri katmanı. Kaynak dil Türkçedir: `t('Türkçe metin')` çağrısında metnin kendisi anahtardır ve
 * İngilizce karşılığı `en.ts` sözlüğünde aranır. Karşılık yoksa Türkçe metin gösterilir (hiçbir ekran boş kalmaz).
 * Değişken içeren metinlerde `{ad}` yer tutucuları kullanılır: `t('{n} satır', { n: 12 })`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { interpolate, translate, translateCode, type Lang, type Vars } from '@statadvisor/shared';

export type { Lang, Vars };

/** Etkin dil; sağlayıcı her işlemede günceller. Bileşen dışı yardımcılar için `tl` kullanır. */
let currentLang: Lang = 'tr';
/** Kanca kullanamayan (modül düzeyi) işlevlerde çeviri: etkin dile göre çevirir. */
/** Rapor uçlarına eklenen dil sorgusu ("&lang=en" ya da boş). */
export const langQuery = (): string => (currentLang === 'en' ? '&lang=en' : '');
/** Üretilmiş koddaki yorum satırlarını etkin dile çevirir (kanca gerektirmez). */
export const tc = (code: string): string => translateCode(currentLang, code);
/** Sayı biçimi (etkin dile göre: 1.234,5 / 1,234.5). */
export const nf = { format: (n: number): string => new Intl.NumberFormat(currentLang === 'en' ? 'en-US' : 'tr-TR').format(n) };
export const tl = (tr: string, vars?: Vars): string => translate(currentLang, tr, vars);
export { interpolate, translate };

const STORAGE_KEY = 'statadvisor.lang';

interface I18n {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (tr: string, vars?: Vars) => string;
  /** Sayı ve tarih biçimi için yerel ayar. */
  locale: 'tr-TR' | 'en-US';
}

const defaults: I18n = { lang: 'tr', setLang: () => {}, t: (tr, vars) => interpolate(tr, vars), locale: 'tr-TR' };
const Ctx = createContext<I18n>(defaults);

function readStored(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'en' ? 'en' : 'tr';
  } catch {
    return 'tr';
  }
}

export function I18nProvider({ children, initialLang }: { children: ReactNode; initialLang?: Lang }) {
  const [lang, setLangState] = useState<Lang>(initialLang ?? readStored);
  currentLang = lang;

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* Depolama kapalıysa tercih yalnızca bu oturumda geçerli olur. */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<I18n>(() => ({ lang, setLang, t: (tr, vars) => translate(lang, tr, vars), locale: lang === 'en' ? 'en-US' : 'tr-TR' }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
export const useT = () => useContext(Ctx).t;
