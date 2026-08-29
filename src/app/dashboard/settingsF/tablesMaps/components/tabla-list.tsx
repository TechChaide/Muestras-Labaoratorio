"use client";

import { useState, useMemo } from 'react';
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Edit, Plus, LayoutGrid, Eye } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { TipoEnsayo, TipoMedicion } from '@/types/interfaces';
import type { TablaGroup } from '../page';
import TablaPreview from './tabla-preview';

const PAGE_SIZE_OPTIONS = [10, 15, 20, 50];

interface Props {
    grupos: TablaGroup[];
    tiposEnsayo: TipoEnsayo[];
    tiposMedicion: TipoMedicion[];
    isLoading: boolean;
    onEdit: (group: TablaGroup) => void;
    onAddNew: () => void;
}

export default function TablaDesignList({ grupos, tiposEnsayo, tiposMedicion, isLoading, onEdit, onAddNew }: Props) {
    const [page, setPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(PAGE_SIZE_OPTIONS[0]);
    const [filter, setFilter] = useState("");
    const [previewGroup, setPreviewGroup] = useState<TablaGroup | null>(null);

    const getTipoEnsayoNombre = (codigo?: number) => {
        if (!codigo) return '-';
        return tiposEnsayo.find(t => t.codigo_tipo_ensayo === codigo)?.nombre_tipo_ensayo || `#${codigo}`;
    };

    const filtered = useMemo(() => {
        if (!filter.trim()) return grupos;
        const f = filter.toLowerCase();
        return grupos.filter(g =>
            g.nombre_tabla.toLowerCase().includes(f) ||
            getTipoEnsayoNombre(g.codigo_tipo_ensayo).toLowerCase().includes(f)
        );
    }, [grupos, filter, tiposEnsayo]);

    const totalRows = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
    const paginated = useMemo(() => {
        const start = (page - 1) * rowsPerPage;
        return filtered.slice(start, start + rowsPerPage);
    }, [filtered, page, rowsPerPage]);

    if (page > totalPages && totalPages > 0) setPage(totalPages);

    const renderSkeleton = () => (
        [...Array(5)].map((_, i) => (
            <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                <TableCell className="text-right"><Skeleton className="h-8 w-20" /></TableCell>
            </TableRow>
        ))
    );

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="flex items-center gap-2">
                        <LayoutGrid className="h-5 w-5" />
                        Tablas Diseñadas
                    </CardTitle>
                    <CardDescription>
                        Cada tabla está asociada a un tipo de ensayo y se compone de columnas agrupadas en secciones.
                    </CardDescription>
                </div>
                <Button onClick={onAddNew}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nueva Tabla
                </Button>
            </CardHeader>
            <CardContent>
                <div className="flex justify-between items-center mb-4">
                    <Input
                        type="text"
                        className="max-w-xs"
                        placeholder="Filtrar por nombre o tipo de ensayo..."
                        value={filter}
                        onChange={e => {
                            setFilter(e.target.value);
                            setPage(1);
                        }}
                    />
                </div>
                <div className="border rounded-md overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>#</TableHead>
                                <TableHead>Nombre Tabla</TableHead>
                                <TableHead>Tipo de Ensayo</TableHead>
                                <TableHead>Tabla N°</TableHead>
                                <TableHead>Columnas</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? renderSkeleton() : paginated.length > 0 ? (
                                paginated.map((g, idx) => (
                                    <TableRow key={`${g.codigo_tipo_ensayo}-${g.numero_tabla}`}>
                                        <TableCell className="font-medium">
                                            {(page - 1) * rowsPerPage + idx + 1}
                                        </TableCell>
                                        <TableCell className="font-medium">{g.nombre_tabla}</TableCell>
                                        <TableCell>{getTipoEnsayoNombre(g.codigo_tipo_ensayo)}</TableCell>
                                        <TableCell>
                                            <span className="inline-block bg-gray-100 text-gray-800 px-2 py-0.5 rounded text-xs font-mono">
                                                {g.numero_tabla}
                                            </span>
                                        </TableCell>
                                        <TableCell>{g.columnas.length}</TableCell>
                                        <TableCell>
                                            <Badge variant={g.estado === 'A' ? 'default' : 'secondary'}>
                                                {g.estado === 'A' ? 'Activo' : 'Inactivo'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                <Dialog open={previewGroup?.codigo_tipo_ensayo === g.codigo_tipo_ensayo && previewGroup?.numero_tabla === g.numero_tabla}
                                                    onOpenChange={(open) => setPreviewGroup(open ? g : null)}>
                                                    <DialogTrigger asChild>
                                                        <Button variant="ghost" size="sm" title="Vista previa">
                                                            <Eye className="h-4 w-4" />
                                                        </Button>
                                                    </DialogTrigger>
                                                    <DialogContent className="max-w-5xl">
                                                        <DialogHeader>
                                                            <DialogTitle>{g.nombre_tabla} — {getTipoEnsayoNombre(g.codigo_tipo_ensayo)}</DialogTitle>
                                                        </DialogHeader>
                                                        <TablaPreview columnas={g.columnas} tiposMedicion={tiposMedicion} />
                                                    </DialogContent>
                                                </Dialog>
                                                <Button variant="ghost" size="sm" onClick={() => onEdit(g)} title="Editar">
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        No hay tablas diseñadas. Crea una nueva para comenzar.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>

                <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium">Filas por página:</label>
                        <select
                            className="border rounded px-2 py-1 text-sm"
                            value={rowsPerPage}
                            onChange={(e) => {
                                setRowsPerPage(Number(e.target.value));
                                setPage(1);
                            }}
                        >
                            {PAGE_SIZE_OPTIONS.map(size => (
                                <option key={size} value={size}>{size}</option>
                            ))}
                        </select>
                    </div>
                    <div className="text-sm text-muted-foreground">
                        Página {page} de {totalPages} ({totalRows} tablas)
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                            Anterior
                        </Button>
                        <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                            Siguiente
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
