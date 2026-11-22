/**
 * R kodu üretici (anket analizi için hipotez testleri). Üretilen betik, kullanıcının CSV dosyasını okuyup
 * uygulamadaki analizi yeniden yapar ve Python betiğiyle aynı `expectedOutput` satırlarını yazdırır.
 * Yalnızca temel R (stats) kullanılır; ek paket gerekmez. Bu eşitlik, R bulunan ortamda otomatik testle doğrulanır.
 */
import type { AnalysisResult } from './analysis.ts';
import { expectedLines, fmt, type AnalysisSpec, type DatasetFile, type GeneratedCode } from './codegen.ts';
import type { ScaleDef, ScaleResult } from './scales.ts';
import type { ScreenOptions, ScreenResult } from './screening.ts';

export const rs = (s: string) => JSON.stringify(s);
export const rVec = (xs: string[]) => `c(${xs.map(rs).join(', ')})`;

const NA_VALUES = ['', 'na', 'NA', 'n/a', 'N/A', 'nan', 'NaN', 'NAN', 'null', 'NULL', 'none', 'None', '-', '?', '#N/A'];

export const naBlockR = `NA_DEGERLERI <- ${rVec(NA_VALUES)}  # uygulamanın eksik saydığı değerler`;

/** Python'un f"{x:.nf}" biçimiyle aynı çıktıyı veren yardımcı ve satır yazıcı. */
export const helpersR = [
  'f <- function(x, d) {  # sayıyı sabit ondalıkla yazar (nan / inf dahil)',
  '  if (is.na(x)) return("nan")',
  '  if (is.infinite(x)) return(if (x > 0) "inf" else "-inf")',
  '  formatC(x, format = "f", digits = d)',
  '}',
  'yaz <- function(...) cat(..., "\\n", sep = "")',
].join('\n');

export function readCsvLineR(file: DatasetFile): string {
  const lines = [
    `df <- read.csv(${rs(file.fileName)}, sep = ${rs(file.delimiter)}, dec = ${rs(file.decimalComma ? ',' : '.')}, na.strings = NA_DEGERLERI, stringsAsFactors = FALSE, check.names = FALSE, fileEncoding = "UTF-8-BOM")`,
  ];
  if (file.prefixCoded?.length) {
    lines.push(
      `KODLU <- ${rVec(file.prefixCoded)}  # "2:Bazen katılıyorum" gibi etiketlerin baştaki sayısı alınır`,
      'for (s in KODLU) {',
      '  x <- as.character(df[[s]])',
      '  df[[s]] <- suppressWarnings(as.numeric(ifelse(grepl("^\\\\s*-?[0-9]+\\\\s*:", x), sub("^\\\\s*(-?[0-9]+)\\\\s*:.*$", "\\\\1", x), NA)))',
      '}',
    );
  }
  const ranks = Object.entries(file.rankCoded ?? {});
  if (ranks.length) {
    lines.push(
      `SIRALI <- list(${ranks.map(([k, v]) => `${rs(k)} = ${rVec(v)}`).join(', ')})  # aralık etiketleri küçükten büyüğe sıra numarası alır`,
      'for (s in names(SIRALI)) df[[s]] <- match(trimws(as.character(df[[s]])), SIRALI[[s]]) - 1',
    );
  }
  return lines.join('\n');
}

export const ETIKET_FN = [
  'etiket <- function(v) {  # grup etiketlerini uygulamadaki gösterimle aynı yapar (1.0 -> "1")',
  '  if (is.numeric(v)) ifelse(v == floor(v), sprintf("%.0f", v), as.character(v)) else as.character(v)',
  '}',
].join('\n');

export const SHAPIRO = (label: string, arr: string) => [
  `kalintilar <- ${arr}`,
  'if (length(kalintilar) > 5000) kalintilar <- sort(kalintilar)[floor((0:4999) * length(kalintilar) / 5000) + 1]  # Shapiro-Wilk en fazla 5000 gözlemle çalışır',
  'sw <- shapiro.test(kalintilar)',
  `yaz("Shapiro-Wilk [${label}] W: ", f(unname(sw$statistic), 3), " p: ", f(sw$p.value, 6))`,
];

const SKEW_KURT_FN = [
  'carpiklik_basiklik <- function(x) {  # düzeltilmiş çarpıklık ve fazlalık basıklık (SPSS ile aynı)',
  '  n <- length(x); m <- mean(x); m2 <- mean((x - m)^2)',
  '  g1 <- mean((x - m)^3) / m2^1.5; g2 <- mean((x - m)^4) / m2^2 - 3',
  '  c(g1 * sqrt(n * (n - 1)) / (n - 2), (n - 1) / ((n - 2) * (n - 3)) * ((n + 1) * g2 + 6))',
  '}',
].join('\n');

const SKEW_KURT = (label: string, arr: string) => [
  `kalintilar <- ${arr}`,
  'sk <- carpiklik_basiklik(kalintilar)',
  `yaz("Carpiklik-Basiklik [${label}] carpiklik: ", f(sk[1], 3), " basiklik: ", f(sk[2], 3))`,
];

/** Python'daki scipy 'auto' kurallarını R'da yeniden uygulayan p değeri yardımcıları. */
const WILCOX_FN = [
  'wilcoxon_p <- function(u, v) {  # kesin p: n <= 50, sıfır fark ve bağ yoksa; aksi halde sürekliklik düzeltmeli yaklaşım',
  '  d <- u - v; sifir <- any(d == 0); d <- d[d != 0]',
  '  kesin <- length(d) <= 50 && !sifir && !anyDuplicated(abs(d))',
  '  suppressWarnings(wilcox.test(d, mu = 0, exact = kesin, correct = TRUE)$p.value)',
  '}',
].join('\n');

const printStat = (stat: string, eff: string, effVar: string, n: string, df?: string, ci?: [string, string]): string[] => [
  `yaz("Istatistik: ", f(${stat}, 4))`,
  ...(df ? [`yaz("Serbestlik derecesi: ", ${df})`] : []),
  'yaz("p: ", f(p_deger, 6))',
  `yaz("Etki (${eff}): ", f(${effVar}, 4))`,
  ...(ci ? [`yaz("GA: [", f(${ci[0]}, 4), ", ", f(${ci[1]}, 4), "]")`] : []),
  `yaz("N: ", as.integer(${n}))`,
];

const df4 = (...xs: string[]) => xs.map((x) => `f(${x}, 4)`).join(', ", ", ');

function postHocR(r: AnalysisResult, names: string, kind: 'dunn' | 'tukey' | 'games-howell' | 'paired-t' | 'wilcoxon' | 'mcnemar', dataVar: string): string[] {
  const ph = r.outcome.postHoc;
  if (!ph) return [];
  const L = [`if (p_deger < ALPHA && length(${dataVar}) > 2) {`, `  yaz("Post-hoc: ${ph.method}")`, `  k <- length(${dataVar})`, '  ciftler <- combn(k, 2)'];
  const printFark = '    yaz(' + `${names}[a], " - ", ${names}[b], ": fark = ", f(fark, 4), " GA: [", f(alt, 4), ", ", f(ust, 4), "] p_duz = ", f(p, 6))`;
  if (kind === 'tukey') {
    L.push(
      `  sse <- sum(sapply(${dataVar}, function(g) sum((g - mean(g))^2))); dfe <- sum(lengths(${dataVar})) - k; mse <- sse / dfe`,
      '  for (j in seq_len(ncol(ciftler))) {',
      '    a <- ciftler[1, j]; b <- ciftler[2, j]',
      `    fark <- mean(${dataVar}[[a]]) - mean(${dataVar}[[b]])`,
      `    se <- sqrt(mse / 2 * (1 / length(${dataVar}[[a]]) + 1 / length(${dataVar}[[b]])))  # Tukey-Kramer`,
      '    p <- ptukey(abs(fark) / se, k, dfe, lower.tail = FALSE)',
      '    kritik <- qtukey(0.95, k, dfe)',
      '    alt <- fark - kritik * se; ust <- fark + kritik * se',
      printFark,
      '  }',
      '}',
    );
    return L;
  }
  if (kind === 'games-howell') {
    L.push(
      '  for (j in seq_len(ncol(ciftler))) {',
      '    a <- ciftler[1, j]; b <- ciftler[2, j]',
      `    ga <- ${dataVar}[[a]]; gb <- ${dataVar}[[b]]`,
      '    va <- var(ga) / length(ga); vb <- var(gb) / length(gb)',
      '    se <- sqrt(va + vb)',
      '    sd_ <- (va + vb)^2 / (va^2 / (length(ga) - 1) + vb^2 / (length(gb) - 1))',
      '    fark <- mean(ga) - mean(gb)',
      '    p <- ptukey(sqrt(2) * abs(fark) / se, k, sd_, lower.tail = FALSE)',
      '    kritik <- qtukey(0.95, k, sd_) / sqrt(2)',
      '    alt <- fark - kritik * se; ust <- fark + kritik * se',
      printFark,
      '  }',
      '}',
    );
    return L;
  }
  if (kind === 'dunn') {
    L.push(
      `  tum <- unlist(${dataVar}); N <- length(tum); sira <- rank(tum)`,
      `  grup <- rep(seq_len(k), lengths(${dataVar}))`,
      '  ort_sira <- tapply(sira, grup, mean)',
      '  bag <- table(tum); s2 <- N * (N + 1) / 12 - sum(bag^3 - bag) / (12 * (N - 1))  # bağ düzeltmeli',
      `  ham <- apply(ciftler, 2, function(ab) 2 * pnorm(-abs(ort_sira[ab[1]] - ort_sira[ab[2]]) / sqrt(s2 * (1 / length(${dataVar}[[ab[1]]]) + 1 / length(${dataVar}[[ab[2]]])))))`,
    );
  } else {
    const raw =
      kind === 'paired-t'
        ? `t.test(${dataVar}[[ab[1]]], ${dataVar}[[ab[2]]], paired = TRUE)$p.value`
        : kind === 'mcnemar'
          ? `mcnemar_p(${dataVar}[[ab[1]]], ${dataVar}[[ab[2]]])`
          : `wilcoxon_p(${dataVar}[[ab[1]]], ${dataVar}[[ab[2]]])`;
    L.push(`  ham <- apply(ciftler, 2, function(ab) ${raw})`);
  }
  L.push('  duz <- p.adjust(ham, method = "holm")', '  for (j in seq_len(ncol(ciftler))) {', `    yaz(${names}[ciftler[1, j]], " - ", ${names}[ciftler[2, j]], ": p_duz = ", f(duz[j], 6))`, '  }', '}');
  return L;
}

export function generateAnalysisCodeR(file: DatasetFile, spec: AnalysisSpec, r: AnalysisResult): GeneratedCode {
  const o = r.outcome;
  const alpha = spec.alpha ?? 0.05;
  const names = r.descriptives.map((d) => d.group);
  const needsEtiket = spec.group || spec.rowVar || spec.colVar || r.binaryLevels;
  const limit = spec.normality === 'skewkurt-2' ? 2 : 1.5;
  const byShape = spec.normality === 'skewkurt-1.5' || spec.normality === 'skewkurt-2';
  const norm = (label: string, arr: string) => (byShape ? SKEW_KURT(label, arr) : SHAPIRO(label, arr));
  const body: string[] = [];
  const extraFns: string[] = [];

  body.push(naBlockR, `ALPHA <- ${alpha}`, '', helpersR, '', readCsvLineR(file), '');
  if (byShape) body.push(SKEW_KURT_FN, '');
  if (needsEtiket) body.push(ETIKET_FN, '');

  if (o.kind === 'groups') {
    const { value, group } = spec;
    body.push(
      `d <- df[, c(${rs(value!)}, ${rs(group!)})]`,
      `d[[${rs(value!)}]] <- suppressWarnings(as.numeric(d[[${rs(value!)}]]))`,
      'd <- d[complete.cases(d), ]',
      `d[[${rs(group!)}]] <- etiket(d[[${rs(group!)}]])`,
      `siralama <- ${rVec(names)}`,
      `gruplar <- lapply(siralama, function(s) as.numeric(d[d[[${rs(group!)}]] == s, ${rs(value!)}]))`,
      '',
    );
    if (r.assumptions.length) {
      body.push('# Varsayım testleri: grup içi kalıntılarda normallik, gruplar arasında varyans eşitliği');
      if (byShape) body.push(`# Normallik ölçütü: |çarpıklık| ve |basıklık| ≤ ${limit}`);
      body.push(...norm('residuals', 'unlist(lapply(gruplar, function(g) g - mean(g)))'));
      body.push(
        'tum_y <- unlist(gruplar); tum_g <- factor(rep(seq_along(gruplar), lengths(gruplar)))',
        'sapma <- abs(tum_y - ave(tum_y, tum_g, FUN = median))  # Levene (Brown-Forsythe): medyandan mutlak sapmalar',
        'lv <- anova(lm(sapma ~ tum_g))',
        'yaz("Levene F: ", f(lv[["F value"]][1], 2), " p: ", f(lv[["Pr(>F)"]][1], 6))',
        '',
      );
    }
    body.push(`yaz("Test: ${o.test}")`);
    const g = (i: number) => `gruplar[[${i}]]`;
    switch (o.test) {
      case 'Welch t-testi':
      case 'Bağımsız örneklem t-testi': {
        const eq = o.test === 'Bağımsız örneklem t-testi';
        body.push(
          `res <- t.test(${g(1)}, ${g(2)}, var.equal = ${eq ? 'TRUE' : 'FALSE'})`,
          `n1 <- length(${g(1)}); n2 <- length(${g(2)})`,
          `sp <- sqrt(((n1 - 1) * var(${g(1)}) + (n2 - 1) * var(${g(2)})) / (n1 + n2 - 2))`,
          `hedges_g <- (mean(${g(1)}) - mean(${g(2)})) / sp * (1 - 3 / (4 * (n1 + n2) - 9))`,
          'p_deger <- res$p.value',
          ...printStat('unname(res$statistic)', 'g', 'hedges_g', 'n1 + n2', 'f(unname(res$parameter), 4)', ['res$conf.int[1]', 'res$conf.int[2]']),
        );
        break;
      }
      case 'Mann-Whitney U testi':
        body.push(
          `kesin <- length(${g(1)}) <= 8 && length(${g(2)}) <= 8 && !anyDuplicated(c(${g(1)}, ${g(2)}))  # kesin p: iki grup da ≤ 8 ve bağ yoksa`,
          `res <- suppressWarnings(wilcox.test(${g(1)}, ${g(2)}, exact = kesin, correct = TRUE))`,
          `rank_biserial <- 2 * unname(res$statistic) / (length(${g(1)}) * length(${g(2)})) - 1`,
          'p_deger <- res$p.value',
          ...printStat('unname(res$statistic)', 'r', 'rank_biserial', `length(${g(1)}) + length(${g(2)})`),
        );
        break;
      case 'Tek Yönlü ANOVA':
      case 'Welch ANOVA': {
        const welch = o.test === 'Welch ANOVA';
        body.push(
          'tum <- unlist(gruplar); genel <- mean(tum)',
          'eta2 <- sum(sapply(gruplar, function(g) length(g) * (mean(g) - genel)^2)) / sum((tum - genel)^2)',
          ...(welch
            ? [
                'res <- oneway.test(tum ~ factor(rep(seq_along(gruplar), lengths(gruplar))), var.equal = FALSE)',
                'F <- unname(res$statistic); p_deger <- res$p.value; df1 <- unname(res$parameter[1]); df2 <- unname(res$parameter[2])',
              ]
            : [
                'tab <- anova(lm(tum ~ factor(rep(seq_along(gruplar), lengths(gruplar)))))',
                'F <- tab[["F value"]][1]; p_deger <- tab[["Pr(>F)"]][1]; df1 <- length(gruplar) - 1; df2 <- length(tum) - length(gruplar)',
              ]),
          ...printStat('F', 'eta2', 'eta2', 'length(tum)', df4('df1', 'df2')),
          ...postHocR(r, 'siralama', welch ? 'games-howell' : 'tukey', 'gruplar'),
        );
        break;
      }
      case 'Kruskal-Wallis H testi':
        body.push(
          'res <- kruskal.test(gruplar)',
          'n <- sum(lengths(gruplar))',
          'epsilon2 <- unname(res$statistic) / (n - 1)  # etki büyüklüğü',
          'p_deger <- res$p.value',
          ...printStat('unname(res$statistic)', 'epsilon2', 'epsilon2', 'n', 'f(length(gruplar) - 1, 4)'),
          ...postHocR(r, 'siralama', 'dunn', 'gruplar'),
        );
        break;
      default:
        throw new Error(`R kodu üretimi desteklenmeyen test: ${o.test}`);
    }
  } else if (o.kind === 'paired') {
    const cols = spec.conditions!;
    if (r.binaryLevels) {
      body.push(
        `d <- df[, ${rVec(cols)}]; d <- d[complete.cases(d), ]`,
        `kosul_adlari <- ${rVec(cols)}`,
        `SEVIYELER <- ${rVec(r.binaryLevels)}  # 0 ve 1 olarak kodlanan düzeyler (uygulamayla aynı sıra)`,
        'kosullar <- lapply(kosul_adlari, function(cn) as.integer(etiket(d[[cn]]) == SEVIYELER[2]))',
        '',
      );
    } else {
      body.push(
        `d <- df[, ${rVec(cols)}]; for (cn in ${rVec(cols)}) d[[cn]] <- suppressWarnings(as.numeric(d[[cn]])); d <- d[complete.cases(d), ]`,
        `kosul_adlari <- ${rVec(cols)}`,
        'kosullar <- lapply(kosul_adlari, function(cn) as.numeric(d[[cn]]))',
        '',
      );
    }
    if (r.assumptions.length) {
      const two = cols.length === 2;
      body.push(
        two ? '# Eşleşmiş tasarımda normallik farklar üzerinde aranır' : '# Eşleşmiş tasarımda normallik iki yönlü kalıntılar üzerinde aranır',
        ...norm(
          'paired',
          two ? '(kosullar[[1]] - kosullar[[2]])' : 'as.vector(local({ M <- do.call(rbind, kosullar); t(M - rowMeans(M) - rep(colMeans(M), each = nrow(M)) + mean(M)) }))',
        ),
        '',
      );
    }
    body.push(`yaz("Test: ${o.test}")`);
    switch (o.test) {
      case 'Eşleştirilmiş t-testi':
        body.push(
          'res <- t.test(kosullar[[1]], kosullar[[2]], paired = TRUE)',
          'fark <- kosullar[[1]] - kosullar[[2]]',
          'dz <- mean(fark) / sd(fark)',
          'p_deger <- res$p.value',
          ...printStat('unname(res$statistic)', 'd_z', 'dz', 'length(fark)', 'f(unname(res$parameter), 4)', ['res$conf.int[1]', 'res$conf.int[2]']),
        );
        break;
      case 'Wilcoxon işaretli sıra testi':
        extraFns.push(WILCOX_FN);
        body.push(
          'fark <- kosullar[[1]] - kosullar[[2]]',
          'p_deger <- wilcoxon_p(kosullar[[1]], kosullar[[2]])',
          'fark <- fark[fark != 0]  # sıfır farklar atılır',
          'sira <- rank(abs(fark))',
          'w_arti <- sum(sira[fark > 0]); w_eksi <- sum(sira[fark < 0])',
          'rank_biserial <- (w_arti - w_eksi) / (w_arti + w_eksi)',
          ...printStat('min(w_arti, w_eksi)', 'r', 'rank_biserial', 'length(fark)'),
        );
        break;
      case 'İşaret testi':
        body.push(
          'fark <- kosullar[[1]] - kosullar[[2]]',
          'fark <- fark[fark != 0]  # sıfır farklar atılır',
          'n_arti <- sum(fark > 0)',
          'p_deger <- binom.test(n_arti, length(fark), 0.5)$p.value',
          'isaret_orani <- (n_arti - (length(fark) - n_arti)) / length(fark)',
          ...printStat('n_arti', 'r', 'isaret_orani', 'length(fark)'),
        );
        break;
      case 'McNemar testi':
        body.push(
          'a <- sum(kosullar[[1]] == 0 & kosullar[[2]] == 0); b <- sum(kosullar[[1]] == 0 & kosullar[[2]] == 1)',
          'c_ <- sum(kosullar[[1]] == 1 & kosullar[[2]] == 0); dd <- sum(kosullar[[1]] == 1 & kosullar[[2]] == 1)',
          'if (b + c_ == 0) {',
          '  istatistik <- 0; p_deger <- 1',
          '} else if (b + c_ < 25) {  # kesin iki terimli test',
          '  istatistik <- min(b, c_); p_deger <- min(1, 2 * pbinom(min(b, c_), b + c_, 0.5))',
          '} else {  # sürekliklik düzeltmeli ki-kare',
          '  istatistik <- (abs(b - c_) - 1)^2 / (b + c_); p_deger <- pchisq(istatistik, 1, lower.tail = FALSE)',
          '}',
          'fark_orani <- if (b + c_) (b - c_) / (b + c_) else 0',
          ...printStat('istatistik', 'g', 'fark_orani', 'a + b + c_ + dd', o.statistic.df.length ? 'f(1, 4)' : undefined),
        );
        break;
      case 'Cochran Q testi':
        extraFns.push(
          [
            'mcnemar_p <- function(u, v) {',
            '  b <- sum(u == 0 & v == 1); c_ <- sum(u == 1 & v == 0)',
            '  if (b + c_ == 0) return(1)',
            '  if (b + c_ < 25) return(min(1, 2 * pbinom(min(b, c_), b + c_, 0.5)))',
            '  pchisq((abs(b - c_) - 1)^2 / (b + c_), 1, lower.tail = FALSE)',
            '}',
          ].join('\n'),
        );
        body.push(
          'M <- do.call(cbind, kosullar); n <- nrow(M); k <- ncol(M)',
          'tj <- colSums(M); li <- rowSums(M); N <- sum(M)',
          'Q <- (k - 1) * (k * sum(tj^2) - N^2) / (k * N - sum(li^2))',
          'etki_w <- Q / (n * (k - 1))',
          'p_deger <- pchisq(Q, k - 1, lower.tail = FALSE)',
          ...printStat('Q', 'W', 'etki_w', 'n', 'f(k - 1, 4)'),
          ...postHocR(r, 'kosul_adlari', 'mcnemar', 'kosullar'),
        );
        break;
      case 'Friedman testi':
        extraFns.push(WILCOX_FN);
        body.push(
          'res <- friedman.test(do.call(cbind, kosullar))',
          'n <- length(kosullar[[1]])',
          'kendall_w <- unname(res$statistic) / (n * (length(kosullar) - 1))',
          'p_deger <- res$p.value',
          ...printStat('unname(res$statistic)', 'W', 'kendall_w', 'n', 'f(length(kosullar) - 1, 4)'),
          ...postHocR(r, 'kosul_adlari', 'wilcoxon', 'kosullar'),
        );
        break;
      case 'Tekrarlı ölçümler ANOVA':
        body.push(
          'M <- do.call(rbind, kosullar); k <- nrow(M); n <- ncol(M)',
          'genel <- mean(M)',
          'ss_kosul <- n * sum((rowMeans(M) - genel)^2)',
          'ss_denek <- k * sum((colMeans(M) - genel)^2)',
          'ss_hata <- sum((M - genel)^2) - ss_kosul - ss_denek',
          'df1 <- k - 1; df2 <- (k - 1) * (n - 1)',
          'F <- (ss_kosul / df1) / (ss_hata / df2)',
          'p_deger <- pf(F, df1, df2, lower.tail = FALSE)',
          'kismi_eta2 <- ss_kosul / (ss_kosul + ss_hata)',
          ...printStat('F', 'eta2_kismi', 'kismi_eta2', 'n', df4('df1', 'df2')),
          ...postHocR(r, 'kosul_adlari', 'paired-t', 'kosullar'),
        );
        break;
      default:
        throw new Error(`R kodu üretimi desteklenmeyen test: ${o.test}`);
    }
  } else if (o.kind === 'xy') {
    body.push(
      `d <- df[, c(${rs(spec.x!)}, ${rs(spec.y!)})]; for (cn in c(${rs(spec.x!)}, ${rs(spec.y!)})) d[[cn]] <- suppressWarnings(as.numeric(d[[cn]])); d <- d[complete.cases(d), ]`,
      `x <- d[[${rs(spec.x!)}]]`,
      `y <- d[[${rs(spec.y!)}]]`,
      '',
    );
    if (r.assumptions.length) body.push('# Normallik her değişken için ayrı sınanır', ...norm('x', 'x'), ...norm('y', 'y'), '');
    body.push(`yaz("Test: ${o.test}")`);
    if (o.test === 'Kendall tau') {
      body.push(
        'kesin <- length(x) <= 33 && !anyDuplicated(x) && !anyDuplicated(y)  # kesin p: n ≤ 33 ve bağ yoksa; aksi halde bağ düzeltmeli yaklaşım',
        'res <- suppressWarnings(cor.test(x, y, method = "kendall", exact = kesin, continuity = FALSE))',
        'p_deger <- res$p.value',
        ...printStat('unname(res$estimate)', 'tau', 'unname(res$estimate)', 'length(x)'),
      );
    } else if (o.test === 'Pearson korelasyonu') {
      body.push('res <- cor.test(x, y, method = "pearson")', 'p_deger <- res$p.value', ...printStat('unname(res$estimate)', 'r', 'unname(res$estimate)', 'length(x)', 'f(length(x) - 2, 4)', ['res$conf.int[1]', 'res$conf.int[2]']));
    } else {
      body.push(
        'rho <- cor(x, y, method = "spearman")',
        't_ <- rho * sqrt((length(x) - 2) / (1 - rho^2))',
        'p_deger <- 2 * pt(-abs(t_), length(x) - 2)  # t yaklaşımı',
        'z <- atanh(rho); se <- 1 / sqrt(length(x) - 3); kritik <- qnorm(0.975)',
        'ci_alt <- tanh(z - kritik * se); ci_ust <- tanh(z + kritik * se)  # Fisher z',
        ...printStat('rho', 'rho', 'rho', 'length(x)', 'f(length(x) - 2, 4)', ['ci_alt', 'ci_ust']),
      );
    }
  } else {
    const t = r.table!;
    body.push(
      `d <- df[, c(${rs(spec.rowVar!)}, ${rs(spec.colVar!)})]; d <- d[complete.cases(d), ]`,
      `tablo <- table(factor(etiket(d[[${rs(spec.rowVar!)}]]), levels = ${rVec(t.rowNames)}), factor(etiket(d[[${rs(spec.colVar!)}]]), levels = ${rVec(t.colNames)}))`,
      '',
      `yaz("Test: ${o.test}")`,
    );
    if (o.test === 'Fisher kesin testi') {
      body.push(
        'v <- sqrt(unname(suppressWarnings(chisq.test(tablo, correct = FALSE)$statistic)) / (sum(tablo) * (min(dim(tablo)) - 1)))  # Cramér V',
        'p_deger <- fisher.test(tablo)$p.value',
        'oran <- (tablo[1, 1] * tablo[2, 2]) / (tablo[1, 2] * tablo[2, 1])  # örneklem olasılık oranı',
        ...printStat('oran', 'V', 'v', 'sum(tablo)'),
      );
    } else {
      body.push(
        'res <- suppressWarnings(chisq.test(tablo, correct = TRUE))  # 2x2 tabloda Yates düzeltmesi',
        'v <- sqrt(unname(suppressWarnings(chisq.test(tablo, correct = FALSE)$statistic)) / (sum(tablo) * (min(dim(tablo)) - 1)))  # Cramér V',
        'p_deger <- res$p.value',
        ...printStat('unname(res$statistic)', 'V', 'v', 'sum(tablo)', 'f(unname(res$parameter), 4)'),
      );
    }
  }

  const head = ['# StatAdvisor tarafından üretildi. Veri dosyası betikle aynı klasörde olmalıdır.', '# Yalnızca temel R (stats) kullanılır; ek paket gerekmez.', ''];
  const code = [...head, ...body.flatMap((l) => (l === helpersR && extraFns.length ? [l, '', ...extraFns] : [l]))].join('\n') + '\n';
  return { filename: 'analiz.R', code, expectedOutput: expectedLines(r), requirements: [] };
}

/** Ölçek puanları (ters madde, toplam/ortalama, eksik kuralı, Cronbach alfa) için R betiği. */
export function generateScalesCodeR(file: DatasetFile, defs: ScaleDef[], results: ScaleResult[]): GeneratedCode {
  const L: string[] = ['# StatAdvisor tarafından üretildi. Veri dosyası betikle aynı klasörde olmalıdır.', '# Yalnızca temel R (stats) kullanılır; ek paket gerekmez.', ''];
  L.push(naBlockR, '', helpersR, '', SKEW_KURT_FN, '', readCsvLineR(file), '');
  L.push('# Ölçekler: alt boyutlar araştırmacı tarafından tanımlanmıştır (ters maddeler: min + max - x)', 'SKALALAR <- list(');
  L.push(
    defs
      .map(
        (d) =>
          `  list(ad = ${rs(d.name.trim())}, maddeler = ${rVec(d.items)}, ters = ${d.reverse.length ? rVec(d.reverse) : 'character(0)'}, yontem = ${rs(d.method)}, min = ${d.min}, max = ${d.max}, gecerli_oran = ${d.minValidShare})`,
      )
      .join(',\n'),
  );
  L.push(
    ')',
    'for (sk in SKALALAR) {',
    '  k <- length(sk$maddeler)',
    '  for (s in sk$maddeler) df[[s]] <- suppressWarnings(as.numeric(df[[s]]))',
    '  m <- df[, sk$maddeler, drop = FALSE]',
    '  for (s in sk$ters) m[[s]] <- sk$min + sk$max - m[[s]]',
    '  gerekli <- max(1, ceiling(sk$gecerli_oran * k - 1e-9))',
    '  puan <- rowMeans(m, na.rm = TRUE)',
    '  if (sk$yontem == "sum") puan <- puan * k  # yanıtlananların ortalaması x madde sayısı',
    '  puan[rowSums(!is.na(m)) < gerekli] <- NA',
    '  df[[sk$ad]] <- puan',
    '  tam <- m[complete.cases(m), , drop = FALSE]  # alfa yalnızca tüm maddeleri yanıtlayanlarda',
    '  toplam_var <- if (nrow(tam) >= 3) var(rowSums(tam)) else NaN',
    '  alfa <- if (!is.nan(toplam_var) && toplam_var > 0) k / (k - 1) * (1 - sum(sapply(tam, var)) / toplam_var) else NaN',
    '  ort <- if (any(!is.na(puan))) mean(puan, na.rm = TRUE) else NaN',
    '  yaz("Olcek [", sk$ad, "] alfa: ", f(alfa, 4), " n_alfa: ", nrow(tam))',
    '  yaz("Olcek [", sk$ad, "] ortalama: ", f(ort, 4), " gecerli: ", sum(!is.na(puan)))',
    '  v <- puan[!is.na(puan)]',
    '  if (length(v) >= 4 && sd(v) > 0) {  # puanın normalliği',
    '    u <- if (length(v) > 5000) sort(v)[floor((0:4999) * length(v) / 5000) + 1] else v',
    '    sw <- shapiro.test(u); sk_ <- carpiklik_basiklik(v)',
    '    yaz("Olcek [", sk$ad, "] carpiklik: ", f(sk_[1], 3), " basiklik: ", f(sk_[2], 3), " Shapiro-Wilk W: ", f(unname(sw$statistic), 3), " p: ", f(sw$p.value, 6))',
    '  }',
    '}',
    '',
    'write.csv(df, "olcekli.csv", row.names = FALSE)',
  );
  const expected = results.flatMap((r) => [
    `Olcek [${r.name}] alfa: ${r.alpha === null ? 'nan' : fmt(r.alpha, 4)} n_alfa: ${r.nAlpha}`,
    `Olcek [${r.name}] ortalama: ${r.mean === null ? 'nan' : fmt(r.mean, 4)} gecerli: ${r.nValid}`,
    ...(r.skewness !== null && r.shapiroP !== null
      ? [`Olcek [${r.name}] carpiklik: ${fmt(r.skewness, 3)} basiklik: ${fmt(r.kurtosis ?? NaN, 3)} Shapiro-Wilk W: ${fmt(r.shapiroW!, 3)} p: ${fmt(r.shapiroP, 6)}`]
      : []),
  ]);
  return { filename: 'olcek.R', code: L.join('\n') + '\n', expectedOutput: expected, requirements: [] };
}

/** Anket yanıt taraması (düz çizgi, Mahalanobis D²) için R betiği. */
export function generateScreeningCodeR(file: DatasetFile, opts: ScreenOptions, r: ScreenResult): GeneratedCode {
  const alpha = opts.mahalanobisAlpha ?? 0.001;
  const L: string[] = ['# StatAdvisor tarafından üretildi. Veri dosyası betikle aynı klasörde olmalıdır.', '# Yalnızca temel R (stats) kullanılır; ek paket gerekmez.', ''];
  L.push(naBlockR, '', helpersR, '', readCsvLineR(file), '');
  L.push(
    `MADDELER <- ${rVec(opts.items)}`,
    'for (s in MADDELER) df[[s]] <- suppressWarnings(as.numeric(df[[s]]))',
    'tam_satir <- which(complete.cases(df[, MADDELER]))  # yalnızca tüm maddeleri yanıtlayanlar taranır',
    'tam <- as.matrix(df[tam_satir, MADDELER])',
    'isaretli <- integer(0)',
  );
  if (opts.straightLine) {
    L.push('', '# Düz çizgi: tüm maddelere aynı yanıt', 'duz <- tam_satir[apply(tam, 1, function(x) length(unique(x)) == 1)]', 'isaretli <- union(isaretli, duz)', 'yaz("Duz cizgi: ", length(duz))');
  }
  if (opts.mahalanobis) {
    L.push(
      '',
      `# Mahalanobis D²: ki-kare (sd = madde sayısı), p < ${alpha} (Tabachnick ve Fidell, 2013)`,
      'd2 <- mahalanobis(tam, colMeans(tam), cov(tam))',
      'p <- pchisq(d2, df = ncol(tam), lower.tail = FALSE)',
      `mah <- tam_satir[p < ${alpha}]`,
      'isaretli <- union(isaretli, mah)',
      'yaz("Mahalanobis: ", length(mah), " en_buyuk_D2: ", f(max(d2), 4))',
    );
  }
  L.push('', 'yaz("Cikarilan satir: ", length(isaretli))', 'if (length(isaretli) > 0) df <- df[-isaretli, , drop = FALSE]', 'write.csv(df, "taranmis.csv", row.names = FALSE)');
  const expected: string[] = [];
  if (opts.straightLine) expected.push(`Duz cizgi: ${r.straightLiners.length}`);
  if (opts.mahalanobis) expected.push(`Mahalanobis: ${r.mahalanobis.length} en_buyuk_D2: ${fmt(r.maxD2 ?? NaN, 4)}`);
  expected.push(`Cikarilan satir: ${r.flagged.length}`);
  return { filename: 'tarama.R', code: L.join('\n') + '\n', expectedOutput: expected, requirements: [] };
}
