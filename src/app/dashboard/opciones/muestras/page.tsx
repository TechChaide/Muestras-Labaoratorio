"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, History } from "lucide-react";
import type { Familia, TipoEnsayo } from "@/types/interfaces";
import { ensayoCategoriaEnsayoService } from "@/services/muestrasLaboratorio/ensayoCategoriaEnsayo.service";
import { familiaService } from "@/services/muestrasLaboratorio/familia.service";
import { tipoEnsayoService } from "@/services/muestrasLaboratorio/tipoEnsayo.service";
import { etiquetaEnsayo, type EnsayoAgendable } from "@/components/agendamiento/types";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

const asArray = <T,>(data: T | T[] | undefined): T[] => (Array.isArray(data) ? data : data ? [data] : []);

interface SolicitudHistorialRow {
    codigoSolicitud: number;
    identificador: string;
    material: string;
    familiaCodigo?: number;
    fechaIngreso?: Date | string;
    tipos: TipoEnsayo[];
}

const toDateOnly = (value?: Date | string): string => {
    if (!value) return "";
    const s = typeof value === "string" ? value : value.toISOString();
    return s.split("T")[0];
};

/** Historial de todas las solicitudes/ensayos realizados — a diferencia del Gantt
 * (acotado a un año y a ensayos ya programados), esta vista acumula TODO el
 * histórico, agrupado por solicitud, con filtros por fecha/Familia/tipo de ensayo
 * y búsqueda libre por identificador. */
export default function MuestrasHistorialPage() {
    const { toast } = useToast();
    const [items, setItems] = useState<EnsayoAgendable[]>([]);
    const [familias, setFamilias] = useState<Familia[]>([]);
    const [tiposEnsayo, setTiposEnsayo] = useState<TipoEnsayo[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [busqueda, setBusqueda] = useState("");
    const [filtroFamilia, setFiltroFamilia] = useState<number | "">("");
    const [filtroTipoEnsayo, setFiltroTipoEnsayo] = useState<number | "">("");
    const [fechaDesde, setFechaDesde] = useState("");
    const [fechaHasta, setFechaHasta] = useState("");

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
                description: error instanceof Error ? error.message : "No se pudo cargar el historial de ensayos.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const nombreFamilia = (codigo?: number) =>
        familias.find((f) => f.codigo_familia === codigo)?.nombre_familia || "Sin familia";

    // Agrupa por solicitud: una fila por requerimiento, con todos los tipos de
    // ensayo que se le solicitaron.
    const filas = useMemo(() => {
        const map = new Map<number, SolicitudHistorialRow>();
        for (const item of items) {
            const codigoSolicitud = item.codigo_solicitud;
            if (codigoSolicitud == null) continue;
            let fila = map.get(codigoSolicitud);
            if (!fila) {
                fila = {
                    codigoSolicitud,
                    identificador: etiquetaEnsayo(item),
                    material: item.muestra?.nombre_material_muestra || "—",
                    familiaCodigo: item.tipo_ensayo?.codigo_familia,
                    fechaIngreso: item.solicitud?.fecha_fab_adq,
                    tipos: [],
                };
                map.set(codigoSolicitud, fila);
            }
            if (item.tipo_ensayo && !fila.tipos.some((t) => t.codigo_tipo_ensayo === item.tipo_ensayo!.codigo_tipo_ensayo)) {
                fila.tipos.push(item.tipo_ensayo);
            }
            if (!fila.material || fila.material === "—") {
                fila.material = item.muestra?.nombre_material_muestra || fila.material;
            }
        }
        return Array.from(map.values()).sort((a, b) => b.codigoSolicitud - a.codigoSolicitud);
    }, [items]);

    const filasFiltradas = useMemo(() => {
        const busquedaNorm = busqueda.trim().toLowerCase();
        return filas.filter((fila) => {
            if (busquedaNorm && !fila.identificador.toLowerCase().includes(busquedaNorm)) return false;
            if (filtroFamilia !== "" && fila.familiaCodigo !== filtroFamilia) return false;
            if (filtroTipoEnsayo !== "" && !fila.tipos.some((t) => t.codigo_tipo_ensayo === filtroTipoEnsayo)) return false;
            const fechaFila = toDateOnly(fila.fechaIngreso);
            if (fechaDesde && (!fechaFila || fechaFila < fechaDesde)) return false;
            if (fechaHasta && (!fechaFila || fechaFila > fechaHasta)) return false;
            return true;
        });
    }, [filas, busqueda, filtroFamilia, filtroTipoEnsayo, fechaDesde, fechaHasta]);

    return (
        <div className="flex flex-col gap-4">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <History className="h-5 w-5 text-primary" />
                        Muestras
                    </CardTitle>
                    <CardDescription>
                        Historial de todas las solicitudes y ensayos realizados — filtra por fecha, familia o tipo de
                        ensayo, o busca directamente por identificador.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        <div className="space-y-1.5 lg:col-span-2">
                            <Label className="text-xs text-muted-foreground">Buscar por identificador</Label>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    className="pl-8"
                                    placeholder="Ej: ACE-SEP-26-001"
                                    value={busqueda}
                                    onChange={(e) => setBusqueda(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Familia</Label>
                            <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                value={filtroFamilia}
                                onChange={(e) => setFiltroFamilia(e.target.value === "" ? "" : Number(e.target.value))}
                            >
                                <option value="">Todas</option>
                                {familias.map((f) => (
                                    <option key={f.codigo_familia} value={f.codigo_familia}>{f.nombre_familia}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Tipo de ensayo</Label>
                            <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                value={filtroTipoEnsayo}
                                onChange={(e) => setFiltroTipoEnsayo(e.target.value === "" ? "" : Number(e.target.value))}
                            >
                                <option value="">Todos</option>
                                {tiposEnsayo.map((t) => (
                                    <option key={t.codigo_tipo_ensayo} value={t.codigo_tipo_ensayo}>{t.nombre_tipo_ensayo}</option>
                                ))}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">Desde</Label>
                                <Input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">Hasta</Label>
                                <Input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                        {filasFiltradas.length} solicitud{filasFiltradas.length === 1 ? "" : "es"}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <p className="text-sm text-muted-foreground">Cargando...</p>
                    ) : filasFiltradas.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">
                            No hay solicitudes que coincidan con los filtros aplicados.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Identificador</TableHead>
                                    <TableHead>Material</TableHead>
                                    <TableHead>Familia</TableHead>
                                    <TableHead>Tipos de ensayo solicitados</TableHead>
                                    <TableHead>Fecha Ingreso</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filasFiltradas.map((fila) => (
                                    <TableRow key={fila.codigoSolicitud}>
                                        <TableCell className="font-medium">{fila.identificador}</TableCell>
                                        <TableCell>{fila.material}</TableCell>
                                        <TableCell>{nombreFamilia(fila.familiaCodigo)}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {fila.tipos.map((t) => (
                                                    <Badge key={t.codigo_tipo_ensayo} variant="secondary">
                                                        {t.nombre_tipo_ensayo}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {fila.fechaIngreso ? new Date(fila.fechaIngreso).toLocaleDateString("es-EC") : "—"}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
