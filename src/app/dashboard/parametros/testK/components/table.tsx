"use client";

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Edit, Plus } from 'lucide-react';
import type { TipoEnsayo, Familia } from '@/types/interfaces';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useState, useMemo, useEffect } from 'react';
import { familiaService } from '@/services/muestrasLaboratorio/familia.service';

const PAGE_SIZE_OPTIONS = [10, 15, 20, 50];

interface TipoEnsayoTableProps {
  records: TipoEnsayo[];
  isLoading: boolean;
  onEdit: (record: TipoEnsayo) => void;
  onAddNew: () => void;
}

export default function TipoEnsayoTable({ records, isLoading, onEdit, onAddNew }: TipoEnsayoTableProps) {
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(PAGE_SIZE_OPTIONS[0]);
  const [filter, setFilter] = useState("");
  const [familias, setFamilias] = useState<Familia[]>([]);

  // Cargar familias para mostrar nombres
  useEffect(() => {
    const loadFamilias = async () => {
      try {
        const response = await familiaService.getAll();
        const data = response.data || [];
        const familiasList = Array.isArray(data) ? data : [data];
        setFamilias(familiasList);
      } catch (error) {
        console.error('Error cargando familias:', error);
      }
    };
    loadFamilias();
  }, []);

  // Función para obtener el nombre de la familia
  const getFamiliaName = (codigoFamilia?: number) => {
    if (!codigoFamilia) return '-';
    const familia = familias.find(f => f.codigo_familia === codigoFamilia);
    return familia?.nombre_familia || '-';
  };

  // Filtrado por nombre, mnemónico o familia
  const filteredRecords = useMemo(() => {
    if (!filter.trim()) return records;
    const f = filter.toLowerCase();
    return records.filter(r =>
      (r.nombre_tipo_ensayo?.toLowerCase().includes(f) || "") ||
      (r.mnemonico?.toLowerCase().includes(f) || "") ||
      (getFamiliaName(r.codigo_familia)?.toLowerCase().includes(f) || "")
    );
  }, [records, filter, familias]);

  const totalRows = filteredRecords.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const paginatedRecords = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return filteredRecords.slice(start, start + rowsPerPage);
  }, [filteredRecords, page, rowsPerPage]);

  if (page > totalPages && totalPages > 0) setPage(totalPages);

  const renderSkeleton = () => (
    [...Array(5)].map((_, i) => (
        <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell><Skeleton className="h-4 w-40" /></TableCell>
            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-8 w-8" /></TableCell>
        </TableRow>
    ))
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
            <CardTitle>Listado de Tipos de Ensayo</CardTitle>
            <CardDescription>Tipos de ensayo registrados.</CardDescription>
        </div>
        <Button onClick={onAddNew}>
            <Plus className="mr-2 h-4 w-4" />
            Añadir Tipo de Ensayo
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex justify-between items-center mb-4">
          <input
            type="text"
            className="border rounded px-3 py-2 w-full max-w-xs text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Filtrar por nombre, mnemónico o familia..."
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
                        <TableHead>Código</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Mnemónico</TableHead>
                        <TableHead>Familia</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {isLoading ? renderSkeleton() : paginatedRecords.length > 0 ? (
                        paginatedRecords.map((record) => (
                            <TableRow key={record.codigo_tipo_ensayo}>
                                <TableCell className="font-medium">{record.codigo_tipo_ensayo}</TableCell>
                                <TableCell>{record.nombre_tipo_ensayo}</TableCell>
                                <TableCell className="font-mono text-sm">
                                    {record.mnemonico?.trim()
                                      ? record.mnemonico.trim().toUpperCase()
                                      : <span className="text-muted-foreground">—</span>}
                                </TableCell>
                                <TableCell>{getFamiliaName(record.codigo_familia)}</TableCell>
                                <TableCell>
                                    <Badge variant={record.estado === 'A' ? 'default' : 'secondary'}>
                                        {record.estado === 'A' ? 'Activo' : 'Inactivo'}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => onEdit(record)}>
                                                <Edit className="mr-2 h-4 w-4" />
                                                Editar
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                                No hay registros que mostrar
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>

        {/* Paginación */}
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
            Página {page} de {totalPages} ({totalRows} registros)
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(Math.max(1, page - 1))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(Math.min(totalPages, page + 1))}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
