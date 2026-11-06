"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useUsersInfo, type EmpleadoInfo } from "@/hooks/use-users-info";
import { cn } from "@/lib/utils";

interface ResponsableComboboxProps {
  value?: string;
  onChange: (codigo: string, empleado?: EmpleadoInfo) => void;
  disabled?: boolean;
}

/** Extrae correo de la ficha de empleado (el API usa distintos nombres de campo). */
export function extractEmpleadoCorreo(empleado?: EmpleadoInfo | null): string {
  if (!empleado) return "";
  const keys = [
    "CORREO",
    "EMAIL",
    "CORREO_ELECTRONICO",
    "correo",
    "email",
    "MAIL",
    "mail",
    "E_MAIL",
    "Email",
  ];
  for (const k of keys) {
    const v = empleado[k];
    if (typeof v === "string" && v.includes("@")) return v.trim();
  }
  for (const v of Object.values(empleado)) {
    if (typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) {
      return v.trim();
    }
  }
  return "";
}

/** Combobox de búsqueda de empleados activos (CODIGO/NOMBRE/CEDULA/DEPARTAMENTO). */
export function ResponsableCombobox({ value, onChange, disabled }: ResponsableComboboxProps) {
  const { usersInfo, isLoading } = useUsersInfo();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // El API/caché a veces trae el mismo CODIGO más de una vez → keys React duplicadas.
  const uniqueUsers = useMemo(() => {
    const seen = new Set<string>();
    const list: EmpleadoInfo[] = [];
    for (const u of usersInfo) {
      const code = String(u.CODIGO ?? "").trim();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      list.push(u);
    }
    return list;
  }, [usersInfo]);

  const selected = useMemo(
    () => uniqueUsers.find((u) => String(u.CODIGO).trim() === String(value ?? "").trim()),
    [uniqueUsers, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return uniqueUsers;
    return uniqueUsers.filter((u) =>
      [u.CODIGO, u.NOMBRE, u.CEDULA, u.DEPARTAMENTO]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [uniqueUsers, query]);

  const displayLabel = (u: EmpleadoInfo) => `${u.CODIGO} - ${u.NOMBRE}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || isLoading}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {selected ? displayLabel(selected) : isLoading ? "Cargando empleados..." : "Buscar responsable..."}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="border-b">
          <input
            type="text"
            placeholder="Buscar por código, nombre, cédula o departamento..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full px-3 py-2 text-sm focus:outline-none"
            autoFocus
          />
        </div>
        <div className="max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No se encontraron empleados
            </div>
          ) : (
            filtered.slice(0, 200).map((u) => (
              <button
                key={String(u.CODIGO).trim()}
                type="button"
                onClick={() => {
                  onChange(String(u.CODIGO), u);
                  setQuery("");
                  setOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center justify-between gap-2"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{u.NOMBRE}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {u.CODIGO}
                    {u.DEPARTAMENTO ? ` · ${u.DEPARTAMENTO}` : ""}
                  </span>
                </span>
                {String(u.CODIGO).trim() === String(value ?? "").trim() && (
                  <Check className={cn("h-4 w-4 shrink-0")} />
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
