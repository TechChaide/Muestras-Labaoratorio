"use client";

import { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown, ChevronLeft, ChevronRight, CalendarClock, Hand, X } from "lucide-react";
import { useUsersInfo } from "@/hooks/use-users-info";
import type { Familia, TipoEnsayo } from "@/types/interfaces";
import { etiquetaEnsayo, type EnsayoAgendable } from "./types";
import { cn } from "@/lib/utils";

interface EnsayoGanttChartProps {
  items: EnsayoAgendable[];
  familias: Familia[];
  tiposEnsayo: TipoEnsayo[];
  selectedYear: number;
  onSelectedYearChange: (year: number) => void;
  /** 0-11. Si se pasa, el Gantt muestra solo ese mes (por defecto el mes en curso en Mis Ensayos). */
  selectedMonth?: number | null;
  onSelectedMonthChange?: (month: number) => void;
  /** Una sola barra por identificador (identificador + técnico), sin apilar tipos de ensayo. */
  compactoPorSolicitud?: boolean;
  editable: boolean;
  onSelectItem: (item: EnsayoAgendable) => void;
  title?: string;
  description?: string;
}

const MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
const MESES_LARGOS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
const DAY_PX_MONTH = 22;

/** Paleta del Gantt original: verdes/azules vivos por tipo. */
const COLORES_ENSAYO = [
  "#22c55e",
  "#3b82f6",
  "#16a34a",
  "#2563eb",
  "#10b981",
  "#0ea5e9",
  "#84cc16",
  "#6366f1",
];
const COLOR_VENCIDO = "#9ca3af";
const COLOR_EXT = "#22c55e";
const COLOR_GROUP = "#1e3a5f";
/** Card contenedor claro detrás de los ensayos (deja ver la paleta original). */
const COLOR_CARD = "#f8fafc";
const COLOR_CARD_BORDER = "#e2e8f0";

const LABEL_WIDTH = 200;
/** Días sin actividad: estrechos. Días con ensayos/EXT: se ensanchan. */
const DAY_PX_IDLE = 4;
const DAY_PX_ACTIVE = 14;
const BAR_HEIGHT = 36;
const BAR_GAP = 6;
const ROW_PAD = 10;
const CARD_PAD_X = 8;
const CARD_PAD_Y = 6;
const BAR_MIN_WIDTH = 100;
const EXT_MIN_WIDTH = 44;

interface SolicitudGroup {
  codigoSolicitud: number;
  identificador: string;
  familiaCodigo?: number;
  ensayos: EnsayoAgendable[];
}

interface FilterOption {
  value: number;
  label: string;
}

/** Combobox simple con búsqueda; value null = “Todos”. */
function GanttFilterCombobox({
  label,
  placeholder,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  placeholder: string;
  value: number | null;
  options: FilterOption[];
  onChange: (value: number | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div className="flex flex-col gap-1 min-w-[200px] flex-1 max-w-xs">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="h-9 justify-between font-normal"
          >
            <span className="truncate">{selected ? selected.label : placeholder}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <div className="border-b">
            <input
              type="text"
              placeholder="Buscar…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full px-3 py-2 text-sm focus:outline-none"
              autoFocus
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
              onClick={() => {
                onChange(null);
                setOpen(false);
                setQuery("");
              }}
            >
              <Check className={cn("h-4 w-4", value == null ? "opacity-100" : "opacity-0")} />
              {placeholder}
            </button>
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">Sin resultados</div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Check className={cn("h-4 w-4", value === o.value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.label}</span>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Gantt anual: una fila por Identificador (solicitud) con ensayos apilados y
 * bloque EXT a la derecha — layout de referencia [Identificador | Ensayos] [EXT]. */
export function EnsayoGanttChart({
  items,
  familias,
  tiposEnsayo,
  selectedYear,
  onSelectedYearChange,
  selectedMonth = null,
  onSelectedMonthChange,
  compactoPorSolicitud = false,
  editable,
  onSelectItem,
  title = "Diagrama de Gantt — Agendamiento de Ensayos",
  description = "Visualiza los ensayos programados por solicitud y tipo de ensayo",
}: Readonly<EnsayoGanttChartProps>) {
  const { usersInfo } = useUsersInfo();
  // Familia y tipo de ensayo son mutuamente excluyentes: al elegir uno se limpia el otro.
  const [filtroFamilia, setFiltroFamilia] = useState<number | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<number | null>(null);
  const [panning, setPanning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panRef = useRef({
    active: false,
    dragged: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });

  const isLeapYear = (y: number) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const isMonthView = selectedMonth != null;
  const daysInMonth = isMonthView ? new Date(selectedYear, selectedMonth + 1, 0).getDate() : 0;
  const totalDays = isMonthView ? daysInMonth : isLeapYear(selectedYear) ? 366 : 365;

  const parseDate = (value: Date | string | null | undefined): string => {
    if (!value) return "";
    return typeof value === "string" ? value.split("T")[0] : value.toISOString().split("T")[0];
  };

  const getDayOfYear = (dateStr: string): number => {
    if (!dateStr) return -1;
    const [year, month, day] = dateStr.split("-").map(Number);
    if (isMonthView) {
      if (year !== selectedYear || month !== selectedMonth + 1) return -1;
      return day;
    }
    if (year !== selectedYear) return -1;
    let d = 0;
    for (let m = 1; m < month; m++) d += new Date(year, m, 0).getDate();
    return d + day;
  };

  /** Recorta un rango al mes/año visible. Devuelve día 1..totalDays o -1. */
  const clipToView = (dateStr: string, role: "start" | "end"): number => {
    if (!dateStr) return -1;
    const [year, month, day] = dateStr.split("-").map(Number);
    if (!year) return -1;
    const dt = new Date(year, month - 1, day);
    if (isMonthView) {
      const start = new Date(selectedYear, selectedMonth, 1);
      const end = new Date(selectedYear, selectedMonth + 1, 0);
      if (dt < start) return role === "start" ? 1 : -1;
      if (dt > end) return role === "end" ? totalDays : -1;
      return day;
    }
    const yearStart = new Date(selectedYear, 0, 1);
    const yearEnd = new Date(selectedYear, 11, 31);
    if (dt < yearStart) return role === "start" ? 1 : -1;
    if (dt > yearEnd) return role === "end" ? totalDays : -1;
    return getDayOfYear(dateStr);
  };

  const getResponsableNombre = (codigo?: string): string => {
    if (!codigo) return "Sin asignar";
    const u = usersInfo.find((e) => String(e.CODIGO).trim() === String(codigo).trim());
    return u?.NOMBRE || codigo;
  };

  const today = new Date();
  const todayNoTime = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayDay = (() => {
    const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return getDayOfYear(stamp);
  })();

  const nombreFamilia = (codigo?: number) => familias.find((f) => f.codigo_familia === codigo)?.nombre_familia || "Sin familia";

  const familiaOptions = useMemo<FilterOption[]>(() => {
    // Catálogo completo (no solo ensayos ya programados): si el Gantt está vacío
    // igual se pueden elegir familia/tipo para filtrar cuando haya datos.
    return familias
      .filter((f) => (f.estado || "A") === "A")
      .map((f) => ({
        value: f.codigo_familia,
        label: f.nombre_familia || `Familia #${f.codigo_familia}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [familias]);

  const tipoOptions = useMemo<FilterOption[]>(() => {
    return tiposEnsayo
      .filter((t) => (t.estado || "A") === "A")
      .map((t) => ({
        value: t.codigo_tipo_ensayo,
        label: t.nombre_tipo_ensayo || `Tipo #${t.codigo_tipo_ensayo}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [tiposEnsayo]);

  const itemsFiltrados = useMemo(() => {
    let list = items;
    if (filtroFamilia != null) {
      list = list.filter((i) => i.tipo_ensayo?.codigo_familia === filtroFamilia);
    } else if (filtroTipo != null) {
      list = list.filter((i) => i.codigo_tipo_ensayo === filtroTipo);
    }
    if (isMonthView) {
      const monthStart = new Date(selectedYear, selectedMonth, 1);
      const monthEnd = new Date(selectedYear, selectedMonth + 1, 0);
      list = list.filter((i) => {
        const parse = (value: Date | string | null | undefined): Date | null => {
          if (!value) return null;
          const s = typeof value === "string" ? value.split("T")[0] : value.toISOString().split("T")[0];
          const d = new Date(`${s}T00:00:00`);
          return Number.isNaN(d.getTime()) ? null : d;
        };
        const from = parse(i.fecha_inicio);
        const to = parse(i.fecha_extension) || parse(i.fecha_fin);
        if (!from && !to) return false;
        const a = from ?? to!;
        const b = to ?? from!;
        return a <= monthEnd && b >= monthStart;
      });
    }
    return list;
  }, [items, filtroFamilia, filtroTipo, isMonthView, selectedYear, selectedMonth]);

  // Una fila por Identificador; dentro, ensayos apilados + EXT (layout de referencia).
  const ganttRows = itemsFiltrados.reduce<SolicitudGroup[]>((acc, item) => {
    const codigoSolicitud = item.codigo_solicitud ?? -1;
    let grupo = acc.find((g) => g.codigoSolicitud === codigoSolicitud);
    if (!grupo) {
      grupo = {
        codigoSolicitud,
        identificador: etiquetaEnsayo(item),
        familiaCodigo: item.tipo_ensayo?.codigo_familia,
        ensayos: [],
      };
      acc.push(grupo);
    }
    grupo.ensayos.push(item);
    return acc;
  }, []);

  // Días con ensayos o extensión se ensanchan; el resto queda compacto.
  // Rangos cortos se potencian para que el texto de la barra sea legible.
  const { dayLeft, dayWidth, monthOffsets, monthWidths, timelineWidth } = useMemo(() => {
    const parse = (value: Date | string | null | undefined): string => {
      if (!value) return "";
      return typeof value === "string" ? value.split("T")[0] : value.toISOString().split("T")[0];
    };
    const dayOfView = (dateStr: string, role: "start" | "end"): number => {
      if (!dateStr) return -1;
      const [year, month, day] = dateStr.split("-").map(Number);
      if (!year) return -1;
      const dt = new Date(year, month - 1, day);
      if (isMonthView && selectedMonth != null) {
        const start = new Date(selectedYear, selectedMonth, 1);
        const end = new Date(selectedYear, selectedMonth + 1, 0);
        if (dt < start) return role === "start" ? 1 : -1;
        if (dt > end) return role === "end" ? totalDays : -1;
        return day;
      }
      if (year !== selectedYear) {
        if (year < selectedYear) return role === "start" ? 1 : -1;
        if (year > selectedYear) return role === "end" ? totalDays : -1;
      }
      let d = 0;
      for (let m = 1; m < month; m++) d += new Date(year, m, 0).getDate();
      return d + day;
    };

    const widths = new Array<number>(totalDays + 1).fill(isMonthView ? DAY_PX_MONTH : DAY_PX_IDLE);
    const mark = (from: number, to: number, minPx: number) => {
      if (from < 1 || to < 1) return;
      const a = Math.max(1, Math.min(from, to));
      const b = Math.min(totalDays, Math.max(from, to));
      const days = b - a + 1;
      const perDay = Math.max(isMonthView ? DAY_PX_MONTH : DAY_PX_ACTIVE, Math.ceil(minPx / days));
      for (let d = a; d <= b; d++) {
        widths[d] = Math.max(widths[d], perDay);
      }
    };

    for (const item of itemsFiltrados) {
      const d0 = dayOfView(parse(item.fecha_inicio), "start");
      const d1 = dayOfView(parse(item.fecha_fin), "end");
      const dx = dayOfView(parse(item.fecha_extension), "end");
      mark(d0, d1, BAR_MIN_WIDTH);
      if (dx > d1) mark(d1 + 1, dx, 56);
    }

    const lefts = new Array<number>(totalDays + 2).fill(0);
    for (let d = 1; d <= totalDays; d++) {
      lefts[d + 1] = lefts[d] + widths[d];
    }

    const mOffsets: number[] = [];
    const mWidths: number[] = [];
    if (isMonthView) {
      mOffsets.push(0);
      mWidths.push(lefts[totalDays + 1]);
    } else {
      const dim = MESES.map((_, i) => new Date(selectedYear, i + 1, 0).getDate());
      const mStart: number[] = [];
      for (let i = 0; i < 12; i++) {
        mStart.push(i === 0 ? 1 : mStart[i - 1] + dim[i - 1]);
      }
      for (let i = 0; i < 12; i++) {
        const start = mStart[i];
        const end = start + dim[i] - 1;
        mOffsets.push(lefts[start]);
        mWidths.push(lefts[end + 1] - lefts[start]);
      }
    }

    return {
      dayLeft: lefts,
      dayWidth: widths,
      monthOffsets: mOffsets,
      monthWidths: mWidths,
      timelineWidth: lefts[totalDays + 1],
    };
  }, [itemsFiltrados, selectedYear, selectedMonth, isMonthView, totalDays]);

  const dayToPx = (day: number) => (day > 0 ? dayLeft[day] : 0);
  const spanToPx = (fromDay: number, toDay: number) => {
    if (fromDay < 1 || toDay < 1 || toDay < fromDay) return 0;
    return dayLeft[toDay + 1] - dayLeft[fromDay];
  };

  const colorForTipo = (codigoTipo?: number, fallbackIdx = 0) => {
    const seed = codigoTipo && codigoTipo > 0 ? codigoTipo : fallbackIdx;
    return COLORES_ENSAYO[seed % COLORES_ENSAYO.length];
  };

  const hasActiveFilter = filtroFamilia != null || filtroTipo != null;
  const rowHeightFor = (n: number) =>
    ROW_PAD * 2 + Math.max(1, n) * BAR_HEIGHT + Math.max(0, n - 1) * BAR_GAP;

  const irMesAnterior = () => {
    if (!isMonthView || selectedMonth == null || !onSelectedMonthChange) {
      onSelectedYearChange(selectedYear - 1);
      return;
    }
    if (selectedMonth === 0) {
      onSelectedMonthChange(11);
      onSelectedYearChange(selectedYear - 1);
    } else {
      onSelectedMonthChange(selectedMonth - 1);
    }
  };

  const irMesSiguiente = () => {
    if (!isMonthView || selectedMonth == null || !onSelectedMonthChange) {
      onSelectedYearChange(selectedYear + 1);
      return;
    }
    if (selectedMonth === 11) {
      onSelectedMonthChange(0);
      onSelectedYearChange(selectedYear + 1);
    } else {
      onSelectedMonthChange(selectedMonth + 1);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-wrap items-end gap-3 mb-5">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={irMesAnterior}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className={cn("text-lg font-semibold text-center", isMonthView ? "min-w-[10rem]" : "w-16")}>
              {isMonthView && selectedMonth != null
                ? `${MESES_LARGOS[selectedMonth]} ${selectedYear}`
                : selectedYear}
            </span>
            <Button variant="outline" size="sm" onClick={irMesSiguiente}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground pl-1">
              <Hand className="h-4 w-4" />
              Arrastra para desplazarte
            </span>
          </div>

          {!compactoPorSolicitud && (
            <>
              <GanttFilterCombobox
                label="Familia"
                placeholder="Todas las familias"
                value={filtroFamilia}
                options={familiaOptions}
                disabled={filtroTipo != null}
                onChange={(v) => {
                  setFiltroFamilia(v);
                  if (v != null) setFiltroTipo(null);
                }}
              />
              <GanttFilterCombobox
                label="Tipo de ensayo"
                placeholder="Todos los tipos"
                value={filtroTipo}
                options={tipoOptions}
                disabled={filtroFamilia != null}
                onChange={(v) => {
                  setFiltroTipo(v);
                  if (v != null) setFiltroFamilia(null);
                }}
              />
              {hasActiveFilter && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9"
                  onClick={() => {
                    setFiltroFamilia(null);
                    setFiltroTipo(null);
                  }}
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  Limpiar filtros
                </Button>
              )}
            </>
          )}
        </div>
        {!compactoPorSolicitud && (
          <p className="text-[11px] text-muted-foreground -mt-3 mb-4">
            Familia y tipo de ensayo son excluyentes: al elegir uno se desactiva el otro.
          </p>
        )}

        {ganttRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground border-2 border-dashed rounded-lg">
            <CalendarClock className="h-10 w-10 mb-3" />
            <p className="font-semibold">
              {hasActiveFilter
                ? `No hay ensayos programados para ${isMonthView && selectedMonth != null ? `${MESES_LARGOS[selectedMonth]} ${selectedYear}` : selectedYear} con el filtro actual`
                : `No hay ensayos programados para ${isMonthView && selectedMonth != null ? `${MESES_LARGOS[selectedMonth]} ${selectedYear}` : selectedYear}`}
            </p>
          </div>
        ) : (
          <div
            ref={scrollRef}
            className={cn(
              "overflow-auto rounded-lg border shadow-sm max-h-[70vh] select-none",
              panning ? "cursor-grabbing" : "cursor-grab"
            )}
            onPointerDown={(e) => {
              if (e.pointerType === "touch" || e.button !== 0) return;
              const el = scrollRef.current;
              if (!el) return;
              panRef.current = {
                active: true,
                dragged: false,
                startX: e.clientX,
                startY: e.clientY,
                scrollLeft: el.scrollLeft,
                scrollTop: el.scrollTop,
              };
            }}
            onPointerMove={(e) => {
              const pan = panRef.current;
              const el = scrollRef.current;
              if (!pan.active || !el) return;
              const dx = e.clientX - pan.startX;
              const dy = e.clientY - pan.startY;
              if (!pan.dragged && Math.abs(dx) + Math.abs(dy) < 5) return;
              if (!pan.dragged) {
                pan.dragged = true;
                setPanning(true);
                el.setPointerCapture(e.pointerId);
              }
              el.scrollLeft = pan.scrollLeft - dx;
              el.scrollTop = pan.scrollTop - dy;
            }}
            onPointerUp={() => {
              panRef.current.active = false;
              if (panRef.current.dragged) setPanning(false);
            }}
            onPointerCancel={() => {
              panRef.current.active = false;
              panRef.current.dragged = false;
              setPanning(false);
            }}
            onClickCapture={(e) => {
              if (!panRef.current.dragged) return;
              e.preventDefault();
              e.stopPropagation();
              panRef.current.dragged = false;
            }}
          >
            <div style={{ width: LABEL_WIDTH + timelineWidth }}>
              <div className="flex sticky top-0 z-20 shadow-sm">
                <div className="shrink-0 bg-slate-50 border-r border-b" style={{ width: LABEL_WIDTH, minHeight: 40 }} />
                {(isMonthView && selectedMonth != null ? [MESES[selectedMonth]] : MESES).map((mes, i) => (
                  <div
                    key={mes}
                    className="border-r border-b border-slate-700 bg-slate-800 text-white text-xs font-bold flex items-center justify-center"
                    style={{ width: monthWidths[i], minHeight: 40 }}
                  >
                    {mes}
                  </div>
                ))}
              </div>

              {ganttRows.map(({ codigoSolicitud, identificador, familiaCodigo, ensayos }) => {
                const rowH = rowHeightFor(compactoPorSolicitud ? 1 : ensayos.length);
                const responsables = Array.from(
                  new Set(ensayos.map((e) => getResponsableNombre(e.responsable_ensayo)))
                );

                let groupStartDay = Infinity;
                let groupEndDay = -Infinity;
                let groupExtDay = -Infinity;
                for (const item of ensayos) {
                  const d0 = clipToView(parseDate(item.fecha_inicio), "start");
                  const d1 = clipToView(parseDate(item.fecha_fin), "end");
                  const dx = clipToView(parseDate(item.fecha_extension), "end");
                  if (d0 > 0) groupStartDay = Math.min(groupStartDay, d0);
                  if (d1 > 0) groupEndDay = Math.max(groupEndDay, d1);
                  if (dx > 0) groupExtDay = Math.max(groupExtDay, dx);
                }
                const hasGroupRange = Number.isFinite(groupStartDay) && groupEndDay > 0;
                const groupLeft = hasGroupRange ? dayToPx(groupStartDay as number) : 0;
                const groupWidth = hasGroupRange
                  ? Math.max(spanToPx(groupStartDay as number, groupEndDay as number), BAR_MIN_WIDTH)
                  : 0;
                const showGroupExt = hasGroupRange && groupExtDay > groupEndDay;
                const extWidth = showGroupExt
                  ? Math.max(spanToPx((groupEndDay as number) + 1, groupExtDay as number), EXT_MIN_WIDTH)
                  : 0;

                return (
                  <div key={codigoSolicitud} className="flex border-b border-slate-100">
                    <div
                      className="shrink-0 border-r p-2 flex items-stretch bg-slate-50/60"
                      style={{ width: LABEL_WIDTH, minHeight: rowH }}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectItem(ensayos[0])}
                        className="flex-1 rounded-md px-3 py-2 flex flex-col justify-center text-white shadow-sm text-left hover:brightness-110"
                        style={{ backgroundColor: COLOR_GROUP }}
                      >
                        <span className="font-semibold text-xs leading-tight truncate">{identificador}</span>
                        {compactoPorSolicitud ? (
                          <span className="text-[10px] text-slate-300 truncate">
                            {responsables.join(", ")}
                          </span>
                        ) : (
                          <>
                            <span className="text-[10px] text-slate-300 truncate">{nombreFamilia(familiaCodigo)}</span>
                            <span className="text-[9px] text-slate-400 mt-0.5">
                              {ensayos.length} ensayo{ensayos.length === 1 ? "" : "s"}
                            </span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="relative bg-white" style={{ width: timelineWidth, minHeight: rowH }}>
                      {monthOffsets.map((left, i) => (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 border-r border-slate-100"
                          style={{ left, width: monthWidths[i] }}
                        />
                      ))}

                      {todayDay > 0 && (
                        <div
                          className="absolute top-0 bottom-0 z-10 pointer-events-none"
                          style={{ left: dayToPx(todayDay) + dayWidth[todayDay] / 2, borderLeft: "2px dashed #94a3b8" }}
                        />
                      )}

                      {hasGroupRange && groupWidth > 0 && (
                        <div
                          className="absolute rounded-xl pointer-events-none z-[0]"
                          style={{
                            left: Math.max(0, groupLeft - 2),
                            width:
                              groupWidth +
                              CARD_PAD_X * 2 +
                              (showGroupExt ? Math.max(extWidth, EXT_MIN_WIDTH) + 6 : 0),
                            top: ROW_PAD - CARD_PAD_Y,
                            height: rowH - ROW_PAD * 2 + CARD_PAD_Y * 2,
                            backgroundColor: COLOR_CARD,
                            border: `1px solid ${COLOR_CARD_BORDER}`,
                            boxShadow: "0 1px 4px rgba(15, 23, 42, 0.08)",
                          }}
                        />
                      )}

                      {(compactoPorSolicitud ? ensayos.slice(0, 1) : ensayos).map((item, idx) => {
                        const inicioStr = parseDate(item.fecha_inicio);
                        const finStr = parseDate(item.fecha_fin);
                        const extStr = parseDate(item.fecha_extension);
                        const diaInicio = compactoPorSolicitud
                          ? (groupStartDay as number)
                          : clipToView(inicioStr, "start");
                        const diaFin = compactoPorSolicitud
                          ? (groupEndDay as number)
                          : clipToView(finStr, "end");
                        const diaExt = compactoPorSolicitud
                          ? (groupExtDay as number)
                          : clipToView(extStr, "end");
                        const barLeft = diaInicio > 0 ? dayToPx(diaInicio) : groupLeft;
                        const naturalW =
                          diaInicio > 0 && diaFin > 0
                            ? spanToPx(diaInicio, diaFin)
                            : Math.max(groupWidth, BAR_MIN_WIDTH);
                        const barWidth = Math.max(naturalW - 4, BAR_MIN_WIDTH - 8);
                        const topOffset = ROW_PAD + idx * (BAR_HEIGHT + BAR_GAP);
                        const tipoNombre = compactoPorSolicitud
                          ? identificador
                          : item.tipo_ensayo?.nombre_tipo_ensayo ||
                            tiposEnsayo.find((t) => t.codigo_tipo_ensayo === item.codigo_tipo_ensayo)
                              ?.nombre_tipo_ensayo ||
                            `Ensayo ${idx + 1}`;
                        const responsableNombre = compactoPorSolicitud
                          ? responsables.join(", ")
                          : getResponsableNombre(item.responsable_ensayo);
                        const cutoffStr = compactoPorSolicitud
                          ? ensayos
                              .map((e) => parseDate(e.fecha_extension) || parseDate(e.fecha_fin))
                              .filter(Boolean)
                              .sort()
                              .at(-1) || ""
                          : extStr || finStr;
                        const cutoffDate = cutoffStr ? new Date(`${cutoffStr}T00:00:00`) : null;
                        const isVencido = !!cutoffDate && cutoffDate < todayNoTime;
                        const barColor = isVencido
                          ? COLOR_VENCIDO
                          : compactoPorSolicitud
                            ? COLORES_ENSAYO[1]
                            : colorForTipo(item.codigo_tipo_ensayo, idx);
                        const showExt = diaFin > 0 && diaExt > diaFin;
                        const itemExtWidth = showExt
                          ? Math.max(spanToPx(diaFin + 1, diaExt), EXT_MIN_WIDTH)
                          : 0;
                        const renderedBarW = Math.min(barWidth, groupWidth + CARD_PAD_X - 4);
                        const renderedBarLeft = barLeft + CARD_PAD_X;

                        return (
                          <div key={item.codigo_ensayo_categoria_ensayo}>
                            <button
                              type="button"
                              onClick={() => onSelectItem(item)}
                              className={cn(
                                "absolute rounded-md text-white flex flex-col justify-center px-2.5 z-[1] text-left shadow-sm",
                                editable
                                  ? "hover:brightness-110 active:brightness-95 cursor-pointer"
                                  : "cursor-pointer hover:brightness-110",
                                isVencido && "opacity-85"
                              )}
                              style={{
                                left: renderedBarLeft,
                                width: renderedBarW,
                                top: topOffset,
                                height: BAR_HEIGHT,
                                backgroundColor: barColor,
                                overflow: "hidden",
                              }}
                              title={`${tipoNombre} · ${responsableNombre}${
                                compactoPorSolicitud ? "" : ` · ${inicioStr} → ${finStr}`
                              }${extStr ? ` · Extensión: ${extStr}` : ""}${isVencido ? " · Vencido" : ""}`}
                            >
                              <span className="font-semibold text-[11px] leading-tight truncate w-full">
                                {compactoPorSolicitud ? identificador : tipoNombre}
                              </span>
                              <span className="text-[9px] leading-tight truncate w-full opacity-90 uppercase">
                                {responsableNombre}
                              </span>
                            </button>

                            {showExt && (
                              <button
                                type="button"
                                onClick={() => onSelectItem(item)}
                                className="absolute rounded-md flex items-center justify-center z-[1] hover:bg-green-50 transition-colors bg-white"
                                style={{
                                  left: renderedBarLeft + renderedBarW,
                                  width: itemExtWidth,
                                  top: topOffset,
                                  height: BAR_HEIGHT,
                                  color: COLOR_EXT,
                                  border: `2px dashed ${COLOR_EXT}`,
                                  borderLeft: "none",
                                  borderTopLeftRadius: 0,
                                  borderBottomLeftRadius: 0,
                                  cursor: "pointer",
                                }}
                                title={`Fecha de extensión: ${extStr}`}
                              >
                                <span className="font-bold text-[10px] tracking-wide">EXT</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div className="flex flex-wrap items-center gap-6 px-4 py-2 bg-slate-50 border-t text-xs text-slate-500">
                {todayDay > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-6 border-t-2 border-dashed border-slate-400" />
                    Hoy ({today.toLocaleDateString("es-EC")})
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-6 h-3 rounded-sm" style={{ backgroundColor: COLOR_GROUP }} />
                  Identificador (solicitud)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-6 h-3 rounded-sm" style={{ backgroundColor: COLOR_CARD }} />
                  Contenedor de ensayos
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-6 h-3 rounded-sm" style={{ backgroundColor: COLORES_ENSAYO[0] }} />
                  Ensayo programado
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-6 h-3 rounded-sm bg-white"
                    style={{ border: `2px dashed ${COLOR_EXT}` }}
                  />
                  Fecha de extensión (EXT)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-6 h-3 rounded-sm" style={{ backgroundColor: COLOR_VENCIDO }} />
                  Vencido
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
