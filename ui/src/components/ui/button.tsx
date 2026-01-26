import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap text-xs sm:text-sm font-medium font-mono transition-all disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3.5 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-primary/30 focus-visible:ring-2 border",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground border-primary/80 hover:bg-primary/80',
        destructive:
          'bg-destructive/90 text-white border-destructive/80 hover:bg-destructive',
        outline:
          'border-border/50 bg-transparent hover:bg-muted/30 hover:border-primary/40 hover:text-primary',
        secondary:
          'bg-muted/30 text-foreground border-border/30 hover:bg-muted/50',
        ghost:
          'border-transparent hover:bg-muted/30 hover:text-primary',
        link: 'text-primary underline-offset-4 hover:underline border-transparent',
      },
      size: {
        default: 'h-8 px-3 py-1.5',
        sm: 'h-7 gap-1 px-2.5 text-xs',
        lg: 'h-9 px-4',
        icon: 'size-8',
        'icon-sm': 'size-7',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
