"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { AlertTriangle, Camera, Loader2, X } from "lucide-react";
import type { Columna, Tabla } from "@/types/interfaces";
import { cellRefToken, type FormCellSnapshot, type FormulaValueMap } from "@/lib/formula";
import { cn, formatAliasDisplay } from "@/lib/utils";
import { uploadService } from "@/services/muestrasLaboratorio/upload.service";
import { useToast } from "@/hooks/use-toast";

interface FormularioResultadosGridProps {
  tabla: Tabla;
  celdas: FormCellSnapshot[];
  columnas: Columna[];
  /** Valores en vivo (entradas + fórmulas). Las celdas calculadas leen de aquí. */
  valores: FormulaValueMap;
  /** Solo lo que el técnico tipeó. El input numérico nunca mezcla toma ni el resultado de una fórmula. */
  inputValues?: FormulaValueMap;
  /** Celdas con fórmula (aunque el diseñador las haya dejado como "input"). */
  formulaIds?: Set<string>;
  textValues: Record<string, string>;
  errors: Record<string, string>;
  onChangeInput: (codigoCelda: number, raw: string) => void;
  /** Texto exacto capturado, por referencia de celda. */
  inputTexts?: Record<string, string>;
  onChangeText: (codigoCelda: number, value: string | undefined) => void;
  /** Modo solo-lectura: deshabilita todos los controles de entrada. */
  readOnly?: boolean;
}

const TIPO_STYLE: Record<string, string> = {
  header: "bg-slate-100/95 text-slate-700 font-semibold",
  label: "bg-amber-50/90 text-amber-950",
  input: "bg-white",
  calculated: "bg-violet-50/90 text-violet-950",
};

type NavDir = "up" | "down" | "left" | "right";

/** Estilo "celda de Excel" refinada: el control llena el <td>; al enfocar,
 * anillo primary hacia adentro. */
const EXCEL_CELL_INPUT =
  "h-11 w-full bg-white px-2.5 text-center text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-300 hover:bg-sky-50/50 focus:bg-sky-50/80 focus:ring-2 focus:ring-inset focus:ring-[#0055b8]/40 focus:z-10 relative disabled:cursor-not-allowed disabled:text-muted-foreground disabled:bg-slate-50/80 disabled:hover:bg-slate-50/80";

export const formatValor = (v: number | null | undefined): string => {
  if (v == null || !Number.isFinite(v)) return "";
  const r = Math.round(v * 10000) / 10000;
  return String(r);
};

/** Solo las celdas "input" con tipo_dato distinto de "nulos" capturan datos.
 * "imagen" queda fuera de la navegación por teclado: es una acción de clic/tap
 * (abre el selector de archivo), no de tipeo. */
const isEditable = (cel: FormCellSnapshot, formulaIds?: Set<string>) =>
  cel.tipo_celda === "input" &&
  cel.tipo_dato !== "nulos" &&
  cel.tipo_dato !== "imagen" &&
  !formulaIds?.has(cellRefToken(cel));

/** Grilla editable de UNA tabla dentro de la captura de resultados: reutiliza el
 * mismo algoritmo de layout que MiniGrid (formulario-preview.tsx) pero con
 * inputs reales para celdas "input" (tipados según tipo_dato) y valores en vivo
 * para "calculated". Soporta navegación con flechas/Enter entre celdas editables. */
export function FormularioResultadosGrid({
  tabla,
  celdas,
  columnas,
  valores,
  inputValues,
  formulaIds,
  textValues,
  errors,
  onChangeInput,
  inputTexts,
  onChangeText,
  readOnly = false,
}: Readonly<FormularioResultadosGridProps>) {
  const { toast } = useToast();
  const fieldRefs = useRef(new Map<number, HTMLInputElement | HTMLSelectElement>());
  const [uploadingIds, setUploadingIds] = useState<Set<number>>(new Set());
  const [imagenExpandida, setImagenExpandida] = useState<string | null>(null);

  useEffect(() => {
    if (!imagenExpandida) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setImagenExpandida(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [imagenExpandida]);

  const handleImageUpload = async (cel: FormCellSnapshot, file: File) => {
    setUploadingIds((prev) => new Set(prev).add(cel.codigo_celda));
    try {
      const url = await uploadService.uploadImagen(file);
      onChangeText(cel.codigo_celda, url);
    } catch (error) {
      toast({
        title: "Error al subir imagen",
        description: error instanceof Error ? error.message : "No se pudo subir la imagen.",
        variant: "destructive",
      });
    } finally {
      setUploadingIds((prev) => {
        const next = new Set(prev);
        next.delete(cel.codigo_celda);
        return next;
      });
    }
  };

  const { maxRow, maxCol, byPos, posMap } = useMemo(() => {
    let mr = 0;
    let mc = columnas.length || 0;
    const anchors = new Map<string, FormCellSnapshot>();
    for (const c of celdas) {
      mr = Math.max(mr, c.fila + c.rowspan - 1);
      mc = Math.max(mc, c.col + c.colspan - 1);
      anchors.set(`${c.fila}:${c.col}`, c);
    }
    // Mapa completo (incluye posiciones cubiertas por fusiones) para navegación por teclado.
    const full = new Map<string, FormCellSnapshot>();
    for (const c of celdas) {
      for (let r = c.fila; r < c.fila + c.rowspan; r++) {
        for (let cc = c.col; cc < c.col + c.colspan; cc++) {
          full.set(`${r}:${cc}`, c);
        }
      }
    }
    return { maxRow: mr || 1, maxCol: mc || 1, byPos: anchors, posMap: full };
  }, [celdas, columnas]);

  const findNextEditable = (from: FormCellSnapshot, dir: NavDir): FormCellSnapshot | null => {
    let r = from.fila;
    let c = from.col;
    if (dir === "down") r = from.fila + from.rowspan;
    else if (dir === "up") r = from.fila - 1;
    else if (dir === "right") c = from.col + from.colspan;
    else c = from.col - 1;

    while (r >= 1 && r <= maxRow && c >= 1 && c <= maxCol) {
      const cel = posMap.get(`${r}:${c}`);
      if (cel && isEditable(cel, formulaIds)) return cel;
      if (dir === "down") r += 1;
      else if (dir === "up") r -= 1;
      else if (dir === "right") c += 1;
      else c -= 1;
    }
    return null;
  };

  const focusCell = (cel: FormCellSnapshot) => {
    const el = fieldRefs.current.get(cel.codigo_celda);
    if (!el) return;
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
  };

  const handleNavKeyDown = (cel: FormCellSnapshot) => (e: ReactKeyboardEvent) => {
    let dir: NavDir | null = null;
    if (e.key === "ArrowDown" || e.key === "Enter") dir = "down";
    else if (e.key === "ArrowUp") dir = "up";
    else if (e.key === "ArrowLeft") dir = "left";
    else if (e.key === "ArrowRight") dir = "right";
    if (!dir) return;

    const next = findNextEditable(cel, dir);
    if (!next) return;
    e.preventDefault();
    focusCell(next);
  };

  if (celdas.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-muted-foreground">
        {tabla.nombre_tabla || `Tabla #${tabla.codigo_tabla}`}: sin celdas definidas.
      </p>
    );
  }

  const covered = new Set<string>();

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/5">
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-sm table-fixed">
            <tbody>
              {Array.from({ length: maxRow }, (_, ri) => {
                const fila = ri + 1;
                return (
                  <tr key={fila} className="group/row">
                    {Array.from({ length: maxCol }, (_, ci) => {
                      const col = ci + 1;
                      const key = `${fila}:${col}`;
                      if (covered.has(key)) return null;
                      const cel = byPos.get(key);
                      if (!cel) {
                        return (
                          <td
                            key={key}
                            className="h-11 min-w-[100px] border border-slate-200 bg-slate-50/40"
                          />
                        );
                      }
                      for (let r = fila; r < fila + cel.rowspan; r++) {
                        for (let c = col; c < col + cel.colspan; c++) {
                          if (r !== fila || c !== col) covered.add(`${r}:${c}`);
                        }
                      }

                      const ref = cellRefToken(cel);
                      const error = errors[ref];
                      const tipoDato = cel.tipo_dato || "texto";
                      const esFormula =
                        cel.tipo_celda === "calculated" || Boolean(formulaIds?.has(ref));
                      const fillsCell = cel.tipo_celda === "input" && tipoDato !== "imagen" && !esFormula;
                      const isHeader = cel.tipo_celda === "header";
                      const valorEntrada = inputValues?.[ref] ?? undefined;

                      return (
                        <td
                          key={key}
                          data-codigo-celda={cel.codigo_celda}
                          rowSpan={cel.rowspan}
                          colSpan={cel.colspan}
                          className={cn(
                            "min-w-[100px] overflow-hidden border border-slate-200 align-middle text-center transition-colors",
                            fillsCell ? "h-11 p-0" : "h-11 px-2.5 py-1.5",
                            esFormula ? TIPO_STYLE.calculated : TIPO_STYLE[cel.tipo_celda] || "bg-white",
                            isHeader && "border-b-slate-300 bg-gradient-to-b from-slate-100 to-slate-50 text-[11px] uppercase tracking-wide",
                            esFormula && "font-medium",
                            error && "ring-2 ring-inset ring-amber-400/70"
                          )}
                        >
                          {cel.tipo_celda === "input" && tipoDato === "nulos" ? (
                            <div className="flex h-11 items-center justify-center bg-slate-50 text-sm text-slate-400">
                              —
                            </div>
                          ) : cel.tipo_celda === "input" && tipoDato === "imagen" ? (
                            <div className="flex flex-col items-center justify-center gap-1.5 py-2">
                              {textValues[ref] ? (
                                <div className="relative">
                                  <img
                                    src={uploadService.resolveUrl(textValues[ref])}
                                    alt=""
                                    className="h-14 w-14 cursor-zoom-in rounded-lg border border-slate-200 object-cover shadow-sm transition-transform hover:scale-105"
                                    onClick={() => setImagenExpandida(uploadService.resolveUrl(textValues[ref]))}
                                  />
                                  {!readOnly && (
                                    <button
                                      type="button"
                                      onClick={() => onChangeText(cel.codigo_celda, undefined)}
                                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-white shadow"
                                      title="Quitar imagen"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              ) : uploadingIds.has(cel.codigo_celda) ? (
                                <Loader2 className="h-5 w-5 animate-spin text-[#0055b8]" />
                              ) : readOnly ? (
                                <span className="text-xs text-muted-foreground">Sin foto</span>
                              ) : (
                                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-[#0055b8]/40 bg-sky-50/80 px-2.5 py-1.5 text-[11px] font-semibold text-[#0055b8] transition-colors hover:border-[#0055b8] hover:bg-sky-100">
                                  <Camera className="h-3.5 w-3.5" />
                                  Subir foto
                                  <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      e.target.value = "";
                                      if (file) void handleImageUpload(cel, file);
                                    }}
                                  />
                                </label>
                              )}
                            </div>
                          ) : esFormula ? (
                            <div className="flex min-h-[2.75rem] items-center justify-center gap-1.5 px-1">
                              <span data-valor-calculado className="rounded-md bg-white/70 px-2 py-0.5 font-semibold tabular-nums tracking-tight text-violet-900 shadow-sm ring-1 ring-violet-200/60">
                                {formatValor(valores[ref]) || "—"}
                              </span>
                              {error && (
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label={error} />
                              )}
                            </div>
                          ) : cel.tipo_celda === "input" && tipoDato === "booleano" ? (
                            <select
                              ref={(el) => {
                                if (el) fieldRefs.current.set(cel.codigo_celda, el);
                                else fieldRefs.current.delete(cel.codigo_celda);
                              }}
                              value={textValues[ref] ?? ""}
                              onChange={(e) => onChangeText(cel.codigo_celda, e.target.value || undefined)}
                              onKeyDown={handleNavKeyDown(cel)}
                              disabled={readOnly}
                              className={cn(EXCEL_CELL_INPUT, "cursor-pointer")}
                            >
                              <option value="">—</option>
                              <option value="true">Sí</option>
                              <option value="false">No</option>
                            </select>
                          ) : cel.tipo_celda === "input" && tipoDato === "fecha" ? (
                            <input
                              ref={(el) => {
                                if (el) fieldRefs.current.set(cel.codigo_celda, el);
                                else fieldRefs.current.delete(cel.codigo_celda);
                              }}
                              type="date"
                              value={textValues[ref] ?? ""}
                              onChange={(e) => onChangeText(cel.codigo_celda, e.target.value || undefined)}
                              onKeyDown={handleNavKeyDown(cel)}
                              disabled={readOnly}
                              className={EXCEL_CELL_INPUT}
                            />
                          ) : cel.tipo_celda === "input" && tipoDato === "texto" ? (
                            <input
                              ref={(el) => {
                                if (el) fieldRefs.current.set(cel.codigo_celda, el);
                                else fieldRefs.current.delete(cel.codigo_celda);
                              }}
                              type="text"
                              value={textValues[ref] ?? ""}
                              onChange={(e) => onChangeText(cel.codigo_celda, e.target.value || undefined)}
                              onKeyDown={handleNavKeyDown(cel)}
                              disabled={readOnly}
                              className={EXCEL_CELL_INPUT}
                            />
                          ) : cel.tipo_celda === "input" ? (
                            <input
                              ref={(el) => {
                                if (el) fieldRefs.current.set(cel.codigo_celda, el);
                                else fieldRefs.current.delete(cel.codigo_celda);
                              }}
                              type="text"
                              inputMode={tipoDato === "entero" ? "numeric" : "decimal"}
                              value={
                                inputTexts?.[ref] != null
                                  ? inputTexts[ref]
                                  : valorEntrada == null
                                    ? ""
                                    : String(valorEntrada)
                              }
                              onChange={(e) => {
                                onChangeInput(cel.codigo_celda, e.target.value);
                              }}
                              onKeyDown={handleNavKeyDown(cel)}
                              disabled={readOnly}
                              className={EXCEL_CELL_INPUT}
                            />
                          ) : (
                            <span className="block truncate px-0.5">{formatAliasDisplay(cel.alias) || "·"}</span>
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
      </div>

      <div className="flex flex-wrap items-center gap-3 px-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-slate-300 bg-white" />
          Editable
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-violet-200" />
          Calculado
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-100" />
          Etiqueta
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-slate-200" />
          Encabezado
        </span>
      </div>

      {imagenExpandida && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setImagenExpandida(null)}
        >
          <button
            type="button"
            onClick={() => setImagenExpandida(null)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            title="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={imagenExpandida}
            alt=""
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
