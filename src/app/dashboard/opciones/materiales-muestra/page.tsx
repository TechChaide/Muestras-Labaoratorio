"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useToast } from "@/hooks/use-toast";
import type { Familia, Muestra } from '@/types/interfaces';
import { muestraService } from '@/services/muestrasLaboratorio/muestra.service';
import { familiaService } from '@/services/muestrasLaboratorio/familia.service';
import MuestraForm from './components/form';
import MuestraEditPanel from './components/muestra-edit-panel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useSidebar } from '@/components/ui/sidebar-new';
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
import { Edit, FlaskConical, MoreHorizontal, PlusCircle, Trash2 } from 'lucide-react';

/** YYYY-MM-DD local a partir de fecha_carga. */
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

export default function MaterialesMuestraPage() {
    const [records, setRecords] = useState<Muestra[]>([]);
    const [familias, setFamilias] = useState<Familia[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [editingMuestra, setEditingMuestra] = useState<Muestra | null>(null);
    const [muestraToDelete, setMuestraToDelete] = useState<Muestra | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [hasFetched, setHasFetched] = useState(false);
    const [filtroFamilia, setFiltroFamilia] = useState<number | ''>('');
    const [filtroFechaDesde, setFiltroFechaDesde] = useState('');
    const [filtroFechaHasta, setFiltroFechaHasta] = useState('');
    const [busqueda, setBusqueda] = useState('');
    const { toast } = useToast();
    const { isCollapsed, toggleCollapse, isMobile, isOpen, setIsOpen } = useSidebar();
    const wasSidebarOpenRef = useRef({ collapsed: isCollapsed, open: isOpen });

    const fetchRecords = useCallback(async () => {
        setIsLoading(true);
        try {
            const [mRes, fRes] = await Promise.all([
                muestraService.getAll(),
                familiaService.getAll().catch(() => ({ data: [] as Familia[] })),
            ]);
            const data = mRes.data || [];
            const fData = fRes.data || [];
            setRecords(Array.isArray(data) ? data : [data]);
            setFamilias(Array.isArray(fData) ? fData : [fData]);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "No se pudo cargar las muestras.";
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        } finally {
            setIsLoading(false);
            setHasFetched(true);
        }
    }, [toast]);

    useEffect(() => {
        fetchRecords();
    }, [fetchRecords]);

    const openPanel = () => {
        setEditingMuestra(null);
        wasSidebarOpenRef.current = { collapsed: isCollapsed, open: isOpen };
        if (isMobile) {
            if (isOpen) setIsOpen(false);
        } else if (!isCollapsed) {
            toggleCollapse();
        }
        setIsPanelOpen(true);
    };

    const openEdit = (muestra: Muestra) => {
        setIsPanelOpen(false);
        wasSidebarOpenRef.current = { collapsed: isCollapsed, open: isOpen };
        if (isMobile) {
            if (isOpen) setIsOpen(false);
        } else if (!isCollapsed) {
            toggleCollapse();
        }
        setEditingMuestra(muestra);
    };

    const restoreSidebar = () => {
        if (isMobile) {
            if (isOpen !== wasSidebarOpenRef.current.open) setIsOpen(wasSidebarOpenRef.current.open);
        } else if (isCollapsed !== wasSidebarOpenRef.current.collapsed) {
            toggleCollapse();
        }
    };

    const closePanel = () => {
        setIsPanelOpen(false);
        restoreSidebar();
    };

    const closeEdit = () => {
        setEditingMuestra(null);
        restoreSidebar();
    };

    const handleEditSuccess = () => {
        fetchRecords();
        closeEdit();
    };

    const handleConfirmDelete = async () => {
        if (!muestraToDelete) return;
        setDeleting(true);
        try {
            await muestraService.delete(muestraToDelete.codigo_muestra);
            toast({ title: 'Muestra eliminada', description: 'La muestra se desactivó correctamente.' });
            setMuestraToDelete(null);
            fetchRecords();
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'No se pudo eliminar la muestra.';
            toast({ title: 'Error', description: msg, variant: 'destructive' });
        } finally {
            setDeleting(false);
        }
    };

    const nombreFamilia = (codigo?: number) =>
        familias.find(f => f.codigo_familia === codigo)?.nombre_familia || '—';

    const filteredRecords = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return records.filter((rec) => {
            if (filtroFamilia !== '' && rec.codigo_familia_material !== filtroFamilia) return false;

            if (filtroFechaDesde || filtroFechaHasta) {
                const key = toLocalDateKey(rec.fecha_carga);
                if (!key) return false;
                if (filtroFechaDesde && key < filtroFechaDesde) return false;
                if (filtroFechaHasta && key > filtroFechaHasta) return false;
            }

            if (q) {
                const nombreMaterial = (rec.nombre_material_muestra || '').toLowerCase();
                const idsSolicitud = (rec.identificadores_ensayo || []).join(' ').toLowerCase();
                const nombreFam = nombreFamilia(rec.codigo_familia_material).toLowerCase();
                const match =
                    nombreMaterial.includes(q) ||
                    idsSolicitud.includes(q) ||
                    (nombreFam !== '—' && nombreFam.includes(q));
                if (!match) return false;
            }

            return true;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [records, filtroFamilia, filtroFechaDesde, filtroFechaHasta, busqueda, familias]);

    const hasActiveFilters =
        filtroFamilia !== '' || !!filtroFechaDesde || !!filtroFechaHasta || !!busqueda.trim();

    return (
        <div className="flex flex-col gap-4">
            <Card>
                <CardHeader>
                    <CardTitle>Materiales Muestra</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>Consulta y edita las muestras físicas registradas, o asígnalas a ensayos pendientes de una solicitud.</p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle>Materiales Muestra Registrados</CardTitle>
                    <Button onClick={openPanel} size="sm" className="shrink-0 self-start sm:self-auto">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Nueva Carga de Muestra
                    </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                    {!isLoading && records.length > 0 && (
                        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                            <div className="space-y-1.5 min-w-[200px] flex-1 sm:max-w-xs">
                                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Buscar
                                </label>
                                <Input
                                    className="h-9"
                                    placeholder="Material o identificador de solicitud..."
                                    value={busqueda}
                                    onChange={e => setBusqueda(e.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5 min-w-[180px]">
                                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Familia
                                </label>
                                <select
                                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                                    value={filtroFamilia}
                                    onChange={e => setFiltroFamilia(e.target.value === '' ? '' : Number(e.target.value))}
                                >
                                    <option value="">Todas las familias</option>
                                    {familias.map(f => (
                                        <option key={f.codigo_familia} value={f.codigo_familia}>
                                            {f.nombre_familia}
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
                                    onChange={e => setFiltroFechaDesde(e.target.value)}
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
                                    onChange={e => setFiltroFechaHasta(e.target.value)}
                                />
                            </div>
                            {hasActiveFilters && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-9"
                                    onClick={() => {
                                        setFiltroFamilia('');
                                        setFiltroFechaDesde('');
                                        setFiltroFechaHasta('');
                                        setBusqueda('');
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
                        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-12 text-center">
                            <FlaskConical className="h-10 w-10 text-muted-foreground" />
                            <div>
                                <p className="font-medium">Aún no hay muestras registradas</p>
                                <p className="text-sm text-muted-foreground">
                                    Las muestras se crean principalmente al registrar una solicitud de ensayo.
                                </p>
                            </div>
                            <Button onClick={openPanel} size="sm">
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Nueva Carga de Muestra
                            </Button>
                        </div>
                    ) : filteredRecords.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">
                            No hay muestras que coincidan con los filtros o la búsqueda.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Código</TableHead>
                                    <TableHead>Material</TableHead>
                                    <TableHead>Familia</TableHead>
                                    <TableHead>Solicitud</TableHead>
                                    <TableHead>Fecha Ingreso de la Muestra</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredRecords.map((rec) => (
                                    <TableRow key={rec.codigo_muestra}>
                                        <TableCell>{rec.codigo_muestra}</TableCell>
                                        <TableCell className="font-medium">{rec.nombre_material_muestra}</TableCell>
                                        <TableCell>{nombreFamilia(rec.codigo_familia_material)}</TableCell>
                                        <TableCell>
                                            {rec.identificadores_ensayo && rec.identificadores_ensayo.length > 0
                                                ? rec.identificadores_ensayo.join(', ')
                                                : '—'}
                                        </TableCell>
                                        <TableCell>
                                            {rec.fecha_carga
                                                ? new Date(rec.fecha_carga).toLocaleString('es-EC')
                                                : '—'}
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
                                                        title={rec.estado === 'I' ? 'Solo se pueden gestionar muestras activas' : 'Acciones'}
                                                    >
                                                        <MoreHorizontal className="h-4 w-4" />
                                                        <span className="sr-only">Abrir menú</span>
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => openEdit(rec)}>
                                                        <Edit className="mr-2 h-4 w-4" />
                                                        Editar
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        className="text-red-600 focus:text-red-600"
                                                        onClick={() => setMuestraToDelete(rec)}
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
                    )}
                </CardContent>
            </Card>

            <Sheet open={isPanelOpen} onOpenChange={(open) => (open ? openPanel() : closePanel())}>
                <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-6">
                    <MuestraForm onCancel={closePanel} />
                </SheetContent>
            </Sheet>

            <Sheet open={!!editingMuestra} onOpenChange={(open) => { if (!open) closeEdit(); }}>
                <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-6">
                    {editingMuestra && (
                        <MuestraEditPanel
                            muestra={editingMuestra}
                            familias={familias}
                            onSuccess={handleEditSuccess}
                            onCancel={closeEdit}
                        />
                    )}
                </SheetContent>
            </Sheet>

            <AlertDialog
                open={!!muestraToDelete}
                onOpenChange={(open) => { if (!open && !deleting) setMuestraToDelete(null); }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar esta muestra?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Se desactivará la muestra
                            {muestraToDelete?.nombre_material_muestra
                                ? ` “${muestraToDelete.nombre_material_muestra}”`
                                : ''}
                            {muestraToDelete?.codigo_muestra != null
                                ? ` (#${muestraToDelete.codigo_muestra})`
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
