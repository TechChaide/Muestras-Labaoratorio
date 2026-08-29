"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Save, X, Merge, SplitSquareHorizontal, SplitSquareVertical, Calculator, Plus, Minus,
} from "lucide-react";
import type {
  Tabla, TipoEnsayo, Familia, Columna, Celda, Formula, TipoCelda, Dependencias,
} from "@/types/interfaces";
import { tablaService } from "@/services/muestrasLaboratorio/tabla.service";
import { columnaService } from "@/services/muestrasLaboratorio/columna.service";
import { celdaService } from "@/services/muestrasLaboratorio/celda.service";
import { formulaService } from "@/services/muestrasLaboratorio/formula.service";
import { dependenciasService } from "@/services/muestrasLaboratorio/dependencias.service";
import { FormulaWolframEditor } from "@/components/formula/formula-wolfram-editor";
import { formulaApi } from "@/lib/formula";
import type { SupportedFunction } from "@/lib/formula";
import { cn } from "@/lib/utils";

const genId = () => Math.random().toString(36).slice(2, 10);

type TipoCeldaLocal = TipoCelda;

interface ColumnaLocal {
  _localId: string;
  codigo_columna?: number;
  indice: number;
  nombre_columna: string;
  unidades: string;
  estado: string;
}

interface FormulaLocal {
  _localId: string;
  codigo_formula?: number;
  nombre: string;
  expresion: string;
  latex: string;
  ambito: string;
  estado: string;
  dependencias_local_ids: string[];
}

interface CeldaLocal {
  _localId: string;
  codigo_celda?: number;
  fila: number;
  col: number;
  rowspan: number;
  colspan: number;
  tipo_celda: TipoCeldaLocal;
  alias: string;
  campo_obligatorio: boolean;
  estado: string;
  formula?: FormulaLocal | null;
}

interface Props {
  tabla: Tabla | null;
  tiposEnsayo: TipoEnsayo[];
  familias: Familia[];
  onSuccess: () => void;
  onCancel: () => void;
}

interface SelRange {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

const TIPO_COLORS: Record<TipoCeldaLocal, string> = {
  header: "bg-slate-200 text-slate-900",
  label: "bg-slate-100 text-slate-700",
  input: "bg-white",
  calculated: "bg-sky-50 text-sky-900",
};

function normalizeRange(sel: SelRange): SelRange {
  return {
    r1: Math.min(sel.r1, sel.r2),
    c1: Math.min(sel.c1, sel.c2),
    r2: Math.max(sel.r1, sel.r2),
    c2: Math.max(sel.c1, sel.c2),
  };
}

function colLetter(n: number) {
  let x = n;
  let s = "";
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s || "A";
}

type BaselineSnap = {
  columnas: number[];
  celdas: number[];
  formulas: number[];
  deps: Dependencias[];
};

async function silentDelete(run: () => Promise<void>) {
  try {
    await run();
  } catch {
    /* ya no existe o FK; no abortar el guardado */
  }
}

export default function TablaEditor({ tabla, tiposEnsayo, familias, onSuccess, onCancel }: Props) {
  const { toast } = useToast();
  const isEdit = !!tabla?.codigo_tabla;
  const [isSaving, setIsSaving] = useState(false);
  const baselineRef = useRef<BaselineSnap>({
    columnas: [],
    celdas: [],
    formulas: [],
    deps: [],
  });

  const [codigoTipoEnsayo, setCodigoTipoEnsayo] = useState<number | undefined>(tabla?.codigo_tipo_ensayo);
  const [nombreTabla, setNombreTabla] = useState(tabla?.nombre_tabla ?? "");
  const [filasMuestra, setFilasMuestra] = useState(tabla?.filas_muestra ?? 0);
  const [numeroColumnas, setNumeroColumnas] = useState(tabla?.numero_columnas ?? 4);
  /** Filas de cabecera locales; en BD: numero_filas_diseno = cabecera + muestra + extras. */
  const [numeroFilasCabecera, setNumeroFilasCabecera] = useState(1);
  /** Filas extra insertadas por divisiones verticales (subceldas). */
  const [filasExtra, setFilasExtra] = useState(0);
  const [version, setVersion] = useState(tabla?.version ?? "1");
  const [estado, setEstado] = useState(tabla?.estado ?? "A");

  const [columnas, setColumnas] = useState<ColumnaLocal[]>([]);
  const [celdas, setCeldas] = useState<CeldaLocal[]>([]);

  const [sel, setSel] = useState<SelRange | null>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedCeldaId, setSelectedCeldaId] = useState<string | null>(null);
  const [formulaOpen, setFormulaOpen] = useState(false);

  const hasTipoEnsayo = !!codigoTipoEnsayo;

  const tipoEnsayoSeleccionado = useMemo(
    () => tiposEnsayo.find((t) => t.codigo_tipo_ensayo === codigoTipoEnsayo),
    [tiposEnsayo, codigoTipoEnsayo]
  );

  const familiaSeleccionada = useMemo(() => {
    const famId = tipoEnsayoSeleccionado?.codigo_familia;
    if (!famId) return null;
    return familias.find((f) => f.codigo_familia === famId) || null;
  }, [familias, tipoEnsayoSeleccionado]);

  const numFilasDiseno = Math.max(
    1,
    Math.max(0, numeroFilasCabecera) + Math.max(0, filasMuestra) + Math.max(0, filasExtra)
  );

  useEffect(() => {
    if (!codigoTipoEnsayo) {
      if (!isEdit) setFilasMuestra(0);
      return;
    }
    const tipo = tiposEnsayo.find((t) => t.codigo_tipo_ensayo === codigoTipoEnsayo);
    const fam = familias.find((f) => f.codigo_familia === tipo?.codigo_familia);
    const n = Number(fam?.probetas_minimas);
    if (Number.isFinite(n) && n > 0) setFilasMuestra(n);
  }, [codigoTipoEnsayo, tiposEnsayo, familias, isEdit]);

  // Sync ejes de columna al cambiar ancho
  useEffect(() => {
    const n = Math.max(1, numeroColumnas);
    setColumnas((prev) => {
      const next: ColumnaLocal[] = [];
      for (let i = 1; i <= n; i++) {
        const existing = prev.find((c) => c.indice === i);
        next.push(
          existing || {
            _localId: genId(),
            indice: i,
            nombre_columna: colLetter(i),
            unidades: "",
            estado: "A",
          }
        );
      }
      return next;
    });
  }, [numeroColumnas]);

  // Asegurar celdas 1x1 en celdas vacías del diseño
  useEffect(() => {
    if (!hasTipoEnsayo) return;
    const rows = numFilasDiseno;
    const cols = Math.max(1, numeroColumnas);
    setCeldas((prev) => {
      const covered = new Set<string>();
      for (const c of prev) {
        for (let r = c.fila; r < c.fila + c.rowspan; r++) {
          for (let col = c.col; col < c.col + c.colspan; col++) {
            if (r === c.fila && col === c.col) continue;
            covered.add(`${r}:${col}`);
          }
        }
      }
      const byPos = new Map(prev.map((c) => [`${c.fila}:${c.col}`, c]));
      const next: CeldaLocal[] = [];
      for (let r = 1; r <= rows; r++) {
        for (let col = 1; col <= cols; col++) {
          const key = `${r}:${col}`;
          if (covered.has(key)) continue;
          const existing = byPos.get(key);
          if (existing) {
            // Recortar merges que se salen del canvas
            next.push({
              ...existing,
              rowspan: Math.min(existing.rowspan, rows - existing.fila + 1),
              colspan: Math.min(existing.colspan, cols - existing.col + 1),
            });
          } else {
            const inHeader = r <= numeroFilasCabecera;
            next.push({
              _localId: genId(),
              fila: r,
              col,
              rowspan: 1,
              colspan: 1,
              tipo_celda: inHeader ? "header" : "input",
              alias: inHeader ? "" : `${colLetter(col)}${r}`,
              campo_obligatorio: false,
              estado: "A",
              formula: null,
            });
          }
        }
      }
      return next;
    });
  }, [numFilasDiseno, numeroColumnas, numeroFilasCabecera, hasTipoEnsayo]);

  // Cargar al editar
  useEffect(() => {
    if (!tabla?.codigo_tabla) {
      baselineRef.current = { columnas: [], celdas: [], formulas: [], deps: [] };
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [colRes, celRes, formRes, depRes] = await Promise.all([
          columnaService.getAll().catch(() => ({ data: [] as Columna[] })),
          celdaService.getAll().catch(() => ({ data: [] as Celda[] })),
          formulaService.getAll().catch(() => ({ data: [] as Formula[] })),
          dependenciasService.getAll().catch(() => ({ data: [] as Dependencias[] })),
        ]);
        if (cancelled) return;
        const allCols = Array.isArray(colRes.data) ? colRes.data : colRes.data ? [colRes.data] : [];
        const allCels = Array.isArray(celRes.data) ? celRes.data : celRes.data ? [celRes.data] : [];
        const allForms = Array.isArray(formRes.data) ? formRes.data : formRes.data ? [formRes.data] : [];
        const allDeps = Array.isArray(depRes.data) ? depRes.data : depRes.data ? [depRes.data] : [];

        const colsTabla = allCols
          .filter((c) => c.codigo_tabla === tabla.codigo_tabla)
          .sort((a, b) => (a.indice || 0) - (b.indice || 0));

        if (colsTabla.length) {
          setNumeroColumnas(Math.max(tabla.numero_columnas || 0, colsTabla.length, 1));
          setColumnas(
            colsTabla.map((c, i) => ({
              _localId: genId(),
              codigo_columna: c.codigo_columna,
              indice: c.indice || i + 1,
              nombre_columna: c.nombre_columna || colLetter(i + 1),
              unidades: c.unidades || "",
              estado: c.estado || "A",
            }))
          );
        }

        const formulasByCelda = new Map<number, Formula>();
        for (const f of allForms) {
          if (f.codigo_celda) formulasByCelda.set(f.codigo_celda, f);
        }

        const celsTabla = allCels.filter(
          (c) => c.codigo_tabla === tabla.codigo_tabla || colsTabla.some((col) => col.codigo_columna === c.codigo_columna)
        );

        let mapped: CeldaLocal[] = [];
        if (celsTabla.length) {
          mapped = celsTabla.map((c) => {
            const fila = c.fila ?? 1;
            const col = c.col ?? 1;
            const f = c.codigo_celda ? formulasByCelda.get(c.codigo_celda) : undefined;
            const expresion = f?.expresion || "";
            const compiled = formulaApi.compile(expresion);
            return {
              _localId: genId(),
              codigo_celda: c.codigo_celda,
              fila,
              col,
              rowspan: Math.max(1, c.rowspan || 1),
              colspan: Math.max(1, c.colspan || 1),
              tipo_celda: (c.tipo_celda as TipoCeldaLocal) || "input",
              alias: c.alias || "",
              campo_obligatorio: !!c.campo_obligatorio,
              estado: c.estado || "A",
              formula: f
                ? {
                    _localId: genId(),
                    codigo_formula: f.codigo_formula,
                    nombre: f.nombre || "",
                    expresion,
                    latex: f.latex || (compiled.ok ? compiled.latex : ""),
                    ambito: f.ambito || "CELDA",
                    estado: f.estado || "A",
                    dependencias_local_ids: [],
                  }
                : null,
            };
          });

          const localByCeldaCodigo = new Map<number, string>();
          for (const c of mapped) {
            if (c.codigo_celda) localByCeldaCodigo.set(c.codigo_celda, c._localId);
          }
          const formulaCodes = new Set(
            mapped
              .map((c) => c.formula?.codigo_formula)
              .filter((id): id is number => typeof id === "number" && id > 0)
          );
          const depsTabla = allDeps.filter(
            (d) => d.codigo_formula != null && formulaCodes.has(d.codigo_formula)
          );
          mapped = mapped.map((c) => {
            if (!c.formula?.codigo_formula) return c;
            const depLocals = depsTabla
              .filter((d) => d.codigo_formula === c.formula!.codigo_formula)
              .map((d) => (d.codigo_celda ? localByCeldaCodigo.get(d.codigo_celda) : undefined))
              .filter((id): id is string => !!id);
            return {
              ...c,
              formula: { ...c.formula, dependencias_local_ids: depLocals },
            };
          });
          setCeldas(mapped);

          baselineRef.current = {
            columnas: colsTabla
              .map((c) => c.codigo_columna)
              .filter((id): id is number => typeof id === "number" && id > 0),
            celdas: celsTabla
              .map((c) => c.codigo_celda)
              .filter((id): id is number => typeof id === "number" && id > 0),
            formulas: [...formulaCodes],
            deps: depsTabla,
          };
        } else {
          baselineRef.current = {
            columnas: colsTabla
              .map((c) => c.codigo_columna)
              .filter((id): id is number => typeof id === "number" && id > 0),
            celdas: [],
            formulas: [],
            deps: [],
          };
        }

        if (tabla.filas_muestra) setFilasMuestra(tabla.filas_muestra);
        if (tabla.version) setVersion(tabla.version);

        // Recuperar cabecera / extras a partir del alto guardado y tipos de celda
        const maxFila = celsTabla.reduce(
          (m, c) => Math.max(m, (c.fila || 1) + Math.max(1, c.rowspan || 1) - 1),
          tabla.numero_filas_diseno || 0
        );
        const muestra = tabla.filas_muestra || 0;
        let cab = 1;
        if (celsTabla.length) {
          let r = 1;
          while (r <= maxFila) {
            const rowCells = celsTabla.filter((c) => (c.fila || 0) === r);
            const allHeader =
              rowCells.length > 0 && rowCells.every((c) => c.tipo_celda === "header");
            if (!allHeader) break;
            cab = r;
            r += 1;
          }
          if (r === 1) cab = 0;
        }
        setNumeroFilasCabecera(cab);
        setFilasExtra(Math.max(0, maxFila - cab - muestra));
      } catch {
        /* API puede no existir aún */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tabla?.codigo_tabla]);

  const cellAt = (fila: number, col: number) =>
    celdas.find((c) => c.fila === fila && c.col === col);

  const coverOwner = (fila: number, col: number) =>
    celdas.find(
      (c) =>
        fila >= c.fila &&
        fila < c.fila + c.rowspan &&
        col >= c.col &&
        col < c.col + c.colspan
    );

  const selectedCelda = celdas.find((c) => c._localId === selectedCeldaId) || null;
  const normSel = sel ? normalizeRange(sel) : null;

  const beginSelect = (r: number, c: number) => {
    setDragging(true);
    setSel({ r1: r, c1: c, r2: r, c2: c });
    const owner = coverOwner(r, c);
    setSelectedCeldaId(owner?._localId || null);
  };

  const extendSelect = (r: number, c: number) => {
    if (!dragging || !sel) return;
    setSel({ ...sel, r2: r, c2: c });
  };

  const endSelect = () => setDragging(false);

  const updateCelda = (localId: string, patch: Partial<CeldaLocal>) => {
    setCeldas((prev) => prev.map((c) => (c._localId === localId ? { ...c, ...patch } : c)));
  };

  const mergeSelection = () => {
    if (!normSel || !hasTipoEnsayo) return;
    const { r1, c1, r2, c2 } = normSel;
    const rowspan = r2 - r1 + 1;
    const colspan = c2 - c1 + 1;
    if (rowspan === 1 && colspan === 1) return;

    setCeldas((prev) => {
      const survivors = prev.filter(
        (c) => c.fila < r1 || c.fila > r2 || c.col < c1 || c.col > c2
      );
      const anchor =
        prev.find((c) => c.fila === r1 && c.col === c1) ||
        ({
          _localId: genId(),
          fila: r1,
          col: c1,
          tipo_celda: r1 <= numeroFilasCabecera ? "header" : "input",
          alias: "",
          campo_obligatorio: false,
          estado: "A",
          formula: null,
        } as CeldaLocal);

      survivors.push({
        ...anchor,
        fila: r1,
        col: c1,
        rowspan,
        colspan,
      });
      return survivors;
    });
    toast({ title: "Celdas combinadas", description: `${rowspan}×${colspan}` });
  };

  const unmergeSelected = () => {
    if (!selectedCelda) return;
    if (selectedCelda.rowspan === 1 && selectedCelda.colspan === 1) return;
    const { fila, col, rowspan, colspan, tipo_celda } = selectedCelda;
    setCeldas((prev) => {
      const rest = prev.filter((c) => c._localId !== selectedCelda._localId);
      const added: CeldaLocal[] = [];
      for (let r = fila; r < fila + rowspan; r++) {
        for (let c = col; c < col + colspan; c++) {
          added.push({
            _localId: r === fila && c === col ? selectedCelda._localId : genId(),
            codigo_celda: r === fila && c === col ? selectedCelda.codigo_celda : undefined,
            fila: r,
            col: c,
            rowspan: 1,
            colspan: 1,
            tipo_celda: r === fila && c === col ? selectedCelda.tipo_celda : tipo_celda,
            alias: r === fila && c === col ? selectedCelda.alias : `${colLetter(c)}${r}`,
            campo_obligatorio: false,
            estado: "A",
            formula: r === fila && c === col ? selectedCelda.formula : null,
          });
        }
      }
      return [...rest, ...added];
    });
    toast({ title: "Celdas separadas" });
  };

  /**
   * División vertical tipo Excel: parte la celda en N subceldas apiladas
   * e inserta filas; las columnas vecinas ganan rowspan.
   */
  const splitVertical = (parts: number) => {
    if (!selectedCelda || !hasTipoEnsayo) return;
    const n = Math.min(12, Math.max(2, Math.floor(parts)));
    if (selectedCelda.colspan !== 1) {
      toast({
        title: "No se puede dividir",
        description: "Separa primero la fusión horizontal (colspan).",
        variant: "destructive",
      });
      return;
    }

    const cel = selectedCelda;
    const start = cel.fila;
    const height = Math.max(1, cel.rowspan);
    const insertCount = Math.max(0, n - height);

    setCeldas((prev) => {
      let working = prev.map((c) => ({ ...c }));

      if (insertCount > 0) {
        const insertAfter = start + height - 1;
        working = working.map((c) => {
          if (c._localId === cel._localId) return c;
          if (c.fila > insertAfter) {
            return { ...c, fila: c.fila + insertCount };
          }
          // Vecino que cubre exactamente el bloque actual → ampliar
          if (
            c.col !== cel.col &&
            c.fila === start &&
            c.rowspan === height
          ) {
            return { ...c, rowspan: height + insertCount };
          }
          // Vecino de 1 fila en la misma fila de inicio
          if (c.col !== cel.col && c.fila === start && c.rowspan === 1 && height === 1) {
            return { ...c, rowspan: n };
          }
          // Celda que atraviesa el punto de inserción
          if (
            c.fila <= insertAfter &&
            c.fila + c.rowspan - 1 > insertAfter &&
            c.col !== cel.col
          ) {
            return { ...c, rowspan: c.rowspan + insertCount };
          }
          return c;
        });
      } else if (n < height) {
        // Reducir: repartir el bloque existente en n subceldas (sin quitar filas de grilla aquí)
        // Las filas sobrantes quedan para unir manualmente / Separar vecinos.
      }

      // Quitar la celda original y cualquier celda de esta columna dentro del nuevo bloque
      const blockEnd = start + Math.max(height, n) - 1;
      working = working.filter(
        (c) =>
          !(
            c.col >= cel.col &&
            c.col < cel.col + cel.colspan &&
            c.fila >= start &&
            c.fila <= blockEnd
          )
      );

      const baseAlias = cel.alias.replace(/_\d+$/, "") || `${colLetter(cel.col)}${start}`;
      const newCells: CeldaLocal[] = [];
      for (let i = 0; i < n; i++) {
        newCells.push({
          _localId: i === 0 ? cel._localId : genId(),
          codigo_celda: i === 0 ? cel.codigo_celda : undefined,
          fila: start + i,
          col: cel.col,
          rowspan: 1,
          colspan: 1,
          tipo_celda: cel.tipo_celda === "header" ? "header" : cel.tipo_celda,
          alias: n > 1 ? `${baseAlias}_${i + 1}` : baseAlias,
          campo_obligatorio: cel.campo_obligatorio,
          estado: cel.estado,
          formula: i === 0 ? cel.formula : null,
        });
      }

      // Asegurar vecinos con rowspan = n si height era 1 e insertamos
      if (height === 1 && insertCount > 0) {
        working = working.map((c) => {
          if (c.col === cel.col) return c;
          if (c.fila === start && c.rowspan < n) {
            // solo si no empieza más abajo
            return { ...c, rowspan: Math.max(c.rowspan, n) };
          }
          return c;
        });
      }

      return [...working, ...newCells];
    });

    if (insertCount > 0) {
      setFilasExtra((e) => e + insertCount);
    }
    setSelectedCeldaId(cel._localId);
    toast({
      title: "División vertical",
      description: `Celda partida en ${n} subceldas apiladas.`,
    });
  };

  /** Une subceldas verticales consecutivas de la columna seleccionada en una sola. */
  const joinVerticalStack = () => {
    if (!selectedCelda || selectedCelda.colspan !== 1) return;
    const col = selectedCelda.col;
    const start = selectedCelda.fila;

    const stack = celdas
      .filter((c) => c.col === col && c.colspan === 1 && c.rowspan === 1 && c.fila >= start)
      .sort((a, b) => a.fila - b.fila);

    const consecutive: CeldaLocal[] = [];
    let expect = start;
    for (const c of stack) {
      if (c.fila !== expect) break;
      consecutive.push(c);
      expect += 1;
    }
    if (consecutive.length < 2) {
      toast({
        title: "Nada que unir",
        description: "Selecciona la primera subcelda de una pila vertical.",
        variant: "destructive",
      });
      return;
    }

    const n = consecutive.length;
    const ids = new Set(consecutive.map((c) => c._localId));
    const first = consecutive[0];
    const rowsToDrop = Array.from({ length: n - 1 }, (_, i) => start + 1 + i);

    setCeldas((prev) => {
      let working = prev.filter((c) => !ids.has(c._localId));
      working.push({
        ...first,
        rowspan: 1,
        alias: first.alias.replace(/_\d+$/, "") || first.alias,
      });

      working = working.map((c) => {
        if (c.col === col) return c;
        if (c.fila === start && c.rowspan === n) {
          return { ...c, rowspan: 1 };
        }
        return c;
      });

      const canDrop = rowsToDrop.every((r) => !working.some((c) => c.fila === r));
      if (canDrop) {
        working = working.map((c) => {
          const shift = rowsToDrop.filter((r) => r < c.fila).length;
          return shift ? { ...c, fila: c.fila - shift } : c;
        });
      }
      return working;
    });

    setFilasExtra((e) => Math.max(0, e - (n - 1)));
    setSelectedCeldaId(first._localId);
    toast({ title: "Subceldas unidas", description: `${n} → 1` });
  };

  const openFormula = (cel: CeldaLocal) => {
    setSelectedCeldaId(cel._localId);
    if (!cel.formula) {
      updateCelda(cel._localId, {
        tipo_celda: "calculated",
        formula: {
          _localId: genId(),
          nombre: cel.alias || `Fórmula ${colLetter(cel.col)}${cel.fila}`,
          expresion: "",
          latex: "",
          ambito: "CELDA",
          estado: "A",
          dependencias_local_ids: [],
        },
      });
    }
    setFormulaOpen(true);
  };

  const updateFormula = (patch: Partial<FormulaLocal>) => {
    if (!selectedCelda?.formula) return;
    const next = { ...selectedCelda.formula, ...patch };
    if (patch.expresion !== undefined) {
      const compiled = formulaApi.compile(patch.expresion);
      next.latex = compiled.ok ? compiled.latex : "";
    }
    updateCelda(selectedCelda._localId, { formula: next, tipo_celda: "calculated" });
  };

  const insertRef = (refCel: CeldaLocal) => {
    if (!selectedCelda?.formula) return;
    const token = refCel.alias || `${colLetter(refCel.col)}${refCel.fila}`;
    const cur = selectedCelda.formula.expresion.trim();
    const expresion = cur
      ? `${cur}${/[+\-*/^(,]$/.test(cur) ? "" : "+"}${token}`
      : token;
    const deps = selectedCelda.formula.dependencias_local_ids.includes(refCel._localId)
      ? selectedCelda.formula.dependencias_local_ids
      : [...selectedCelda.formula.dependencias_local_ids, refCel._localId];
    const compiled = formulaApi.compile(expresion);
    updateCelda(selectedCelda._localId, {
      formula: {
        ...selectedCelda.formula,
        expresion,
        latex: compiled.ok ? compiled.latex : "",
        dependencias_local_ids: deps,
      },
    });
  };

  /** Inserta un atajo de función; si hay refs ya marcadas, las pone como argumentos. */
  const insertFunctionShortcut = (fnInsert: string, fnName: SupportedFunction) => {
    if (!selectedCelda?.formula) return;
    const deps = selectedCelda.formula.dependencias_local_ids
      .map((id) => celdas.find((c) => c._localId === id))
      .filter(Boolean) as CeldaLocal[];
    const tokens = deps.map((c) => c.alias || `${colLetter(c.col)}${c.fila}`);
    let chunk: string;
    if (fnName === "sqrt") {
      chunk = tokens.length >= 1 ? `sqrt(${tokens[0]})` : "sqrt(";
    } else if (tokens.length > 0) {
      chunk = `${fnName}(${tokens.join(",")})`;
    } else {
      chunk = fnInsert;
    }
    const cur = selectedCelda.formula.expresion.trim();
    const expresion = cur
      ? `${cur}${/[+\-*/^(,]$/.test(cur) ? "" : "+"}${chunk}`
      : chunk;
    const compiled = formulaApi.compile(expresion);
    updateCelda(selectedCelda._localId, {
      formula: {
        ...selectedCelda.formula,
        expresion,
        latex: compiled.ok ? compiled.latex : selectedCelda.formula.latex,
      },
    });
  };

  const onSave = async () => {
    if (!nombreTabla.trim()) {
      toast({ title: "Falta el nombre", variant: "destructive" });
      return;
    }
    if (!codigoTipoEnsayo) {
      toast({ title: "Selecciona un tipo de ensayo", variant: "destructive" });
      return;
    }
    if (filasMuestra < 1) {
      toast({
        title: "Sin filas de muestra",
        description: "La familia del tipo no tiene probetas mínimas.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const baseline = baselineRef.current;
      const keepColIds = new Set(
        columnas
          .map((c) => c.codigo_columna)
          .filter((id): id is number => typeof id === "number" && id > 0)
      );
      const keepCelIds = new Set(
        celdas
          .map((c) => c.codigo_celda)
          .filter((id): id is number => typeof id === "number" && id > 0)
      );
      const keepFormulaIds = new Set(
        celdas
          .map((c) =>
            c.formula?.expresion.trim() ? c.formula.codigo_formula : undefined
          )
          .filter((id): id is number => typeof id === "number" && id > 0)
      );

      const formulasToDelete = baseline.formulas.filter((id) => !keepFormulaIds.has(id));
      const celdasToDelete = baseline.celdas.filter((id) => !keepCelIds.has(id));
      const columnasToDelete = baseline.columnas.filter((id) => !keepColIds.has(id));

      // 1) Quitar dependencias de fórmulas eliminadas o que se van a reescribir
      const formulaIdsTouchDeps = new Set<number>([
        ...baseline.formulas,
        ...keepFormulaIds,
      ]);
      let serverDeps: Dependencias[] = baseline.deps;
      try {
        const depRes = await dependenciasService.getAll();
        const raw = Array.isArray(depRes.data) ? depRes.data : depRes.data ? [depRes.data] : [];
        serverDeps = raw.filter(
          (d) => d.codigo_formula != null && formulaIdsTouchDeps.has(d.codigo_formula)
        );
      } catch {
        /* usar baseline */
      }
      for (const dep of serverDeps) {
        if (dep.codigo_dependencia) {
          await silentDelete(() => dependenciasService.delete(dep.codigo_dependencia));
        }
      }

      // 2) Fórmulas quitadas (celda borrada, expresión vacía o tipo ya no calculated)
      for (const id of formulasToDelete) {
        await silentDelete(() => formulaService.delete(id));
      }

      // 3) Celdas / columnas fuera del diseño actual
      for (const id of celdasToDelete) {
        await silentDelete(() => celdaService.delete(id));
      }
      for (const id of columnasToDelete) {
        await silentDelete(() => columnaService.delete(id));
      }

      // 4) Upsert cabecera + columnas + celdas + fórmulas
      const tablaSaved = await tablaService.save({
        codigo_tabla: tabla?.codigo_tabla || 0,
        codigo_tipo_ensayo: codigoTipoEnsayo,
        nombre_tabla: nombreTabla.trim(),
        filas_muestra: filasMuestra,
        numero_columnas: numeroColumnas,
        numero_filas_diseno: numFilasDiseno,
        version,
        estado,
      });
      const codigoTabla = (tablaSaved.data as Tabla)?.codigo_tabla || tabla?.codigo_tabla;
      if (!codigoTabla) throw new Error("No se obtuvo codigo_tabla.");

      const colIdByIndice = new Map<number, number>();
      const savedColIds: number[] = [];
      for (const col of columnas) {
        const saved = await columnaService.save({
          codigo_columna: col.codigo_columna || 0,
          codigo_tabla: codigoTabla,
          indice: col.indice,
          nombre_columna: col.nombre_columna,
          unidades: col.unidades,
          estado: col.estado,
        });
        const codigo = (saved.data as Columna)?.codigo_columna || col.codigo_columna;
        if (codigo) {
          colIdByIndice.set(col.indice, codigo);
          savedColIds.push(codigo);
        }
      }

      const celdaIdByLocal = new Map<string, number>();
      const savedCelIds: number[] = [];
      for (const cel of celdas) {
        const codigoColumna = colIdByIndice.get(cel.col);
        const saved = await celdaService.save({
          codigo_celda: cel.codigo_celda || 0,
          codigo_tabla: codigoTabla,
          codigo_columna: codigoColumna,
          fila: cel.fila,
          col: cel.col,
          rowspan: cel.rowspan,
          colspan: cel.colspan,
          tipo_celda: cel.tipo_celda,
          alias: cel.alias,
          campo_obligatorio: cel.campo_obligatorio,
          estado: cel.estado,
        });
        const codigoCelda = (saved.data as Celda)?.codigo_celda || cel.codigo_celda;
        if (codigoCelda) {
          celdaIdByLocal.set(cel._localId, codigoCelda);
          savedCelIds.push(codigoCelda);
        }
      }

      const savedFormulaIds: number[] = [];
      const savedDeps: Dependencias[] = [];
      for (const cel of celdas) {
        const codigoCelda = celdaIdByLocal.get(cel._localId);
        if (!cel.formula?.expresion.trim() || !codigoCelda) continue;
        const compiled = formulaApi.compile(cel.formula.expresion);
        const fSaved = await formulaService.save({
          codigo_formula: cel.formula.codigo_formula || 0,
          codigo_celda: codigoCelda,
          nombre: cel.formula.nombre || cel.alias || `Fórmula ${codigoCelda}`,
          expresion: cel.formula.expresion,
          latex: compiled.ok ? compiled.latex : cel.formula.latex,
          ambito: cel.formula.ambito || "CELDA",
          estado: cel.formula.estado,
        });
        const codigoFormula =
          (fSaved.data as Formula)?.codigo_formula || cel.formula.codigo_formula;
        if (!codigoFormula) continue;
        savedFormulaIds.push(codigoFormula);

        for (const depLocal of cel.formula.dependencias_local_ids) {
          const depCodigo = celdaIdByLocal.get(depLocal);
          if (!depCodigo) continue;
          const dSaved = await dependenciasService.save({
            codigo_dependencia: 0,
            codigo_formula: codigoFormula,
            codigo_celda: depCodigo,
            estado: "A",
          });
          const dep = dSaved.data as Dependencias | undefined;
          if (dep?.codigo_dependencia) savedDeps.push(dep);
        }
      }

      baselineRef.current = {
        columnas: savedColIds,
        celdas: savedCelIds,
        formulas: savedFormulaIds,
        deps: savedDeps,
      };

      toast({
        title: "Guardado",
        description: isEdit
          ? `Cambios aplicados (altas/bajas/ediciones) en "${nombreTabla}".`
          : `Tabla "${nombreTabla}" creada.`,
      });
      onSuccess();
    } catch (error) {
      toast({
        title: "Error al guardar",
        description:
          error instanceof Error
            ? error.message
            : "El backend puede no tener aún los nuevos campos. La grilla quedó lista en front.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const formulaCelda = selectedCelda?.formula
    ? selectedCelda
    : null;

  return (
    <div className="flex flex-col gap-3" onMouseUp={endSelect} onMouseLeave={endSelect}>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">
                {isEdit ? "Editar tabla" : "Nueva tabla"}
              </CardTitle>
              <CardDescription>
                Grilla tipo Excel: selecciona un rango y combina celdas. Fórmulas con vista LaTeX.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
                <X className="mr-2 h-4 w-4" />
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={onSave}
                disabled={isSaving}
                variant={isEdit ? "destructive" : "default"}
                className={isEdit ? "bg-red-600 hover:bg-red-700 text-white" : undefined}
              >
                <Save className="mr-2 h-4 w-4" />
                {isSaving
                  ? isEdit
                    ? "Actualizando..."
                    : "Guardando..."
                  : isEdit
                    ? "Actualizar"
                    : "Guardar"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Nombre</Label>
            <Input
              value={nombreTabla}
              onChange={(e) => setNombreTabla(e.target.value)}
              placeholder="Ej: Dimensiones iniciales"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tipo de ensayo *</Label>
            <Select
              value={codigoTipoEnsayo ? String(codigoTipoEnsayo) : undefined}
              onValueChange={(v) => setCodigoTipoEnsayo(Number(v))}
            >
              <SelectTrigger className={!hasTipoEnsayo ? "border-amber-400" : undefined}>
                <SelectValue placeholder="Selecciona primero" />
              </SelectTrigger>
              <SelectContent>
                {tiposEnsayo.map((t) => (
                  <SelectItem key={t.codigo_tipo_ensayo} value={String(t.codigo_tipo_ensayo)}>
                    {t.nombre_tipo_ensayo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Filas muestra</Label>
            <Input type="number" value={filasMuestra} readOnly disabled />
            <p className="text-[10px] text-muted-foreground">
              {familiaSeleccionada
                ? `${familiaSeleccionada.nombre_familia}: ${familiaSeleccionada.probetas_minimas ?? 0} probetas`
                : "Según familia del tipo"}
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Columnas</Label>
            <div className="flex gap-1">
              <Button
                type="button"
                size="icon"
                variant="outline"
                disabled={!hasTipoEnsayo || numeroColumnas <= 1}
                onClick={() => setNumeroColumnas((n) => Math.max(1, n - 1))}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input className="text-center" type="number" value={numeroColumnas} readOnly />
              <Button
                type="button"
                size="icon"
                variant="outline"
                disabled={!hasTipoEnsayo}
                onClick={() => setNumeroColumnas((n) => Math.min(40, n + 1))}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Filas cabecera</Label>
            <div className="flex gap-1">
              <Button
                type="button"
                size="icon"
                variant="outline"
                disabled={!hasTipoEnsayo || numeroFilasCabecera <= 0}
                onClick={() => setNumeroFilasCabecera((n) => Math.max(0, n - 1))}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input className="text-center" type="number" value={numeroFilasCabecera} readOnly />
              <Button
                type="button"
                size="icon"
                variant="outline"
                disabled={!hasTipoEnsayo}
                onClick={() => setNumeroFilasCabecera((n) => Math.min(10, n + 1))}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Estado</Label>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A">Activo</SelectItem>
                <SelectItem value="I">Inactivo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-3">
        <Card>
          <CardHeader className="py-3 flex flex-row items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-sm font-medium flex-wrap">
              Vista grilla
              <Badge variant="outline">
                {numFilasDiseno} × {numeroColumnas}
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!hasTipoEnsayo || !normSel}
                onClick={mergeSelection}
              >
                <Merge className="mr-1 h-4 w-4" />
                Combinar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!selectedCelda || (selectedCelda.rowspan === 1 && selectedCelda.colspan === 1)}
                onClick={unmergeSelected}
              >
                <SplitSquareHorizontal className="mr-1 h-4 w-4" />
                Separar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {!hasTipoEnsayo ? (
              <div className="border-2 border-dashed border-amber-300 rounded-lg py-16 text-center bg-amber-50/40 text-amber-950">
                <p className="font-medium">Selecciona un tipo de ensayo</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Las filas de muestra salen de las probetas de su familia.
                </p>
              </div>
            ) : (
              <div className="overflow-auto border rounded-md bg-white select-none">
                <table className="border-collapse text-sm min-w-full">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 bg-slate-100 border px-2 py-1 w-10" />
                      {columnas.map((col) => (
                        <th
                          key={col._localId}
                          className="border px-1 py-1 bg-slate-100 min-w-[88px] font-medium"
                        >
                          <input
                            className="w-full bg-transparent text-center outline-none text-xs font-semibold"
                            value={col.nombre_columna}
                            onChange={(e) =>
                              setColumnas((prev) =>
                                prev.map((c) =>
                                  c._localId === col._localId
                                    ? { ...c, nombre_columna: e.target.value }
                                    : c
                                )
                              )
                            }
                          />
                          <input
                            className="w-full bg-transparent text-center outline-none text-[10px] text-muted-foreground"
                            placeholder="unidad"
                            value={col.unidades}
                            onChange={(e) =>
                              setColumnas((prev) =>
                                prev.map((c) =>
                                  c._localId === col._localId
                                    ? { ...c, unidades: e.target.value }
                                    : c
                                )
                              )
                            }
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: numFilasDiseno }, (_, i) => i + 1).map((r) => (
                      <tr key={r}>
                        <td className="sticky left-0 z-10 border px-2 py-1 bg-slate-50 text-center text-xs font-medium">
                          {r}
                          {numeroFilasCabecera > 0 && r === numeroFilasCabecera && (
                            <span className="block text-[9px] text-muted-foreground">cabecera</span>
                          )}
                          {filasMuestra > 0 && r === numeroFilasCabecera + 1 && (
                            <span className="block text-[9px] text-muted-foreground">muestras ↓</span>
                          )}
                        </td>
                        {Array.from({ length: numeroColumnas }, (_, j) => j + 1).map((c) => {
                          const owner = coverOwner(r, c);
                          if (owner && (owner.fila !== r || owner.col !== c)) return null;
                          const cel = owner || cellAt(r, c);
                          if (!cel) return <td key={c} className="border" />;
                          const inSel =
                            !!normSel &&
                            cel.fila <= normSel.r2 &&
                            cel.fila + cel.rowspan - 1 >= normSel.r1 &&
                            cel.col <= normSel.c2 &&
                            cel.col + cel.colspan - 1 >= normSel.c1;
                          const isSelected = selectedCeldaId === cel._localId;
                          return (
                            <td
                              key={`${cel._localId}`}
                              rowSpan={cel.rowspan}
                              colSpan={cel.colspan}
                              className={cn(
                                "border p-0.5 align-middle cursor-cell min-w-[88px] h-10",
                                TIPO_COLORS[cel.tipo_celda] || "bg-white",
                                inSel && "ring-2 ring-inset ring-primary/60",
                                isSelected && "ring-2 ring-inset ring-primary"
                              )}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                beginSelect(r, c);
                              }}
                              onMouseEnter={() => extendSelect(r, c)}
                              onDoubleClick={() => openFormula(cel)}
                            >
                              <div className="px-1 py-1 text-center text-xs min-h-[36px] flex flex-col items-center justify-center gap-0.5">
                                {cel.tipo_celda === "calculated" && cel.formula?.expresion ? (
                                  <>
                                    <Calculator className="h-3 w-3 text-blue-600" />
                                    <span className="truncate max-w-[100px] text-blue-800 font-mono text-[10px]">
                                      {cel.formula.expresion}
                                    </span>
                                  </>
                                ) : cel.alias ? (
                                  <span className={cn(
                                    cel.tipo_celda === "header" || cel.tipo_celda === "label"
                                      ? "font-medium"
                                      : "text-muted-foreground opacity-60"
                                  )}>
                                    {cel.alias}
                                  </span>
                                ) : (
                                  <span className="opacity-20">—</span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Arrastra · Combinar/Separar · En propiedades: ÷2/÷3 subceldas verticales · Doble clic =
              fórmula
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Propiedades</CardTitle>
            <CardDescription className="text-xs">
              {selectedCelda
                ? `${colLetter(selectedCelda.col)}${selectedCelda.fila}${
                    selectedCelda.rowspan > 1 || selectedCelda.colspan > 1
                      ? ` · ${selectedCelda.rowspan}×${selectedCelda.colspan}`
                      : ""
                  }`
                : "Selecciona una celda"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedCelda ? (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Tipo de celda</Label>
                  <Select
                    value={selectedCelda.tipo_celda}
                    onValueChange={(v) =>
                      updateCelda(selectedCelda._localId, {
                        tipo_celda: v as TipoCeldaLocal,
                        ...(v !== "calculated" ? { formula: null } : {}),
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="header">Cabecera</SelectItem>
                      <SelectItem value="label">Etiqueta</SelectItem>
                      <SelectItem value="input">Entrada</SelectItem>
                      <SelectItem value="calculated">Calculada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Alias / etiqueta</Label>
                  <Input
                    value={selectedCelda.alias}
                    onChange={(e) =>
                      updateCelda(selectedCelda._localId, {
                        alias: e.target.value.replace(/\s+/g, "_"),
                      })
                    }
                    placeholder="Med1 o título de cabecera"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/50 p-3">
                  <Label className="text-xs flex items-center gap-1 font-semibold">
                    <SplitSquareVertical className="h-3.5 w-3.5" />
                    Subceldas verticales (Excel)
                  </Label>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Parte esta celda en subceldas apiladas. Las columnas vecinas ocupan toda la
                    altura (rowspan).
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={selectedCelda.colspan !== 1}
                      onClick={() => splitVertical(2)}
                    >
                      ÷ 2
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700"
                      disabled={selectedCelda.colspan !== 1}
                      onClick={() => splitVertical(3)}
                    >
                      ÷ 3
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={selectedCelda.colspan !== 1}
                      onClick={() => splitVertical(4)}
                    >
                      ÷ 4
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={joinVerticalStack}
                    >
                      Unir pila
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="obl"
                    type="checkbox"
                    checked={selectedCelda.campo_obligatorio}
                    onChange={(e) =>
                      updateCelda(selectedCelda._localId, {
                        campo_obligatorio: e.target.checked,
                      })
                    }
                  />
                  <Label htmlFor="obl" className="text-xs">
                    Campo obligatorio
                  </Label>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="w-full"
                  variant="secondary"
                  onClick={() => openFormula(selectedCelda)}
                >
                  <Calculator className="mr-1 h-4 w-4" />
                  Fórmula / LaTeX
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {!hasTipoEnsayo
                  ? "Elige un tipo de ensayo para diseñar la grilla."
                  : "Haz clic en una celda o arrastra un rango para combinar."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={formulaOpen} onOpenChange={setFormulaOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-5xl max-h-[90vh] overflow-y-auto border-[#c4a8e0] p-0 gap-0">
          <DialogHeader className="bg-[#5b2d8e] text-white px-6 py-4 rounded-t-lg space-y-1">
            <DialogTitle className="text-white">
              Editor de fórmula
              {formulaCelda
                ? ` — ${formulaCelda.alias || `${colLetter(formulaCelda.col)}${formulaCelda.fila}`}`
                : ""}
            </DialogTitle>
            <p className="text-sm text-white/80">
              Entrada matemática · minimotor Excel · clic en la tabla para insertar alias
            </p>
          </DialogHeader>
          {formulaCelda?.formula && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-6">
              {/* Vista solo lectura de la grilla */}
              <div className="space-y-2 min-w-0">
                <Label className="text-xs uppercase tracking-wide text-[#5b2d8e]">
                  Tabla en modo vista
                </Label>
                <div className="overflow-auto border border-[#c4a8e0] rounded-md bg-white max-h-[55vh]">
                  <table className="border-collapse text-xs min-w-full">
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-10 bg-[#f7f4fb] border px-1.5 py-1 w-8" />
                        {columnas.map((col) => (
                          <th
                            key={col._localId}
                            className="border px-1 py-1 bg-[#f7f4fb] min-w-[64px] font-medium"
                          >
                            {col.nombre_columna}
                            {col.unidades ? (
                              <span className="block text-[9px] font-normal text-muted-foreground">
                                {col.unidades}
                              </span>
                            ) : null}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: numFilasDiseno }, (_, i) => i + 1).map((r) => (
                        <tr key={r}>
                          <td className="sticky left-0 z-10 border px-1.5 py-0.5 bg-slate-50 text-center text-[10px] font-medium">
                            {r}
                          </td>
                          {Array.from({ length: numeroColumnas }, (_, j) => j + 1).map((c) => {
                            const owner = coverOwner(r, c);
                            if (owner && (owner.fila !== r || owner.col !== c)) return null;
                            const cel = owner || cellAt(r, c);
                            if (!cel) return <td key={c} className="border" />;
                            const token = cel.alias || `${colLetter(cel.col)}${cel.fila}`;
                            const isTarget = cel._localId === formulaCelda._localId;
                            const isDep = formulaCelda.formula!.dependencias_local_ids.includes(
                              cel._localId
                            );
                            const clickable = !isTarget;
                            return (
                              <td
                                key={cel._localId}
                                rowSpan={cel.rowspan}
                                colSpan={cel.colspan}
                                title={
                                  isTarget
                                    ? "Celda de esta fórmula"
                                    : `Clic para insertar ${token}`
                                }
                                className={cn(
                                  "border p-0.5 text-center align-middle min-w-[64px]",
                                  TIPO_COLORS[cel.tipo_celda] || "bg-white",
                                  isTarget && "ring-2 ring-inset ring-violet-600 bg-violet-50",
                                  isDep && !isTarget && "ring-2 ring-inset ring-emerald-500",
                                  clickable && "cursor-pointer hover:ring-2 hover:ring-inset hover:ring-primary/50"
                                )}
                                onClick={() => {
                                  if (clickable) insertRef(cel);
                                }}
                              >
                                <div className="px-0.5 py-1 min-h-[28px] flex flex-col items-center justify-center gap-0.5">
                                  {isTarget ? (
                                    <span className="text-[9px] font-semibold text-violet-700">
                                      ƒx
                                    </span>
                                  ) : null}
                                  {cel.tipo_celda === "calculated" && cel.formula?.expresion && !isTarget ? (
                                    <Calculator className="h-3 w-3 text-blue-600" />
                                  ) : null}
                                  <span
                                    className={cn(
                                      "truncate max-w-[72px] font-mono text-[10px]",
                                      cel.tipo_celda === "header" || cel.tipo_celda === "label"
                                        ? "font-semibold font-sans"
                                        : "text-muted-foreground"
                                    )}
                                  >
                                    {cel.tipo_celda === "header" || cel.tipo_celda === "label"
                                      ? cel.alias || "—"
                                      : token}
                                  </span>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Violeta = celda calculada actual · Verde = ya referenciada · Clic = insertar alias
                </p>
              </div>

              <FormulaWolframEditor
                nombre={formulaCelda.formula.nombre}
                expresion={formulaCelda.formula.expresion}
                depTokens={formulaCelda.formula.dependencias_local_ids
                  .map((id) => {
                    const c = celdas.find((x) => x._localId === id);
                    return c ? c.alias || `${colLetter(c.col)}${c.fila}` : "";
                  })
                  .filter(Boolean)}
                onNombreChange={(nombre) => updateFormula({ nombre })}
                onExpresionChange={(expresion) => updateFormula({ expresion })}
                onInsertFunction={insertFunctionShortcut}
              />

              <div className="lg:col-span-2 space-y-1.5 -mt-1">
                <Label className="text-xs text-[#5b2d8e]">Referencias usadas</Label>
                <div className="flex flex-wrap gap-1">
                  {formulaCelda.formula.dependencias_local_ids.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Ninguna aún</span>
                  ) : (
                    formulaCelda.formula.dependencias_local_ids.map((id) => {
                      const c = celdas.find((x) => x._localId === id);
                      if (!c) return null;
                      const token = c.alias || `${colLetter(c.col)}${c.fila}`;
                      return (
                        <Badge key={id} variant="secondary" className="font-mono text-[10px]">
                          {token}
                        </Badge>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="px-6 py-4 border-t bg-[#f7f4fb]">
            <Button
              type="button"
              className="bg-[#5b2d8e] hover:bg-[#3d1f66]"
              onClick={() => setFormulaOpen(false)}
            >
              Listo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
