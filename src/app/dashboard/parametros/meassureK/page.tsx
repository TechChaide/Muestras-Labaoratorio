"use client";

import { useState, useEffect, useCallback } from 'react';
import { useToast } from "@/hooks/use-toast";
import type { TipoMedicion } from '@/types/interfaces';
import { tipoMedicionService } from '@/services/muestrasLaboratorio/tipoMedicion.service';
import TipoMedicionForm from './components/form';
import TipoMedicionTable from './components/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function TipoMedicionPage() {
    const [records, setRecords] = useState<TipoMedicion[]>([]);
    const [selectedRecord, setSelectedRecord] = useState<TipoMedicion | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [hasFetched, setHasFetched] = useState(false);
    const { toast } = useToast();

    const fetchRecords = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await tipoMedicionService.getAll();
            const data = response.data || [];
            const recordsList = Array.isArray(data) ? data : [data];
            setRecords(recordsList);
            if (recordsList.length === 0) {
                setIsFormOpen(true);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "No se pudo cargar los tipos de medición.";
            toast({
                title: "Error",
                description: errorMessage,
                variant: "destructive",
            });
            setIsFormOpen(true);
        } finally {
            setIsLoading(false);
            setHasFetched(true);
        }
    }, [toast]);

    useEffect(() => {
        fetchRecords();
    }, [fetchRecords]);

    const handleEdit = (record: TipoMedicion) => {
        setSelectedRecord(record);
        setIsFormOpen(true);
    };

    const handleAddNew = () => {
        setSelectedRecord(null);
        setIsFormOpen(true);
    };

    const handleSuccess = () => {
        fetchRecords();
        setIsFormOpen(false);
        setSelectedRecord(null);
    }

    const handleCancel = () => {
        if (records.length > 0) {
            setIsFormOpen(false);
            setSelectedRecord(null);
        }
    }

    const showTable = hasFetched && !isFormOpen && records.length > 0;

    return (
        <div className="flex flex-col gap-4">
            <Card>
                <CardHeader>
                    <CardTitle>Gestión de Tipos de Medición</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>Crea, edita y gestiona los tipos de mediciones para los ensayos de laboratorio.</p>
                </CardContent>
            </Card>

            {isFormOpen ? (
                <TipoMedicionForm
                    record={selectedRecord}
                    onSuccess={handleSuccess}
                    onCancel={handleCancel}
                />
            ) : showTable ? (
                <TipoMedicionTable
                    records={records}
                    isLoading={isLoading}
                    onEdit={handleEdit}
                    onAddNew={handleAddNew}
                />
            ) : null}
        </div>
    );
}
