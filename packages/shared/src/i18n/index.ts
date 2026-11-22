/**
 * Çeviri çekirdeği (arayüz ve sunucu ortak). Kaynak dil Türkçedir: metnin kendisi anahtardır.
 *
 * Anahtar iki biçimde olabilir:
 *  - Düz metin: birebir eşleşir.
 *  - Şablon: `{ad}` yer tutucuları içerir ve sayı, test adı gibi değişken parçaları olan cümlelerle eşleşir.
 *    Yakalanan parçalar önce kendi başlarına çevrilmeye çalışılır (ör. bir test adı), sonra İngilizce şablona yerleşir.
 *
 * Karşılık bulunamazsa Türkçe metin olduğu gibi döner; hiçbir metin kaybolmaz.
 */
import { enStats } from './en-stats.ts';
import { enUi } from './en-ui.ts';

export type Lang = 'tr' | 'en';
export type Vars = Record<string, string | number>;

export const en: Record<string, string> = { ...enUi, ...enStats };

/** Yer tutucuları doldurur; yoksa olduğu gibi bırakır. */
export function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

interface Template {
  re: RegExp;
  names: string[];
  value: string;
  weight: number;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compile(dict: Record<string, string>): { exact: Map<string, string>; templates: Template[] } {
  const exact = new Map<string, string>();
  const templates: Template[] = [];
  for (const [key, value] of Object.entries(dict)) {
    if (!/\{\w+\}/.test(key)) {
      exact.set(key, value);
      continue;
    }
    const names: string[] = [];
    const source = key
      .split(/(\{\w+\})/)
      .map((part) => {
        const m = /^\{(\w+)\}$/.exec(part);
        if (!m) return escapeRe(part);
        names.push(m[1]!);
        // Yakalama cümle sınırını (nokta + boşluk + büyük harf) geçemez; çok cümleli metin cümle cümle çevrilir.
        return '((?:(?!\\.\\s+[A-ZÇĞİÖŞÜ“])[\\s\\S])*?)';
      })
      .join('');
    templates.push({ re: new RegExp(`^${source}$`), names, value, weight: key.replace(/\{\w+\}/g, '').length });
  }
  // Daha çok sabit metin içeren (daha özgül) şablonlar önce denenir.
  templates.sort((a, b) => b.weight - a.weight);
  return { exact, templates };
}

const compiled = compile(en);

function lookup(text: string, depth: number): string {
  const hit = compiled.exact.get(text);
  if (hit !== undefined) return hit;
  if (depth > 4) return text;
  for (const t of compiled.templates) {
    const m = t.re.exec(text);
    if (!m) continue;
    const vars: Vars = {};
    t.names.forEach((n, i) => {
      vars[n] = lookup(m[i + 1]!, depth + 1);
    });
    return interpolate(t.value, vars);
  }
  // Çok cümleli metin (ör. APA paragrafı): cümle cümle çevrilir.
  const sentences = text.split(/(?<=\.)\s+(?=[A-ZÇĞİÖŞÜ“])/);
  if (sentences.length > 1) return sentences.map((s) => lookup(s, depth + 1)).join(' ');
  // Noktalı virgülle ayrılmış listeler (ör. yordayıcı listesi): öğe öğe çevrilir.
  const items = text.split('; ');
  if (items.length > 1) {
    const out = items.map((s) => lookup(s, depth + 1));
    if (out.some((s, i) => s !== items[i])) return out.join('; ');
  }
  return text;
}

/** Saf çeviri işlevi: `lang === 'tr'` ise metin aynen döner. */
export function translate(lang: Lang, tr: string, vars?: Vars): string {
  if (lang !== 'en') return interpolate(tr, vars);
  const text = vars ? interpolate(tr, vars) : tr;
  // Önce yer tutuculu kaynak anahtar (t('… {n} …', { n })), olmazsa doldurulmuş metin üzerinde şablon eşleştirme.
  const direct = vars ? compiled.exact.get(tr) ?? en[tr] : undefined;
  if (direct !== undefined) return interpolate(direct, vars);
  return lookup(text, 0);
}

const htmlEntities: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decodeHtml = (s: string) => s.replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => htmlEntities[m]!);
const encodeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Üretilmiş bir HTML belgesindeki metin düğümlerini çevirir (rapor çıktıları için); etiketlere ve stile dokunmaz. */
export function translateHtml(lang: Lang, html: string): string {
  if (lang !== 'en') return html;
  return html
    .replace(/<html lang="tr"/, '<html lang="en"')
    .replace(/<style>[\s\S]*?<\/style>|>([^<>]+)</g, (m, text: string | undefined) => {
      if (text === undefined) return m; // <style> bloğu
      const plain = decodeHtml(text);
      if (!/\p{L}{2,}/u.test(plain)) return m;
      const lead = /^\s*/.exec(plain)![0];
      const trail = /\s*$/.exec(plain)![0];
      const core = plain.trim();
      return `>${encodeHtml(lead + translate('en', core) + trail)}<`;
    });
}


/** Bir kod satırında dizge dışındaki ilk `#` işaretinin konumu (yoksa -1). */
function commentStart(line: string): number {
  let quote = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '#') return i;
  }
  return -1;
}

/** Üretilmiş Python/R kodundaki `#` yorum metinleri (dizgelerdeki `#` sayılmaz). */
export function codeComments(code: string): string[] {
  return code
    .split('\n')
    .map((line) => {
      const i = commentStart(line);
      return i < 0 ? '' : line.slice(i + 1).trim();
    })
    .filter(Boolean);
}

/**
 * Üretilmiş Python/R kodundaki `#` yorumlarını çevirir. Çalışan koda ve dizgelere (özellikle beklenen çıktıyı
 * üreten print/yaz satırlarına) dokunmaz.
 */
export function translateCode(lang: Lang, code: string): string {
  if (lang !== 'en') return code;
  return code
    .split('\n')
    .map((line) => {
      const i = commentStart(line);
      if (i < 0) return line;
      const comment = line.slice(i + 1).trim();
      if (!/\p{L}{2,}/u.test(comment)) return line;
      return `${line.slice(0, i)}# ${translate('en', comment)}`;
    })
    .join('\n');
}
