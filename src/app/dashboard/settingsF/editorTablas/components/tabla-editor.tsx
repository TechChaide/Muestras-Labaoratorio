"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
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
  Save, X, Merge, SplitSquareHorizontal, SplitSquareVertical, Plus, Minus, Copy, ClipboardPaste,
  GripVertical, ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
} from "lucide-react";
import type {
  Tabla, TipoEnsayo, Columna, Celda, TipoCelda, Formulario, FormularioTabla,
} from "@/types/interfaces";
import { tablaService } from "@/services/muestrasLaboratorio/tabla.service";
import { columnaService } from "@/services/muestrasLaboratorio/columna.service";
import { celdaService } from "@/services/muestrasLaboratorio/celda.service";
import { formularioService } from "@/services/muestrasLaboratorio/formulario.service";
import { formularioTablaService } from "@/services/muestrasLaboratorio/formularioTabla.service";
import { purgeOrphanFormulasForTable } from "@/lib/formula/formula-persistence";
import {
  bumpVersion,
  findFormulariosUsingTabla,
  type FormularioAfectado,
} from "@/lib/tabla-version";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

const genId = () => Math.random().toString(36).slice(2, 10);

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  if (raw.trim() === "") return fallback;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Opciones de tipo_tabla (1–4 fijas; 5 = nombre libre ≤50). */
const TIPOS_TABLA = [
  { value: "1", label: "Información Ensayo" },
  { value: "2", label: "Datos Ensayo" },
  { value: "3", label: "Resultados" },
  { value: "4", label: "Tabla Resumen" },
  { value: "5", label: "Otras (Especificar)" },
] as const;

const TIPOS_TABLA_FIJOS = TIPOS_TABLA.filter((t) => t.value !== "5");

function parseTipoTabla(stored?: string): { option: string; otro: string } {
  if (!stored?.trim()) return { option: "", otro: "" };
  const fijo = TIPOS_TABLA_FIJOS.find((t) => t.label === stored.trim());
  if (fijo) return { option: fijo.value, otro: "" };
  return { option: "5", otro: stored.trim().slice(0, 50) };
}

function resolveTipoTabla(option: string, otro: string): string | null {
  if (!option) return null;
  if (option === "5") {
    const t = otro.trim();
    return t ? t.slice(0, 50) : null;
  }
  return TIPOS_TABLA_FIJOS.find((t) => t.value === option)?.label ?? null;
}

type TipoCeldaLocal = TipoCelda;

interface ColumnaLocal {
  _localId: string;
  codigo_columna?: number;
  indice: number;
  nombre_columna: string;
  unidades: string;
  estado: string;
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
  /** Filas extra insertadas al dividir (para revertir al unir la pila). */
  _splitInserted?: number;
}

interface Props {
  tabla: Tabla | null;
  tiposEnsayo: TipoEnsayo[];
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

function parseColumnNamesFromClipboard(text: string): string[] {
  const normalized = text.replace(/\r/g, "").trim();
  if (!normalized) return [];

  const lines = normalized
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  // Columna vertical (Excel: copiar columna hacia abajo)
  if (lines.length > 1 && !normalized.includes("\t")) {
    return lines;
  }

  // Fila horizontal con tabuladores
  if (normalized.includes("\t")) {
    return normalized.split("\t").map((s) => s.trim());
  }

  return [normalized];
}

function serializeColumnNames(names: string[]): string {
  return names.join("\t");
}

/** Invierte filas insertadas por splitVertical: elimina filas y ajusta vecinos. */
function dropInsertedGridRows(
  cells: CeldaLocal[],
  start: number,
  dropCount: number,
  mergedCol: number
): CeldaLocal[] {
  if (dropCount <= 0) return cells;

  const delStart = start + 1;
  const delEnd = start + dropCount;

  let working = cells.filter((c) => {
    if (c.col === mergedCol) return true;
    if (c.rowspan === 1 && c.fila >= delStart && c.fila <= delEnd) return false;
    return true;
  });

  working = working.map((c) => {
    const next = { ...c };
    if (next.fila > delEnd) {
      next.fila -= dropCount;
    }
    if (next.col !== mergedCol) {
      const cellEnd = next.fila + next.rowspan - 1;
      const overlapStart = Math.max(next.fila, delStart);
      const overlapEnd = Math.min(cellEnd, delEnd);
      if (overlapStart <= overlapEnd) {
        next.rowspan = Math.max(1, next.rowspan - (overlapEnd - overlapStart + 1));
      }
    }
    return next;
  });

  return working;
}

function cellOverlapsRect(
  c: CeldaLocal,
  r1: number,
  c1: number,
  r2: number,
  c2: number
): boolean {
  const er = c.fila + c.rowspan - 1;
  const ec = c.col + c.colspan - 1;
  return c.fila <= r2 && er >= r1 && c.col <= c2 && ec >= c1;
}

function cellExtendsOutsideRect(
  c: CeldaLocal,
  r1: number,
  c1: number,
  r2: number,
  c2: number
): boolean {
  const er = c.fila + c.rowspan - 1;
  const ec = c.col + c.colspan - 1;
  return c.fila < r1 || er > r2 || c.col < c1 || ec > c2;
}

function clipCellToGrid(c: CeldaLocal, rows: number, cols: number): CeldaLocal | null {
  if (c.fila > rows || c.col > cols || c.fila < 1 || c.col < 1) return null;
  const rowspan = Math.min(c.rowspan, rows - c.fila + 1);
  const colspan = Math.min(c.colspan, cols - c.col + 1);
  if (rowspan < 1 || colspan < 1) return null;
  return { ...c, rowspan, colspan };
}

/** Elimina solapamientos y rellena huecos sin duplicar celdas. */
function reconcileGridCells(
  cells: CeldaLocal[],
  rows: number,
  cols: number,
  headerRows: number
): CeldaLocal[] {
  if (rows < 1 || cols < 1) return [];

  const covered = new Set<string>();
  const kept: CeldaLocal[] = [];

  const sorted = [...cells]
    .map((c) => clipCellToGrid(c, rows, cols))
    .filter((c): c is CeldaLocal => !!c)
    .sort(
      (a, b) =>
        a.fila - b.fila ||
        a.col - b.col ||
        b.rowspan * b.colspan - a.rowspan * a.colspan
    );

  for (const c of sorted) {
    let conflict = false;
    for (let r = c.fila; r < c.fila + c.rowspan && !conflict; r++) {
      for (let col = c.col; col < c.col + c.colspan; col++) {
        if (covered.has(`${r}:${col}`)) {
          conflict = true;
          break;
        }
      }
    }
    if (conflict) continue;

    for (let r = c.fila; r < c.fila + c.rowspan; r++) {
      for (let col = c.col; col < c.col + c.colspan; col++) {
        covered.add(`${r}:${col}`);
      }
    }
    kept.push(c);
  }

  for (let r = 1; r <= rows; r++) {
    for (let col = 1; col <= cols; col++) {
      if (covered.has(`${r}:${col}`)) continue;
      const inHeader = headerRows > 0 && r <= headerRows;
      kept.push({
        _localId: genId(),
        fila: r,
        col,
        rowspan: 1,
        colspan: 1,
        tipo_celda: inHeader ? "header" : "input",
        alias: inHeader ? "" : `${colLetter(col)}${r}`,
        campo_obligatorio: false,
        estado: "A",
      });
      covered.add(`${r}:${col}`);
    }
  }

  return kept;
}

/** Inserta una fila en insertAt (1-based); las filas ≥ insertAt bajan una posición. */
function insertGridRowAt(cells: CeldaLocal[], insertAt: number): CeldaLocal[] {
  return cells.map((c) => {
    const endRow = c.fila + c.rowspan - 1;
    if (endRow < insertAt) return c;
    if (c.fila >= insertAt) return { ...c, fila: c.fila + 1 };
    return { ...c, rowspan: c.rowspan + 1 };
  });
}

/** Inserta una columna en insertAt (1-based); las columnas ≥ insertAt se corren a la derecha. */
function insertGridColumnAt(cells: CeldaLocal[], insertAt: number): CeldaLocal[] {
  return cells.map((c) => {
    const endCol = c.col + c.colspan - 1;
    if (endCol < insertAt) return c;
    if (c.col >= insertAt) return { ...c, col: c.col + 1 };
    return { ...c, colspan: c.colspan + 1 };
  });
}

/** Pila consecutiva de subceldas 1×1 en una columna que contiene anchorRow. */
function findVerticalStackRun(
  cells: CeldaLocal[],
  col: number,
  anchorRow: number
): CeldaLocal[] {
  const singles = cells
    .filter((c) => c.col === col && c.colspan === 1 && c.rowspan === 1)
    .sort((a, b) => a.fila - b.fila);

  const runs: CeldaLocal[][] = [];
  let current: CeldaLocal[] = [];
  for (const c of singles) {
    if (current.length === 0 || c.fila === current[current.length - 1].fila + 1) {
      current.push(c);
    } else {
      runs.push(current);
      current = [c];
    }
  }
  if (current.length) runs.push(current);

  return runs.find((run) => run.some((c) => c.fila === anchorRow)) ?? [];
}

/** Subceldas 1×1 consecutivas justo debajo de afterRow en la misma columna. */
function getConsecutiveSinglesBelow(
  cells: CeldaLocal[],
  col: number,
  afterRow: number
): CeldaLocal[] {
  const below = cells
    .filter(
      (c) =>
        c.col === col &&
        c.colspan === 1 &&
        c.rowspan === 1 &&
        c.fila > afterRow
    )
    .sort((a, b) => a.fila - b.fila);

  const result: CeldaLocal[] = [];
  let expect = afterRow + 1;
  for (const c of below) {
    if (c.fila !== expect) break;
    result.push(c);
    expect += 1;
  }
  return result;
}

type SplitVerticalResult = { cells: CeldaLocal[]; insertCount: number };

function splitVerticalInPlace(
  prev: CeldaLocal[],
  celId: string,
  parts: number
): SplitVerticalResult {
  const n = Math.min(12, Math.max(2, Math.floor(parts)));
  const cel = prev.find((c) => c._localId === celId);
  if (!cel || cel.colspan !== 1) return { cells: prev, insertCount: 0 };

  const start = cel.fila;
  const height = Math.max(1, cel.rowspan);
  const insertCount = Math.max(0, n - height);

  let working = prev.map((c) => ({ ...c }));

  if (insertCount > 0) {
    const insertAfter = start + height - 1;
    working = working.map((c) => {
      if (c._localId === cel._localId) return c;
      if (c.fila > insertAfter) {
        return { ...c, fila: c.fila + insertCount };
      }
      if (c.col !== cel.col && c.fila === start && c.rowspan === height) {
        return { ...c, rowspan: height + insertCount };
      }
      if (c.col !== cel.col && c.fila === start && c.rowspan === 1 && height === 1) {
        return { ...c, rowspan: n };
      }
      if (
        c.fila <= insertAfter &&
        c.fila + c.rowspan - 1 > insertAfter &&
        c.col !== cel.col
      ) {
        return { ...c, rowspan: c.rowspan + insertCount };
      }
      return c;
    });
  }

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
      _splitInserted: insertCount > 0 ? insertCount : undefined,
    });
  }

  if (height === 1 && insertCount > 0) {
    working = working.map((c) => {
      if (c.col === cel.col) return c;
      if (c.fila === start && c.rowspan < n) {
        return { ...c, rowspan: Math.max(c.rowspan, n) };
      }
      return c;
    });
  }

  return { cells: [...working, ...newCells], insertCount };
}

type BaselineSnap = {
  columnas: number[];
  celdas: number[];
};

async function silentDelete(run: () => Promise<void>) {
  try {
    await run();
  } catch {
    /* ya no existe o FK; no abortar el guardado */
  }
}

export default function TablaEditor({ tabla, tiposEnsayo, onSuccess, onCancel }: Props) {
  const { toast } = useToast();
  const isEdit = !!tabla?.codigo_tabla;
  const sourceVersion = tabla?.version ?? "1";
  const [isSaving, setIsSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [formulariosAfectados, setFormulariosAfectados] = useState<FormularioAfectado[]>([]);
  const baselineRef = useRef<BaselineSnap>({
    columnas: [],
    celdas: [],
  });

  const [codigoTipoEnsayo, setCodigoTipoEnsayo] = useState<number | undefined>(tabla?.codigo_tipo_ensayo);
  const [nombreTabla, setNombreTabla] = useState(tabla?.nombre_tabla ?? "");
  const initialTipoTabla = parseTipoTabla(tabla?.tipo_tabla);
  const [tipoTablaOption, setTipoTablaOption] = useState(initialTipoTabla.option);
  const [tipoTablaOtro, setTipoTablaOtro] = useState(initialTipoTabla.otro);
  const [filasMuestra, setFilasMuestra] = useState(tabla?.filas_muestra ?? 0);
  /** Filas de cuerpo libres (solo tipos distintos de Datos Ensayo). */
  const [filasCuerpo, setFilasCuerpo] = useState(1);
  const [numeroColumnas, setNumeroColumnas] = useState(tabla?.numero_columnas ?? 4);
  /** Filas de cabecera locales; en BD: numero_filas_diseno = cabecera + muestra/cuerpo + extras. */
  const [numeroFilasCabecera, setNumeroFilasCabecera] = useState(1);
  /** Filas extra insertadas por divisiones verticales (subceldas). */
  const [filasExtra, setFilasExtra] = useState(0);
  const [version, setVersion] = useState(isEdit ? bumpVersion(tabla?.version) : "1");
  const [estado, setEstado] = useState("A");

  const [columnas, setColumnas] = useState<ColumnaLocal[]>([]);
  const [celdas, setCeldas] = useState<CeldaLocal[]>([]);

  const [sel, setSel] = useState<SelRange | null>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedCeldaId, setSelectedCeldaId] = useState<string | null>(null);
  const [selectedCeldaIds, setSelectedCeldaIds] = useState<string[]>([]);
  const [colSel, setColSel] = useState<SelRange | null>(null);
  const [colDragging, setColDragging] = useState(false);
  const columnNamesClipboardRef = useRef<{ names: string[]; text: string } | null>(null);
  const aliasInputRef = useRef<HTMLInputElement>(null);
  const aliasReplaceOnTypeRef = useRef(true);
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const selectedCellElRef = useRef<HTMLTableCellElement | null>(null);
  const floatPanelRef = useRef<HTMLDivElement | null>(null);
  const [floatPanelPos, setFloatPanelPos] = useState<{ top: number; left: number } | null>(null);
  const [floatPanelManualPos, setFloatPanelManualPos] = useState<{ top: number; left: number } | null>(
    null
  );
  const floatPanelDragRef = useRef<{
    startX: number;
    startY: number;
    startTop: number;
    startLeft: number;
  } | null>(null);

  const hasTipoEnsayo = !!codigoTipoEnsayo;
  const hasTipoTabla = !!tipoTablaOption && (tipoTablaOption !== "5" || !!tipoTablaOtro.trim());
  /** Solo Datos Ensayo usa filas automáticas por probetas mínimas. */
  const esDatosEnsayo = tipoTablaOption === "2";
  const canDesign = hasTipoEnsayo && hasTipoTabla;

  const tipoEnsayoSeleccionado = useMemo(
    () => tiposEnsayo.find((t) => t.codigo_tipo_ensayo === codigoTipoEnsayo),
    [tiposEnsayo, codigoTipoEnsayo]
  );

  const filasCuerpoEfectivas = esDatosEnsayo ? filasMuestra : filasCuerpo;

  const numFilasDiseno = Math.max(
    1,
    Math.max(0, numeroFilasCabecera) + Math.max(0, filasCuerpoEfectivas) + Math.max(0, filasExtra)
  );

  // Probetas → filas de muestra solo para "Datos Ensayo"
  useEffect(() => {
    if (!esDatosEnsayo) {
      setFilasMuestra(0);
      return;
    }
    if (!codigoTipoEnsayo) {
      if (!isEdit) setFilasMuestra(0);
      return;
    }
    const tipo = tiposEnsayo.find((t) => t.codigo_tipo_ensayo === codigoTipoEnsayo);
    const n = Number(tipo?.probetas_minimas);
    if (Number.isFinite(n) && n > 0) setFilasMuestra(n);
    else if (!isEdit) setFilasMuestra(0);
  }, [codigoTipoEnsayo, tiposEnsayo, isEdit, esDatosEnsayo]);

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

  // Mantener grilla consistente (sin solapamientos ni huecos)
  useEffect(() => {
    if (!canDesign) return;
    setCeldas((prev) =>
      reconcileGridCells(prev, numFilasDiseno, Math.max(1, numeroColumnas), numeroFilasCabecera)
    );
  }, [numFilasDiseno, numeroColumnas, numeroFilasCabecera, canDesign]);

  // Cargar al editar
  useEffect(() => {
    if (!tabla?.codigo_tabla) {
      baselineRef.current = { columnas: [], celdas: [] };
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [colRes, celRes] = await Promise.all([
          columnaService.getAll().catch(() => ({ data: [] as Columna[] })),
          celdaService.getAll().catch(() => ({ data: [] as Celda[] })),
        ]);
        if (cancelled) return;
        const allCols = Array.isArray(colRes.data) ? colRes.data : colRes.data ? [colRes.data] : [];
        const allCels = Array.isArray(celRes.data) ? celRes.data : celRes.data ? [celRes.data] : [];

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

        const celsTabla = allCels.filter(
          (c) =>
            c.codigo_tabla === tabla.codigo_tabla ||
            colsTabla.some((col) => col.codigo_columna === c.codigo_columna)
        );

        if (celsTabla.length) {
          const mapped: CeldaLocal[] = celsTabla.map((c) => ({
            _localId: genId(),
            codigo_celda: c.codigo_celda,
            fila: c.fila ?? 1,
            col: c.col ?? 1,
            rowspan: Math.max(1, c.rowspan || 1),
            colspan: Math.max(1, c.colspan || 1),
            tipo_celda: (c.tipo_celda as TipoCeldaLocal) || "input",
            alias: c.alias || "",
            campo_obligatorio: !!c.campo_obligatorio,
            estado: c.estado || "A",
          }));
          setCeldas(mapped);

          baselineRef.current = {
            columnas: colsTabla
              .map((c) => c.codigo_columna)
              .filter((id): id is number => typeof id === "number" && id > 0),
            celdas: celsTabla
              .map((c) => c.codigo_celda)
              .filter((id): id is number => typeof id === "number" && id > 0),
          };
        } else {
          baselineRef.current = {
            columnas: colsTabla
              .map((c) => c.codigo_columna)
              .filter((id): id is number => typeof id === "number" && id > 0),
            celdas: [],
          };
        }

        if (tabla.filas_muestra) setFilasMuestra(tabla.filas_muestra);
        setVersion(bumpVersion(tabla.version));

        // Recuperar cabecera / extras a partir del alto guardado y tipos de celda
        const maxFila = celsTabla.reduce(
          (m, c) => Math.max(m, (c.fila || 1) + Math.max(1, c.rowspan || 1) - 1),
          tabla.numero_filas_diseno || 0
        );
        const esDatos = (tabla.tipo_tabla || "").trim() === "Datos Ensayo";
        const muestra = esDatos ? tabla.filas_muestra || 0 : 0;
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
        if (esDatos) {
          setFilasExtra(Math.max(0, maxFila - cab - muestra));
          setFilasCuerpo(1);
        } else {
          // Cuerpo libre: todo lo que no es cabecera (extras de splits se absorben al recargar)
          setFilasCuerpo(Math.max(0, maxFila - cab));
          setFilasExtra(0);
        }
      } catch {
        /* API puede no existir aún */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tabla?.codigo_tabla]);

  useEffect(() => {
    if (!tabla?.codigo_tabla) {
      setFormulariosAfectados([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [linksRes, formsRes] = await Promise.all([
          formularioTablaService.getAll().catch(() => ({ data: [] as FormularioTabla[] })),
          formularioService.getAll().catch(() => ({ data: [] as Formulario[] })),
        ]);
        if (cancelled) return;
        const linksRaw = linksRes.data;
        const formsRaw = formsRes.data;
        const links = Array.isArray(linksRaw) ? linksRaw : linksRaw ? [linksRaw] : [];
        const forms = Array.isArray(formsRaw) ? formsRaw : formsRaw ? [formsRaw] : [];
        setFormulariosAfectados(
          findFormulariosUsingTabla(tabla.codigo_tabla!, links, forms)
        );
      } catch {
        setFormulariosAfectados([]);
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
  const selectedCeldas = useMemo(
    () => celdas.filter((c) => selectedCeldaIds.includes(c._localId)),
    [celdas, selectedCeldaIds]
  );
  const normSel = sel ? normalizeRange(sel) : null;
  const normColSel = colSel ? normalizeRange(colSel) : null;

  const activeColRange = useMemo(() => {
    if (normColSel) return { c1: normColSel.c1, c2: normColSel.c2 };
    if (normSel) return { c1: normSel.c1, c2: normSel.c2 };
    if (selectedCelda) return { c1: selectedCelda.col, c2: selectedCelda.col };
    return null;
  }, [normColSel, normSel, selectedCelda]);

  const beginSelect = (r: number, c: number, e?: MouseEvent) => {
    setColSel(null);
    const owner = coverOwner(r, c);
    const id = owner?._localId || null;

    if (e?.ctrlKey || e?.metaKey) {
      e.preventDefault();
      setDragging(false);
      if (!id) return;
      setSelectedCeldaIds((prev) => {
        const set = new Set(prev);
        if (set.has(id)) set.delete(id);
        else set.add(id);
        return Array.from(set);
      });
      setSelectedCeldaId(id);
      setSel({ r1: r, c1: c, r2: r, c2: c });
      return;
    }

    setSelectedCeldaIds(id ? [id] : []);
    setDragging(true);
    setSel({ r1: r, c1: c, r2: r, c2: c });
    setSelectedCeldaId(id);
  };

  const extendSelect = (r: number, c: number) => {
    if (!dragging || !sel) return;
    setSel({ ...sel, r2: r, c2: c });
  };

  const endSelect = () => setDragging(false);

  const beginColSelect = (colIndex: number) => {
    setColDragging(true);
    setColSel({ r1: 1, c1: colIndex, r2: 1, c2: colIndex });
    setSel(null);
    setSelectedCeldaId(null);
    setSelectedCeldaIds([]);
    aliasInputRef.current?.blur();
  };

  const extendColSelect = (colIndex: number) => {
    if (!colDragging || !colSel) return;
    setColSel({ ...colSel, c2: colIndex });
  };

  const endColSelect = () => setColDragging(false);

  const copyColumnNames = useCallback(async () => {
    if (!canDesign || !activeColRange) {
      toast({
        title: "Selecciona columnas",
        description: "Arrastra en los encabezados de columna o selecciona un rango en la grilla.",
        variant: "destructive",
      });
      return;
    }
    const { c1, c2 } = activeColRange;
    const names = columnas
      .filter((c) => c.indice >= c1 && c.indice <= c2)
      .sort((a, b) => a.indice - b.indice)
      .map((c) => c.nombre_columna);
    if (!names.length) return;

    const text = serializeColumnNames(names);
    columnNamesClipboardRef.current = { names, text };

    let clipboardOk = false;
    try {
      await navigator.clipboard.writeText(text);
      clipboardOk = true;
    } catch {
      /* buffer interno disponible */
    }

    toast({
      title: "Nombres copiados",
      description: clipboardOk
        ? `${names.length} columna(s): ${colLetter(c1)}${c1 !== c2 ? `–${colLetter(c2)}` : ""}`
        : `${names.length} columna(s) en memoria (usa Pegar nombres).`,
    });
  }, [canDesign, activeColRange, columnas, toast]);

  const pasteColumnNames = useCallback(
    async (opts?: { fromKeyboard?: boolean }) => {
      if (!canDesign || !activeColRange) {
        toast({
          title: "Selecciona columna destino",
          description: "Haz clic en el encabezado o selecciona la primera columna destino.",
          variant: "destructive",
        });
        return;
      }

      const startCol = activeColRange.c1;
      const internal = columnNamesClipboardRef.current;
      let names: string[] = [];

      if (opts?.fromKeyboard) {
        try {
          const text = await navigator.clipboard.readText();
          const parsed = parseColumnNamesFromClipboard(text);
          if (parsed.length) {
            names = parsed;
          }
        } catch {
          /* usar memoria interna */
        }
        if (!names.length && internal?.names.length) {
          names = internal.names;
        }
      } else if (internal?.names.length) {
        names = internal.names;
      } else {
        try {
          const text = await navigator.clipboard.readText();
          names = parseColumnNamesFromClipboard(text);
        } catch {
          toast({
            title: "Nada que pegar",
            description: "Copia nombres de columna primero.",
            variant: "destructive",
          });
          return;
        }
      }

      if (!names.length) {
        toast({
          title: "Nada que pegar",
          description: "El portapapeles está vacío. Copia nombres primero.",
          variant: "destructive",
        });
        return;
      }

      columnNamesClipboardRef.current = { names, text: serializeColumnNames(names) };
      setColumnas((prev) =>
        prev.map((c) => {
          const offset = c.indice - startCol;
          if (offset < 0 || offset >= names.length) return c;
          return { ...c, nombre_columna: names[offset] };
        })
      );

      const applied = Math.min(names.length, numeroColumnas - startCol + 1);
      const endCol = startCol + applied - 1;
      toast({
        title: "Nombres pegados",
        description: `${applied} columna(s): ${colLetter(startCol)}${endCol !== startCol ? `–${colLetter(endCol)}` : ""}`,
      });
    },
    [canDesign, activeColRange, numeroColumnas, toast]
  );

  const updateCelda = (localId: string, patch: Partial<CeldaLocal>) => {
    setCeldas((prev) => prev.map((c) => (c._localId === localId ? { ...c, ...patch } : c)));
  };

  useEffect(() => {
    aliasReplaceOnTypeRef.current = true;
    if (!selectedCeldaId || !canDesign) return;
    requestAnimationFrame(() => {
      aliasInputRef.current?.focus();
      aliasInputRef.current?.select();
    });
  }, [selectedCeldaId, canDesign]);

  useEffect(() => {
    setFloatPanelManualPos(null);
  }, [selectedCeldaId]);

  const updateFloatPanelPos = useCallback(() => {
    if (floatPanelManualPos) {
      setFloatPanelPos(floatPanelManualPos);
      return;
    }
    const cell = selectedCellElRef.current;
    const wrap = gridWrapRef.current;
    if (!cell || !wrap || !selectedCelda) {
      setFloatPanelPos(null);
      return;
    }
    const cellRect = cell.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    setFloatPanelPos({
      top: cellRect.top - wrapRect.top + wrap.scrollTop + 4,
      left: cellRect.right - wrapRect.left + wrap.scrollLeft + 6,
    });
  }, [selectedCelda, floatPanelManualPos]);

  const beginFloatPanelDrag = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const wrap = gridWrapRef.current;
    if (!wrap || !floatPanelPos) return;

    floatPanelDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startTop: floatPanelPos.top,
      startLeft: floatPanelPos.left,
    };

    const onMove = (ev: MouseEvent) => {
      const drag = floatPanelDragRef.current;
      if (!drag || !gridWrapRef.current) return;

      const panel = floatPanelRef.current;
      const panelW = panel?.offsetWidth ?? 160;
      const panelH = panel?.offsetHeight ?? 72;
      const maxTop = Math.max(0, gridWrapRef.current.scrollHeight - panelH);
      const maxLeft = Math.max(0, gridWrapRef.current.scrollWidth - panelW);

      const top = Math.min(maxTop, Math.max(0, drag.startTop + ev.clientY - drag.startY));
      const left = Math.min(maxLeft, Math.max(0, drag.startLeft + ev.clientX - drag.startX));
      const pos = { top, left };
      setFloatPanelManualPos(pos);
      setFloatPanelPos(pos);
    };

    const onUp = () => {
      floatPanelDragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  useEffect(() => {
    updateFloatPanelPos();
    const wrap = gridWrapRef.current;
    if (!wrap) return;
    wrap.addEventListener("scroll", updateFloatPanelPos);
    window.addEventListener("resize", updateFloatPanelPos);
    return () => {
      wrap.removeEventListener("scroll", updateFloatPanelPos);
      window.removeEventListener("resize", updateFloatPanelPos);
    };
  }, [updateFloatPanelPos, selectedCeldaId, numFilasDiseno, numeroColumnas]);

  useEffect(() => {
    if (!canDesign) return;

    const isFormField = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
        return true;
      }
      if (el.isContentEditable) return true;
      return !!el.closest("[role='combobox'], [role='listbox']");
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isCtrl = e.ctrlKey || e.metaKey;
      const inAliasInput = target === aliasInputRef.current;
      const inColHeader = !!target?.closest("thead");
      const inColNameInput =
        inColHeader &&
        target?.tagName === "INPUT" &&
        (target as HTMLInputElement).placeholder !== "unidad";
      const editingColName =
        inColNameInput &&
        document.activeElement === target &&
        (target as HTMLInputElement).selectionStart !==
          (target as HTMLInputElement).selectionEnd;
      const multiColSel = !!(normColSel && normColSel.c1 !== normColSel.c2);

      // Copiar/pegar nombres de columna
      if (isCtrl && (e.key === "c" || e.key === "C" || e.key === "v" || e.key === "V")) {
        const shouldHandleColumns =
          !editingColName &&
          (multiColSel ||
            (normColSel && !inColNameInput) ||
            (!inAliasInput && !isFormField(e.target) && !!activeColRange));

        if (shouldHandleColumns) {
          e.preventDefault();
          if (e.key === "c" || e.key === "C") {
            void copyColumnNames();
          } else {
            void pasteColumnNames({ fromKeyboard: true });
          }
          return;
        }
      }

      if (isFormField(e.target)) {
        if (inAliasInput) return;
        return;
      }

      if (selectedCeldaId && !isCtrl && !e.altKey) {
        if (e.key === "Backspace") {
          e.preventDefault();
          setCeldas((prev) =>
            prev.map((c) => {
              if (c._localId !== selectedCeldaId) return c;
              const nextAlias = aliasReplaceOnTypeRef.current
                ? ""
                : c.alias.slice(0, -1);
              aliasReplaceOnTypeRef.current = false;
              return { ...c, alias: nextAlias };
            })
          );
          return;
        }
        if (e.key === "Delete") {
          e.preventDefault();
          updateCelda(selectedCeldaId, { alias: "" });
          aliasReplaceOnTypeRef.current = false;
          return;
        }
        if (e.key.length === 1) {
          e.preventDefault();
          const char = e.key.replace(/\s+/g, "_");
          setCeldas((prev) =>
            prev.map((c) => {
              if (c._localId !== selectedCeldaId) return c;
              const nextAlias = aliasReplaceOnTypeRef.current ? char : c.alias + char;
              aliasReplaceOnTypeRef.current = false;
              return { ...c, alias: nextAlias };
            })
          );
          requestAnimationFrame(() => {
            aliasInputRef.current?.focus();
            const len = aliasInputRef.current?.value.length ?? 0;
            aliasInputRef.current?.setSelectionRange(len, len);
          });
          return;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canDesign, copyColumnNames, pasteColumnNames, selectedCeldaId, normColSel, activeColRange]);

  const mergeSelection = () => {
    if (!normSel || !canDesign) return;
    const { r1, c1, r2, c2 } = normSel;
    const rowspan = r2 - r1 + 1;
    const colspan = c2 - c1 + 1;
    if (rowspan === 1 && colspan === 1) return;

    const overlapping = celdas.filter((c) => cellOverlapsRect(c, r1, c1, r2, c2));
    const extending = overlapping.filter((c) => cellExtendsOutsideRect(c, r1, c1, r2, c2));
    if (extending.length > 0) {
      toast({
        title: "No se puede combinar",
        description:
          "Hay celdas fusionadas que sobresalen del rango. Sepáralas o elige un rango rectangular completo.",
        variant: "destructive",
      });
      return;
    }

    const expectedCells = rowspan * colspan;
    let covered = 0;
    for (let r = r1; r <= r2; r++) {
      for (let col = c1; col <= c2; col++) {
        if (overlapping.some((c) => cellOverlapsRect(c, r, col, r, col))) covered += 1;
      }
    }
    if (covered !== expectedCells) {
      toast({
        title: "Rango inválido",
        description: "El rango seleccionado no forma un bloque rectangular continuo.",
        variant: "destructive",
      });
      return;
    }

    const ids = new Set(overlapping.map((c) => c._localId));
    const anchor =
      overlapping.find((c) => c.fila === r1 && c.col === c1) ||
      [...overlapping].sort((a, b) => a.fila - b.fila || a.col - b.col)[0];
    if (!anchor) return;

    setCeldas((prev) => {
      const survivors = prev.filter((c) => !ids.has(c._localId));
      survivors.push({
        ...anchor,
        fila: r1,
        col: c1,
        rowspan,
        colspan,
        _splitInserted: undefined,
      });
      return reconcileGridCells(
        survivors,
        numFilasDiseno,
        Math.max(1, numeroColumnas),
        numeroFilasCabecera
      );
    });
    toast({ title: "Celdas combinadas", description: `${rowspan}×${colspan}` });
  };

  const unmergeSelected = () => {
    if (!selectedCelda) return;
    if (selectedCelda.rowspan === 1 && selectedCelda.colspan === 1) return;
    const { fila, col, rowspan, colspan, tipo_celda } = selectedCelda;
    const er = fila + rowspan - 1;
    const ec = col + colspan - 1;

    setCeldas((prev) => {
      const rest = prev.filter((c) => c._localId !== selectedCelda._localId);
      const added: CeldaLocal[] = [];
      for (let r = fila; r <= er; r++) {
        for (let c = col; c <= ec; c++) {
          added.push({
            _localId: r === fila && c === col ? selectedCelda._localId : genId(),
            codigo_celda: r === fila && c === col ? selectedCelda.codigo_celda : undefined,
            fila: r,
            col: c,
            rowspan: 1,
            colspan: 1,
            tipo_celda: r === fila && c === col ? selectedCelda.tipo_celda : tipo_celda,
            alias:
              r === fila && c === col
                ? selectedCelda.alias
                : `${colLetter(c)}${r}`,
            campo_obligatorio: r === fila && c === col ? selectedCelda.campo_obligatorio : false,
            estado: "A",
          });
        }
      }
      return reconcileGridCells(
        [...rest, ...added],
        numFilasDiseno,
        Math.max(1, numeroColumnas),
        numeroFilasCabecera
      );
    });
    toast({ title: "Celdas separadas" });
  };

  /**
   * División vertical tipo Excel: parte la celda en N subceldas apiladas
   * e inserta filas; las columnas vecinas ganan rowspan.
   * Soporta selección múltiple (Ctrl+clic) en la misma columna.
   */
  const splitVertical = (parts: number) => {
    if (!canDesign) return;
    const n = Math.min(12, Math.max(2, Math.floor(parts)));

    const targets =
      selectedCeldas.length > 1
        ? selectedCeldas
        : selectedCelda
          ? [selectedCelda]
          : [];

    if (!targets.length) return;

    if (targets.some((c) => c.colspan !== 1)) {
      toast({
        title: "No se puede dividir",
        description: "Separa primero la fusión horizontal (colspan).",
        variant: "destructive",
      });
      return;
    }

    const cols = new Set(targets.map((c) => c.col));
    if (cols.size > 1) {
      toast({
        title: "Misma columna",
        description: "Para dividir varias celdas, selecciónalas con Ctrl en la misma columna.",
        variant: "destructive",
      });
      return;
    }

    const sorted = [...targets].sort((a, b) => b.fila - a.fila);
    let totalInsert = 0;
    let firstId = sorted[sorted.length - 1]._localId;

    setCeldas((prev) => {
      let working = prev;
      for (const cel of sorted) {
        const result = splitVerticalInPlace(working, cel._localId, n);
        working = result.cells;
        totalInsert += result.insertCount;
      }
      return reconcileGridCells(
        working,
        numFilasDiseno + totalInsert,
        Math.max(1, numeroColumnas),
        numeroFilasCabecera
      );
    });

    if (totalInsert > 0) {
      setFilasExtra((e) => e + totalInsert);
    }
    setSelectedCeldaId(firstId);
    setSelectedCeldaIds([firstId]);
    toast({
      title: "División vertical",
      description:
        sorted.length > 1
          ? `${sorted.length} celdas partidas en ${n} subceldas.`
          : `Celda partida en ${n} subceldas apiladas.`,
    });
  };

  /** Une subceldas verticales consecutivas (toda la pila o celdas unidas debajo). */
  const joinVerticalStack = () => {
    const anchor =
      selectedCeldas.length > 0
        ? celdas.find((c) => c._localId === selectedCeldaId) || selectedCeldas[0]
        : selectedCelda;
    if (!anchor || anchor.colspan !== 1) return;

    const col = anchor.col;

    // Celda fusionada + subceldas consecutivas debajo
    if (anchor.rowspan > 1) {
      const endRow = anchor.fila + anchor.rowspan - 1;
      const below = getConsecutiveSinglesBelow(celdas, col, endRow);
      if (below.length === 0) {
        toast({
          title: "Nada que unir",
          description: "No hay subceldas consecutivas debajo de esta fusión.",
          variant: "destructive",
        });
        return;
      }

      const dropCount =
        below.some((c) => (c._splitInserted ?? 0) > 0) && below.length > 1
          ? below.length - 1
          : 0;
      const idsBelow = new Set(below.map((c) => c._localId));
      const newRowspan = anchor.rowspan + below.length;

      setCeldas((prev) => {
        let working = prev.filter((c) => !idsBelow.has(c._localId));
        working = working.map((c) =>
          c._localId === anchor._localId
            ? {
                ...c,
                rowspan: newRowspan,
                _splitInserted: undefined,
              }
            : c
        );
        if (dropCount > 0) {
          working = dropInsertedGridRows(working, endRow, dropCount, col);
        }
        const rowsAfter = numFilasDiseno - dropCount;
        return reconcileGridCells(
          working,
          rowsAfter,
          Math.max(1, numeroColumnas),
          numeroFilasCabecera
        );
      });

      if (dropCount > 0) {
        setFilasExtra((e) => Math.max(0, e - dropCount));
      }
      setSelectedCeldaId(anchor._localId);
      setSelectedCeldaIds([anchor._localId]);
      toast({
        title: "Subceldas unidas",
        description: `Fusión ampliada a ${newRowspan} fila(s).`,
      });
      return;
    }

    // Pila completa de subceldas 1×1 (desde la fila mínima seleccionada)
    const anchorRow =
      selectedCeldas.length > 0
        ? Math.min(...selectedCeldas.filter((c) => c.col === col).map((c) => c.fila))
        : anchor.fila;

    const consecutive = findVerticalStackRun(celdas, col, anchorRow);
    if (consecutive.length < 2) {
      toast({
        title: "Nada que unir",
        description: "Selecciona la primera subcelda de una pila vertical o usa Ctrl+clic.",
        variant: "destructive",
      });
      return;
    }

    const n = consecutive.length;
    const ids = new Set(consecutive.map((c) => c._localId));
    const first = consecutive[0];
    const hasInsertedRows = consecutive.some((c) => (c._splitInserted ?? 0) > 0);
    const dropCount = hasInsertedRows ? n - 1 : 0;
    const mergedRowspan = dropCount > 0 ? 1 : n;

    setCeldas((prev) => {
      let working = prev.filter((c) => !ids.has(c._localId));
      working.push({
        ...first,
        fila: first.fila,
        rowspan: mergedRowspan,
        alias: first.alias.replace(/_\d+$/, "") || first.alias,
        _splitInserted: undefined,
      });

      if (dropCount > 0) {
        working = dropInsertedGridRows(working, first.fila, dropCount, col);
      }

      return reconcileGridCells(
        working,
        numFilasDiseno - dropCount,
        Math.max(1, numeroColumnas),
        numeroFilasCabecera
      );
    });

    if (dropCount > 0) {
      setFilasExtra((e) => Math.max(0, e - dropCount));
    }
    setSelectedCeldaId(first._localId);
    setSelectedCeldaIds([first._localId]);
    toast({ title: "Subceldas unidas", description: `${n} → 1` });
  };

  const applyRowDimensionInsert = (insertAt: number) => {
    if (insertAt <= numeroFilasCabecera) {
      setNumeroFilasCabecera((n) => Math.min(10, n + 1));
    } else if (esDatosEnsayo) {
      setFilasExtra((n) => n + 1);
    } else {
      setFilasCuerpo((n) => Math.min(40, n + 1));
    }
  };

  const insertRowAt = (insertAt: number) => {
    if (!canDesign || insertAt < 1 || insertAt > numFilasDiseno + 1) return;
    const newRows = numFilasDiseno + 1;
    setCeldas((prev) =>
      reconcileGridCells(
        insertGridRowAt(prev, insertAt),
        newRows,
        Math.max(1, numeroColumnas),
        insertAt <= numeroFilasCabecera ? numeroFilasCabecera + 1 : numeroFilasCabecera
      )
    );
    applyRowDimensionInsert(insertAt);
    toast({ title: "Fila insertada", description: `Nueva fila en posición ${insertAt}` });
  };

  const insertColumnAt = (insertAt: number) => {
    if (!canDesign || insertAt < 1 || insertAt > numeroColumnas + 1) return;
    const newCols = numeroColumnas + 1;
    setNumeroColumnas(newCols);
    setColumnas((prev) => {
      const shifted = prev.map((col) =>
        col.indice >= insertAt ? { ...col, indice: col.indice + 1 } : col
      );
      shifted.push({
        _localId: genId(),
        indice: insertAt,
        nombre_columna: colLetter(insertAt),
        unidades: "",
        estado: "A",
      });
      return shifted.sort((a, b) => a.indice - b.indice);
    });
    setCeldas((prev) =>
      reconcileGridCells(
        insertGridColumnAt(prev, insertAt),
        numFilasDiseno,
        newCols,
        numeroFilasCabecera
      )
    );
    toast({
      title: "Columna insertada",
      description: `Nueva columna en posición ${colLetter(insertAt)}`,
    });
  };

  const insertRowAbove = () => {
    const row = selectedCelda?.fila ?? normSel?.r1;
    if (!row) return;
    insertRowAt(row);
  };

  const insertRowBelow = () => {
    if (!selectedCelda && !normSel) return;
    const row = selectedCelda
      ? selectedCelda.fila + selectedCelda.rowspan
      : (normSel?.r2 ?? 0) + 1;
    insertRowAt(row);
  };

  const insertColumnLeft = () => {
    const col = activeColRange?.c1 ?? selectedCelda?.col ?? normSel?.c1;
    if (!col) return;
    insertColumnAt(col);
  };

  const insertColumnRight = () => {
    const col = selectedCelda
      ? selectedCelda.col + selectedCelda.colspan
      : activeColRange
        ? activeColRange.c2 + 1
        : normSel
          ? normSel.c2 + 1
          : null;
    if (!col) return;
    insertColumnAt(col);
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
    const tipoTablaResolved = resolveTipoTabla(tipoTablaOption, tipoTablaOtro);
    if (!tipoTablaResolved) {
      toast({
        title: "Falta el tipo de tabla",
        description:
          tipoTablaOption === "5"
            ? "Especifica el nombre del tipo (máx. 50 caracteres)."
            : "Selecciona un tipo de tabla.",
        variant: "destructive",
      });
      return;
    }
    if (esDatosEnsayo && filasMuestra < 1) {
      toast({
        title: "Sin filas de muestra",
        description: "El tipo de ensayo no tiene probetas mínimas.",
        variant: "destructive",
      });
      return;
    }
    if (!esDatosEnsayo && numFilasDiseno < 1) {
      toast({
        title: "Tabla vacía",
        description: "Agrega al menos una fila para diseñar la tabla.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    setConfirmOpen(false);
    const sourceTablaId = tabla?.codigo_tabla;
    try {
      if (!isEdit) {
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
        const celdasToDelete = baseline.celdas.filter((id) => !keepCelIds.has(id));
        const columnasToDelete = baseline.columnas.filter((id) => !keepColIds.has(id));

        for (const id of celdasToDelete) {
          await silentDelete(() => celdaService.delete(id));
        }
        for (const id of columnasToDelete) {
          await silentDelete(() => columnaService.delete(id));
        }
      }

      const tablaSaved = await tablaService.save({
        codigo_tabla: isEdit ? 0 : tabla?.codigo_tabla || 0,
        codigo_tipo_ensayo: codigoTipoEnsayo,
        nombre_tabla: nombreTabla.trim(),
        tipo_tabla: tipoTablaResolved,
        filas_muestra: esDatosEnsayo ? filasMuestra : 0,
        numero_columnas: numeroColumnas,
        numero_filas_diseno: numFilasDiseno,
        version,
        estado: "A",
      });
      const codigoTabla = (tablaSaved.data as Tabla)?.codigo_tabla;
      if (!codigoTabla) throw new Error("No se obtuvo codigo_tabla.");

      const colIdByIndice = new Map<number, number>();
      const savedColIds: number[] = [];
      for (const col of columnas) {
        const saved = await columnaService.save({
          codigo_columna: isEdit ? 0 : col.codigo_columna || 0,
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
          codigo_celda: isEdit ? 0 : cel.codigo_celda || 0,
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

      if (isEdit && sourceTablaId && tabla) {
        await tablaService.save({
          codigo_tabla: sourceTablaId,
          codigo_tipo_ensayo: tabla.codigo_tipo_ensayo,
          nombre_tabla: tabla.nombre_tabla,
          tipo_tabla: tabla.tipo_tabla,
          filas_muestra: tabla.filas_muestra,
          numero_columnas: tabla.numero_columnas,
          numero_filas_diseno: tabla.numero_filas_diseno,
          version: tabla.version,
          estado: "I",
        });
      }

      const calculatedIds = new Set(
        celdas
          .filter((c) => c.tipo_celda === "calculated")
          .map((c) => celdaIdByLocal.get(c._localId))
          .filter((id): id is number => !!id)
      );
      await purgeOrphanFormulasForTable(codigoTabla, calculatedIds);

      baselineRef.current = {
        columnas: savedColIds,
        celdas: savedCelIds,
      };

      if (isEdit) {
        const afectados =
          formulariosAfectados.length > 0
            ? ` Formularios afectados: ${formulariosAfectados
                .map((f) => f.nombre_formulario || `#${f.codigo_formulario}`)
                .join(", ")}.`
            : "";
        toast({
          title: "Nueva versión creada",
          description: `Tabla "${nombreTabla}" v${version} (#${codigoTabla}). La versión anterior (#${sourceTablaId}) quedó inactiva.${afectados} Actualiza los formularios en el Editor de Formularios y redefine las fórmulas.`,
          duration: 12000,
        });
      } else {
        toast({
          title: "Guardado",
          description: `Tabla "${nombreTabla}" creada. Define fórmulas al armar el formulario.`,
        });
      }
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

  const handleSaveClick = () => {
    if (isEdit) {
      setConfirmOpen(true);
      return;
    }
    void onSave();
  };

  return (
    <div
      className="flex flex-col gap-3"
      onMouseUp={() => {
        endSelect();
        endColSelect();
      }}
      onMouseLeave={() => {
        endSelect();
        endColSelect();
      }}
    >
      {isEdit && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">Estás creando una nueva versión de la tabla</p>
          <p className="mt-1 text-amber-900/90">
            Los cambios se guardarán como versión <strong>v{version}</strong> (la actual es{" "}
            <strong>v{sourceVersion}</strong>, código #{tabla?.codigo_tabla}). La versión anterior
            quedará <strong>inactiva</strong>.
          </p>
          {formulariosAfectados.length > 0 ? (
            <p className="mt-2 text-amber-900/90">
              <strong>{formulariosAfectados.length}</strong> formulario(s) usan esta tabla y{" "}
              <strong>dejarán de ser válidos</strong> hasta que los actualices en el{" "}
              <strong>Editor de Formularios</strong>: reemplaza la tabla antigua por la nueva y
              redefine las fórmulas (referencias <code className="text-xs bg-amber-100 px-1 rounded">T…</code>).
            </p>
          ) : (
            <p className="mt-2 text-amber-900/90">
              Ningún formulario usa esta tabla actualmente. Si la usas más adelante, asigna siempre
              la versión activa más reciente.
            </p>
          )}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Crear nueva versión de la tabla?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Se creará la versión <strong>v{version}</strong> y la tabla #{tabla?.codigo_tabla}{" "}
                  (v{sourceVersion}) quedará inactiva. Esta acción no se puede deshacer.
                </p>
                {formulariosAfectados.length > 0 ? (
                  <div>
                    <p className="font-medium text-foreground">
                      Formularios que perderán validez:
                    </p>
                    <ul className="mt-2 list-disc pl-5 space-y-1">
                      {formulariosAfectados.map((f) => (
                        <li key={f.codigo_formulario}>
                          {f.nombre_formulario || `Formulario #${f.codigo_formulario}`}
                          {f.cabecera ? ` — sección «${f.cabecera}»` : ""}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2">
                      Después de guardar, abre el <strong>Editor de Formularios</strong>, cambia cada
                      sección a la nueva tabla y vuelve a definir las fórmulas.
                    </p>
                  </div>
                ) : (
                  <p>No hay formularios vinculados a esta tabla.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isSaving}
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault();
                void onSave();
              }}
            >
              {isSaving ? "Creando versión…" : "Sí, crear nueva versión"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">
                {isEdit ? "Nueva versión de tabla" : "Nueva tabla"}
              </CardTitle>
              <CardDescription>
                Grilla tipo Excel: fusiones, tipos de celda y alias. Al modificar una tabla existente
                se crea una nueva versión; las fórmulas se definen en el Editor de Formularios.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
                <X className="mr-2 h-4 w-4" />
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleSaveClick}
                disabled={isSaving}
                variant={isEdit ? "destructive" : "default"}
                className={isEdit ? "bg-red-600 hover:bg-red-700 text-white" : undefined}
              >
                <Save className="mr-2 h-4 w-4" />
                {isSaving
                  ? isEdit
                    ? "Creando versión…"
                    : "Guardando..."
                  : isEdit
                    ? "Guardar nueva versión"
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
            <Label className="text-xs">Tipo de tabla *</Label>
            <Select
              value={tipoTablaOption || undefined}
              onValueChange={(v) => {
                setTipoTablaOption(v);
                if (v !== "5") setTipoTablaOtro("");
              }}
            >
              <SelectTrigger className={!tipoTablaOption ? "border-amber-400" : undefined}>
                <SelectValue placeholder="Selecciona tipo" />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_TABLA.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {tipoTablaOption === "5" && (
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Especificar tipo *</Label>
              <Input
                value={tipoTablaOtro}
                maxLength={50}
                onChange={(e) => setTipoTablaOtro(e.target.value.slice(0, 50))}
                placeholder="Nombre del tipo (máx. 50 caracteres)"
                className={!tipoTablaOtro.trim() ? "border-amber-400" : undefined}
              />
              <p className="text-[10px] text-muted-foreground text-right">
                {tipoTablaOtro.length}/50
              </p>
            </div>
          )}
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
          {esDatosEnsayo ? (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Filas muestra</Label>
                <Input type="number" value={filasMuestra} readOnly disabled />
                <p className="text-[10px] text-muted-foreground">
                  {tipoEnsayoSeleccionado
                    ? `${tipoEnsayoSeleccionado.nombre_tipo_ensayo}: ${tipoEnsayoSeleccionado.probetas_minimas ?? 0} probetas`
                    : "Automático por probetas mínimas"}
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Filas extra</Label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    disabled={!canDesign || filasExtra <= 0}
                    onClick={() => setFilasExtra((n) => Math.max(0, n - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    className="text-center"
                    type="number"
                    min={0}
                    max={40}
                    value={filasExtra}
                    disabled={!canDesign}
                    onChange={(e) =>
                      setFilasExtra(clampInt(e.target.value, 0, 40, filasExtra))
                    }
                    onBlur={(e) => setFilasExtra(clampInt(e.target.value, 0, 40, 0))}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    disabled={!canDesign}
                    onClick={() => setFilasExtra((n) => Math.min(40, n + 1))}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Subceldas o filas de pie (también suman las divisiones verticales)
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs">Filas cuerpo</Label>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  disabled={!canDesign || filasCuerpo <= 0}
                  onClick={() => setFilasCuerpo((n) => Math.max(0, n - 1))}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  className="text-center"
                  type="number"
                  min={0}
                  max={40}
                  value={filasCuerpo}
                  disabled={!canDesign}
                  onChange={(e) =>
                    setFilasCuerpo(clampInt(e.target.value, 0, 40, filasCuerpo))
                  }
                  onBlur={(e) =>
                    setFilasCuerpo(clampInt(e.target.value, 0, 40, 0))
                  }
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  disabled={!canDesign}
                  onClick={() => setFilasCuerpo((n) => Math.min(40, n + 1))}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">Diseño libre (sin probetas)</p>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Columnas</Label>
            <div className="flex gap-1">
              <Button
                type="button"
                size="icon"
                variant="outline"
                disabled={!canDesign || numeroColumnas <= 1}
                onClick={() => setNumeroColumnas((n) => Math.max(1, n - 1))}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                className="text-center"
                type="number"
                min={1}
                max={40}
                value={numeroColumnas}
                disabled={!canDesign}
                onChange={(e) =>
                  setNumeroColumnas(clampInt(e.target.value, 1, 40, numeroColumnas))
                }
                onBlur={(e) =>
                  setNumeroColumnas(clampInt(e.target.value, 1, 40, 1))
                }
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                disabled={!canDesign}
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
                disabled={!canDesign || numeroFilasCabecera <= 0}
                onClick={() => setNumeroFilasCabecera((n) => Math.max(0, n - 1))}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                className="text-center"
                type="number"
                min={0}
                max={10}
                value={numeroFilasCabecera}
                disabled={!canDesign}
                onChange={(e) =>
                  setNumeroFilasCabecera(
                    clampInt(e.target.value, 0, 10, numeroFilasCabecera)
                  )
                }
                onBlur={(e) =>
                  setNumeroFilasCabecera(clampInt(e.target.value, 0, 10, 0))
                }
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                disabled={!canDesign}
                onClick={() => setNumeroFilasCabecera((n) => Math.min(10, n + 1))}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="col-span-2 md:col-span-4 lg:col-span-6 rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] text-muted-foreground">
            <strong className="text-slate-700">Tamaño actual:</strong> {numFilasDiseno} filas ×{" "}
            {numeroColumnas} columnas
            {canDesign ? (
              <>
                {" "}
                — Usa <strong>Fila ↑</strong> / <strong>Col ←</strong> en la grilla para insertar
                filas o columnas en medio del diseño.{" "}
                {esDatosEnsayo
                  ? "Las filas de muestra vienen del tipo de ensayo."
                  : "Los controles +/− al final solo agrandan o reducen el borde."}
              </>
            ) : (
              " — Selecciona tipo de tabla y tipo de ensayo para diseñar."
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Versión</Label>
            <Input
              value={version}
              readOnly
              disabled
              className="bg-muted"
            />
            {isEdit && (
              <p className="text-[10px] text-muted-foreground">
                Incremento automático desde v{sourceVersion}
              </p>
            )}
          </div>
          {!isEdit && (
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
          )}
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
                }${selectedCeldas.length > 1 ? ` · ${selectedCeldas.length} seleccionadas` : ""}`
              : "Selecciona una celda"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {selectedCelda ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs">Tipo de celda</Label>
                  <Select
                    value={selectedCelda.tipo_celda}
                    onValueChange={(v) =>
                      updateCelda(selectedCelda._localId, {
                        tipo_celda: v as TipoCeldaLocal,
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
                    ref={aliasInputRef}
                    value={selectedCelda.alias}
                    onChange={(e) => {
                      aliasReplaceOnTypeRef.current = false;
                      updateCelda(selectedCelda._localId, {
                        alias: e.target.value.replace(/\s+/g, "_"),
                      });
                    }}
                    placeholder="Med1 o título de cabecera"
                    className="font-mono"
                  />
                </div>
                <div className="flex items-end gap-2 sm:col-span-2">
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
              </div>
              <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50/80 p-3">
                <Label className="text-xs font-semibold">Insertar filas / columnas</Label>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Inserta en la posición de la celda seleccionada (como Excel). Las celdas
                  existentes se corren; las fusiones que cruzan la línea se amplían.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={insertRowAbove}
                  >
                    <ArrowUp className="mr-1 h-3 w-3" />
                    Fila arriba
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={insertRowBelow}
                  >
                    <ArrowDown className="mr-1 h-3 w-3" />
                    Fila abajo
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={insertColumnLeft}
                  >
                    <ArrowLeft className="mr-1 h-3 w-3" />
                    Col. izquierda
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={insertColumnRight}
                  >
                    <ArrowRight className="mr-1 h-3 w-3" />
                    Col. derecha
                  </Button>
                </div>
              </div>
              {selectedCelda.tipo_celda === "calculated" && (
                <p className="text-[11px] text-violet-800 bg-violet-50 border border-violet-200 rounded-md p-2">
                  La expresión de esta celda se define en el{" "}
                  <strong>Editor de Formularios</strong> cuando la tabla forme parte de un
                  formulario.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {!canDesign
                ? "Elige tipo de tabla y tipo de ensayo para diseñar la grilla."
                : "Haz clic en una celda o arrastra un rango para combinar."}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
          <CardHeader className="py-3 flex flex-row items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-sm font-medium flex-wrap">
              Vista grilla
              <Badge variant="outline">
                {numFilasDiseno} × {numeroColumnas}
              </Badge>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canDesign || !activeColRange}
                onClick={() => void copyColumnNames()}
                title="Ctrl+C"
              >
                <Copy className="mr-1 h-4 w-4" />
                Copiar nombres
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canDesign || !activeColRange}
                onClick={() => void pasteColumnNames({ fromKeyboard: false })}
                title="Ctrl+V"
              >
                <ClipboardPaste className="mr-1 h-4 w-4" />
                Pegar nombres
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canDesign || (!selectedCelda && !normSel)}
                onClick={insertRowAbove}
                title="Insertar fila arriba de la celda"
              >
                <ArrowUp className="mr-1 h-4 w-4" />
                Fila ↑
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canDesign || (!activeColRange && !selectedCelda && !normSel)}
                onClick={insertColumnLeft}
                title="Insertar columna a la izquierda"
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Col ←
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!canDesign || !normSel}
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
            {!canDesign ? (
              <div className="border-2 border-dashed border-amber-300 rounded-lg py-16 text-center bg-amber-50/40 text-amber-950">
                <p className="font-medium">Selecciona tipo de tabla y tipo de ensayo</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {esDatosEnsayo
                    ? "En Datos Ensayo las filas de muestra salen de las probetas mínimas."
                    : "Para este tipo de tabla diseñas la grilla desde cero."}
                </p>
              </div>
            ) : (
              <div
                ref={gridWrapRef}
                className="overflow-auto border rounded-md bg-white select-none relative"
              >
                {selectedCelda && floatPanelPos && (
                  <div
                    ref={floatPanelRef}
                    className="absolute z-30 flex flex-col gap-1 rounded-lg border border-amber-300 bg-amber-50/95 p-2 shadow-lg backdrop-blur-sm"
                    style={{
                      top: floatPanelPos.top,
                      left: floatPanelPos.left,
                      maxWidth: 160,
                    }}
                  >
                    <div
                      className="flex items-center gap-1 cursor-grab active:cursor-grabbing select-none touch-none"
                      onMouseDown={beginFloatPanelDrag}
                      title="Arrastrar panel"
                    >
                      <GripVertical className="h-3.5 w-3.5 shrink-0 text-amber-700/60" />
                      <span className="text-[10px] font-semibold text-amber-900 flex items-center gap-1 flex-1">
                        <SplitSquareVertical className="h-3 w-3" />
                        Subceldas
                        {selectedCeldas.length > 1 && (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0">
                            {selectedCeldas.length}
                          </Badge>
                        )}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1" onMouseDown={(e) => e.stopPropagation()}>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={selectedCelda.colspan !== 1}
                        onClick={() => splitVertical(2)}
                      >
                        ÷ 2
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 px-2 text-xs bg-amber-600 hover:bg-amber-700"
                        disabled={selectedCelda.colspan !== 1}
                        onClick={() => splitVertical(3)}
                      >
                        ÷ 3
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={selectedCelda.colspan !== 1}
                        onClick={() => splitVertical(4)}
                      >
                        ÷ 4
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2 text-xs"
                        onClick={joinVerticalStack}
                      >
                        Unir
                      </Button>
                    </div>
                  </div>
                )}
                <table className="border-collapse text-sm min-w-full">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 bg-slate-100 border px-2 py-1 w-10" />
                      {columnas.map((col) => {
                        const inColSel =
                          !!normColSel &&
                          col.indice >= normColSel.c1 &&
                          col.indice <= normColSel.c2;
                        return (
                        <th
                          key={col._localId}
                          className={cn(
                            "border px-1 py-1 bg-slate-100 min-w-[88px] font-medium cursor-col-resize",
                            inColSel && "ring-2 ring-inset ring-primary bg-primary/10"
                          )}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            beginColSelect(col.indice);
                          }}
                          onMouseEnter={() => extendColSelect(col.indice)}
                        >
                          <input
                            className="w-full bg-transparent text-center outline-none text-xs font-semibold cursor-text"
                            value={col.nombre_columna}
                            onFocus={() => {
                              setColSel({ r1: 1, c1: col.indice, r2: 1, c2: col.indice });
                              setColDragging(false);
                            }}
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
                        );
                      })}
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
                          {esDatosEnsayo && filasMuestra > 0 && r === numeroFilasCabecera + 1 && (
                            <span className="block text-[9px] text-muted-foreground">muestras ↓</span>
                          )}
                          {!esDatosEnsayo && filasCuerpo > 0 && r === numeroFilasCabecera + 1 && (
                            <span className="block text-[9px] text-muted-foreground">cuerpo ↓</span>
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
                          const isMultiSelected = selectedCeldaIds.includes(cel._localId);
                          return (
                            <td
                              key={`${cel._localId}`}
                              ref={(el) => {
                                if (isSelected) selectedCellElRef.current = el;
                              }}
                              rowSpan={cel.rowspan}
                              colSpan={cel.colspan}
                              className={cn(
                                "border p-0.5 align-middle cursor-cell min-w-[88px] h-10",
                                TIPO_COLORS[cel.tipo_celda] || "bg-white",
                                inSel && "ring-2 ring-inset ring-primary/60",
                                isMultiSelected && !isSelected && "ring-2 ring-inset ring-violet-400/70 bg-violet-50/40",
                                isSelected && "ring-2 ring-inset ring-primary"
                              )}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                beginSelect(r, c, e);
                              }}
                              onMouseEnter={() => extendSelect(r, c)}
                            >
                              <div className="px-1 py-1 text-center text-xs min-h-[36px] flex flex-col items-center justify-center gap-0.5">
                                {cel.tipo_celda === "calculated" ? (
                                  <span className="text-[10px] font-semibold text-violet-700">
                                    ƒx
                                  </span>
                                ) : null}
                                {cel.alias ? (
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
              Ctrl+clic: selección múltiple (misma columna para dividir) · Encabezados: Ctrl+C/V
              nombres · Panel flotante: subceldas · Combinar/Separar
            </p>
          </CardContent>
      </Card>
    </div>
  );
}
