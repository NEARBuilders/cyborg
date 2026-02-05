import * as React from 'react';

import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'placeholder:text-muted-foreground/40 selection:bg-primary selection:text-primary-foreground',
        'border border-border/40 bg-muted/10 min-h-[60px] w-full min-w-0 px-2.5 py-1.5',
        'text-sm font-mono transition-all outline-none resize-none',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40',
        'focus-visible:border-primary/40 focus-visible:bg-muted/20',
        'aria-invalid:border-destructive/50',
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
