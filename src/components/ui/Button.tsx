import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/misc';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'dangerOutline';
type Size = 'xs' | 'sm' | 'md';

const base = 'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55 whitespace-nowrap select-none';
const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800',
  secondary: 'bg-ink text-white hover:bg-ink-soft',
  outline: 'border border-sand-300 bg-white text-ink hover:border-ink-faint hover:bg-ivory-50',
  ghost: 'text-ink-soft hover:bg-sand-100 hover:text-ink',
  danger: 'bg-red-700 text-white hover:bg-red-800',
  dangerOutline: 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
};
const sizes: Record<Size, string> = {
  xs: 'h-7 px-2 text-xs',
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
};

export function buttonClasses(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClasses(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

interface ButtonLinkProps extends LinkProps {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export function ButtonLink({ variant = 'outline', size = 'md', icon, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  size?: 'sm' | 'md';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ label, size = 'md', className, children, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-sand-100 hover:text-ink disabled:opacity-40',
        size === 'sm' ? 'h-7 w-7' : 'h-9 w-9',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
