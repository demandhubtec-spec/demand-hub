import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "w-full rounded-[10px] border border-border bg-surface-2 px-3 py-[9px] text-[13.5px] text-ink transition-[border-color,box-shadow] placeholder:text-muted focus:border-primary-bright focus:outline-none focus:ring-4 focus:ring-primary-bright/15",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
