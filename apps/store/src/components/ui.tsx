import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

// Small components in the shadcn/ui style, written by hand as in the console.

export const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-emerald-700 text-white hover:bg-emerald-800',
        secondary:
          'border border-neutral-300 bg-white hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800',
        ghost: 'hover:bg-neutral-100 dark:hover:bg-neutral-800',
      },
      size: { sm: 'px-2 py-1 text-xs', md: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

const fieldClass =
  'w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(fieldClass, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(fieldClass, className)} {...props} />;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

export function Card({
  title,
  className,
  children,
}: {
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        'rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900',
        className,
      )}
    >
      {title === undefined ? null : <h2 className="mb-3 font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

const badgeTones = {
  neutral: 'bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200',
  green: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  amber: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
};

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: keyof typeof badgeTones;
  children: ReactNode;
}) {
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', badgeTones[tone])}>
      {children}
    </span>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl font-semibold">{children}</h1>;
}
