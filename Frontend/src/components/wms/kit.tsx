import { Loader2, Warehouse, Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const ALL = "__all__";

export function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
  className,
  loading = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: Array<string | { value: string; label: string }>;
  className?: string;
  loading?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={cn("w-48 shrink-0 rounded-xl", className)}
        icon={loading ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72 rounded-xl">
        {loading ? (
          <SelectItem disabled value="__loading__">
            Memuat...
          </SelectItem>
        ) : (
          <>
            <SelectItem value={ALL}>{placeholder}</SelectItem>
            {options.map((o) => {
              const entry = typeof o === "string" ? { value: o, label: o } : o;
              return (
                <SelectItem key={entry.value} value={entry.value}>
                  {entry.label}
                </SelectItem>
              );
            })}
          </>
        )}
      </SelectContent>
    </Select>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-primary-foreground shadow-soft"
        style={{ backgroundImage: "var(--gradient-primary)" }}
      >
        <Warehouse className="h-5 w-5" strokeWidth={2.2} />
      </div>
      {!compact && (
        <span className="truncate text-lg tracking-tight text-foreground">
          <span className="font-extrabold">Kelola</span>
          <span className="font-normal">Gudang</span>
        </span>
      )}
    </div>
  );
}

const tones = {
  success: "bg-success/12 text-success border-success/25",
  warning: "bg-warning/15 text-warning-foreground border-warning/35",
  danger: "bg-destructive/10 text-destructive border-destructive/25",
  info: "bg-info/12 text-info border-info/25",
  neutral: "bg-muted text-muted-foreground border-border",
  brand: "bg-primary-soft text-primary border-primary/20",
} as const;

export type Tone = keyof typeof tones;

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-lg border px-2 py-0.5 text-xs font-semibold",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "brand",
  valueTitle,
  loading = false,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
  icon: LucideIcon;
  tone?: Tone;
  valueTitle?: string | undefined;
  loading?: boolean;
}) {
  return (
    <div className="card-soft card-hover p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-1.5 h-7 w-24 rounded-lg" />
          ) : valueTitle ? (
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="mt-1.5 whitespace-nowrap text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                    {value}
                  </p>
                </TooltipTrigger>
                <TooltipContent className="whitespace-nowrap">{valueTitle}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <p className="mt-1.5 whitespace-nowrap text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {value}
            </p>
          )}
          {hint && !loading && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-xl border",
            tones[tone],
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:flex sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("card-soft overflow-hidden", className)}>
      {(title || actions) && (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>}
            {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function EmptyState({
  title = "Belum ada data",
  description = "Data akan tampil di sini setelah transaksi dibuat.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
        <Inbox className="h-6 w-6" />
      </span>
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-8 rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ItemThumb({
  hue,
  label,
  size = 40,
}: {
  hue: number;
  label: string;
  size?: number;
}) {
  return (
    <div
      className="grid shrink-0 place-items-center rounded-xl text-sm font-bold text-foreground/70"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, oklch(0.93 0.06 ${hue}), oklch(0.87 0.08 ${hue + 25}))`,
        fontSize: size / 3,
      }}
    >
      {label.slice(0, 2).toUpperCase()}
    </div>
  );
}
