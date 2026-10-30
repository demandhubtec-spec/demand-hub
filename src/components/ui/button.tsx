import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-[13.5px] font-semibold transition-[color,background-color,border-color,filter,transform] active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-bright disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[15px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-white shadow-[0_10px_28px_rgba(110,58,255,.38),inset_0_-3px_0_rgba(0,0,0,.18)] hover:brightness-110",
        ghost: "bg-surface text-ink border border-border hover:border-primary-bright hover:text-primary-bright",
        outline: "border border-border bg-transparent hover:bg-surface-2 text-ink",
        icon: "text-muted hover:bg-surface-2 hover:text-ink border border-transparent hover:border-border",
      },
      size: {
        default: "px-[18px] py-[9px]",
        sm: "px-3 py-1.5 text-xs",
        icon: "h-9 w-9 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
