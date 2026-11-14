import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative overflow-hidden rounded-[12px] border border-border bg-surface shadow-[0_1px_2px_rgba(18,16,31,.04)]",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

export { Card };
