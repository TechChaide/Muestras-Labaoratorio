"use client";

import { useEffect, useMemo, useState } from "react";
import type { Celda, Columna, Tabla } from "@/types/interfaces";
import { celdaService } from "@/services/muestrasLaboratorio/celda.service";
import { columnaService } from "@/services/muestrasLaboratorio/columna.service";
import { qualifyAlias } from "@/lib/formula/cross-table";
import { Skeleton } from "@/components/ui/skeleton";

export interface FormSectionPreview {
  _localId: string;
  codigo_tabla?: number;
  cabecera: string;
  posicion: number;
}

interface Props {
  sections: FormSectionPreview[];
  tablas: Tabla[];
}

const TIPO_STYLE: Record<string, string> = {
  header: "bg-slate-100 text-slate-700 font-semibold",
  label: "bg-amber-50 text-amber-900",
  input: "bg-sky-50 text-sky-900",
  calculated: "bg-violet-50 text-violet-900",
};

function MiniGrid({
  codigoTabla,
  nombreTabla,
}: {
  codigoTabla: number;
  nombreTabla: string;
}) {
  const [celdas, setCeldas] = useState<Celda[]>([]);
  const [columnas, setColumnas] = useState<Columna[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [cRes, colRes] = await Promise.all([
          celdaService.getAll().catch(() => ({ data: [] as Celda[] })),
          columnaService.getAll().catch(() => ({ data: [] as Columna[] })),
        ]);
        const allC = Array.isArray(cRes.data) ? cRes.data : cRes.data ? [cRes.data] : [];
        const allCol = Array.isArray(colRes.data)
          ? colRes.data
          : colRes.data
            ? [colRes.data]
            : [];
        if (!cancelled) {
          setCeldas(allC.filter((c) => c.codigo_tabla === codigoTabla));
          setColumnas(
            allCol
              .filter((c) => c.codigo_tabla === codigoTabla)
              .sort((a, b) => (a.indice || 0) - (b.indice || 0))
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [codigoTabla]);

  const { maxRow, maxCol, byPos } = useMemo(() => {
    let mr = 0;
    let mc = columnas.length || 0;
    const map = new Map<string, Celda>();
    for (const c of celdas) {
      const f = c.fila || 1;
      const col = c.col || 1;
      const rs = Math.max(1, c.rowspan || 1);
      const cs = Math.max(1, c.colspan || 1);
      mr = Math.max(mr, f + rs - 1);
      mc = Math.max(mc, col + cs - 1);
      map.set(`${f}:${col}`, c);
    }
    return { maxRow: mr || 1, maxCol: mc || 1, byPos: map };
  }, [celdas, columnas]);

  if (loading) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (celdas.length === 0) {
    return (
      <div className="text-xs text-muted-foreground border rounded-md p-3 bg-muted/20">
        Tabla #{codigoTabla} ({nombreTabla}) sin celdas definidas. Diseñala en
        Editor de Tablas.
      </div>
    );
  }

  const covered = new Set<string>();

  return (
    <div className="overflow-x-auto border rounded-md bg-white">
      <table className="min-w-full border-collapse text-[11px]">
        <tbody>
          {Array.from({ length: maxRow }, (_, ri) => {
            const fila = ri + 1;
            return (
              <tr key={fila}>
                {Array.from({ length: maxCol }, (_, ci) => {
                  const col = ci + 1;
                  const key = `${fila}:${col}`;
                  if (covered.has(key)) return null;
                  const cel = byPos.get(key);
                  if (!cel) {
                    return (
                      <td
                        key={key}
                        className="border border-slate-200 h-7 min-w-[56px] bg-slate-50/50"
                      />
                    );
                  }
                  const rs = Math.max(1, cel.rowspan || 1);
                  const cs = Math.max(1, cel.colspan || 1);
                  for (let r = fila; r < fila + rs; r++) {
                    for (let c = col; c < col + cs; c++) {
                      if (r !== fila || c !== col) covered.add(`${r}:${c}`);
                    }
                  }
                  const tipo = String(cel.tipo_celda || "label");
                  const alias = cel.alias
                    ? qualifyAlias(codigoTabla, cel.alias)
                    : "";
                  return (
                    <td
                      key={key}
                      rowSpan={rs}
                      colSpan={cs}
                      title={alias || undefined}
                      className={`border border-slate-200 px-1.5 py-1 align-middle text-center ${
                        TIPO_STYLE[tipo] || "bg-white"
                      }`}
                    >
                      <div className="truncate max-w-[120px]">
                        {cel.alias || "·"}
                      </div>
                      {alias && (
                        <div className="text-[9px] text-muted-foreground truncate">
                          {alias}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function FormularioPreview({ sections, tablas }: Props) {
  const ordered = useMemo(
    () => [...sections].sort((a, b) => a.posicion - b.posicion),
    [sections]
  );

  if (ordered.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground border rounded-md bg-muted/30 text-sm">
        Agrega tablas al formulario para ver la vista previa apilada.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {ordered.map((sec, idx) => {
        const tabla = tablas.find((t) => t.codigo_tabla === sec.codigo_tabla);
        const title =
          sec.cabecera.trim() ||
          tabla?.nombre_tabla ||
          (sec.codigo_tabla ? `Tabla #${sec.codigo_tabla}` : "Sin tabla");
        return (
          <section key={sec._localId} className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-mono text-muted-foreground">
                #{idx + 1}
              </span>
              <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
              {sec.codigo_tabla != null && (
                <span className="text-[10px] font-mono text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded">
                  prefijo T{sec.codigo_tabla}.*
                </span>
              )}
            </div>
            {sec.codigo_tabla ? (
              <MiniGrid
                codigoTabla={sec.codigo_tabla}
                nombreTabla={tabla?.nombre_tabla || ""}
              />
            ) : (
              <div className="text-xs text-muted-foreground border border-dashed rounded-md p-3">
                Selecciona una tabla para esta sección.
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
