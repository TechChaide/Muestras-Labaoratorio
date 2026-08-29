"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from "@/hooks/use-toast";
import type { EnsayoMediciones, TipoEnsayo, TipoMedicion } from '@/types/interfaces';
import { ensayoMedicionService } from '@/services/muestrasLaboratorio/ensayoMedicion.service';
import { tipoEnsayoService } from '@/services/muestrasLaboratorio/tipoEnsayo.service';
import { tipoMedicionService } from '@/services/muestrasLaboratorio/tipoMedicion.service';
import TablaDesignList from './components/tabla-list';
import TablaDesigner from './components/tabla-designer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export interface TablaGroup {
    codigo_tipo_ensayo: number;
    numero_tabla: number;
    nombre_tabla: string;
    columnas: EnsayoMediciones[];
    estado: string;
}

export default function TablesMapsPage() {
    const [mediciones, setMediciones] = useState<EnsayoMediciones[]>([]);
    const [tiposEnsayo, setTiposEnsayo] = useState<TipoEnsayo[]>([]);
    const [tiposMedicion, setTiposMedicion] = useState<TipoMedicion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [hasFetched, setHasFetched] = useState(false);
    const [isDesigning, setIsDesigning] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<TablaGroup | null>(null);
    const { toast } = useToast();

    const fetchAll = useCallback(async () => {
        setIsLoading(true);
        try {
            const [medRes, teRes, tmRes] = await Promise.all([
                ensayoMedicionService.getAll(),
                tipoEnsayoService.getAll(),
                tipoMedicionService.getAll(),
            ]);
            const meds = (medRes.data || []) as EnsayoMediciones[] | EnsayoMediciones;
            const tes = (teRes.data || []) as TipoEnsayo[] | TipoEnsayo;
            const tms = (tmRes.data || []) as TipoMedicion[] | TipoMedicion;
            setMediciones(Array.isArray(meds) ? meds : [meds]);
            setTiposEnsayo(Array.isArray(tes) ? tes : [tes]);
            setTiposMedicion(Array.isArray(tms) ? tms : [tms]);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "No se pudo cargar la información.";
            toast({
                title: "Error",
                description: errorMessage,
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
            setHasFetched(true);
        }
    }, [toast]);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    // Agrupar mediciones por (codigo_tipo_ensayo, numero_tabla)
    const grupos = useMemo<TablaGroup[]>(() => {
        const map = new Map<string, TablaGroup>();
        for (const m of mediciones) {
            const ce = m.codigo_tipo_ensayo ?? 0;
            const nt = m.numero_tabla ?? 0;
            if (!ce || !nt) continue;
            const key = `${ce}-${nt}`;
            if (!map.has(key)) {
                map.set(key, {
                    codigo_tipo_ensayo: ce,
                    numero_tabla: nt,
                    nombre_tabla: m.nombre_tabla || `Tabla ${nt}`,
                    columnas: [],
                    estado: m.estado || 'A',
                });
            }
            const grp = map.get(key)!;
            grp.columnas.push(m);
            if (m.nombre_tabla && !grp.nombre_tabla.startsWith('Tabla ')) {
                // mantener primer nombre encontrado distinto del placeholder
            } else if (m.nombre_tabla) {
                grp.nombre_tabla = m.nombre_tabla;
            }
        }
        // Ordenar columnas por identificacion_campo
        const list = Array.from(map.values());
        list.forEach(g => {
            g.columnas.sort((a, b) => (a.identificacion_campo ?? 0) - (b.identificacion_campo ?? 0));
        });
        return list.sort((a, b) => {
            if (a.codigo_tipo_ensayo !== b.codigo_tipo_ensayo) return a.codigo_tipo_ensayo - b.codigo_tipo_ensayo;
            return a.numero_tabla - b.numero_tabla;
        });
    }, [mediciones]);

    const handleEdit = (group: TablaGroup) => {
        setSelectedGroup(group);
        setIsDesigning(true);
    };

    const handleAddNew = () => {
        setSelectedGroup(null);
        setIsDesigning(true);
    };

    const handleSuccess = () => {
        fetchAll();
        setIsDesigning(false);
        setSelectedGroup(null);
    };

    const handleCancel = () => {
        setIsDesigning(false);
        setSelectedGroup(null);
    };

    return (
        <div className="flex flex-col gap-4">
            <Card>
                <CardHeader>
                    <CardTitle>Diseñador de Tablas de Mediciones</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        Crea, edita y asocia tablas de mediciones a tus tipos de ensayo. Cada tabla puede contener
                        múltiples secciones (agrupadas por tipo de medición) y dentro de cada sección, los campos
                        que se capturarán durante el ensayo.
                    </p>
                </CardContent>
            </Card>

            {isDesigning ? (
                <TablaDesigner
                    tiposEnsayo={tiposEnsayo}
                    tiposMedicion={tiposMedicion}
                    mediciones={mediciones}
                    initialGroup={selectedGroup}
                    onSuccess={handleSuccess}
                    onCancel={handleCancel}
                />
            ) : (
                <TablaDesignList
                    grupos={grupos}
                    tiposEnsayo={tiposEnsayo}
                    tiposMedicion={tiposMedicion}
                    isLoading={isLoading || !hasFetched}
                    onEdit={handleEdit}
                    onAddNew={handleAddNew}
                />
            )}
        </div>
    );
}
