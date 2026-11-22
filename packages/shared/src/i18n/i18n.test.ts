import { describe, expect, it } from 'vitest';
import { en, interpolate, translate } from './index.ts';

describe('çeviri çekirdeği', () => {
  it('düz anahtarı birebir çevirir, Türkçede dokunmaz', () => {
    expect(translate('en', 'Welch t-testi')).toBe('Welch t-test');
    expect(translate('tr', 'Welch t-testi')).toBe('Welch t-testi');
  });

  it('bilinmeyen metni olduğu gibi bırakır', () => {
    expect(translate('en', 'Hiçbir sözlükte yok')).toBe('Hiçbir sözlükte yok');
  });

  it('sayı içeren sunucu cümlesini şablonla eşleştirir', () => {
    expect(translate('en', 'En küçük grupta yalnızca 12 gözlem var: Shapiro-Wilk bu n’de güçsüzdür, “normal” çıkması normalliği kanıtlamaz.')).toBe(
      'The smallest group has only 12 observations: Shapiro-Wilk has little power at this n, and a “normal” result does not prove normality.',
    );
  });

  it('yakalanan test adını da çevirir (özyinelemeli)', () => {
    const out = translate('en', 'Normallik kararı sınırda: küçük bir veri değişikliği seçimi tersine çevirebilir. Sonucun sağlamlığını göstermek için Mann-Whitney U testi sonucunu da raporlamanız önerilir.');
    expect(out).toContain('we recommend also reporting the Mann-Whitney U test result');
  });

  it('yer tutuculu kaynak anahtarı değişkenlerle çevirir', () => {
    expect(translate('en', '“{name}” yüklendi ({rows} satır, {cols} sütun).', { name: 'a.csv', rows: 5, cols: 3 })).toBe('“a.csv” uploaded (5 rows, 3 columns).');
  });

  it('interpolate bilinmeyen yer tutucuyu korur', () => {
    expect(interpolate('{a} ve {b}', { a: 1 })).toBe('1 ve {b}');
  });

  it('sözlükte aynı anahtar iki farklı anlamla tanımlanmamıştır', () => {
    // Nesne değişmezinde yinelenen anahtar TypeScript hatası olur; burada yalnızca boş değer olmadığını sınarız.
    for (const [k, v] of Object.entries(en)) expect(v.trim(), k).not.toBe('');
  });
});
