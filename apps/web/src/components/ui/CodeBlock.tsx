import type { ReactNode } from 'react';
import { Highlight, type PrismTheme } from 'prism-react-renderer';
import { FileCode2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { CopyButton } from './CopyButton';

const theme: PrismTheme = {
  plain: { color: 'var(--color-fg)', backgroundColor: 'transparent' },
  styles: [
    { types: ['comment'], style: { color: 'var(--color-syntax-comment)', fontStyle: 'italic' } },
    { types: ['keyword', 'builtin', 'important'], style: { color: 'var(--color-syntax-keyword)' } },
    { types: ['string', 'char', 'attr-value'], style: { color: 'var(--color-syntax-string)' } },
    { types: ['number', 'boolean', 'constant'], style: { color: 'var(--color-syntax-number)' } },
    { types: ['function', 'class-name'], style: { color: 'var(--color-syntax-function)' } },
    { types: ['operator', 'punctuation'], style: { color: 'var(--color-fg-muted)' } },
  ],
};

export type CodeLanguage = 'python' | 'r' | 'bash' | 'text';

export interface CodeBlockProps {
  code: string;
  language?: CodeLanguage;
  filename?: string;
  /** Başlık çubuğunda çalışma ortamı, ör. "Python 3.11 · SciPy". */
  runtime?: ReactNode;
  lineNumbers?: boolean;
  /** Üst çubuğun sağına ek eylemler. */
  actions?: ReactNode;
  maxHeight?: string;
  className?: string;
}

export function CodeBlock({
  code,
  language = 'python',
  filename,
  runtime,
  lineNumbers = false,
  actions,
  maxHeight,
  className,
}: CodeBlockProps) {
  // prism-react-renderer R içermiyor; R ve bash düz metin olarak gösterilir.
  const prismLang = language === 'python' ? 'python' : 'text';
  return (
    <figure className={cn('min-w-0 max-w-full overflow-hidden rounded-card border border-white/5 bg-code shadow-1', className)}>
      <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/5 bg-surface-lowest px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </span>
        {filename && (
          <span className="flex items-center gap-1.5 font-mono text-data text-fg-muted">
            <FileCode2 size={14} aria-hidden />
            {filename}
          </span>
        )}
        {runtime && <span className="text-caption text-fg-subtle">{runtime}</span>}
        <span className="ml-auto flex items-center gap-2">
          {actions}
          <CopyButton text={code} label="Kodu kopyala" />
        </span>
      </figcaption>
      <Highlight code={code.trimEnd()} language={prismLang} theme={theme}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre
            tabIndex={0}
            aria-label={filename ? `${filename} kodu` : 'Kod'}
            className="overflow-auto p-4 font-mono text-data leading-6"
            style={maxHeight ? { maxHeight } : undefined}
          >
            {tokens.map((line, i) => {
              const lineProps = getLineProps({ line });
              return (
                <div key={i} {...lineProps} className={cn(lineProps.className, 'table-row')}>
                  {lineNumbers && (
                    <span className="table-cell pr-4 text-right text-fg-subtle select-none" aria-hidden>
                      {i + 1}
                    </span>
                  )}
                  <span className="table-cell whitespace-pre">
                    {line.map((token, j) => (
                      <span key={j} {...getTokenProps({ token })} />
                    ))}
                  </span>
                </div>
              );
            })}
          </pre>
        )}
      </Highlight>
    </figure>
  );
}
