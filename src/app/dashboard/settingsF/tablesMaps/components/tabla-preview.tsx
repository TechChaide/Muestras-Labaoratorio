"use client";

import { useMemo } from 'react';
import type { EnsayoMediciones, TipoMedicion } from '@/types/interfaces';

interface Props {
    columnas: EnsayoMediciones[];
    tiposMedicion: TipoMedicion[];
}

interface SeccionVisual {
    codigo_tipo_medicion: number | null;
    nombre: string;
    seccion?: string;
    columnas: EnsayoMediciones[];
}

// Parsea "mediciones_minimas" como número de subdivisiones. Por defecto 1.
const parseSplits = (raw?: string): number => {
    if (!raw) return 1;
    const n = parseInt(String(raw).trim(), 10);
    if (isNaN(n) || n < 1) return 1;
    return Math.min(n, 20); // cap razonable
};

export default function TablaPreview({ columnas, tiposMedicion }: Props) {
    const secciones = useMemo<SeccionVisual[]>(() => {
        const map = new Map<string, SeccionVisual>();
        const ordered = [...columnas].sort(
            (a, b) => (a.identificacion_campo ?? 0) - (b.identificacion_campo ?? 0)
        );
        for (const c of ordered) {
            const codTm = c.codigo_tipo_medicion ?? 0;
            const tm = tiposMedicion.find(t => t.codigo_tipo_medicion === codTm);
            const key = String(codTm);
            if (!map.has(key)) {
                map.set(key, {
                    codigo_tipo_medicion: codTm || null,
                    nombre: tm?.nombre_tipo_medicion || (codTm ? `Sección #${codTm}` : 'Sin sección'),
                    seccion: tm?.seccion,
                    columnas: [],
                });
            }
            map.get(key)!.columnas.push(c);
        }
        return Array.from(map.values());
    }, [columnas, tiposMedicion]);

    // ¿Existe alguna columna con más de 1 medición? Si sí, agregamos fila inferior con sub-índices.
    const anySplit = useMemo(
        () => columnas.some(c => parseSplits(c.mediciones_minimas) > 1),
        [columnas]
    );

    if (columnas.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground border rounded-md bg-muted/30">
                Aún no hay columnas definidas. Agrega secciones y campos para verlos aquí.
            </div>
        );
    }

    const colorClasses = [
        'bg-blue-50 text-blue-900 border-blue-200',
        'bg-orange-50 text-orange-900 border-orange-200',
        'bg-emerald-50 text-emerald-900 border-emerald-200',
        'bg-purple-50 text-purple-900 border-purple-200',
        'bg-rose-50 text-rose-900 border-rose-200',
        'bg-amber-50 text-amber-900 border-amber-200',
    ];

    // colSpan de cada sección = suma de splits de sus columnas
    const seccionColSpan = (s: SeccionVisual) =>
        s.columnas.reduce((acc, c) => acc + parseSplits(c.mediciones_minimas), 0) || 1;

    const headerRowSpan = anySplit ? 3 : 2;

    return (
        <div className="overflow-x-auto border rounded-md bg-white">
            <table className="min-w-full border-collapse text-xs">
                <thead>
                    <tr>
                        <th rowSpan={headerRowSpan} className="border px-2 py-2 bg-gray-100 font-semibold text-gray-700 sticky left-0 z-10">
                            Muestra
                        </th>
                        {secciones.map((s, i) => (
                            <th
                                key={`sec-${i}`}
                                colSpan={seccionColSpan(s)}
                                className={`border px-2 py-1 font-semibold text-center ${colorClasses[i % colorClasses.length]}`}
                            >
                                {s.nombre}
                                {s.seccion ? <div className="text-[10px] font-normal opacity-70">{s.seccion}</div> : null}
                            </th>
                        ))}
                    </tr>
                    <tr>
                        {secciones.flatMap((s, i) =>
                            s.columnas.map((c, j) => {
                                const splits = parseSplits(c.mediciones_minimas);
                                return (
                                    <th
                                        key={`col-${i}-${j}`}
                                        colSpan={splits}
                                        rowSpan={anySplit && splits === 1 ? 2 : 1}
                                        className={`border px-2 py-1 font-medium text-center ${colorClasses[i % colorClasses.length]} bg-opacity-50`}
                                        title={c.mediciones_minimas ? `Mín: ${c.mediciones_minimas}` : undefined}
                                    >
                                        {c.nombre_campo || '(sin nombre)'}
                                        {splits > 1 ? (
                                            <div className="text-[10px] font-normal opacity-60">
                                                {splits} mediciones
                                            </div>
                                        ) : null}
                                    </th>
                                );
                            })
                        )}
                    </tr>
                    {anySplit && (
                        <tr>
                            {secciones.flatMap((s, i) =>
                                s.columnas.flatMap((c, j) => {
                                    const splits = parseSplits(c.mediciones_minimas);
                                    if (splits <= 1) return []; // ya tomó rowSpan=2
                                    return Array.from({ length: splits }).map((_, k) => (
                                        <th
                                            key={`sub-${i}-${j}-${k}`}
                                            className={`border px-1 py-1 font-normal text-center ${colorClasses[i % colorClasses.length]} bg-opacity-30 text-[11px]`}
                                        >
                                            {k + 1}
                                        </th>
                                    ));
                                })
                            )}
                        </tr>
                    )}
                </thead>
                <tbody>
                    {[1, 2, 3].map((row) => (
                        <tr key={row}>
                            <td className="border px-2 py-2 text-center font-medium bg-gray-50 sticky left-0">
                                ({row})
                            </td>
                            {secciones.flatMap((s, i) =>
                                s.columnas.flatMap((c, j) => {
                                    const splits = parseSplits(c.mediciones_minimas);
                                    return Array.from({ length: splits }).map((_, k) => (
                                        <td
                                            key={`r-${row}-${i}-${j}-${k}`}
                                            className="border px-2 py-2 text-center text-muted-foreground min-w-[48px]"
                                        >
                                            —
                                        </td>
                                    ));
                                })
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
