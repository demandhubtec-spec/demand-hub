import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full resize-none rounded-[7px] border border-border bg-surface-2 px-[11px] py-[9px] text-[13.5px] text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary-bright focus:ring-offset-1 focus:ring-offset-surface",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
