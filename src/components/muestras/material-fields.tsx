"use client";

import { useEffect, useRef, useState } from 'react';
import { useMaterialSearch } from "@/hooks/use-material-search";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from 'lucide-react';
import type { Familia } from '@/types/interfaces';
import type { MaterialResult } from '@/services/muestrasLaboratorio/servicios.service';

export interface MaterialFieldsValue {
    codigo_familia_material: number | '';
    nombre_material_muestra: string;
    area_material: string;
    detalle_material: string;
    material: string;
    fecha_carga: string;
}

const toDatetimeLocalValue = (date: Date): string => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const emptyMaterialFields: MaterialFieldsValue = {
    codigo_familia_material: '',
    nombre_material_muestra: '',
    area_material: '',
    detalle_material: '',
    material: '',
    fecha_carga: toDatetimeLocalValue(new Date()),
};

interface Props {
    value: MaterialFieldsValue;
    onChange: <K extends keyof MaterialFieldsValue>(key: K, value: MaterialFieldsValue[K]) => void;
    errors?: Record<string, string>;
    familias: Familia[];
    familiasLoading?: boolean;
    /** Si false, oculta la búsqueda en vivo del maestro SAP (solicitud externa). */
    allowMaterialSearch?: boolean;
}

/** Sección reutilizable de datos del material — usada en el wizard de Nueva Solicitud y en Carga de Muestras. */
export default function MaterialFields({
    value,
    onChange,
    errors = {},
    familias,
    familiasLoading,
    allowMaterialSearch = true,
}: Props) {
    const {
        termino: materialQuery,
        setTermino: setMaterialQuery,
        resultados: materialResultados,
        loading: materialSearchLoading,
        error: materialSearchError,
    } = useMaterialSearch();
    const [showMaterialDropdown, setShowMaterialDropdown] = useState(false);
    const materialBoxRef = useRef<HTMLDivElement>(null);
    const seededMaterialRef = useRef(false);

    // Precargar el input del maestro con el código ya guardado (modo edición).
    useEffect(() => {
        if (!allowMaterialSearch) return;
        if (seededMaterialRef.current) return;
        if (!value.material?.trim()) return;
        seededMaterialRef.current = true;
        setMaterialQuery(value.material.trim());
    }, [allowMaterialSearch, value.material, setMaterialQuery]);

    useEffect(() => {
        if (!allowMaterialSearch) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (materialBoxRef.current && !materialBoxRef.current.contains(e.target as Node)) {
                setShowMaterialDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [allowMaterialSearch]);

    const selectMaterial = (m: MaterialResult) => {
        onChange('material', m.MATERIAL);
        if (!value.nombre_material_muestra.trim()) {
            onChange('nombre_material_muestra', m.DESCRIPCION);
        }
        setMaterialQuery(`${m.MATERIAL} — ${m.DESCRIPCION}`);
        setShowMaterialDropdown(false);
    };

    const materialBlock = (
        <div className="space-y-1.5 sm:col-span-2 relative" ref={materialBoxRef}>
            <Label className="text-xs text-muted-foreground">
                {allowMaterialSearch ? 'Material (maestro SAP)' : 'Código de material (opcional)'}
            </Label>
            {allowMaterialSearch ? (
                <>
                    <Input
                        placeholder="Busca por código o descripción (mín. 2 caracteres)..."
                        value={materialQuery}
                        onChange={e => {
                            setMaterialQuery(e.target.value);
                            setShowMaterialDropdown(true);
                            if (value.material) onChange('material', '');
                        }}
                        onFocus={() => setShowMaterialDropdown(true)}
                    />
                    {showMaterialDropdown && materialQuery.trim().length >= 2 && (
                        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-md border bg-background shadow-lg">
                            {materialSearchLoading ? (
                                <p className="p-2 text-xs text-muted-foreground flex items-center gap-2">
                                    <Loader2 className="h-3 w-3 animate-spin" /> Buscando...
                                </p>
                            ) : materialSearchError ? (
                                <p className="p-2 text-xs text-red-600">
                                    No se pudo buscar: {materialSearchError}
                                </p>
                            ) : materialResultados.length === 0 ? (
                                <p className="p-2 text-xs text-muted-foreground">Sin resultados.</p>
                            ) : (
                                materialResultados.map((m, idx) => (
                                    <button
                                        key={`${m.MATERIAL}-${m.CENTRO}-${idx}`}
                                        type="button"
                                        onClick={() => selectMaterial(m)}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex flex-col border-b last:border-b-0"
                                    >
                                        <span className="font-medium font-mono">{m.MATERIAL}</span>
                                        <span className="text-xs text-muted-foreground truncate">
                                            {m.DESCRIPCION}{m.CENTRO ? ` · Centro ${m.CENTRO}` : ''}
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    )}
                    {value.material && (
                        <p className="text-xs text-muted-foreground">
                            Código seleccionado: <span className="font-mono">{value.material}</span>
                        </p>
                    )}
                </>
            ) : (
                <Input
                    placeholder="Ingresa el código manualmente si lo conoces"
                    value={value.material}
                    onChange={e => onChange('material', e.target.value)}
                />
            )}
        </div>
    );

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Buscador SAP siempre primero */}
            {materialBlock}

            <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">
                    Nombre del material <span className="text-red-500">*</span>
                </Label>
                <Input
                    placeholder="Ej: Cable de cobre THHN 12 AWG"
                    value={value.nombre_material_muestra}
                    onChange={e => onChange('nombre_material_muestra', e.target.value)}
                    className={errors.nombre_material_muestra ? 'border-red-500 focus-visible:ring-red-400' : ''}
                />
                {errors.nombre_material_muestra && (
                    <p className="text-xs text-red-500">{errors.nombre_material_muestra}</p>
                )}
            </div>

            <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Familia del material</Label>
                <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={value.codigo_familia_material === '' ? '' : String(value.codigo_familia_material)}
                    onChange={e => onChange('codigo_familia_material', e.target.value === '' ? '' : Number(e.target.value))}
                    disabled={familiasLoading}
                >
                    <option value="">Sin especificar</option>
                    {familias.map(f => (
                        <option key={f.codigo_familia} value={String(f.codigo_familia)}>{f.nombre_familia}</option>
                    ))}
                </select>
            </div>

            <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Área del material</Label>
                <Input
                    placeholder="Ej: Producción"
                    value={value.area_material}
                    onChange={e => onChange('area_material', e.target.value)}
                />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Detalle del material</Label>
                <Textarea
                    placeholder="Observaciones adicionales del material..."
                    className="resize-none"
                    rows={3}
                    value={value.detalle_material}
                    onChange={e => onChange('detalle_material', e.target.value)}
                />
            </div>

            <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Fecha ingreso de la muestra</Label>
                <Input
                    type="datetime-local"
                    value={value.fecha_carga}
                    onChange={e => onChange('fecha_carga', e.target.value)}
                />
            </div>
        </div>
    );
}
