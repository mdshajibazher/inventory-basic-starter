'use client';

import Link from 'next/link';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as Dialog from '@radix-ui/react-dialog';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { Check, ChevronDown, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { clsx } from '@/lib/utils';

export function Button({
  className,
  variant = 'primary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return (
    <button
      className={clsx(
        'inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-black text-white hover:bg-neutral-800',
        variant === 'secondary' && 'border border-neutral-200 bg-white text-black hover:bg-neutral-50',
        variant === 'ghost' && 'text-black hover:bg-neutral-100',
        variant === 'danger' && 'text-red-700 hover:bg-red-50',
        className
      )}
      {...props}
    />
  );
}

export function ActionButton({
  icon: Icon,
  text,
  color,
  bgColor,
  href,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  text: string;
  color: string;
  bgColor: string;
  href?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const className = clsx(
    'inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-transparent transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300',
    color,
    bgColor,
    disabled && 'cursor-not-allowed opacity-50'
  );

  if (href) {
    return (
      <Link className={className} href={href} aria-label={text} title={text}>
        <Icon className="h-4 w-4" />
      </Link>
    );
  }

  return (
    <button type="button" className={className} aria-label={text} title={text} disabled={disabled} onClick={onClick}>
      <Icon className="h-4 w-4" />
    </button>
  );
}

export function Input({ className, min, onWheel, step, type, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  const numberMin = typeof min === 'number' ? min : typeof min === 'string' && min !== '' ? Number(min) : null;
  const normalizedMin = type === 'number' && numberMin !== null && numberMin > 0 && numberMin < 1 ? 0 : min;

  function handleWheel(event: React.WheelEvent<HTMLInputElement>) {
    onWheel?.(event);

    if (type === 'number' && !event.defaultPrevented) {
      event.currentTarget.blur();
      event.preventDefault();
    }
  }

  return (
    <input
      {...props}
      type={type}
      min={normalizedMin}
      step={type === 'number' ? 1 : step}
      onWheel={handleWheel}
      className={clsx(
        'h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm outline-none transition placeholder:text-neutral-400 focus:border-black',
        className
      )}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={clsx(
        'min-h-24 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-neutral-400 focus:border-black',
        props.className
      )}
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-neutral-900">{label}</span>
      {children}
      {hint ? <span className="text-xs text-neutral-500">{hint}</span> : null}
    </label>
  );
}

export function Modal({
  title,
  description,
  headerIcon: HeaderIcon,
  showDescription = false,
  open,
  onOpenChange,
  children,
  contentClassName,
}: {
  title: string;
  description?: string;
  headerIcon?: LucideIcon;
  showDescription?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  contentClassName?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 data-[state=closed]:animate-modal-overlay-out data-[state=open]:animate-modal-overlay-in" />
        <Dialog.Content className={clsx('fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-5 shadow-xl data-[state=closed]:animate-modal-content-out data-[state=open]:animate-modal-content-in', contentClassName)}>
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              {HeaderIcon ? (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                  <HeaderIcon className="h-6 w-6" />
                </div>
              ) : null}
              <div className="min-w-0">
                <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
                <Dialog.Description className={showDescription ? 'mt-0.5 text-sm text-slate-500' : 'sr-only'}>{description ?? title}</Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" className="h-8 w-8 px-0" aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder = 'Select',
  disabled = false,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger className="flex h-10 w-full items-center justify-between rounded-md border border-neutral-200 bg-white px-3 text-left text-sm outline-none focus:border-black disabled:cursor-not-allowed disabled:opacity-50">
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="h-4 w-4" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className="z-[80] max-h-80 overflow-hidden rounded-md border border-neutral-200 bg-white shadow-lg">
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className="relative cursor-default rounded px-8 py-2 text-sm outline-none data-[highlighted]:bg-neutral-100"
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2 top-2.5">
                  <Check className="h-4 w-4" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export function Checkbox({
  checked,
  onCheckedChange,
}: {
  checked: boolean | 'indeterminate';
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <CheckboxPrimitive.Root
      checked={checked}
      onCheckedChange={(value) => onCheckedChange(value === true)}
      className="flex h-4 w-4 items-center justify-center rounded border border-neutral-300 bg-white data-[state=checked]:bg-black data-[state=indeterminate]:bg-black"
    >
      <CheckboxPrimitive.Indicator className="text-white">
        <Check className="h-3 w-3" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export function Switch({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="relative h-6 w-11 rounded-full bg-neutral-200 transition data-[state=checked]:bg-black"
    >
      <SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition data-[state=checked]:translate-x-5" />
    </SwitchPrimitive.Root>
  );
}

export function StatusBadge({ active }: { active: unknown }) {
  return (
    <span className={clsx('inline-flex rounded-full px-2 py-1 text-xs font-medium', active ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-600')}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}
