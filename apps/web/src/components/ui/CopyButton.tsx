import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useT } from '@/i18n';
import { Button, type ButtonProps } from './Button';

export interface CopyButtonProps extends Omit<ButtonProps, 'onClick' | 'children'> {
  text: string;
  label?: string;
  copiedLabel?: string;
}

export function CopyButton({ text, label, copiedLabel, variant = 'tonal', size = 'sm', ...rest }: CopyButtonProps) {
  const t = useT();
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('error');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  }

  const shown = state === 'copied' ? (copiedLabel ?? t('Kopyalandı')) : state === 'error' ? t('Kopyalanamadı') : (label ?? t('Kopyala'));
  return (
    <Button variant={variant} size={size} icon={state === 'copied' ? Check : Copy} onClick={copy} {...rest}>
      <span aria-live="polite">{shown}</span>
    </Button>
  );
}
