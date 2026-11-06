"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Columna, Tabla } from "@/types/interfaces";
import {
  FormulaWolframEditor,
  type FormulaWolframEditorHandle,
} from "@/components/formula/formula-wolfram-editor";
import { FormulaMathPreview } from "@/components/formula/mathjax-preview";
import { formulaApi, isFormulaEligible } from "@/lib/formula";
import { cellPositionRef, computeAutofillShift, shiftRefsInExpression } from "@/lib/formula/grid-utils";
import {
  cellRefToken,
  tableDisplayName,
  loadFormFormulaContext,
  saveFormFormulaDrafts,
  buildRefMap,
  resolveRefDetailed,
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calculator, AlertCircle, Check, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

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
  /** Notifica al padre si hay cambios de fórmulas sin persistir. */
  onDirtyChange?: (dirty: boolean) => void;
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
  onDirtyChange,
}: Props) {
  const { toast } = useToast();
  const [savedSnapshot, setSavedSnapshot] = useState<Map<number, string> | null>(null);
  const snapshotOf = (list: FormulaDraft[]) =>
    new Map(list.map((d) => [d.codigo_celda, `${d.nombre}:${d.expresion}`]));

  useEffect(() => {
    if (!isLoading) setSavedSnapshot(snapshotOf(drafts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const isDirty = useMemo(() => {
    if (!savedSnapshot) return false;
    return drafts.some((d) => savedSnapshot.get(d.codigo_celda) !== `${d.nombre}:${d.expresion}`);
  }, [drafts, savedSnapshot]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const [selectedCellId, setSelectedCellId] = useState<number | null>(null);
  const [isEditingFormula, setIsEditingFormula] = useState(false);
  const [savingFormula, setSavingFormula] = useState(false);
  const editorRef = useRef<FormulaWolframEditorHandle>(null);
  const cellNodeRefs = useRef(new Map<number, HTMLTableCellElement>());
  /** Snapshot al entrar en modo edición — Esc/X restaura estos valores. */
  const editBaselineRef = useRef<{
    codigo_celda: number;
    nombre: string;
    expresion: string;
    latex: string;
  } | null>(null);

  const selectCell = (codigoCelda: number | null) => {
    setSelectedCellId(codigoCelda);
    setIsEditingFormula(false);
    editBaselineRef.current = null;
  };

  const beginEditing = (codigoCelda: number) => {
    const d = drafts.find((x) => x.codigo_celda === codigoCelda);
    if (d) {
      editBaselineRef.current = {
        codigo_celda: d.codigo_celda,
        nombre: d.nombre,
        expresion: d.expresion,
        latex: d.latex,
      };
    }
    setSelectedCellId(codigoCelda);
    setIsEditingFormula(true);
  };

  const cancelEditing = () => {
    const bas = editBaselineRef.current;
    if (bas) {
      onDraftsChange(
        drafts.map((d) =>
          d.codigo_celda === bas.codigo_celda
            ? { ...d, nombre: bas.nombre, expresion: bas.expresion, latex: bas.latex }
            : d
        )
      );
    }
    editBaselineRef.current = null;
    setIsEditingFormula(false);
  };

  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCellClick = (cel: FormCellSnapshot, eligible: boolean, isTarget: boolean) => {
    if (!eligible) return;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      if (isEditingFormula && selectedDraft) {
        if (!isTarget) editorRef.current?.insertReference(cellRefToken(cel));
        return;
      }
      selectCell(cel.codigo_celda);
    }, 250);
  };

  const handleCellDoubleClick = (cel: FormCellSnapshot, eligible: boolean) => {
    if (!eligible) return;
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    beginEditing(cel.codigo_celda);
  };

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);

  // ── Arrastrar para rellenar (autofill tipo Excel, con refs relativas) ──
  type FillDrag = { sourceCel: FormCellSnapshot; axis: "row" | "col" | null; toIndex: number };
  const dragRef = useRef<FillDrag | null>(null);
  // Forzar re-render mientras se arrastra (el rango vive en dragRef, no en estado).
  const [, forceRerender] = useState(0);
  const bumpDrag = () => forceRerender((v) => v + 1);

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

  const draftsByCell = useMemo(
    () => new Map(drafts.map((d) => [d.codigo_celda, d])),
    [drafts]
  );

  const selectedDraft = useMemo(
    () => (selectedCellId != null ? draftsByCell.get(selectedCellId) ?? null : null),
    [draftsByCell, selectedCellId]
  );

  const draftIssues = useMemo(() => {
    const map = new Map<number, string>();
    for (const d of drafts) {
      const exp = d.expresion.trim();
      if (!exp) continue; // vacía no es un error, solo no está definida todavía
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

  /** Persiste TODOS los drafts actuales (la única unidad que soporta saveFormFormulaDrafts). */
  const persistFormulas = async (successDescription: string): Promise<boolean> => {
    setSavingFormula(true);
    try {
      await saveFormFormulaDrafts(tableIds, drafts);
      // Releer desde el servidor para quedar con los codigo_formula reales (evita duplicados al re-guardar).
      const ctx = await loadFormFormulaContext(tableIds);
      onDraftsChange(ctx.drafts);
      setSavedSnapshot(snapshotOf(ctx.drafts));
      toast({ title: "Fórmulas guardadas", description: successDescription, variant: "success" });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error inesperado al guardar.";
      toast({ title: "No se pudo guardar", description: msg, variant: "destructive" });
      return false;
    } finally {
      setSavingFormula(false);
    }
  };

  /** Valida la celda en edición y la deja en borrador (memoria). No escribe en BD. */
  const finishEditing = () => {
    if (!selectedDraft || savingFormula) return;
    const exp = selectedDraft.expresion.trim();
    if (exp) {
      const compiled = formulaApi.compile(exp);
      if (!compiled.ok) {
        toast({
          title: "Fórmula inválida",
          description: compiled.error,
          variant: "destructive",
        });
        return;
      }
    }
    editBaselineRef.current = null;
    setIsEditingFormula(false);
    // Queda seleccionada en modo vista; los cambios viven en drafts hasta "Guardar cambios".
  };

  const saveAllFormulas = async () => {
    if (savingFormula || !isDirty) return;
    // Si estaba editando, validar antes de persistir todo.
    if (isEditingFormula && selectedDraft) {
      const exp = selectedDraft.expresion.trim();
      if (exp) {
        const compiled = formulaApi.compile(exp);
        if (!compiled.ok) {
          toast({
            title: "Fórmula inválida",
            description: compiled.error,
            variant: "destructive",
          });
          return;
        }
      }
      editBaselineRef.current = null;
      setIsEditingFormula(false);
    }
    await persistFormulas("Todos los cambios pendientes se guardaron en la base de datos.");
  };

  const applyFill = (drag: { sourceCel: FormCellSnapshot; axis: "row" | "col"; toIndex: number }) => {
    const { sourceCel, axis, toIndex } = drag;
    const sourceDraft = draftsByCell.get(sourceCel.codigo_celda);
    const sourceExp = sourceDraft?.expresion.trim();
    if (!sourceExp) return;

    const tableCells = cells.filter((c) => c.codigo_tabla === sourceCel.codigo_tabla);
    const coverAt = (r: number, c: number) =>
      tableCells.find(
        (cel) =>
          cel.fila <= r &&
          r < cel.fila + cel.rowspan &&
          cel.col <= c &&
          c < cel.col + cel.colspan
      );

    const targets: FormCellSnapshot[] = [];
    const seen = new Set<number>();
    const forward = axis === "row" ? toIndex >= sourceCel.fila : toIndex >= sourceCel.col;
    if (axis === "row") {
      const [lo, hi] =
        sourceCel.fila <= toIndex ? [sourceCel.fila + 1, toIndex] : [toIndex, sourceCel.fila - 1];
      for (let r = lo; r <= hi; r++) {
        const cel = coverAt(r, sourceCel.col);
        if (cel && cel.codigo_celda !== sourceCel.codigo_celda && !seen.has(cel.codigo_celda)) {
          seen.add(cel.codigo_celda);
          targets.push(cel);
        }
      }
    } else {
      const [lo, hi] =
        sourceCel.col <= toIndex ? [sourceCel.col + 1, toIndex] : [toIndex, sourceCel.col - 1];
      for (let c = lo; c <= hi; c++) {
        const cel = coverAt(sourceCel.fila, c);
        if (cel && cel.codigo_celda !== sourceCel.codigo_celda && !seen.has(cel.codigo_celda)) {
          seen.add(cel.codigo_celda);
          targets.push(cel);
        }
      }
    }
    if (!forward) targets.reverse();
    if (targets.length === 0) return;

    const refMap = buildRefMap(cells);
    const skipped: string[] = [];
    const broken: string[] = [];
    let filled = 0;
    const nextDrafts = drafts.map((d) => ({ ...d }));
    targets.forEach((target, i) => {
      if (!isFormulaEligible(target.tipo_celda, target.tipo_dato)) {
        skipped.push(cellPositionRef(target.col, target.fila));
        return;
      }
      const shift = computeAutofillShift(sourceCel, target);
      // En arrastre horizontal forzamos solo columnas (sin mezclar sufijos de grupo).
      const deltaRow = axis === "row" ? shift.deltaRow : 0;
      const deltaCol = axis === "col" ? shift.deltaCol : 0;
      const deltaSample = axis === "row" ? shift.deltaSample : 0;
      const deltaSuffix = axis === "row" ? shift.deltaSuffix : 0;
      const newExp = shiftRefsInExpression(
        sourceExp,
        sourceCel.codigo_tabla,
        deltaRow,
        deltaCol,
        deltaSample,
        deltaSuffix
      );
      const compiled = formulaApi.compile(newExp);
      if (!compiled.ok) {
        broken.push(cellPositionRef(target.col, target.fila));
        return;
      }
      const badRef = compiled.refs.some(
        (ref) => !resolveRefDetailed(ref, target.codigo_tabla, refMap, cells).ok
      );
      if (badRef) {
        broken.push(cellPositionRef(target.col, target.fila));
        return;
      }
      const idx = nextDrafts.findIndex((d) => d.codigo_celda === target.codigo_celda);
      if (idx === -1) return;
      nextDrafts[idx] = {
        ...nextDrafts[idx],
        expresion: newExp,
        latex: compiled.latex,
        nombre: nextDrafts[idx].nombre || sourceDraft!.nombre,
      };
      filled++;
    });

    if (filled > 0) onDraftsChange(nextDrafts);
    const parts: string[] = [];
    if (filled > 0) {
      parts.push(
        `${filled} celda(s) en borrador. Usa "Guardar cambios" (o Guardar el formulario) para persistirlas en la BD.`
      );
    }
    if (skipped.length) parts.push(`Omitidas (no Calculada/Entrada): ${skipped.join(", ")}.`);
    if (broken.length) parts.push(`Omitidas (refs inválidas tras desplazar): ${broken.join(", ")}.`);
    toast({
      title: filled > 0 ? "Fórmulas rellenadas — sin guardar en BD" : "Nada que rellenar",
      description: parts.join(" ") || "Ninguna celda del rango es válida para rellenar.",
      variant: filled > 0 ? undefined : "destructive",
    });
  };

  const startFill = (cel: FormCellSnapshot, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = { sourceCel: cel, axis: null, toIndex: cel.fila };
    bumpDrag();
    const onUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      bumpDrag();
      if (drag?.axis) applyFill({ ...drag, axis: drag.axis });
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mouseup", onUp);
  };

  const extendFill = (cel: FormCellSnapshot) => {
    const drag = dragRef.current;
    if (!drag || cel.codigo_tabla !== drag.sourceCel.codigo_tabla) return;
    if (cel.col === drag.sourceCel.col && cel.fila !== drag.sourceCel.fila) {
      dragRef.current = { ...drag, axis: "row", toIndex: cel.fila };
      bumpDrag();
    } else if (cel.fila === drag.sourceCel.fila && cel.col !== drag.sourceCel.col) {
      dragRef.current = { ...drag, axis: "col", toIndex: cel.col };
      bumpDrag();
    }
  };

  const inFillRange = (cel: FormCellSnapshot) => {
    const drag = dragRef.current;
    if (!drag || !drag.axis) return false;
    if (cel.codigo_tabla !== drag.sourceCel.codigo_tabla) return false;
    if (drag.axis === "row") {
      if (cel.col !== drag.sourceCel.col) return false;
      const [lo, hi] =
        drag.sourceCel.fila <= drag.toIndex
          ? [drag.sourceCel.fila, drag.toIndex]
          : [drag.toIndex, drag.sourceCel.fila];
      return cel.fila >= lo && cel.fila <= hi;
    }
    if (cel.fila !== drag.sourceCel.fila) return false;
    const [lo, hi] =
      drag.sourceCel.col <= drag.toIndex
        ? [drag.sourceCel.col, drag.toIndex]
        : [drag.toIndex, drag.sourceCel.col];
    return cel.col >= lo && cel.col <= hi;
  };

  // Celdas actualmente referenciadas en la fórmula que se está editando (resalte tipo Excel).
  const depTokens = useMemo(() => {
    if (!selectedDraft?.expresion.trim()) return [];
    const compiled = formulaApi.compile(selectedDraft.expresion);
    return compiled.ok ? compiled.refs : [];
  }, [selectedDraft]);

  const isReferenced = (cel: FormCellSnapshot) => {
    if (!selectedDraft) return false;
    const token = cellRefToken(cel);
    return depTokens.some(
      (t) => t === token || t === (cel.alias || cellPositionRef(cel.col, cel.fila))
    );
  };

  // Navegación con flechas entre celdas de una misma tabla (estilo Excel).
  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLTableCellElement>,
    cel: FormCellSnapshot,
    tableCells: FormCellSnapshot[]
  ) => {
    const delta =
      e.key === "ArrowUp"
        ? [-1, 0]
        : e.key === "ArrowDown"
          ? [1, 0]
          : e.key === "ArrowLeft"
            ? [0, -1]
            : e.key === "ArrowRight"
              ? [0, 1]
              : null;
    if (!delta) return;
    const next = tableCells.find(
      (c) => c.fila === cel.fila + delta[0] && c.col === cel.col + delta[1]
    );
    if (!next) return;
    e.preventDefault();
    selectCell(isFormulaEligible(next.tipo_celda, next.tipo_dato) ? next.codigo_celda : null);
    requestAnimationFrame(() => cellNodeRefs.current.get(next.codigo_celda)?.focus());
  };

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
            Marca celdas como <strong>Calculada</strong> o <strong>Entrada</strong> en el
            Editor de Tablas; luego selecciónalas aquí para definir su expresión.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-md">
          Ninguna celda de tipo Calculada o Entrada en las tablas seleccionadas.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-violet-200">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="h-4 w-4 text-violet-700" />
            Fórmulas del formulario
          </CardTitle>
          {isDirty && (
            <Button
              type="button"
              size="sm"
              className="h-8 bg-violet-700 hover:bg-violet-800"
              onClick={saveAllFormulas}
              disabled={savingFormula}
            >
              <Check className="mr-1.5 h-3.5 w-3.5" />
              {savingFormula ? "Guardando…" : "Guardar cambios"}
            </Button>
          )}
        </div>
        <CardDescription>
          <strong>Clic</strong> = ver fórmula. <strong>Doble clic</strong> = editar (luego clic en
          otra celda inserta su ref <code className="text-[10px]">T{"{id}"}.alias</code>).{" "}
          <strong>Enter / Listo</strong> valida y deja el cambio en borrador. Edita varias celdas;
          todo queda en memoria hasta <strong>Guardar cambios</strong> (o Guardar el formulario).{" "}
          <strong>Esc</strong> descarta solo la edición actual. El autofill también queda en
          borrador.{" "}
          {isDirty && (
            <span className="text-amber-700 font-semibold">
              Tienes cambios sin guardar en BD.
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="space-y-4 min-w-0 max-h-[65vh] overflow-y-auto pr-1">
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
                                      className="border h-8 min-w-[56px] bg-slate-50/40"
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
                                const eligible = isFormulaEligible(cel.tipo_celda, cel.tipo_dato);
                                const isTarget = cel.codigo_celda === selectedCellId;
                                const draft = draftsByCell.get(cel.codigo_celda);
                                const hasFormula = !!draft?.expresion.trim();
                                const needsFormula =
                                  cel.tipo_celda === "calculated" && eligible && !hasFormula;
                                const issue = draftIssues.get(cel.codigo_celda);
                                const referenced = !isTarget && isReferenced(cel);
                                const insertMode =
                                  eligible && !isTarget && selectedDraft != null && isEditingFormula;
                                const pendingFill = !isTarget && inFillRange(cel);

                                return (
                                  <td
                                    key={key}
                                    ref={(el) => {
                                      if (el) cellNodeRefs.current.set(cel.codigo_celda, el);
                                      else cellNodeRefs.current.delete(cel.codigo_celda);
                                    }}
                                    tabIndex={eligible ? 0 : -1}
                                    rowSpan={cel.rowspan}
                                    colSpan={cel.colspan}
                                    title={
                                      !eligible
                                        ? undefined
                                        : needsFormula
                                          ? "Calculada sin fórmula — obligatorio definir expresión"
                                          : isTarget
                                            ? isEditingFormula
                                              ? "Editando esta fórmula."
                                              : "Viendo esta fórmula — doble clic para editarla."
                                            : insertMode
                                              ? `Clic para insertar ${cellRefToken(cel)}`
                                              : "Clic para ver esta fórmula, doble clic para editarla. Flechas para moverte."
                                    }
                                    className={cn(
                                      "relative border px-1 py-1 text-center align-middle min-w-[56px] outline-none",
                                      TIPO_STYLE[cel.tipo_celda] || "bg-white",
                                      eligible && "cursor-pointer hover:brightness-95",
                                      eligible && "focus-visible:ring-2 focus-visible:ring-primary",
                                      isTarget && "ring-2 ring-inset ring-violet-600",
                                      referenced && "ring-2 ring-inset ring-emerald-500",
                                      issue && !isTarget && "ring-2 ring-inset ring-amber-500",
                                      needsFormula &&
                                        !isTarget &&
                                        "ring-2 ring-inset ring-amber-500 border-dashed bg-amber-50/80",
                                      pendingFill && "ring-2 ring-inset ring-violet-400 bg-violet-100/60"
                                    )}
                                    onClick={() => handleCellClick(cel, eligible, isTarget)}
                                    onDoubleClick={() => handleCellDoubleClick(cel, eligible)}
                                    onMouseEnter={() => extendFill(cel)}
                                    onKeyDown={(e) => handleCellKeyDown(e, cel, tableCells)}
                                  >
                                    <div className="truncate max-w-[80px] mx-auto font-mono">
                                      {cel.alias || "·"}
                                    </div>
                                    {cel.tipo_celda === "calculated" && (
                                      <span className="absolute bottom-0 left-0.5 text-[7px] font-bold uppercase text-violet-600/80">
                                        calc
                                      </span>
                                    )}
                                    {eligible && hasFormula && !isTarget && (
                                      <span className="absolute top-0 left-0.5 text-[8px] font-bold text-violet-700">
                                        ƒx
                                      </span>
                                    )}
                                    {needsFormula && !isTarget && (
                                      <span className="absolute top-0 right-0.5 text-[8px] font-bold text-amber-700">
                                        ¡ƒx!
                                      </span>
                                    )}
                                    {issue && !isTarget && !needsFormula && (
                                      <AlertCircle className="h-2.5 w-2.5 text-amber-600 absolute top-0.5 right-0.5" />
                                    )}
                                    {isTarget && hasFormula && (
                                      <div
                                        onMouseDown={(e) => startFill(cel, e)}
                                        title="Arrastra para rellenar con referencias relativas (autofill)"
                                        className="absolute -bottom-1 -right-1 h-2.5 w-2.5 bg-violet-700 border border-white rounded-sm cursor-crosshair z-10"
                                      />
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
              );
            })}
          </div>

          <div className="min-w-0">
            {selectedDraft && isEditingFormula ? (
              // ── Modo edición: editor completo (caja de texto, funciones, atajos) ──
              <div className="border-2 border-violet-400 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-violet-100 border-b border-violet-300">
                  <span className="text-xs font-mono font-semibold text-violet-900 flex items-center gap-1.5">
                    <Pencil className="h-3 w-3" />
                    {selectedDraft.cellLabel} — editando
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 bg-violet-700 hover:bg-violet-800 text-xs"
                      onClick={finishEditing}
                      disabled={savingFormula}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" />
                      Listo
                    </Button>
                    <button
                      type="button"
                      onClick={cancelEditing}
                      className="text-violet-700 hover:text-violet-900"
                      title="Descartar esta edición"
                      disabled={savingFormula}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="p-3">
                  <FormulaWolframEditor
                    ref={editorRef}
                    nombre={selectedDraft.nombre}
                    expresion={selectedDraft.expresion}
                    onNombreChange={(nombre) => {
                      setIsEditingFormula(true);
                      updateDraft(selectedDraft.codigo_celda, { nombre });
                    }}
                    onExpresionChange={(expresion) => {
                      setIsEditingFormula(true);
                      updateDraft(selectedDraft.codigo_celda, { expresion });
                    }}
                    onCommit={finishEditing}
                    onCancel={cancelEditing}
                  />
                </div>
              </div>
            ) : selectedDraft ? (
              // ── Modo vista: solo la vista matemática (MathJax), de un vistazo ──
              <div className="border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-b">
                  <span className="text-xs font-mono font-semibold text-slate-700">
                    {selectedDraft.cellLabel}
                    {selectedDraft.nombre && selectedDraft.nombre !== selectedDraft.cellLabel && (
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        · {selectedDraft.nombre}
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => beginEditing(selectedDraft.codigo_celda)}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      Editar
                    </Button>
                    <button
                      type="button"
                      onClick={() => selectCell(null)}
                      className="text-slate-500 hover:text-slate-800"
                      title="Cerrar"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="p-3">
                  {selectedDraft.expresion.trim() ? (
                    <FormulaMathPreview
                      expresion={selectedDraft.expresion}
                      latex={selectedDraft.latex}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-md">
                      Esta celda todavía no tiene fórmula. Doble clic en ella (o "Editar") para crear una.
                    </p>
                  )}
                  <p className="mt-2 text-[11px] text-muted-foreground text-center">
                    Doble clic en la celda de la tabla, o el botón "Editar", para modificarla.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-md">
                Selecciona una celda Calculada o de Entrada en la tabla para ver su fórmula.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
