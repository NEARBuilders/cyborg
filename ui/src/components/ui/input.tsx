import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground/40 selection:bg-primary selection:text-primary-foreground',
        'border border-border/40 bg-muted/10 h-8 w-full min-w-0 px-2.5 py-1.5',
        'text-sm font-mono transition-all outline-none',
        'file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs file:font-medium',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40',
        'focus-visible:border-primary/40 focus-visible:bg-muted/20',
        'aria-invalid:border-destructive/50',
        className
      )}
      {...props}
    />
  );
}

export { Input };
