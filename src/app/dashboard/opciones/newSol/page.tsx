"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from "@/hooks/use-toast";
import type { Familia, Solicitud } from '@/types/interfaces';
import { solicitudService } from '@/services/muestrasLaboratorio/solicitud.service';
import { familiaService } from '@/services/muestrasLaboratorio/familia.service';
import SolicitudForm from './components/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PlusCircle, Edit, MoreHorizontal, Trash2 } from 'lucide-react';
import SolicitudEditPanel from './components/solicitud-edit-panel';

const PAGE_SIZE_OPTIONS = [10, 15, 20, 50];

/** YYYY-MM-DD local a partir de fecha_fab_adq (evita desfase UTC). */
const toLocalDateKey = (value?: Date | string): string | null => {
    if (!value) return null;
    if (typeof value === 'string') {
        const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
        if (m) return m[1];
    }
    const d = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) return null;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

export default function NewSolPage() {
    const [records, setRecords] = useState<Solicitud[]>([]);
    const [familias, setFamilias] = useState<Familia[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingSolicitud, setEditingSolicitud] = useState<Solicitud | null>(null);
    const [solicitudToDelete, setSolicitudToDelete] = useState<Solicitud | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [hasFetched, setHasFetched] = useState(false);
    const [filtroFamilia, setFiltroFamilia] = useState<number | ''>('');
    const [filtroFechaDesde, setFiltroFechaDesde] = useState('');
    const [filtroFechaHasta, setFiltroFechaHasta] = useState('');
    const [page, setPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(PAGE_SIZE_OPTIONS[0]);
    const { toast } = useToast();

    const fetchRecords = useCallback(async () => {
        setIsLoading(true);
        try {
            const [solRes, famRes] = await Promise.all([
                solicitudService.getAll(),
                familiaService.getAll().catch(() => ({ data: [] as Familia[] })),
            ]);
            const data = solRes.data || [];
            setRecords(Array.isArray(data) ? data : [data]);
            const fData = famRes.data || [];
            setFamilias(Array.isArray(fData) ? fData : [fData]);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "No se pudo cargar las solicitudes.";
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        } finally {
            setIsLoading(false);
            setHasFetched(true);
        }
    }, [toast]);

    useEffect(() => {
        fetchRecords();
    }, [fetchRecords]);

    const familiaById = useMemo(() => {
        const map = new Map<number, Familia>();
        for (const f of familias) map.set(f.codigo_familia, f);
        return map;
    }, [familias]);

    const filteredRecords = useMemo(() => {
        return records.filter((rec) => {
            if (filtroFamilia !== '') {
                const fam = familiaById.get(filtroFamilia);
                const mnemonic = (fam?.mnemonico || '').trim().toUpperCase();
                const id = (rec.identificador_ensayo || '').trim().toUpperCase();
                if (!mnemonic || !id.startsWith(`${mnemonic}-`)) return false;
            }

            if (filtroFechaDesde || filtroFechaHasta) {
                const key = toLocalDateKey(rec.fecha_fab_adq);
                if (!key) return false;
                if (filtroFechaDesde && key < filtroFechaDesde) return false;
                if (filtroFechaHasta && key > filtroFechaHasta) return false;
            }

            return true;
        });
    }, [records, filtroFamilia, filtroFechaDesde, filtroFechaHasta, familiaById]);

    const totalRows = filteredRecords.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
    const paginatedRecords = useMemo(() => {
        const start = (page - 1) * rowsPerPage;
        return filteredRecords.slice(start, start + rowsPerPage);
    }, [filteredRecords, page, rowsPerPage]);

    if (page > totalPages) setPage(totalPages);

    const handleSuccess = () => {
        fetchRecords();
        setIsFormOpen(false);
    };

    const handleCancel = () => setIsFormOpen(false);

    const handleEditSuccess = () => {
        fetchRecords();
    };

    const handleEditCancel = () => setEditingSolicitud(null);

    const handleConfirmDelete = async () => {
        if (!solicitudToDelete) return;
        setDeleting(true);
        try {
            await solicitudService.delete(solicitudToDelete.codigo_solicitud);
            toast({ title: 'Solicitud eliminada', description: 'La solicitud se desactivó correctamente.' });
            setSolicitudToDelete(null);
            fetchRecords();
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'No se pudo eliminar la solicitud.';
            toast({ title: 'Error', description: msg, variant: 'destructive' });
        } finally {
            setDeleting(false);
        }
    };

    const estadoBadge = (estado: string | undefined): "default" | "secondary" | "destructive" | "outline" => {
        switch (estado) {
            case 'Aprobada':   return 'default';
            case 'En Proceso': return 'secondary';
            case 'Rechazada':  return 'destructive';
            default:           return 'outline';
        }
    };

    if (isFormOpen) {
        return (
            <div className="flex flex-col gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Nueva Solicitud de Ensayo</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p>Completa los pasos para registrar una nueva solicitud de ensayo.</p>
                    </CardContent>
                </Card>
                <SolicitudForm onSuccess={handleSuccess} onCancel={handleCancel} />
            </div>
        );
    }

    if (editingSolicitud) {
        return (
            <div className="flex flex-col gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Editar Solicitud de Ensayo</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p>Modifica los datos de la solicitud y los tipos de ensayo asignados.</p>
                    </CardContent>
                </Card>
                <SolicitudEditPanel solicitud={editingSolicitud} onSuccess={handleEditSuccess} onCancel={handleEditCancel} />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <Card>
                <CardHeader>
                    <CardTitle>Registro de Solicitudes de Ensayo</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>Crea y gestiona las solicitudes de ensayo para el laboratorio.</p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle>Solicitudes Registradas</CardTitle>
                    <Button onClick={() => setIsFormOpen(true)} size="sm" className="shrink-0 self-start sm:self-auto">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Nueva Solicitud
                    </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                    {!isLoading && records.length > 0 && (
                        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                            <div className="space-y-1.5 min-w-[180px]">
                                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Familia
                                </label>
                                <select
                                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                                    value={filtroFamilia}
                                    onChange={e => {
                                        setFiltroFamilia(e.target.value === '' ? '' : Number(e.target.value));
                                        setPage(1);
                                    }}
                                >
                                    <option value="">Todas las familias</option>
                                    {familias.map(f => (
                                        <option key={f.codigo_familia} value={f.codigo_familia}>
                                            {f.nombre_familia}{f.mnemonico ? ` (${f.mnemonico})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Fecha ingreso desde
                                </label>
                                <Input
                                    type="date"
                                    className="h-9"
                                    value={filtroFechaDesde}
                                    onChange={e => {
                                        setFiltroFechaDesde(e.target.value);
                                        setPage(1);
                                    }}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Fecha ingreso hasta
                                </label>
                                <Input
                                    type="date"
                                    className="h-9"
                                    value={filtroFechaHasta}
                                    onChange={e => {
                                        setFiltroFechaHasta(e.target.value);
                                        setPage(1);
                                    }}
                                />
                            </div>
                            {(filtroFamilia !== '' || filtroFechaDesde || filtroFechaHasta) && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-9"
                                    onClick={() => {
                                        setFiltroFamilia('');
                                        setFiltroFechaDesde('');
                                        setFiltroFechaHasta('');
                                        setPage(1);
                                    }}
                                >
                                    Limpiar filtros
                                </Button>
                            )}
                        </div>
                    )}

                    {isLoading && !hasFetched ? (
                        <p className="text-muted-foreground text-sm">Cargando...</p>
                    ) : records.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No hay solicitudes registradas.</p>
                    ) : filteredRecords.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No hay solicitudes que coincidan con los filtros.</p>
                    ) : (
                        <>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Código</TableHead>
                                    <TableHead>Identificador</TableHead>
                                    <TableHead>Descripción</TableHead>
                                    <TableHead>Origen</TableHead>
                                    <TableHead>Lote/Serial</TableHead>
                                    <TableHead>Fecha Fab.</TableHead>
                                    <TableHead>Fecha Ingreso</TableHead>
                                    <TableHead>Estado Solicitud</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paginatedRecords.map((rec) => (
                                    <TableRow key={rec.codigo_solicitud}>
                                        <TableCell>{rec.codigo_solicitud}</TableCell>
                                        <TableCell className="font-medium">{rec.identificador_ensayo}</TableCell>
                                        <TableCell>{rec.descripcion || '—'}</TableCell>
                                        <TableCell>{rec.origen_solicitud || '—'}</TableCell>
                                        <TableCell>{rec.lote_serial || '—'}</TableCell>
                                        <TableCell>
                                            {rec.fecha_fabricacion
                                                ? new Date(
                                                    typeof rec.fecha_fabricacion === 'string' && /^\d{4}-\d{2}-\d{2}/.test(rec.fecha_fabricacion)
                                                        ? rec.fecha_fabricacion.slice(0, 10) + 'T00:00:00'
                                                        : rec.fecha_fabricacion
                                                  ).toLocaleDateString('es-EC')
                                                : '—'}
                                        </TableCell>
                                        <TableCell>
                                            {rec.fecha_fab_adq
                                                ? new Date(rec.fecha_fab_adq).toLocaleDateString('es-EC')
                                                : '—'}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={estadoBadge(rec.estado_solicitud)}>
                                                {rec.estado_solicitud || '—'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={rec.estado === 'A' ? 'default' : 'destructive'}>
                                                {rec.estado === 'A' ? 'Activo' : 'Inactivo'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        disabled={rec.estado === 'I'}
                                                        title={rec.estado === 'I' ? 'Solo se pueden gestionar solicitudes activas' : 'Acciones'}
                                                    >
                                                        <MoreHorizontal className="h-4 w-4" />
                                                        <span className="sr-only">Abrir menú</span>
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => setEditingSolicitud(rec)}>
                                                        <Edit className="mr-2 h-4 w-4" />
                                                        Editar
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        className="text-red-600 focus:text-red-600"
                                                        onClick={() => setSolicitudToDelete(rec)}
                                                    >
                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                        Eliminar
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
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
                                        <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                </select>
                            </div>
                            <span className="text-sm">
                                {totalRows === 0
                                    ? '0'
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

            <AlertDialog
                open={!!solicitudToDelete}
                onOpenChange={(open) => { if (!open && !deleting) setSolicitudToDelete(null); }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar esta solicitud?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Se desactivará la solicitud
                            {solicitudToDelete?.identificador_ensayo
                                ? ` “${solicitudToDelete.identificador_ensayo}”`
                                : ''}
                            {solicitudToDelete?.codigo_solicitud != null
                                ? ` (#${solicitudToDelete.codigo_solicitud})`
                                : ''}
                            . Esta acción no elimina el historial de ensayos asociados.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                void handleConfirmDelete();
                            }}
                            disabled={deleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleting ? 'Eliminando...' : 'Eliminar'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
