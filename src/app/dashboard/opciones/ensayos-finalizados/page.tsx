"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EnsayoGanttChart } from "@/components/agendamiento/ensayo-gantt-chart";
import { isProgramado, type EnsayoAgendable } from "@/components/agendamiento/types";
import { useUsersInfo } from "@/hooks/use-users-info";
import { ensayoCategoriaEnsayoService } from "@/services/muestrasLaboratorio/ensayoCategoriaEnsayo.service";
import { familiaService } from "@/services/muestrasLaboratorio/familia.service";
import { tipoEnsayoService } from "@/services/muestrasLaboratorio/tipoEnsayo.service";
import { ORIGENES_SOLICITUD, type Familia, type TipoEnsayo } from "@/types/interfaces";
import CapturaResultadosSolicitud from "../mis-ensayos-programados/components/captura-resultados-solicitud";

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

const asArray = <T,>(data: T | T[] | undefined): T[] =>
  Array.isArray(data) ? data : data ? [data] : [];

const toLocalDate = (value?: Date | string | null): Date | null => {
  if (!value) return null;
  const s = typeof value === "string" ? value.split("T")[0] : value.toISOString().split("T")[0];
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Recorte opcional por año/mes. Sin ambos, entra todo el histórico. */const overlapsPeriod = (
  item: EnsayoAgendable,
  year: number | null,
  month: number | null
): boolean => {
  if (year == null && month == null) return true;
  const from = toLocalDate(item.fecha_inicio);
  const to = toLocalDate(item.fecha_extension) || toLocalDate(item.fecha_fin);
  const approval = toLocalDate(item.fecha_aprobacion);
  const a = from ?? to ?? approval;
  const b = to ?? from ?? approval;
  if (!a || !b) return false;

  if (year != null) {
    const start = month != null ? new Date(year, month, 1) : new Date(year, 0, 1);
    const end = month != null ? new Date(year, month + 1, 0) : new Date(year, 11, 31);
    return a <= end && b >= start;
  }

  const startYear = a.getFullYear();
  const endYear = b.getFullYear();
  for (let y = startYear; y <= endYear; y++) {
    const start = new Date(y, month as number, 1);
    const end = new Date(y, (month as number) + 1, 0);
    if (a <= end && b >= start) return true;
  }
  return false;
};

export default function EnsayosFinalizadosPage() {
  const { toast } = useToast();
  const { usersInfo } = useUsersInfo();
  const currentYear = new Date().getFullYear();

  const [items, setItems] = useState<EnsayoAgendable[]>([]);
  const [familias, setFamilias] = useState<Familia[]>([]);
  const [tiposEnsayo, setTiposEnsayo] = useState<TipoEnsayo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [filtroFamilia, setFiltroFamilia] = useState<number | "">("");
  const [filtroTecnico, setFiltroTecnico] = useState("");
  const [filtroOrigen, setFiltroOrigen] = useState("");
  const [consultando, setConsultando] = useState<EnsayoAgendable[] | null>(null);
  const nombreEmpleado = useCallback(
    (codigo?: string) => {
      if (!codigo) return "Sin asignar";
      const u = usersInfo.find((e) => String(e.CODIGO).trim() === String(codigo).trim());
      return u?.NOMBRE || codigo;
    },
    [usersInfo]
  );

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [itemsRes, familiasRes, tiposRes] = await Promise.all([
        ensayoCategoriaEnsayoService.getAll(),
        familiaService.getAll(),
        tipoEnsayoService.getAll(),
      ]);
      setItems(asArray(itemsRes.data) as EnsayoAgendable[]);
      setFamilias(asArray(familiasRes.data));
      setTiposEnsayo(asArray(tiposRes.data));
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "No se pudieron cargar los ensayos finalizados.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const aprobados = useMemo(
    () =>
      items.filter(
        (i) => String(i.codigo_estado_aprobacion || "").trim().toUpperCase() === "AP"
      ),
    [items]
  );

  const tecnicos = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of aprobados) {
      const codigo = String(i.responsable_ensayo || "").trim();
      if (!codigo || map.has(codigo)) continue;
      map.set(codigo, nombreEmpleado(codigo));
    }
    return Array.from(map.entries())
      .map(([codigo, nombre]) => ({ codigo, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [aprobados, nombreEmpleado]);

  const years = useMemo(() => {
    const set = new Set<number>([currentYear]);
    for (const i of aprobados) {
      for (const value of [i.fecha_aprobacion, i.fecha_fin, i.fecha_inicio]) {
        const d = toLocalDate(value);
        if (d) set.add(d.getFullYear());
      }
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [aprobados, currentYear]);

  const filtrados = useMemo(() => {
    return aprobados.filter((i) => {
      if (filtroFamilia !== "" && i.tipo_ensayo?.codigo_familia !== filtroFamilia) return false;
      if (filtroTecnico && String(i.responsable_ensayo || "").trim() !== filtroTecnico) return false;
      if (filtroOrigen && (i.solicitud?.origen_solicitud || "") !== filtroOrigen) return false;
      if (!overlapsPeriod(i, selectedYear, selectedMonth)) return false;
      return true;
    });
  }, [aprobados, filtroFamilia, filtroTecnico, filtroOrigen, selectedYear, selectedMonth]);

  const hayFiltros =    filtroFamilia !== "" ||
    filtroTecnico !== "" ||
    filtroOrigen !== "" ||
    selectedYear != null ||
    selectedMonth != null;

  const limpiarFiltros = () => {
    setFiltroFamilia("");
    setFiltroTecnico("");
    setFiltroOrigen("");
    setSelectedYear(null);
    setSelectedMonth(null);
  };

  const ensayosDeSolicitud = (item: EnsayoAgendable): EnsayoAgendable[] => {
    const codigo = item.codigo_solicitud;
    const delGrupo = aprobados.filter((i) => i.codigo_solicitud === codigo);
    return delGrupo.length > 0 ? delGrupo : [item];
  };

  const verResultados = (item: EnsayoAgendable) => {
    setConsultando(ensayosDeSolicitud(item));
  };

  if (consultando) {
    return (
      <CapturaResultadosSolicitud
        ensayos={consultando}
        soloConsulta
        onBack={() => setConsultando(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Visualización de ensayos finalizados</CardTitle>
          <CardDescription>
            Histórico de ensayos ya aprobados por el jefe de laboratorio. Selecciona una barra del
            Gantt para abrir los resultados en solo lectura.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-1.5 min-w-[180px] flex-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Familia
              </label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={filtroFamilia}
                onChange={(e) => setFiltroFamilia(e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">Todas las familias</option>
                {familias
                  .filter((f) => (f.estado || "A") === "A")
                  .map((f) => (
                    <option key={f.codigo_familia} value={f.codigo_familia}>
                      {f.nombre_familia}
                      {f.mnemonico ? ` (${f.mnemonico})` : ""}
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-1.5 min-w-[200px] flex-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Técnico que ensayó
              </label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={filtroTecnico}
                onChange={(e) => setFiltroTecnico(e.target.value)}
              >
                <option value="">Todos los técnicos</option>
                {tecnicos.map((t) => (
                  <option key={t.codigo} value={t.codigo}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 min-w-[120px]">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Año
              </label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={selectedYear == null ? "" : selectedYear}
                onChange={(e) =>
                  setSelectedYear(e.target.value === "" ? null : Number(e.target.value))
                }
              >
                <option value="">Todos los años</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 min-w-[160px]">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Mes
              </label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={selectedMonth == null ? "" : selectedMonth}
                onChange={(e) =>
                  setSelectedMonth(e.target.value === "" ? null : Number(e.target.value))
                }
              >
                <option value="">Todos los meses</option>
                {MESES_LARGOS.map((nombre, idx) => (
                  <option key={nombre} value={idx}>
                    {nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 min-w-[180px] flex-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tipo de solicitud
              </label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={filtroOrigen}
                onChange={(e) => setFiltroOrigen(e.target.value)}
              >
                <option value="">Todos los tipos</option>
                {ORIGENES_SOLICITUD.map((origen) => (
                  <option key={origen} value={origen}>
                    {origen}
                  </option>
                ))}
              </select>
            </div>

            {hayFiltros && (
              <Button type="button" variant="outline" size="sm" className="h-9" onClick={limpiarFiltros}>
                Limpiar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Cargando...</p>
      ) : (
        <>
          <EnsayoGanttChart
            items={filtrados.filter(isProgramado)}
            familias={familias}
            tiposEnsayo={tiposEnsayo}
            selectedYear={selectedYear ?? currentYear}
            onSelectedYearChange={(year) => setSelectedYear(year)}
            selectedMonth={selectedMonth}
            onSelectedMonthChange={setSelectedMonth}
            compactoPorSolicitud
            editable={false}
            onSelectItem={verResultados}
            title="Diagrama de Gantt — Ensayos finalizados"
            description="Histórico aprobado. Clic en una barra o en el identificador para ver los resultados."
          />
        </>
      )}
    </div>
  );
}
