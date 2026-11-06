"use client";

import { useState } from "react";
import type { DateRange } from "react-day-picker";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfDay,
  subDays,
  subMonths,
} from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface DateRangePickerProps {
  value?: DateRange;
  onChange: (range: DateRange | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Fecha mínima seleccionable (p.ej. hoy, para no agendar en el pasado). */
  minDate?: Date;
}

const fmt = (d: Date) => format(d, "yyyy-MM-dd");

function buildPresets(): { label: string; range: DateRange }[] {
  const today = startOfDay(new Date());
  return [
    { label: "Hoy", range: { from: today, to: today } },
    { label: "Ayer", range: { from: subDays(today, 1), to: subDays(today, 1) } },
    { label: "Últimos 7 días", range: { from: subDays(today, 6), to: today } },
    { label: "Últimos 30 días", range: { from: subDays(today, 29), to: today } },
    { label: "Este mes", range: { from: startOfMonth(today), to: endOfMonth(today) } },
    {
      label: "Mes pasado",
      range: { from: startOfMonth(subMonths(today, 1)), to: endOfMonth(subMonths(today, 1)) },
    },
  ];
}

/** Selector de rango de fechas: input + popover con presets y calendario doble (estilo dashboard). */
export function DateRangePicker({ value, onChange, placeholder = "Selecciona un rango", disabled, className, minDate }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(value);
  const min = minDate ? startOfDay(minDate) : undefined;
  // Con minDate solo tienen sentido los atajos cuyo inicio no cae antes del límite
  // (p.ej. "Hoy"); el resto ("Ayer", "Últimos 7 días", etc.) quedan fuera de rango.
  const presets = buildPresets().filter((p) => !min || (p.range.from && p.range.from >= min));

  const handleOpenChange = (next: boolean) => {
    if (next) setDraft(value);
    setOpen(next);
  };

  const handleApply = () => {
    onChange(draft);
    setOpen(false);
  };

  const handleCancel = () => {
    setDraft(value);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(undefined);
    setDraft(undefined);
  };

  const label = value?.from
    ? value.to
      ? `${fmt(value.from)} ~ ${fmt(value.to)}`
      : fmt(value.from)
    : placeholder;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !value?.from && "text-muted-foreground", className)}
        >
          <span className="flex items-center gap-2 truncate">
            <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
            <span className="truncate">{label}</span>
          </span>
          {value?.from && (
            <span
              role="button"
              tabIndex={-1}
              onClick={handleClear}
              className="ml-2 shrink-0 rounded-sm opacity-60 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex">
          <div className="flex flex-col gap-1 border-r p-3 w-40 shrink-0">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setDraft(p.range)}
                className="text-left text-sm text-primary hover:underline py-1"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="p-3">
            <Calendar
              mode="range"
              numberOfMonths={2}
              locale={es}
              selected={draft}
              onSelect={setDraft}
              defaultMonth={draft?.from ?? min}
              disabled={min ? { before: min } : undefined}
              fromDate={min}
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t p-3">
          <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button type="button" size="sm" onClick={handleApply} disabled={!draft?.from || !draft?.to}>
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
