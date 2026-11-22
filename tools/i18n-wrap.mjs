/**
 * Arayüz dosyalarındaki Türkçe metinleri `t('…')` ile sarar ve gerekli `useI18n` kancasını ekler.
 * Kullanım: node tools/i18n-wrap.mjs <dosya...>
 * Çıktı: bulunan anahtarlar tools/.i18n-keys.json dosyasına eklenir; sarılamayan (modül düzeyi) metinler raporlanır.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');

const ATTRS = new Set(['label', 'title', 'description', 'placeholder', 'aria-label', 'caption', 'hint', 'legend', 'summary', 'alt', 'header', 'runtime', 'feature', 'context', 'meta', 'badge', 'unit', 'annotation', 'emptyText', 'okLabel', 'cancelLabel']);
const PROPS = new Set(['label', 'header', 'title', 'description', 'hint', 'placeholder', 'legend', 'caption', 'summary', 'message', 'text', 'detail', 'name']);
const KEYS_FILE = 'tools/.i18n-keys.json';
const keys = existsSync(KEYS_FILE) ? new Set(JSON.parse(readFileSync(KEYS_FILE, 'utf8'))) : new Set();

const letters = /\p{L}{2,}/u;
const isText = (s) => letters.test(s) && !/^[\p{Lu}\d_.\-/: ]{1,4}$/u.test(s) && !/^https?:|^\/|^[\w.-]+\.\w{2,4}$/.test(s);
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

function enclosingComponent(node) {
  let n = node.parent;
  let best = null;
  while (n) {
    if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)) {
      let name = n.name?.text;
      if (!name && ts.isVariableDeclaration(n.parent)) name = n.parent.name.getText();
      if (name && /^(use)?[A-Z]/.test(name) && n.body && ts.isBlock(n.body)) return n;
      if (n.body && ts.isBlock(n.body) && !best) best = null;
    }
    n = n.parent;
  }
  return best;
}

function template(node, sf) {
  // Şablon dizgesi → anahtar + değişken nesnesi
  const parts = [node.head.text];
  const vars = [];
  const used = new Set();
  node.templateSpans.forEach((span, i) => {
    const expr = span.expression;
    let name = ts.isIdentifier(expr) ? expr.text : ts.isPropertyAccessExpression(expr) ? expr.name.text : `v${i + 1}`;
    while (used.has(name)) name += '2';
    used.add(name);
    parts.push(`{${name}}`, span.literal.text);
    vars.push(`${name}: ${expr.getText(sf)}`);
  });
  return { key: parts.join(''), vars };
}

for (const file of process.argv.slice(2)) {
  const src = readFileSync(file, 'utf8');
  const crlf = src.includes('\r\n');
  const text = src.replace(/\r\n/g, '\n');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = []; // {start,end,text}
  const needHook = new Set();
  const skipped = [];

  const wrap = (node, replacement, display, inJsx) => {
    const comp = enclosingComponent(node);
    if (!comp) {
      skipped.push(display);
      return;
    }
    needHook.add(comp);
    edits.push({ start: node.getStart(sf), end: node.getEnd(), text: replacement });
  };

  function visit(node) {
    if (ts.isJsxText(node)) {
      const raw = node.getText(sf);
      const content = norm(raw);
      if (content && isText(content)) {
        const lead = /^\s*/.exec(raw)[0];
        const trail = /\s*$/.exec(raw)[0];
        const pre = lead && !lead.includes('\n') ? "{' '}" : '';
        const post = trail && !trail.includes('\n') ? "{' '}" : '';
        keys.add(content);
        wrap(node, `${pre}{t(${q(content)})}${post}`, content);
      }
    } else if (ts.isJsxAttribute(node) && node.initializer && ATTRS.has(node.name.getText(sf))) {
      const init = node.initializer;
      if (ts.isStringLiteral(init) && isText(init.text)) {
        keys.add(init.text);
        wrap(init, `{t(${q(init.text)})}`, init.text);
      } else if (ts.isJsxExpression(init) && init.expression) {
        const e = init.expression;
        if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) {
          if (isText(e.text)) {
            keys.add(e.text);
            wrap(e, `t(${q(e.text)})`, e.text);
          }
        } else if (ts.isTemplateExpression(e)) {
          const { key, vars } = template(e, sf);
          if (isText(key.replace(/\{\w+\}/g, ''))) {
            keys.add(key);
            wrap(e, `t(${q(key)}, { ${vars.join(', ')} })`, key);
          }
        }
      }
    } else if (ts.isPropertyAssignment(node) && PROPS.has(node.name.getText(sf).replace(/['"]/g, ''))) {
      const e = node.initializer;
      if ((ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) && isText(e.text) && /[\s\p{Lu}]/u.test(e.text)) {
        keys.add(e.text);
        wrap(e, `t(${q(e.text)})`, e.text);
      } else if (ts.isTemplateExpression(e)) {
        const { key, vars } = template(e, sf);
        if (isText(key.replace(/\{\w+\}/g, ''))) {
          keys.add(key);
          wrap(e, `t(${q(key)}, { ${vars.join(', ')} })`, key);
        }
      }
    }
    // 2. geçiş: Türkçe karakter içeren diğer tüm dizgeler (koşullu ifadeler, dönüş değerleri, şablonlar...)
    if (process.env.I18N_ALL && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node))) {
      const p = node.parent;
      const inT = (() => {
        for (let a = node.parent; a; a = a.parent) {
          if (ts.isCallExpression(a) && ts.isIdentifier(a.expression) && (a.expression.text === 't' || a.expression.text === 'translate')) return true;
          if (ts.isImportDeclaration(a) || ts.isExportDeclaration(a) || ts.isLiteralTypeNode(a) || ts.isTypeNode(a)) return true;
        }
        return false;
      })();
      const isKey = ts.isPropertyAssignment(p) && p.name === node;
      const inAttr = ts.isJsxAttribute(p);
      if (!inT && !isKey && !inAttr && !edits.some((e) => e.start <= node.getStart(sf) && e.end >= node.getEnd())) {
        if (ts.isTemplateExpression(node)) {
          const { key, vars } = template(node, sf);
          if (/[çğıöşüÇĞİÖŞÜ]/.test(key.replace(/{w+}/g, '')) && !/^s*(#|<)/.test(key)) {
            keys.add(key);
            wrap(node, `t(${q(key)}, { ${vars.join(', ')} })`, key);
          }
        } else if (/[çğıöşüÇĞİÖŞÜ]/.test(node.text) && !/^Özellik/.test(node.text)) {
          keys.add(node.text);
          const inJsxExpr = ts.isJsxExpression(p);
          wrap(node, `t(${q(node.text)})`, node.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  // Kancayı ekle
  for (const comp of needHook) {
    const body = comp.body;
    const bodyText = body.getText(sf);
    if (/const\s*\{[^}]*\bt\b[^}]*\}\s*=\s*useI18n\(\)/.test(bodyText) || /const t = useT\(\)/.test(bodyText)) continue;
    const indent = '  ';
    edits.push({ start: body.getStart(sf) + 1, end: body.getStart(sf) + 1, text: `\n${indent}const { t } = useI18n();` });
  }
  if (edits.length && !/from '@\/i18n'/.test(text)) {
    const imports = sf.statements.filter(ts.isImportDeclaration);
    const last = imports[imports.length - 1];
    edits.push({ start: last.getEnd(), end: last.getEnd(), text: "\nimport { useI18n } from '@/i18n';" });
  }

  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let out = text;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  if (crlf) out = out.replace(/\n/g, '\r\n');
  writeFileSync(file, out);
  console.log(`${file}: ${edits.length} düzenleme, ${skipped.length} sarılamayan`);
  for (const s of skipped) console.log('   MODÜL DÜZEYİ: ' + s.slice(0, 100));
}
writeFileSync(KEYS_FILE, JSON.stringify([...keys], null, 1));
