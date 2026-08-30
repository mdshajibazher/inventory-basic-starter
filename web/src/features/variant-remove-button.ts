import { createElement } from 'react';
import { Trash2 } from 'lucide-react';

export function VariantRemoveButton({ onRemove }: { onRemove: () => void }) {
  return createElement(
    'button',
    {
      type: 'button',
      className: 'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200',
      'aria-label': 'Remove variant',
      title: 'Remove variant',
      onClick: onRemove,
    },
    createElement(Trash2, { className: 'h-4 w-4 shrink-0', 'aria-hidden': true }),
    createElement('span', null, 'Remove')
  );
}
