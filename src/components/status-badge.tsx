import { cva } from "class-variance-authority";

import type { InvoiceStatus } from "@/domain/invoice/invoice-status";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap before:size-2 before:rounded-full before:bg-current",
  {
    variants: {
      tone: {
        authorized: "border-status-authorized/40 text-status-authorized",
        cancelled: "border-status-cancelled/40 text-status-cancelled",
        rejected: "border-status-rejected/40 text-status-rejected",
        denied: "border-status-denied/40 text-status-denied",
        not_found: "border-status-not-found/40 text-status-not-found",
        failed: "border-destructive/40 text-destructive",
        pending:
          "border-border text-muted-foreground before:bg-transparent before:ring-1 before:ring-current",
      },
    },
  },
);

export type StatusBadgeTone = InvoiceStatus | "failed" | "pending";

export interface StatusBadgeProps {
  readonly tone: StatusBadgeTone;
  readonly label: string;
  readonly className?: string;
}

export function StatusBadge({ tone, label, className }: StatusBadgeProps) {
  return <span className={cn(statusBadgeVariants({ tone }), className)}>{label}</span>;
}
