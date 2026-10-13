/** Hesaplama motorunun kimliği; her analizin denetim izine yazılır. */
export const ENGINE = {
  name: '@statadvisor/shared',
  version: '0.1.0',
  /** Karar kural kümesinin sürümü; kurallar değiştiğinde artırılır. */
  ruleSet: 'decision-v1',
  /** Referans doğrulama paketi (tools/reference/generate.py) ile aynı olmalıdır; reference.test.ts doğrular. */
  referenceSuite: { scipy: '1.18.1', cases: 1094 },
} as const;
