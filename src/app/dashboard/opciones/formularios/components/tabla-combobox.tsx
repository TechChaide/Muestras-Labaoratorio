"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Familia, Tabla, TipoEnsayo } from "@/types/interfaces";

interface TablaComboboxProps {
  value?: number;
  onChange: (codigoTabla: number) => void;
  /** Tablas ya filtradas por disponibilidad (activas/no usadas) que se ofrecen para elegir. */
  tablas: Tabla[];
  tiposEnsayo: TipoEnsayo[];
  familias: Familia[];
  disabled?: boolean;
}

interface Grupo {
  key: string;
  nombreFamilia: string;
  tablas: Tabla[];
}

/** Selector de tabla con búsqueda por nombre, familia o tipo de ensayo, y las
 * opciones agrupadas por familia — para que sea evidente para qué fue diseñada
 * cada tabla al armar un formulario (antes era una lista plana sin ese contexto). */
export function TablaCombobox({ value, onChange, tablas, tiposEnsayo, familias, disabled }: TablaComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const resolve = (t: Tabla) => {
    const tipo = tiposEnsayo.find((te) => te.codigo_tipo_ensayo === t.codigo_tipo_ensayo);
    const familia = familias.find((f) => f.codigo_familia === tipo?.codigo_familia);
    return { tipo, familia };
  };

  const seleccionada = tablas.find((t) => t.codigo_tabla === value);

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tablas;
    return tablas.filter((t) => {
      const { tipo, familia } = resolve(t);
      return [t.nombre_tabla, tipo?.nombre_tipo_ensayo, familia?.nombre_familia, String(t.codigo_tabla)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablas, query, tiposEnsayo, familias]);

  const grupos = useMemo<Grupo[]>(() => {
    const map = new Map<string, Grupo>();
    for (const t of filtradas) {
      const { familia } = resolve(t);
      const key = familia ? String(familia.codigo_familia) : "sin-familia";
      const nombreFamilia = familia?.nombre_familia || "Sin familia";
      if (!map.has(key)) map.set(key, { key, nombreFamilia, tablas: [] });
      map.get(key)!.tablas.push(t);
    }
    return Array.from(map.values()).sort((a, b) => a.nombreFamilia.localeCompare(b.nombreFamilia));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtradas]);

  const label = (t: Tabla) => {
    const { tipo, familia } = resolve(t);
    const ver = t.version ? ` v${t.version}` : "";
    const inactive = t.estado === "I" ? " (inactiva)" : "";
    const contexto = [familia?.nombre_familia, tipo?.nombre_tipo_ensayo].filter(Boolean).join(" · ");
    return {
      principal: `${t.nombre_tabla || "Sin nombre"}${ver}${inactive}`,
      secundario: contexto ? `${contexto} · T${t.codigo_tabla}.*` : `Sin familia/tipo de ensayo · T${t.codigo_tabla}.*`,
    };
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          {seleccionada ? (
            <span className="min-w-0 text-left">
              <span className="block truncate">{label(seleccionada).principal}</span>
              <span className="block truncate text-xs text-muted-foreground">{label(seleccionada).secundario}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Seleccionar tabla…</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="border-b">
          <input
            type="text"
            placeholder="Buscar por nombre de tabla, familia o tipo de ensayo…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full px-3 py-2 text-sm focus:outline-none"
            autoFocus
          />
        </div>
        <div className="max-h-80 overflow-y-auto">
          {grupos.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">No se encontraron tablas</div>
          ) : (
            grupos.map((grupo) => (
              <div key={grupo.key}>
                <div className="sticky top-0 bg-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {grupo.nombreFamilia}
                </div>
                {grupo.tablas.map((t) => {
                  const l = label(t);
                  const isSelected = t.codigo_tabla === value;
                  return (
                    <button
                      key={t.codigo_tabla}
                      type="button"
                      onClick={() => {
                        onChange(t.codigo_tabla);
                        setQuery("");
                        setOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-accent flex items-start gap-2"
                    >
                      <Table2 className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{l.principal}</span>
                        <span className="block truncate text-xs text-muted-foreground">{l.secundario}</span>
                      </span>
                      {isSelected && <Check className="h-4 w-4 shrink-0 mt-0.5" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
