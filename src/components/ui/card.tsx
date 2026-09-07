import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "card-glow relative overflow-hidden rounded-[--radius] border border-border bg-surface transition-colors hover:border-primary-bright/30",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

export { Card };
