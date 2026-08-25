import {
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STYLES = {
  note: { icon: Info, className: "border-blue-200 bg-blue-50 text-blue-900" },
  warning: {
    icon: AlertTriangle,
    className: "border-amber-200 bg-amber-50 text-amber-900",
  },
  success: {
    icon: CheckCircle2,
    className: "border-green-200 bg-green-50 text-green-900",
  },
  danger: { icon: XCircle, className: "border-red-200 bg-red-50 text-red-900" },
} as const;

export function Callout({
  type = "note",
  title,
  children,
}: {
  type?: keyof typeof STYLES;
  title?: string;
  children?: React.ReactNode;
}) {
  const { icon: Icon, className } = STYLES[type] ?? STYLES.note;
  return (
    <aside
      className={cn(
        "not-prose my-4 flex gap-3 rounded-lg border p-4 text-sm",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children}
      </div>
    </aside>
  );
}
