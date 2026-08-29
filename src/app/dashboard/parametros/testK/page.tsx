"use client";

import { useState, useEffect, useCallback } from 'react';
import { useToast } from "@/hooks/use-toast";
import type { TipoEnsayo } from '@/types/interfaces';
import { tipoEnsayoService } from '@/services/muestrasLaboratorio/tipoEnsayo.service';
import TipoEnsayoForm from './components/form';
import TipoEnsayoTable from './components/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function TipoEnsayoPage() {
    const [records, setRecords] = useState<TipoEnsayo[]>([]);
    const [selectedRecord, setSelectedRecord] = useState<TipoEnsayo | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [hasFetched, setHasFetched] = useState(false);
    const { toast } = useToast();

    const fetchRecords = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await tipoEnsayoService.getAll();
            const data = response.data || [];
            const recordsList = Array.isArray(data) ? data : [data];
            setRecords(recordsList);
            if (recordsList.length === 0) {
                setIsFormOpen(true);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "No se pudo cargar los tipos de ensayo.";
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

    const handleEdit = (record: TipoEnsayo) => {
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
                    <CardTitle>Gestión de Tipos de Ensayo</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>Crea, edita y gestiona los tipos de ensayos que se realizan en el laboratorio.</p>
                </CardContent>
            </Card>

            {isFormOpen ? (
                <TipoEnsayoForm
                    record={selectedRecord}
                    onSuccess={handleSuccess}
                    onCancel={handleCancel}
                />
            ) : showTable ? (
                <TipoEnsayoTable
                    records={records}
                    isLoading={isLoading}
                    onEdit={handleEdit}
                    onAddNew={handleAddNew}
                />
            ) : null}
        </div>
    );
}
