import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LanguageToggle } from '@/components/layout/LanguageToggle';
import { en } from './en';
import { I18nProvider, interpolate, translate, useT } from './index';

const srcDir = join(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'i18n' ? [] : sourceFiles(p);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });
}

describe('çeviri katmanı', () => {
  it('yer tutucuları doldurur, bilinmeyeni olduğu gibi bırakır', () => {
    expect(interpolate('{n} satır, {x}', { n: 12 })).toBe('12 satır, {x}');
  });

  it('İngilizce karşılık yoksa Türkçe metni gösterir', () => {
    expect(translate('en', 'Bu metnin çevirisi yok')).toBe('Bu metnin çevirisi yok');
    expect(translate('en', 'Kopyala')).toBe('Copy');
    expect(translate('tr', 'Kopyala')).toBe('Kopyala');
  });

  it('dil seçici arayüzü değiştirir ve tercihi saklar', async () => {
    function Demo() {
      const t = useT();
      return (
        <>
          <LanguageToggle />
          <p>{t('Hesaplama')}</p>
        </>
      );
    }
    localStorage.removeItem('statadvisor.lang');
    render(
      <I18nProvider>
        <Demo />
      </I18nProvider>,
    );
    expect(screen.getByText('Hesaplama')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'EN' }));
    expect(screen.getByText('Computation')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('statadvisor.lang')).toBe('en');
    localStorage.removeItem('statadvisor.lang');
  });

  it('kaynakta kullanılan her t("…") anahtarının İngilizce karşılığı vardır', () => {
    const missing = new Set<string>();
    for (const file of sourceFiles(srcDir)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) {
        const key = m[1]!.replace(/\\'/g, "'");
        if (!(key in en)) missing.add(key);
      }
    }
    expect([...missing]).toEqual([]);
  });
});
