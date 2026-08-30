"use client";

import { useMemo, useState } from "react";
import type { Columna, Tabla } from "@/types/interfaces";
import { FormulaWolframEditor } from "@/components/formula/formula-wolfram-editor";
import { formulaApi, type SupportedFunction } from "@/lib/formula";
import { cellPositionRef } from "@/lib/formula/grid-utils";
import {
  cellRefToken,
  tableDisplayName,
  type FormCellSnapshot,
  type FormulaDraft,
} from "@/lib/formula/formula-persistence";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Calculator, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const TIPO_STYLE: Record<string, string> = {
  header: "bg-slate-100 text-slate-700",
  label: "bg-amber-50 text-amber-900",
  input: "bg-sky-50 text-sky-900",
  calculated: "bg-violet-50 text-violet-900",
};

interface SectionOrder {
  codigo_tabla: number;
  cabecera: string;
}

interface Props {
  tableIds: number[];
  tablas: Tabla[];
  sectionOrder: SectionOrder[];
  cells: FormCellSnapshot[];
  columnsByTable: Map<number, Columna[]>;
  drafts: FormulaDraft[];
  onDraftsChange: (drafts: FormulaDraft[]) => void;
  isLoading: boolean;
}

function appendToken(current: string, token: string): string {
  const cur = current.trim();
  if (!cur) return token;
  const sep = /[+\-*/^(,]$/.test(cur) ? "" : "+";
  return `${cur}${sep}${token}`;
}

export default function FormularioFormulaPanel({
  tableIds,
  tablas,
  sectionOrder,
  cells,
  columnsByTable,
  drafts,
  onDraftsChange,
  isLoading,
}: Props) {
  const [selectedCellId, setSelectedCellId] = useState<number | null>(null);

  const orderedTables = useMemo(() => {
    const seen = new Set<number>();
    const list: SectionOrder[] = [];
    for (const s of sectionOrder) {
      if (s.codigo_tabla && !seen.has(s.codigo_tabla)) {
        seen.add(s.codigo_tabla);
        list.push(s);
      }
    }
    for (const id of tableIds) {
      if (!seen.has(id)) list.push({ codigo_tabla: id, cabecera: "" });
    }
    return list;
  }, [sectionOrder, tableIds]);

  const selectedDraft = useMemo(
    () => drafts.find((d) => d.codigo_celda === selectedCellId) ?? null,
    [drafts, selectedCellId]
  );

  const draftIssues = useMemo(() => {
    const map = new Map<number, string>();
    for (const d of drafts) {
      const exp = d.expresion.trim();
      if (!exp) {
        map.set(d.codigo_celda, "Sin expresión");
        continue;
      }
      const compiled = formulaApi.compile(exp);
      if (!compiled.ok) map.set(d.codigo_celda, compiled.error);
    }
    return map;
  }, [drafts]);

  const updateDraft = (codigoCelda: number, patch: Partial<FormulaDraft>) => {
    onDraftsChange(
      drafts.map((d) => {
        if (d.codigo_celda !== codigoCelda) return d;
        const next = { ...d, ...patch };
        if (patch.expresion !== undefined) {
          const compiled = formulaApi.compile(patch.expresion);
          next.latex = compiled.ok ? compiled.latex : "";
        }
        return next;
      })
    );
  };

  const insertRef = (refCell: FormCellSnapshot) => {
    if (!selectedDraft) return;
    const token = cellRefToken(refCell);
    updateDraft(selectedDraft.codigo_celda, {
      expresion: appendToken(selectedDraft.expresion, token),
    });
  };

  const insertFunctionShortcut = (fnInsert: string, fnName: SupportedFunction) => {
    if (!selectedDraft) return;
    const compiled = formulaApi.compile(selectedDraft.expresion);
    const depTokens = compiled.ok ? compiled.refs : [];
    let chunk: string;
    if (fnName === "sqrt") {
      chunk = depTokens.length >= 1 ? `sqrt(${depTokens[0]})` : "sqrt(";
    } else if (depTokens.length > 0) {
      chunk = `${fnName}(${depTokens.join(",")})`;
    } else {
      chunk = fnInsert;
    }
    updateDraft(selectedDraft.codigo_celda, {
      expresion: appendToken(selectedDraft.expresion, chunk),
    });
  };

  const depTokens = useMemo(() => {
    if (!selectedDraft?.expresion.trim()) return [];
    const compiled = formulaApi.compile(selectedDraft.expresion);
    return compiled.ok ? compiled.refs : [];
  }, [selectedDraft]);

  if (tableIds.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Agrega tablas al formulario para definir fórmulas.
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fórmulas del formulario</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (drafts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fórmulas del formulario</CardTitle>
          <CardDescription>
            Marca celdas como <strong>Calculada</strong> en el Editor de Tablas; luego
            define aquí sus expresiones.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-md">
          Ninguna celda calculada en las tablas seleccionadas.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-violet-200">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Calculator className="h-4 w-4 text-violet-700" />
          Fórmulas del formulario
        </CardTitle>
        <CardDescription>
          Selecciona una celda calculada y escribe la expresión. Clic en cualquier celda
          del formulario inserta la referencia cualificada (
          <code className="text-xs bg-muted px-1 rounded">T{"{id}"}.alias</code>).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {drafts.map((d) => {
            const issue = draftIssues.get(d.codigo_celda);
            const active = selectedCellId === d.codigo_celda;
            return (
              <button
                key={d.codigo_celda}
                type="button"
                onClick={() => setSelectedCellId(d.codigo_celda)}
                className={cn(
                  "text-left rounded-md border px-3 py-2 text-xs transition-colors min-w-[140px]",
                  active
                    ? "border-violet-600 bg-violet-50 ring-2 ring-violet-200"
                    : "border-slate-200 hover:border-violet-300 bg-white",
                  issue && !active && "border-amber-400"
                )}
              >
                <span className="font-mono font-semibold block">{d.cellLabel}</span>
                <span className="text-muted-foreground truncate block max-w-[200px]">
                  {d.expresion.trim() || "Sin expresión"}
                </span>
                {issue && (
                  <span className="flex items-center gap-1 text-amber-700 mt-1">
                    <AlertCircle className="h-3 w-3" />
                    {issue}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {selectedDraft ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="space-y-3 min-w-0">
              <Label className="text-xs uppercase tracking-wide text-violet-800">
                Tablas del formulario — clic para insertar referencia
              </Label>
              <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
                {orderedTables.map(({ codigo_tabla, cabecera }) => {
                  const tabla = tablas.find((t) => t.codigo_tabla === codigo_tabla);
                  const tableCells = cells.filter((c) => c.codigo_tabla === codigo_tabla);
                  const cols = columnsByTable.get(codigo_tabla) || [];
                  const maxRow = tableCells.reduce(
                    (m, c) => Math.max(m, c.fila + c.rowspan - 1),
                    1
                  );
                  const maxCol = Math.max(
                    cols.length,
                    tableCells.reduce((m, c) => Math.max(m, c.col + c.colspan - 1), 1)
                  );

                  const covered = new Set<string>();
                  const byPos = new Map(
                    tableCells.map((c) => [`${c.fila}:${c.col}`, c])
                  );

                  return (
                    <div key={codigo_tabla} className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          T{codigo_tabla}.*
                        </Badge>
                        <span className="text-xs font-medium">
                          {cabecera.trim() || tableDisplayName(tabla, codigo_tabla)}
                        </span>
                      </div>
                      <div className="overflow-x-auto border rounded-md bg-white">
                        <table className="border-collapse text-[10px] min-w-full">
                          <thead>
                            <tr>
                              <th className="border bg-slate-50 w-6" />
                              {Array.from({ length: maxCol }, (_, i) => (
                                <th
                                  key={i}
                                  className="border bg-slate-50 px-1 py-0.5 font-medium"
                                >
                                  {cols[i]?.nombre_columna || cellPositionRef(i + 1, 1).replace(/\d+/, "")}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from({ length: maxRow }, (_, ri) => {
                              const fila = ri + 1;
                              return (
                                <tr key={fila}>
                                  <td className="border bg-slate-50 text-center font-medium">
                                    {fila}
                                  </td>
                                  {Array.from({ length: maxCol }, (_, ci) => {
                                    const col = ci + 1;
                                    const key = `${fila}:${col}`;
                                    if (covered.has(key)) return null;
                                    const cel = byPos.get(key);
                                    if (!cel) {
                                      return (
                                        <td
                                          key={key}
                                          className="border h-7 min-w-[52px] bg-slate-50/40"
                                        />
                                      );
                                    }
                                    for (let r = cel.fila; r < cel.fila + cel.rowspan; r++) {
                                      for (let c = cel.col; c < cel.col + cel.colspan; c++) {
                                        if (r !== cel.fila || c !== cel.col) {
                                          covered.add(`${r}:${c}`);
                                        }
                                      }
                                    }
                                    const token = cellRefToken(cel);
                                    const isTarget =
                                      cel.codigo_celda === selectedDraft.codigo_celda;
                                    const isDep = depTokens.some(
                                      (t) =>
                                        t === token ||
                                        t === (cel.alias || cellPositionRef(cel.col, cel.fila))
                                    );
                                    const clickable =
                                      !isTarget &&
                                      cel.tipo_celda !== "header" &&
                                      cel.tipo_celda !== "label";
                                    return (
                                      <td
                                        key={key}
                                        rowSpan={cel.rowspan}
                                        colSpan={cel.colspan}
                                        title={
                                          isTarget
                                            ? "Celda de esta fórmula"
                                            : clickable
                                              ? `Insertar ${token}`
                                              : token
                                        }
                                        className={cn(
                                          "border px-0.5 py-0.5 text-center align-middle min-w-[52px]",
                                          TIPO_STYLE[cel.tipo_celda] || "bg-white",
                                          isTarget &&
                                            "ring-2 ring-inset ring-violet-600",
                                          isDep &&
                                            !isTarget &&
                                            "ring-2 ring-inset ring-emerald-500",
                                          clickable &&
                                            "cursor-pointer hover:ring-2 hover:ring-inset hover:ring-primary/40"
                                        )}
                                        onClick={() => {
                                          if (clickable) insertRef(cel);
                                        }}
                                      >
                                        <div className="truncate max-w-[72px] font-mono">
                                          {cel.alias || "·"}
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="min-w-0 border rounded-lg overflow-hidden">
              <FormulaWolframEditor
                nombre={selectedDraft.nombre}
                expresion={selectedDraft.expresion}
                depTokens={depTokens}
                onNombreChange={(nombre) =>
                  updateDraft(selectedDraft.codigo_celda, { nombre })
                }
                onExpresionChange={(expresion) =>
                  updateDraft(selectedDraft.codigo_celda, { expresion })
                }
                onInsertFunction={insertFunctionShortcut}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-md">
            Selecciona una celda calculada arriba para editar su fórmula.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
