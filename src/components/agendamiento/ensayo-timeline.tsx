"use client";

import { useEffect, useState } from "react";
import { PlaneTakeoff, Hourglass, Square } from "lucide-react";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function formatLabel(v: Date | string): string {
  const d = toDate(v);
  return `${DIAS[d.getDay()]} ${d.getDate()}, ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

function toDate(v: Date | string): Date {
  if (v instanceof Date) return v;
  // Si el string es "YYYY-MM-DD", parsearlo como fecha local (no UTC)
  // para evitar que la zona horaria reste un día.
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  if (typeof v === "string" && v.includes("T")) {
    const [datePart] = v.split("T");
    const [y, m, d] = datePart.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(v);
}

interface EnsayoTimelineProps {
  fechaInicio: Date | string;
  fechaFin: Date | string;
  /** Opcional: si no hay extensión, Fin se dibuja como el punto final de la línea. */
  fechaExtension?: Date | string;
}

// ── Layout constants (mismo diseño que el Gantt de referencia) ──
const LINE_PCT = 44;
const ICON_R_PCT = 84;
const ICON_L_PCT = 11;
const ICON_SZ = 76;
const DOT_SZ = 12;
const CONT_H = 480;

const TOP_MIN = 7;
const TOP_MAX = 90;

/** Línea de tiempo vertical de un ensayo: inicio -> (hoy) -> fin -> extensión (si existe). */
export function EnsayoTimeline({ fechaInicio, fechaFin, fechaExtension }: Readonly<EnsayoTimelineProps>) {
  const inicio = toDate(fechaInicio);
  const fin = toDate(fechaFin);
  const tieneExtension = !!fechaExtension;
  const ext = tieneExtension ? toDate(fechaExtension) : fin;

  // "hoy" se calcula solo en cliente para evitar hydration mismatch.
  const [hoy, setHoy] = useState<Date | null>(null);
  useEffect(() => {
    setHoy(new Date());
  }, []);

  const totalMs = ext.getTime() - inicio.getTime();

  const topPct = (d: Date): number => {
    if (totalMs === 0) return (TOP_MIN + TOP_MAX) / 2;
    const raw = ((d.getTime() - inicio.getTime()) / totalMs) * (TOP_MAX - TOP_MIN) + TOP_MIN;
    return Math.max(TOP_MIN, Math.min(TOP_MAX, raw));
  };

  const inicioTop = TOP_MIN;
  const finTop = tieneExtension ? topPct(fin) : TOP_MAX;
  const extTop = TOP_MAX;
  const hoyTop = hoy ? (hoy < inicio ? 1 : topPct(hoy)) : 0;

  const half = ICON_SZ / 2;
  const hdot = DOT_SZ / 2;

  return (
    <div className="relative w-full select-none" style={{ height: CONT_H }}>
      <div
        className="absolute top-0 bottom-0 bg-gray-300"
        style={{ left: `${LINE_PCT}%`, width: 2, transform: "translateX(-50%)" }}
      />

      {/* ════════ FECHA INICIO ════════ */}
      <div
        className="absolute text-[11px] text-gray-500 text-right leading-tight"
        style={{
          top: `${inicioTop}%`,
          transform: "translateY(-50%)",
          right: `${100 - LINE_PCT + 2}%`,
          maxWidth: `${LINE_PCT - 4}%`,
        }}
      >
        Fecha inicio del ensayo
      </div>
      <div
        className="absolute bg-gray-400 rounded-full border-2 border-white z-10"
        style={{ width: DOT_SZ, height: DOT_SZ, top: `${inicioTop}%`, left: `${LINE_PCT}%`, transform: "translate(-50%, -50%)" }}
      />
      <div
        className="absolute bg-gray-300"
        style={{
          height: 2,
          top: `${inicioTop}%`,
          transform: "translateY(-50%)",
          left: `calc(${LINE_PCT}% + ${hdot}px)`,
          right: `calc(${100 - ICON_R_PCT}% + ${half}px)`,
        }}
      />
      <div
        className="absolute bg-gray-400 rounded-full flex items-center justify-center text-white shadow-md"
        style={{ width: ICON_SZ, height: ICON_SZ, top: `${inicioTop}%`, left: `${ICON_R_PCT}%`, transform: "translate(-50%, -50%)" }}
      >
        <PlaneTakeoff size={26} />
      </div>
      <div
        className="absolute text-[11px] text-gray-600 font-medium leading-tight text-center"
        style={{ top: `calc(${inicioTop}% + ${half + 6}px)`, left: `${ICON_R_PCT}%`, transform: "translateX(-50%)", width: 110 }}
      >
        {formatLabel(inicio)}
      </div>

      {/* ════════ HOY ════════ */}
      {hoy && (
        <>
          <div
            className="absolute flex items-center justify-end gap-1.5"
            style={{ top: `${hoyTop}%`, transform: "translateY(-50%)", left: 0, width: `calc(${LINE_PCT}% - 1px)` }}
          >
            <span className="text-[11px] text-gray-500 font-semibold">Hoy</span>
            <div style={{ width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "8px solid #64748b" }} />
          </div>
          <div
            className="absolute border-t-2 border-dashed border-blue-400"
            style={{ top: `${hoyTop}%`, transform: "translateY(-50%)", left: `${LINE_PCT}%`, right: 0 }}
          />
        </>
      )}

      {/* ════════ FECHA FIN ════════ */}
      <div
        className="absolute bg-blue-900 rounded-full flex items-center justify-center text-white shadow-md"
        style={{ width: ICON_SZ, height: ICON_SZ, top: `${finTop}%`, left: `${ICON_L_PCT}%`, transform: "translate(-50%, -50%)" }}
      >
        <Hourglass size={26} />
      </div>
      <div
        className="absolute bg-blue-900"
        style={{
          height: 2,
          top: `${finTop}%`,
          transform: "translateY(-50%)",
          left: `calc(${ICON_L_PCT}% + ${half}px)`,
          right: `calc(${100 - LINE_PCT}% + ${hdot}px)`,
        }}
      />
      <div
        className="absolute bg-blue-800 rounded-full border-2 border-white z-10"
        style={{ width: DOT_SZ, height: DOT_SZ, top: `${finTop}%`, left: `${LINE_PCT}%`, transform: "translate(-50%, -50%)" }}
      />
      <div
        className="absolute text-[11px] text-gray-500 leading-tight"
        style={{ top: `${finTop}%`, transform: "translateY(-50%)", left: `calc(${LINE_PCT}% + ${hdot + 8}px)` }}
      >
        Fecha fin del ensayo
      </div>
      <div
        className="absolute text-[11px] text-gray-600 font-medium leading-tight text-center"
        style={{ top: `calc(${finTop}% + ${half + 6}px)`, left: `${ICON_L_PCT}%`, transform: "translateX(-50%)", width: 110 }}
      >
        {formatLabel(fin)}
      </div>

      {/* ════════ FECHA EXTENSIÓN (solo si existe) ════════ */}
      {tieneExtension && (
        <>
          <div
            className="absolute text-[11px] text-gray-500 text-right leading-tight"
            style={{
              top: `${extTop}%`,
              transform: "translateY(-50%)",
              right: `${100 - LINE_PCT + 2}%`,
              maxWidth: `${LINE_PCT - 4}%`,
            }}
          >
            Fecha extensión del ensayo
          </div>
          <div
            className="absolute bg-red-500 rounded-full border-2 border-white z-10"
            style={{ width: DOT_SZ, height: DOT_SZ, top: `${extTop}%`, left: `${LINE_PCT}%`, transform: "translate(-50%, -50%)" }}
          />
          <div
            className="absolute bg-red-400"
            style={{
              height: 2,
              top: `${extTop}%`,
              transform: "translateY(-50%)",
              left: `calc(${LINE_PCT}% + ${hdot}px)`,
              right: `calc(${100 - ICON_R_PCT}% + ${half}px)`,
            }}
          />
          <div
            className="absolute bg-red-600 rounded-full flex items-center justify-center text-white shadow-md"
            style={{ width: ICON_SZ, height: ICON_SZ, top: `${extTop}%`, left: `${ICON_R_PCT}%`, transform: "translate(-50%, -50%)" }}
          >
            <Square size={22} />
          </div>
          <div
            className="absolute text-[11px] text-gray-600 font-medium leading-tight text-center"
            style={{ top: `calc(${extTop}% + ${half + 6}px)`, left: `${ICON_R_PCT}%`, transform: "translateX(-50%)", width: 110 }}
          >
            {formatLabel(ext)}
          </div>
        </>
      )}
    </div>
  );
}
