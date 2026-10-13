import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tokens.css içindeki özel ölçekler; tailwind-merge'in çakışmaları doğru çözmesi için tanıtılır.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['display', 'title', 'heading', 'body-lg', 'body', 'caption', 'data'],
      radius: ['control', 'card', 'panel'],
      shadow: ['1', '2', '3', 'glow'],
    },
  },
});

/** Sınıfları birleştirir; çakışanlarda sonradan gelen kazanır (ör. "inline-flex" + "hidden"). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
