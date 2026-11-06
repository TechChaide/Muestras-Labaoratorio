"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardList } from "lucide-react";
import { etiquetaEnsayo, type EnsayoAgendable } from "@/components/agendamiento/types";

/** Mismo esquema visual que Listado de Familias; 5 por defecto (pedido para el backlog). */
const PAGE_SIZE_OPTIONS = [5, 10, 15, 20];

interface BacklogPanelProps {
  items: EnsayoAgendable[];
  /** Dispara el wizard de programación para TODOS los tipos de ensayo pendientes de una solicitud. */
  onProgramarSolicitud: (items: EnsayoAgendable[]) => void;
}

interface SolicitudGroup {
  key: string;
  titulo: string;
  descripcion?: string;
  items: EnsayoAgendable[];
}

/** Requerimientos entrantes que aún no tienen responsable y/o fechas asignadas,
 * agrupados por Solicitud: cada solicitud puede traer varios tipos de ensayo, y
 * se programan todos en un mismo wizard (una tarjeta por tipo de ensayo). */
export default function BacklogPanel({ items, onProgramarSolicitud }: Readonly<BacklogPanelProps>) {
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(PAGE_SIZE_OPTIONS[0]);

  const grupos = useMemo<SolicitudGroup[]>(() => {
    const map = new Map<string, SolicitudGroup>();
    for (const item of items) {
      const key = String(item.codigo_solicitud ?? etiquetaEnsayo(item));
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          titulo: etiquetaEnsayo(item),
          descripcion: item.solicitud?.descripcion,
          items: [],
        };
        map.set(key, group);
      }
      group.items.push(item);
    }
    return Array.from(map.values());
  }, [items]);

  const totalRows = grupos.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const paginatedGrupos = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return grupos.slice(start, start + rowsPerPage);
  }, [grupos, page, rowsPerPage]);

  if (page > totalPages && totalPages > 0) setPage(totalPages);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          Requerimientos pendientes de programar
          <Badge variant="secondary">{totalRows}</Badge>
        </CardTitle>
        <CardDescription>
          Solicitudes de ensayo entrantes sin responsable y/o fechas asignadas todavía. Cada solicitud se programa
          en un wizard: una tarjeta por cada tipo de ensayo que trae.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {totalRows === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No hay requerimientos pendientes de programar.
          </p>
        ) : (
          <>
            <div className="space-y-4">
              {paginatedGrupos.map((grupo) => (
                <div key={grupo.key} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="min-w-0 flex items-center gap-2">
                      <p className="font-semibold text-sm truncate">{grupo.titulo}</p>
                      <Badge variant="outline" className="shrink-0">
                        {grupo.items.length} tipo{grupo.items.length === 1 ? "" : "s"} de ensayo
                      </Badge>
                    </div>
                    <Button size="sm" onClick={() => onProgramarSolicitud(grupo.items)} className="shrink-0">
                      Programar solicitud
                    </Button>
                  </div>
                  {grupo.descripcion && (
                    <p className="text-xs text-muted-foreground truncate mb-3">{grupo.descripcion}</p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {grupo.items.map((item) => (
                      <div
                        key={item.codigo_ensayo_categoria_ensayo}
                        className="rounded-md border bg-white p-3"
                      >
                        <p className="text-sm font-medium truncate">
                          {item.tipo_ensayo?.nombre_tipo_ensayo || "Tipo de ensayo sin definir"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {item.muestra?.nombre_material_muestra || "Sin muestra"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Paginador — mismo esquema visual que Listado de Familias */}
            <div className="flex items-center justify-end gap-4 mt-4">
              <div className="flex items-center gap-2">
                <span className="text-sm">Items per page:</span>
                <select
                  className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  value={rowsPerPage}
                  onChange={(e) => {
                    setRowsPerPage(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <span className="text-sm">
                {totalRows === 0
                  ? "0"
                  : `${(page - 1) * rowsPerPage + 1} – ${Math.min(page * rowsPerPage, totalRows)} of ${totalRows}`}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="p-1 rounded disabled:opacity-50 hover:bg-gray-100"
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  aria-label="Primera página"
                >
                  <span className="sr-only">Primera página</span>
                  &#x23ee;
                </button>
                <button
                  type="button"
                  className="p-1 rounded disabled:opacity-50 hover:bg-gray-100"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  aria-label="Página anterior"
                >
                  <span className="sr-only">Página anterior</span>
                  &#x2039;
                </button>
                <button
                  type="button"
                  className="p-1 rounded disabled:opacity-50 hover:bg-gray-100"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  aria-label="Página siguiente"
                >
                  <span className="sr-only">Página siguiente</span>
                  &#x203a;
                </button>
                <button
                  type="button"
                  className="p-1 rounded disabled:opacity-50 hover:bg-gray-100"
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  aria-label="Última página"
                >
                  <span className="sr-only">Última página</span>
                  &#x23ed;
                </button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
