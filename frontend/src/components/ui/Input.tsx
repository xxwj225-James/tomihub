import { cn } from '@/lib/cn';
import { forwardRef, type InputHTMLAttributes } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> { label?: string; error?: string; }

export const Input = forwardRef<HTMLInputElement, Props>(
  ({ label, error, className, id, ...props }, ref) => {
    const inputId = id || (label || '').toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-[0.8125rem] font-medium mb-1.5 text-ink-secondary">
            {label}
          </label>
        )}
        <input ref={ref} id={inputId}
          className={cn(error ? 'input-error' : 'input', className)}
          {...props} />
        {error && <p className="mt-1 text-[0.75rem] text-danger">{error}</p>}
      </div>
    );
  },
);
Input.displayName = 'Input';
