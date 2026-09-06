import { cn } from '@/lib/cn';
import type { HTMLAttributes, ReactNode } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> { children: ReactNode; }

export function Card({ children, className, ...props }: Props) {
  return <div className={cn('card', className)} {...props}>{children}</div>;
}

export function CardHeader({ children, className, ...props }: Props) {
  return <div className={cn('px-6 pt-5 pb-4', className)} style={{ borderBottom: '1px solid hsl(var(--color-border))' }} {...props}>{children}</div>;
}

export function CardContent({ children, className, ...props }: Props) {
  return <div className={cn('px-6 pb-5', className)} {...props}>{children}</div>;
}
