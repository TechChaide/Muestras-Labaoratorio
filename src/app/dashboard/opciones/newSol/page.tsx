"use client";

import { useState, useEffect, useCallback } from 'react';
import { useToast } from "@/hooks/use-toast";
import type { Solicitud } from '@/types/interfaces';
import { solicitudService } from '@/services/muestrasLaboratorio/solicitud.service';
import SolicitudForm from './components/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PlusCircle } from 'lucide-react';

export default function NewSolPage() {
    const [records, setRecords] = useState<Solicitud[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [hasFetched, setHasFetched] = useState(false);
    const { toast } = useToast();

    const fetchRecords = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await solicitudService.getAll();
            const data = response.data || [];
            const recordsList = Array.isArray(data) ? data : [data];
            setRecords(recordsList);
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

    const handleSuccess = () => {
        fetchRecords();
        setIsFormOpen(false);
    };

    const handleCancel = () => setIsFormOpen(false);

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
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Solicitudes Registradas</CardTitle>
                    <Button onClick={() => setIsFormOpen(true)} size="sm">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Nueva Solicitud
                    </Button>
                </CardHeader>
                <CardContent>
                    {isLoading && !hasFetched ? (
                        <p className="text-muted-foreground text-sm">Cargando...</p>
                    ) : records.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No hay solicitudes registradas.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Código</TableHead>
                                    <TableHead>Identificador</TableHead>
                                    <TableHead>Descripción</TableHead>
                                    <TableHead>Fecha Fab./Adq.</TableHead>
                                    <TableHead>Estado Solicitud</TableHead>
                                    <TableHead>Estado</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {records.map((rec) => (
                                    <TableRow key={rec.codigo_solicitud}>
                                        <TableCell>{rec.codigo_solicitud}</TableCell>
                                        <TableCell className="font-medium">{rec.identificador_ensayo}</TableCell>
                                        <TableCell>{rec.descripcion || '—'}</TableCell>
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
