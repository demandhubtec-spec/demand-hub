import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "w-full rounded-[7px] border border-border bg-surface-2 px-[11px] py-[9px] text-[13.5px] text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary-bright focus:ring-offset-1 focus:ring-offset-surface",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
