import { useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type ComboboxOption = {
  value: string;
  label: string;
  keywords?: string;
};

export type FormComboboxProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  allowEmpty?: boolean;
  side?: "top" | "right" | "bottom" | "left";
  avoidCollisions?: boolean;
  loading?: boolean;
  /** Kirim teks yang diketik agar induk bisa memuat opsi async (server-side search). */
  onSearchChange?: (value: string) => void;
} & ButtonProps;

export function FormCombobox({
  value,
  onValueChange,
  options,
  placeholder = "Pilih...",
  searchPlaceholder = "Cari...",
  emptyLabel = "Tidak ada",
  allowEmpty = false,
  side,
  avoidCollisions,
  loading = false,
  onSearchChange,
  className,
  ...buttonProps
}: FormComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  const pick = (next: string) => {
    onValueChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          {...buttonProps}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-9 w-full justify-between rounded-xl px-3 font-normal shadow-sm",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          {loading ? (
            <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-(--radix-popover-trigger-width) p-0"
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        {...(side ? { side } : {})}
        {...(avoidCollisions !== undefined ? { avoidCollisions } : {})}
      >
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            className="h-9"
            disabled={loading && !onSearchChange}
            {...(onSearchChange ? { onValueChange: onSearchChange } : {})}
          />
          <CommandList>
            <CommandEmpty>{loading ? "Memuat..." : "Tidak ditemukan"}</CommandEmpty>
            <CommandGroup>
              {allowEmpty && (
                <CommandItem value={emptyLabel} onSelect={() => pick("")}>
                  <Check
                    className={cn("mr-2 h-4 w-4", value === "" ? "opacity-100" : "opacity-0")}
                  />
                  {emptyLabel}
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.keywords ? `${o.label} ${o.keywords}` : o.label}
                  onSelect={() => pick(o.value)}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === o.value ? "opacity-100" : "opacity-0")}
                  />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
