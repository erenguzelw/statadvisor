/**
 * R kodu üretici (modeller ve temizleme): doğrusal regresyon, ikili lojistik regresyon ve veri temizleme.
 * Yalnızca temel R (stats) kullanılır. Çıktı satırları Python betiğiyle ve arayüzdeki sonuçla aynıdır;
 * bu eşitlik R bulunan ortamda otomatik testle doğrulanır.
 */
import type { LogisticResult } from './logistic.ts';
import { logisticExpectedOutput, type LogisticSpec } from './logistic-report.ts';
import type { RegressionResult } from './regression.ts';
import { regressionExpectedOutput, type RegressionSpec } from './regression-report.ts';
import type { CleaningCodeOptions, DatasetFile, GeneratedCode } from './codegen.ts';
import { ETIKET_FN, SHAPIRO, helpersR, naBlockR, readCsvLineR, rVec, rs } from './codegen-r.ts';

const HEAD = ['# StatAdvisor tarafından üretildi. Veri dosyası betikle aynı klasörde olmalıdır.', '# Yalnızca temel R (stats) kullanılır; ek paket gerekmez.', ''];

const rList = (m: Record<string, string[] | string>) => `list(${Object.entries(m).map(([k, v]) => `${rs(k)} = ${Array.isArray(v) ? rVec(v) : rs(v)}`).join(', ')})`;

/** Tasarım matrisi (Sabit + sayısal + kukla) ve ortak VIF işlevi. */
function designBlock(spec: RegressionSpec | LogisticSpec, r: RegressionResult | LogisticResult, numericDependent: boolean): string[] {
  const numCat = new Set(spec.numericCategorical ?? []);
  const levels = Object.fromEntries(r.categories.map((c) => [c.name, c.levels]));
  const refs = Object.fromEntries(r.categories.map((c) => [c.name, c.reference]));
  const L = [`SAYISAL <- ${spec.numeric.length ? rVec(spec.numeric) : 'character(0)'}`, `KATEGORIK <- ${spec.categorical.length ? rVec(spec.categorical) : 'character(0)'}`];
  if (spec.categorical.length) {
    L.push(`DUZEYLER <- ${rList(levels)}  # kukla kodlamada kullanılan düzeyler (sıralı)`, `REFERANS <- ${rList(refs)}  # referans düzey: kukla değişkeni olmayan düzey`);
  }
  L.push('', ETIKET_FN, '');
  const toNum = [...spec.numeric, ...spec.categorical.filter((c) => numCat.has(c)), ...(numericDependent ? [spec.dependent] : [])];
  L.push(`d <- df[, c(BAGIMLI, SAYISAL, KATEGORIK)]`);
  if (toNum.length) L.push(`for (s in ${rVec([...new Set(toNum)])}) d[[s]] <- suppressWarnings(as.numeric(d[[s]]))`);
  return L;
}

const VIF_FN = [
  'vif <- function(Xm, j) {  # j. sütunun diğer sütunlara (sabit dahil) göre açıklanabilirliğinden 1 / (1 - R2)',
  '  if (ncol(Xm) <= 2) return(1)',
  '  1 / (1 - summary(lm(Xm[, j] ~ Xm[, -c(1, j), drop = FALSE]))$r.squared)',
  '}',
].join('\n');

const BUILD_X = [
  'X <- data.frame(Sabit = rep(1, nrow(d)), check.names = FALSE)',
  'for (s in SAYISAL) X[[s]] <- as.numeric(d[[s]])',
];
const BUILD_X_CAT = [
  'for (s in KATEGORIK) {',
  '  etiketler <- etiket(d[[s]])',
  '  for (duzey in DUZEYLER[[s]]) {',
  '    if (duzey != REFERANS[[s]]) X[[paste0(s, "[", duzey, "]")]] <- as.numeric(etiketler == duzey)',
  '  }',
  '}',
];

export function generateRegressionCodeR(file: DatasetFile, spec: RegressionSpec, r: RegressionResult): GeneratedCode {
  const alpha = spec.alpha ?? 0.05;
  const L: string[] = [...HEAD, naBlockR, `ALPHA <- ${alpha}`, '', helpersR, '', VIF_FN, '', readCsvLineR(file), '', `BAGIMLI <- ${rs(spec.dependent)}`];
  L.push(...designBlock(spec, r, true));
  L.push(
    'd <- d[complete.cases(d), ]  # eksik değeri olan satırlar çıkarılır (liste bazlı silme)',
    'y <- as.numeric(d[[BAGIMLI]])',
    ...BUILD_X,
    ...(spec.categorical.length ? BUILD_X_CAT : []),
    '',
    'Xm <- as.matrix(X)',
    'X1 <- Xm[, -1, drop = FALSE]',
    'model <- lm(y ~ X1)',
    'ozet <- summary(model); kat <- ozet$coefficients',
    'ci <- confint(model, level = 1 - ALPHA)',
    'kalintilar <- residuals(model)',
    'sd_y <- sd(y)',
    '',
    'yaz("n: ", length(y))',
    'yaz("R2: ", f(ozet$r.squared, 4), " duzeltilmis R2: ", f(ozet$adj.r.squared, 4))',
    'fi <- unname(ozet$fstatistic)',
    'yaz("F(", as.integer(fi[2]), ", ", as.integer(fi[3]), "): ", f(fi[1], 4), " p: ", f(pf(fi[1], fi[2], fi[3], lower.tail = FALSE), 6))',
    'for (j in seq_len(ncol(Xm))) {',
    '  satir <- paste0(colnames(Xm)[j], ": b = ", f(kat[j, 1], 4), " SH = ", f(kat[j, 2], 4), " t = ", f(kat[j, 3], 4), " p = ", f(kat[j, 4], 6), " GA = [", f(ci[j, 1], 4), ", ", f(ci[j, 2], 4), "]")',
    '  if (j > 1) satir <- paste0(satir, " beta = ", f(kat[j, 1] * sd(Xm[, j]) / sd_y, 4), " VIF = ", f(vif(Xm, j), 4))',
    '  yaz(satir)',
    '}',
    ...SHAPIRO('kalintilar', 'kalintilar').map((l, i) => (i === 3 ? 'yaz("Shapiro-Wilk (kalintilar) W: ", f(unname(sw$statistic), 4), " p: ", f(sw$p.value, 6))' : l)),
    'bp <- summary(lm(kalintilar^2 ~ X1))$r.squared * length(y)  # Breusch-Pagan (Koenker): n x R2',
    'yaz("Breusch-Pagan LM: ", f(bp, 4), " p: ", f(pchisq(bp, ncol(X1), lower.tail = FALSE), 6))',
    'yaz("Durbin-Watson: ", f(sum(diff(kalintilar)^2) / sum(kalintilar^2), 4))',
    'yaz("Cook uzakligi (en buyuk): ", f(max(cooks.distance(model)), 4))',
  );
  return { filename: 'regresyon.R', code: L.join('\n') + '\n', expectedOutput: regressionExpectedOutput(r), requirements: [] };
}

export function generateLogisticCodeR(file: DatasetFile, spec: LogisticSpec, r: LogisticResult): GeneratedCode {
  const alpha = spec.alpha ?? 0.05;
  const numDep = (spec.numericCategorical ?? []).includes(spec.dependent);
  const L: string[] = [...HEAD, naBlockR, `ALPHA <- ${alpha}`, '', helpersR, '', VIF_FN, '', readCsvLineR(file), '', `BAGIMLI <- ${rs(spec.dependent)}`, `OLAY <- ${rs(r.eventLevel)}  # 1 olarak kodlanan düzey (referans: ${r.referenceLevel})`];
  L.push(...designBlock(spec, r, numDep));
  L.push(
    'd <- d[complete.cases(d), ]  # eksik değeri olan satırlar çıkarılır (liste bazlı silme)',
    'y <- as.integer(etiket(d[[BAGIMLI]]) == OLAY)',
    ...BUILD_X,
    ...(spec.categorical.length ? BUILD_X_CAT : []),
    '',
    'Xm <- as.matrix(X)',
    'X1 <- Xm[, -1, drop = FALSE]',
    'model <- glm(y ~ X1, family = binomial(), control = glm.control(epsilon = 1e-12, maxit = 200))',
    'kat <- summary(model)$coefficients',
    'kritik <- qnorm(1 - ALPHA / 2)  # Wald güven aralığı',
    'olasilik <- unname(fitted(model))',
    'n <- length(y); llf <- as.numeric(logLik(model)); llnull <- as.numeric(logLik(glm(y ~ 1, family = binomial())))',
    '',
    'yaz("n: ", n, " olay: ", sum(y))',
    'lr <- 2 * (llf - llnull)',
    'yaz("LR chi2(", ncol(X1), "): ", f(lr, 4), " p: ", f(pchisq(lr, ncol(X1), lower.tail = FALSE), 6))',
    'cox_snell <- 1 - exp(2 * (llnull - llf) / n)',
    'nagelkerke <- cox_snell / (1 - exp(2 * llnull / n))',
    'yaz("McFadden R2: ", f(1 - llf / llnull, 4), " Nagelkerke R2: ", f(nagelkerke, 4))',
    'for (j in seq_len(ncol(Xm))) {',
    '  b <- kat[j, 1]; se <- kat[j, 2]',
    '  satir <- paste0(colnames(Xm)[j], ": b = ", f(b, 4), " SH = ", f(se, 4), " z = ", f(kat[j, 3], 4), " p = ", f(kat[j, 4], 6), " OR = ", f(exp(b), 4), " OR GA = [", f(exp(b - kritik * se), 4), ", ", f(exp(b + kritik * se), 4), "]")',
    '  if (j > 1) satir <- paste0(satir, " VIF = ", f(vif(Xm, j), 4))',
    '  yaz(satir)',
    '}',
    'sira <- rank(olasilik); n1 <- sum(y == 1); n0 <- sum(y == 0)',
    'yaz("AUC: ", f((sum(sira[y == 1]) - n1 * (n1 + 1) / 2) / (n1 * n0), 4))',
  );
  if (r.hosmerLemeshow) {
    L.push(
      '',
      '# Hosmer-Lemeshow: olasılığa göre kararlı sıralama, boyutları en çok bir farkla eşit 10 grup',
      'sirali <- order(olasilik)',
      'boyut <- rep(n %/% 10, 10) + c(rep(1, n %% 10), rep(0, 10 - n %% 10))',
      'gruplar <- split(sirali, rep(seq_len(10), boyut))',
      'hl <- 0',
      'for (idx in gruplar) {',
      '  beklenen <- sum(olasilik[idx]); pbar <- beklenen / length(idx)',
      '  hl <- hl + (sum(y[idx]) - beklenen)^2 / (length(idx) * pbar * (1 - pbar))',
      '}',
      'yaz("Hosmer-Lemeshow chi2(", length(gruplar) - 2, "): ", f(hl, 4), " p: ", f(pchisq(hl, length(gruplar) - 2, lower.tail = FALSE), 6))',
    );
  }
  L.push(
    '',
    'tahmin <- as.integer(olasilik >= 0.5)',
    'tp <- sum(tahmin == 1 & y == 1); fp <- sum(tahmin == 1 & y == 0)',
    'tn <- sum(tahmin == 0 & y == 0); fn <- sum(tahmin == 0 & y == 1)',
    'yaz("Siniflandirma (esik 0.5): TP = ", tp, " FP = ", fp, " TN = ", tn, " FN = ", fn, " dogruluk = ", f((tp + tn) / length(y), 4))',
  );
  return { filename: 'lojistik.R', code: L.join('\n') + '\n', expectedOutput: logisticExpectedOutput(r), requirements: [] };
}

const KNN_FN = [
  'knn_doldur <- function(Z, k) {  # sklearn KNNImputer ile aynı: nan-öklid uzaklığı, düzgün ağırlıklı ortalama',
  '  n <- nrow(Z); p <- ncol(Z); cikti <- Z; eksik <- is.na(Z)',
  '  for (i in which(rowSums(eksik) > 0)) {',
  '    fark <- sweep(Z, 2, Z[i, ])',
  '    ortak <- rowSums(!is.na(fark))',
  '    uzaklik <- sqrt(p / ortak * rowSums(fark^2, na.rm = TRUE))',
  '    uzaklik[ortak == 0] <- NA; uzaklik[i] <- NA',
  '    for (cc in which(eksik[i, ])) {',
  '      adaylar <- which(!eksik[, cc] & !is.na(uzaklik))',
  '      if (length(adaylar) == 0) { cikti[i, cc] <- mean(Z[, cc], na.rm = TRUE); next }',
  '      secilen <- adaylar[order(uzaklik[adaylar])][seq_len(min(k, length(adaylar)))]',
  '      cikti[i, cc] <- mean(Z[secilen, cc])',
  '    }',
  '  }',
  '  cikti',
  '}',
].join('\n');

const MODE_FN = [
  'mod_doldur <- function(x) {  # en sık değer; eşitlikte en küçük',
  '  if (!any(is.na(x)) || all(is.na(x))) return(x)',
  '  u <- sort(unique(x[!is.na(x)]), method = "radix")',
  '  x[is.na(x)] <- u[which.max(tabulate(match(x, u)))]',
  '  x',
  '}',
].join('\n');

/** Veri temizleme: uygulamanın yaptığı işlemle aynı kurallar. Sonucu temizlenmis.csv dosyasına yazar. */
export function generateCleaningCodeR(file: DatasetFile, opts: CleaningCodeOptions): GeneratedCode {
  const col = (xs: string[]) => (xs.length ? rVec(xs) : 'character(0)');
  const L: string[] = [...HEAD, naBlockR, '', helpersR, '', readCsvLineR(file)];
  L.push('', '# Sayısal sütunlar: sayıya çevrilemeyen değerler eksik sayılır', `SAYISAL <- ${col(opts.numericColumns)}`, 'for (s in SAYISAL) df[[s]] <- suppressWarnings(as.numeric(df[[s]]))');
  if (opts.rules.length) {
    const ranges = Object.entries(opts.validity).filter(([, v]) => v.range);
    const cats = Object.entries(opts.validity).filter(([, v]) => v.categories?.length);
    L.push('', '# 1. Kullanıcının seçtiği kurallar. Hepsi özgün veri üzerinde değerlendirilir; hiçbiri diğerinin sonucunu etkilemez.');
    L.push('#    Geçerli aralık/kategoriler kullanıcı tarafından doğrulanmıştır; gözlenen min/maks değerlerden türetilmemiştir.');
    L.push(`GECERLI_ARALIK <- list(${ranges.map(([n, v]) => `${rs(n)} = c(${v.range!.min}, ${v.range!.max})`).join(', ')})`);
    L.push(`GECERLI_KATEGORI <- list(${cats.map(([n, v]) => `${rs(n)} = c(${v.categories!.map((c) => (v.numeric ? String(Number(c)) : rs(c))).join(', ')})`).join(', ')})`);
    L.push('# (sütun, sorun, eylem): sorun = gecersiz | uc (Tukey 1.5 x IQR, incelenecek uç değer); eylem = eksik | satir');
    L.push(
      `KURALLAR <- data.frame(sutun = ${rVec(opts.rules.map((r) => r.column))}, sorun = ${rVec(opts.rules.map((r) => (r.issue === 'invalid' ? 'gecersiz' : 'uc')))}, eylem = ${rVec(opts.rules.map((r) => (r.action === 'setMissing' ? 'eksik' : 'satir')))}, stringsAsFactors = FALSE)`,
      'satir_sil <- rep(FALSE, nrow(df))',
      'eksik_yap <- list()',
      'for (i in seq_len(nrow(KURALLAR))) {',
      '  s <- KURALLAR$sutun[i]; x <- df[[s]]',
      '  gecersiz <- rep(FALSE, nrow(df))',
      '  if (!is.null(GECERLI_ARALIK[[s]])) {',
      '    gecersiz <- !is.na(x) & (x < GECERLI_ARALIK[[s]][1] | x > GECERLI_ARALIK[[s]][2])',
      '  } else if (!is.null(GECERLI_KATEGORI[[s]])) {',
      '    gecersiz <- !is.na(x) & !(x %in% GECERLI_KATEGORI[[s]])',
      '  }',
      '  if (KURALLAR$sorun[i] == "gecersiz") {',
      '    m <- gecersiz',
      '  } else {  # Tukey sınırı geçersiz hücreler dışarıda bırakılarak hesaplanır',
      '    v <- x[!gecersiz & !is.na(x)]',
      '    m <- rep(FALSE, nrow(df))',
      '    if (length(v) >= 4) {',
      '      q <- quantile(v, c(0.25, 0.75), names = FALSE); iqr <- q[2] - q[1]',
      '      m <- !is.na(x) & !gecersiz & (x < q[1] - 1.5 * iqr | x > q[2] + 1.5 * iqr)',
      '    }',
      '  }',
      '  m[is.na(m)] <- FALSE',
      '  if (KURALLAR$eylem[i] == "satir") satir_sil <- satir_sil | m',
      '  else eksik_yap[[s]] <- if (is.null(eksik_yap[[s]])) m else eksik_yap[[s]] | m',
      '}',
      'for (s in names(eksik_yap)) df[[s]][eksik_yap[[s]]] <- NA',
      'df <- df[!satir_sil, , drop = FALSE]  # silmeden önce işaretlenen hücrelerin geçerliliğini kontrol edin',
    );
  }
  if (opts.impute === 'median') {
    L.push(
      '',
      MODE_FN,
      '',
      '# 2. Eksik değerler: sürekli sütunlarda medyan; sıralı ve kategorik sütunlarda mod',
      `for (s in ${col(opts.continuousColumns)}) df[[s]][is.na(df[[s]])] <- median(df[[s]], na.rm = TRUE)`,
      `for (s in ${col(opts.modeColumns)}) df[[s]] <- mod_doldur(df[[s]])`,
    );
  } else if (opts.impute === 'knn') {
    const k = opts.k ?? 5;
    L.push(
      '',
      KNN_FN,
      '',
      MODE_FN,
      '',
      `# 2. Eksik değerler: sürekli sütunlarda KNN (k=${k}, standartlaştırılmış); sıralı ve kategorik sütunlarda mod`,
      `OZELLIK <- ${col(opts.continuousColumns)}`,
      'if (length(OZELLIK) > 0) {',
      '  M <- as.matrix(df[, OZELLIK, drop = FALSE])',
      '  mu <- colMeans(M, na.rm = TRUE)',
      '  sg <- apply(M, 2, function(v) sqrt(mean((v - mean(v, na.rm = TRUE))^2, na.rm = TRUE)))  # StandardScaler: ddof = 0',
      '  sg[is.na(sg) | sg == 0] <- 1',
      `  Z <- knn_doldur(sweep(sweep(M, 2, mu), 2, sg, "/"), ${k})`,
      '  M2 <- sweep(sweep(Z, 2, sg, "*"), 2, mu, "+")',
      '  for (s in OZELLIK) df[[s]] <- M2[, s]',
      '}',
      `for (s in ${col(opts.modeColumns)}) df[[s]] <- mod_doldur(df[[s]])`,
    );
  }
  L.push(
    '',
    'csv_alan <- function(x) if (grepl("[,\\"\\n]", x)) paste0("\\"", gsub("\\"", "\\"\\"", x), "\\"") else x  # yalnızca gerekirse tırnak',
    'for (s in names(df)) if (is.character(df[[s]])) df[[s]] <- ifelse(is.na(df[[s]]), NA, vapply(df[[s]], csv_alan, ""))',
    'names(df) <- vapply(names(df), csv_alan, "")',
    'write.table(df, "temizlenmis.csv", sep = ",", row.names = FALSE, na = "", quote = FALSE, fileEncoding = "UTF-8")',
    'yaz("Temizlenen veri: ", nrow(df), " satır")',
  );
  return { filename: 'temizle.R', code: L.join('\n') + '\n', expectedOutput: [], requirements: [] };
}
