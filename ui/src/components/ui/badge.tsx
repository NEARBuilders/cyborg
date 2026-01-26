import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-mono font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-2.5 gap-1 [&>svg]:pointer-events-none transition-colors overflow-hidden',
  {
    variants: {
      variant: {
        default:
          'bg-primary/20 text-primary [a&]:hover:bg-primary/30',
        secondary:
          'bg-muted/50 text-muted-foreground [a&]:hover:bg-muted/70',
        destructive:
          'bg-destructive/20 text-destructive [a&]:hover:bg-destructive/30',
        outline:
          'border border-border/50 text-foreground/80 [a&]:hover:border-primary/40 [a&]:hover:text-primary',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span';

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
