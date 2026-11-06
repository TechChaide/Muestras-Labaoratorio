"use client";

import { useEffect, useState } from 'react';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
} from "@/components/ui/sheet";
import { FlaskConical, Loader2 } from 'lucide-react';
import type { Familia, Muestra } from '@/types/interfaces';
import { muestraService } from '@/services/muestrasLaboratorio/muestra.service';
import MaterialFields, { emptyMaterialFields, type MaterialFieldsValue } from '@/components/muestras/material-fields';

const toDatetimeLocalValue = (date: Date): string => {
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const parseFechaCarga = (value?: Date | string | null): string => {
    if (!value) return '';
    if (typeof value === 'string') {
        // "2026-09-21T11:14:00.000Z" o "2026-09-21 11:14:00"
        const isoLocal = value.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}):(\d{2})/);
        if (isoLocal) {
            return `${isoLocal[1]}T${isoLocal[2]}:${isoLocal[3]}`;
        }
        const d = new Date(value);
        return toDatetimeLocalValue(d);
    }
    return toDatetimeLocalValue(value);
};

const muestraToFields = (m: Muestra): MaterialFieldsValue => {
    const fam = m.codigo_familia_material;
    const famNum = fam === null || fam === undefined || fam === ('' as unknown as number)
        ? ''
        : Number(fam);
    return {
        codigo_familia_material: famNum === '' || Number.isNaN(famNum as number) ? '' : (famNum as number),
        nombre_material_muestra: m.nombre_material_muestra ?? '',
        area_material: m.area_material ?? '',
        detalle_material: m.detalle_material ?? '',
        material: m.material ?? '',
        fecha_carga: parseFechaCarga(m.fecha_carga) || emptyMaterialFields.fecha_carga,
    };
};

interface Props {
    muestra: Muestra;
    familias: Familia[];
    onSuccess: () => void;
    onCancel: () => void;
}

export default function MuestraEditPanel({ muestra, familias, onSuccess, onCancel }: Props) {
    const { toast } = useToast();
    const [draft, setDraft] = useState<MaterialFieldsValue>(() => muestraToFields(muestra));
    const [identificadores, setIdentificadores] = useState<string[]>(muestra.identificadores_ensayo || []);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    // Recargar por ID para no depender del listado (puede venir incompleto).
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        muestraService.getById(muestra.codigo_muestra)
            .then((res) => {
                if (cancelled) return;
                const full = res.data;
                if (full) {
                    setDraft(muestraToFields(full));
                    if (full.identificadores_ensayo?.length) {
                        setIdentificadores(full.identificadores_ensayo);
                    }
                }
            })
            .catch((err) => {
                if (cancelled) return;
                // Si falla getById, al menos usamos lo del listado.
                setDraft(muestraToFields(muestra));
                const msg = err instanceof Error ? err.message : 'No se pudo recargar la muestra.';
                toast({ title: 'Aviso', description: msg, variant: 'destructive' });
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [muestra.codigo_muestra]);

    const setField = <K extends keyof MaterialFieldsValue>(key: K, value: MaterialFieldsValue[K]) => {
        setDraft(p => ({ ...p, [key]: value }));
        if (key === 'nombre_material_muestra') setErrors(e => ({ ...e, nombre_material_muestra: '' }));
    };

    const handleSave = async () => {
        if (!draft.nombre_material_muestra.trim()) {
            setErrors({ nombre_material_muestra: 'El nombre del material es requerido.' });
            return;
        }
        setSaving(true);
        try {
            await muestraService.save({
                ...muestra,
                codigo_muestra: muestra.codigo_muestra,
                codigo_familia_material: draft.codigo_familia_material === '' ? undefined : Number(draft.codigo_familia_material),
                nombre_material_muestra: draft.nombre_material_muestra.trim(),
                area_material: draft.area_material || undefined,
                detalle_material: draft.detalle_material || undefined,
                material: draft.material || undefined,
                fecha_carga: draft.fecha_carga ? new Date(draft.fecha_carga) : undefined,
                estado: muestra.estado || 'A',
            });
            toast({ title: 'Muestra actualizada', description: 'Los datos se guardaron correctamente.' });
            onSuccess();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'No se pudo actualizar la muestra.';
            toast({ title: 'Error', description: msg, variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col h-full">
            <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                    <FlaskConical className="h-5 w-5 text-primary" />
                    Editar Muestra #{muestra.codigo_muestra}
                </SheetTitle>
                <SheetDescription>
                    Modifica los datos del material registrado.
                    {identificadores.length > 0 && (
                        <> Solicitud(es): {identificadores.join(', ')}</>
                    )}
                </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto -mx-6 px-6 py-4">
                {loading ? (
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Cargando datos de la muestra...
                    </p>
                ) : (
                    <MaterialFields
                        key={`edit-${muestra.codigo_muestra}-${draft.material}`}
                        value={draft}
                        onChange={setField}
                        errors={errors}
                        familias={familias}
                        allowMaterialSearch
                    />
                )}
            </div>

            <SheetFooter className="pt-4 border-t gap-2">
                <Button type="button" variant="outline" onClick={onCancel} disabled={saving || loading}>
                    Cancelar
                </Button>
                <Button type="button" onClick={handleSave} disabled={saving || loading}>
                    {saving ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...
                        </>
                    ) : (
                        'Guardar cambios'
                    )}
                </Button>
            </SheetFooter>
        </div>
    );
}
