"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Loader2, Pencil, Save, Send, CheckCircle2, XCircle, Clock, ClipboardList, Info } from "lucide-react";
import type { Columna, Resultado, Tabla } from "@/types/interfaces";
import {
  calcularCorrecciones,
  leerValoresMostrados,
  resultadoVigente,
  type CeldaValidable,
} from "@/lib/validacion-resultados";
import { formularioService } from "@/services/muestrasLaboratorio/formulario.service";
import { tablaService } from "@/services/muestrasLaboratorio/tabla.service";
import { resultadoService } from "@/services/muestrasLaboratorio/resultado.service";
import { ensayoCategoriaEnsayoService } from "@/services/muestrasLaboratorio/ensayoCategoriaEnsayo.service";
import { configuracionService } from "@/services/seguridades/configuracion.service";
import {
  formulaApi,
  loadFormFormulaContext,
  bindLiveFormulas,
  cellRefToken,
  tomaDeCelda,
  parseValorNumerico,
  type FormCellSnapshot,
  type FormulaValueMap,
  type LiveFormulaDef,
} from "@/lib/formula";
import { EnsayoContexto } from "@/components/agendamiento/ensayo-contexto";
import { etiquetaEnsayo, type EnsayoAgendable } from "@/components/agendamiento/types";
import { FormularioResultadosGrid, formatValor } from "./formulario-resultados-grid";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useUsersInfo } from "@/hooks/use-users-info";

interface CapturaResultadosProps {
  item: EnsayoAgendable;
  onBack: () => void;
  /** Modo revisión (jefe de área aprobando/rechazando resultados ya capturados):
   * fuerza la grilla a solo-lectura, oculta Guardar/Editar/Notificar y muestra
   * el panel de Aprobar/Rechazar en vez de la pestaña de notificación. */
  soloLectura?: boolean;
  /** Se llama tras registrar una aprobación o rechazo exitosos. */
  onDecidido?: () => void;
  /**
   * Oculta la pestaña/botón de notificación individual: la culminación se
   * notifica a nivel de solicitud cuando TODOS los ensayos están completos.
   */
  ocultarNotificacion?: boolean;
  /** Reporta al padre el progreso de captura (para habilitar notificación de solicitud). */
  onEstadoCapturaChange?: (estado: {
    codigoEnsayo: number;
    todoCompletado: boolean;
    estadoAprobacion?: string;
  }) => void;
  /** Registro de funciones persistirResultados por ensayo (para guardar todo antes de notificar). */
  persistRegistry?: MutableRefObject<Map<number, () => Promise<void>>>;
  /** El padre ya mostró identificador y material: aquí solo el tipo de ensayo. */
  contextoEnPadre?: boolean;
  /** Consulta de datos capturados (periodo vencido): solo lectura, sin editar ni aprobar. */
  soloConsulta?: boolean;
}

interface Seccion {
  key: string;
  cabecera: string;
  tabla: Tabla;
  celdas: FormCellSnapshot[];
}

const asArray = <T,>(data: T | T[] | undefined): T[] => (Array.isArray(data) ? data : data ? [data] : []);

/** Texto numérico guardado. `resultados` conserva lo escrito; `valor` es el respaldo. */
function textoCapturado(row: { valor?: number | string | null; resultados?: string | null }): string {
  const crudo = row.resultados ?? "";
  if (crudo.trim() !== "" && parseValorNumerico(crudo) != null) return crudo;
  if (row.valor == null || String(row.valor).trim() === "") return "";
  const s = String(row.valor).trim();
  if (!s.includes(".")) return s;
  return s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

/** Tipos de dato que se guardan como texto en Resultado.resultados en vez de Resultado.valor.
 * "imagen" guarda ahí la URL relativa del archivo subido (ver upload.service.ts). */
const TEXT_TIPOS_DATO = new Set(["texto", "fecha", "booleano", "imagen"]);

/** Una celda "calculated" siempre produce un número (la calcula el motor de
 * fórmulas) sin importar su tipo_dato: ese campo puede haber quedado en su
 * valor por defecto ("texto") simplemente porque nunca se tocó a propósito
 * para una celda calculada — no significa que el resultado sea texto. */
const esCeldaTexto = (cell: Pick<FormCellSnapshot, "tipo_celda" | "tipo_dato">) =>
  cell.tipo_celda !== "calculated" && TEXT_TIPOS_DATO.has(cell.tipo_dato);

/** Celdas de captura y celdas calculadas se persisten. Las de diseño ("nulos") no. */
const esCeldaPersistible = (cell: Pick<FormCellSnapshot, "tipo_celda" | "tipo_dato">) =>
  cell.tipo_celda === "calculated" || (cell.tipo_celda === "input" && cell.tipo_dato !== "nulos");

type ValorPersistido = { id: number; valor?: number; texto?: string; toma?: number };

// codigo_empleado identifica a los usuarios internos (ver dashboard/layout.tsx) y es
// lo que las fichas de seguridadesGuard (CODIGO) usan para resolver nombres en los
// correos de notificación — id_usuario solo aplica a usuarios externos, que no
// aparecen en esa ficha. Se intenta codigo_empleado primero por eso.
const getCurrentUser = (): string | undefined => {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem("user") : null;
    if (!raw) return undefined;
    const user = JSON.parse(raw);
    return user?.codigo_empleado ? String(user.codigo_empleado) : user?.id_usuario ? String(user.id_usuario) : undefined;
  } catch {
    return undefined;
  }
};

/** Pantalla de captura de resultados de UN ensayo: renderiza todas las tablas
 * del formulario asignado como grillas editables, recalcula las celdas
 * calculadas en vivo y permite guardar avances parciales en cualquier momento. */
export default function CapturaResultados({
  item,
  onBack,
  soloLectura = false,
  onDecidido,
  ocultarNotificacion = false,
  onEstadoCapturaChange,
  persistRegistry,
  contextoEnPadre = false,
  soloConsulta = false,
}: Readonly<CapturaResultadosProps>) {
  const { toast } = useToast();
  const { usersInfo } = useUsersInfo();
  const nombreResponsable = (() => {
    const codigo = item.responsable_ensayo;
    if (!codigo) return "Sin asignar";
    const u = usersInfo.find((e) => String(e.CODIGO).trim() === String(codigo).trim());
    return u?.NOMBRE || codigo;
  })();
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [columnsByTable, setColumnsByTable] = useState<Map<number, Columna[]>>(new Map());
  const [allCells, setAllCells] = useState<FormCellSnapshot[]>([]);
  const [liveFormulas, setLiveFormulas] = useState<LiveFormulaDef[]>([]);
  const [inputValues, setInputValues] = useState<FormulaValueMap>({});
  /** Texto tal cual lo escribió el usuario en cada celda de captura. */
  const [inputTexts, setInputTexts] = useState<Record<string, string>>({});
  /** Valores de celdas "texto" / "fecha" / "booleano": no participan en fórmulas,
   * se guardan en Resultado.resultados (string) en vez de Resultado.valor (float). */
  const [textValues, setTextValues] = useState<Record<string, string>>({});
  const [resultadosById, setResultadosById] = useState<Map<string, number>>(new Map());
  /** Foto de lo último cargado o guardado, para no reenviar celdas sin cambio. */
  const baselineRef = useRef<Map<string, ValorPersistido>>(new Map());
  /** Modo solo-lectura: se activa solo al ENTRAR a un ensayo que ya tenía el
   * 100% de sus campos guardados. No se reactiva solo mientras el usuario
   * edita — para eso está el botón "Editar". */
  const [viewMode, setViewMode] = useState(false);
  const viewModeAppliedFor = useRef<number | undefined>(undefined);
  /** Estado de revisión post-captura: undefined (nunca notificado), 'PA' pendiente,
   * 'AP' aprobado, 'RE' rechazado. Se refleja localmente tras notificar. */
  const [estadoAprobacion, setEstadoAprobacion] = useState(item.codigo_estado_aprobacion);
  const [notificando, setNotificando] = useState(false);
  /** Solo se usa en modo revisión (soloLectura): decisión de aprobación. */
  const [observaciones, setObservaciones] = useState(item.observaciones_aprobacion || "");
  const [procesandoDecision, setProcesandoDecision] = useState<"AP" | "RE" | null>(null);

  const efectivoViewMode = soloLectura || soloConsulta || viewMode;
  const contenedorTablasRef = useRef<HTMLDivElement>(null);
  const validadoAlAbrirRef = useRef<number | undefined>(undefined);

  const fetchAll = useCallback(async () => {
    if (!item.codigo_formulario) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const ensayoId = Number(item.codigo_ensayo_categoria_ensayo);
      const [tablasFormRes, capturaRes] = await Promise.all([
        formularioService.getTablas(item.codigo_formulario, ensayoId),
        resultadoService.getPorEnsayoTabla(ensayoId).catch(() => null),
      ]);

      let captura = capturaRes;
      if (!captura) {
        const fallback = await resultadoService.getByEnsayos([ensayoId]).catch(() => ({ data: [] as Resultado[] }));
        captura = { data: asArray(fallback.data), size: 0, versiones: [] };
      }

      const links = asArray(tablasFormRes.data)
        .filter((l) => (l.estado || "A") !== "I" && !!l.codigo_tabla)
        .sort((a, b) => (Number(a.posicion) || 0) - (Number(b.posicion) || 0));

      const tablaPorLink = new Map<number, Tabla>();
      for (const l of links) {
        if (l.tabla?.codigo_tabla) tablaPorLink.set(l.codigo_formulario_tabla, l.tabla);
      }
      const faltantes = links.filter(
        (l) => l.codigo_formulario_tabla != null && !tablaPorLink.has(l.codigo_formulario_tabla)
      );
      if (faltantes.length > 0) {
        const extra = await Promise.all(
          faltantes.map((l) => tablaService.getById(l.codigo_tabla!).catch(() => null))
        );
        faltantes.forEach((l, i) => {
          const t = extra[i]?.data;
          if (t?.codigo_tabla && l.codigo_formulario_tabla != null) {
            tablaPorLink.set(l.codigo_formulario_tabla, t);
          }
        });
      }

      const tableIds = [
        ...new Set(
          links
            .map((l) => tablaPorLink.get(l.codigo_formulario_tabla)?.codigo_tabla)
            .filter((id): id is number => !!id)
        ),
      ];

      const ctx = await loadFormFormulaContext(tableIds);
      const liveDefs = bindLiveFormulas(ctx.drafts, ctx.cells, ctx.refMap);
      const formulaIdsLoad = new Set(liveDefs.map((f) => f.id));
      setAllCells(ctx.cells);
      setColumnsByTable(ctx.columnsByTable);
      setLiveFormulas(liveDefs);

      const nuevasSecciones: Seccion[] = links.flatMap((l) => {
        const tabla = tablaPorLink.get(l.codigo_formulario_tabla);
        if (!tabla) return [];
        const celdas = ctx.cells
          .filter((c) => c.codigo_tabla === tabla.codigo_tabla)
          .sort((a, b) => a.fila - b.fila || a.col - b.col);
        return [
          {
            key: String(l.codigo_formulario_tabla ?? tabla.codigo_tabla),
            cabecera: l.cabecera_formulario || tabla.nombre_tabla || `Tabla #${tabla.codigo_tabla}`,
            tabla,
            celdas,
          },
        ];
      });
      setSecciones(nuevasSecciones);

      const propios = asArray(captura.data).filter(
        (r) => Number(r.codigo_ensayo_categoria_ensayo) === ensayoId && (r.estado || "A") === "A"
      );
      const cellsById = new Map(ctx.cells.map((c) => [c.codigo_celda, c]));
      const porCelda = new Map<number, Resultado[]>();
      for (const r of propios) {
        if (r.codigo_celda == null) continue;
        const lista = porCelda.get(r.codigo_celda) || [];
        lista.push(r);
        porCelda.set(r.codigo_celda, lista);
      }

      const initialValues: FormulaValueMap = {};
      const initialTextValues: Record<string, string> = {};
      const initialInputTexts: Record<string, string> = {};
      const idMap = new Map<string, number>();
      const baseline = new Map<string, ValorPersistido>();

      for (const [codigoCelda, rows] of porCelda) {
        const cell = cellsById.get(codigoCelda);
        if (!cell || !esCeldaPersistible(cell)) continue;
        const vigente = resultadoVigente(rows);
        if (!vigente?.codigo_resultado) continue;
        const ref = cellRefToken(cell);
        const calculada = cell.tipo_celda === "calculated" || formulaIdsLoad.has(ref);
        if (calculada) {
          const escrito = textoCapturado(vigente);
          const n = parseValorNumerico(escrito || vigente.valor);
          baseline.set(ref, {
            id: vigente.codigo_resultado,
            valor: n,
            texto: escrito || (n != null ? formatValor(n) : ""),
            toma: vigente.toma,
          });
        } else if (esCeldaTexto(cell)) {
          const texto = vigente.resultados ?? "";
          if (texto !== "") initialTextValues[ref] = texto;
          baseline.set(ref, { id: vigente.codigo_resultado, texto, toma: vigente.toma });
        } else {
          const escrito = textoCapturado(vigente);
          const n = parseValorNumerico(escrito || vigente.valor);
          if (escrito !== "") initialInputTexts[ref] = escrito;
          else if (n != null) initialInputTexts[ref] = String(vigente.valor);
          if (n != null) initialValues[ref] = n;
          baseline.set(ref, {
            id: vigente.codigo_resultado,
            valor: n,
            texto: initialInputTexts[ref] ?? "",
            toma: vigente.toma,
          });
        }
        idMap.set(ref, vigente.codigo_resultado);
      }
      baselineRef.current = baseline;
      setInputValues(initialValues);
      setInputTexts(initialInputTexts);
      setTextValues(initialTextValues);
      setResultadosById(idMap);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo cargar el formulario.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [item.codigo_formulario, item.codigo_ensayo_categoria_ensayo, toast]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const formulaIds = useMemo(
    () => new Set(liveFormulas.map((f) => f.id)),
    [liveFormulas]
  );

  const computed = useMemo(
    () => formulaApi.evaluateLive(liveFormulas, inputValues),
    [liveFormulas, inputValues]
  );

  const handleChangeInput = (codigoCelda: number, raw: string) => {
    const cell = allCells.find((c) => c.codigo_celda === codigoCelda);
    if (!cell) return;
    const ref = cellRefToken(cell);
    setInputTexts((prev) => ({ ...prev, [ref]: raw }));
    setInputValues((prev) => {
      const next = { ...prev };
      const n = parseValorNumerico(raw.trim().replace(",", "."));
      if (n == null) delete next[ref];
      else next[ref] = n;
      return next;
    });
  };

  const handleChangeText = (codigoCelda: number, value: string | undefined) => {
    const cell = allCells.find((c) => c.codigo_celda === codigoCelda);
    if (!cell) return;
    const ref = cellRefToken(cell);
    setTextValues((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[ref];
      else next[ref] = value;
      return next;
    });
  };

  /** Celdas de entrada que realmente capturan dato ("nulos" es solo de diseño). */
  const inputCells = useMemo(
    () => allCells.filter((c) => c.tipo_celda === "input" && c.tipo_dato !== "nulos"),
    [allCells]
  );
  const completados = useMemo(
    () => inputCells.filter((c) => {
      const ref = cellRefToken(c);
      if (esCeldaTexto(c)) return !!textValues[ref];
      if (formulaIds.has(ref)) {
        const v = computed.values[ref];
        return v != null && Number.isFinite(v);
      }
      const v = inputValues[ref];
      return v != null && Number.isFinite(v);
    }).length,
    [inputCells, inputValues, textValues, formulaIds, computed.values]
  );

  // Al terminar de cargar un ensayo con el 100% de sus campos ya guardados,
  // entra en modo vista automáticamente. Solo se aplica una vez por ensayo
  // (al entrar), no cada vez que completados cambia mientras se edita.
  useEffect(() => {
    if (isLoading) return;
    if (viewModeAppliedFor.current === item.codigo_ensayo_categoria_ensayo) return;
    viewModeAppliedFor.current = item.codigo_ensayo_categoria_ensayo;
    setViewMode(inputCells.length > 0 && completados === inputCells.length);
  }, [isLoading, completados, inputCells.length, item.codigo_ensayo_categoria_ensayo]);

  const celdasValidables = useMemo<CeldaValidable[]>(
    () =>
      allCells.filter(esCeldaPersistible).map((c) => ({
        codigo_celda: c.codigo_celda,
        codigo_tabla: c.codigo_tabla,
        esTexto: esCeldaTexto(c) && !formulaIds.has(cellRefToken(c)),
      })),
    [allCells, formulaIds]
  );

  const leerFilasGuardadas = async () => {
    const ensayoId = Number(item.codigo_ensayo_categoria_ensayo);
    const res = await resultadoService
      .getPorEnsayoTabla(ensayoId)
      .catch(() => resultadoService.getByEnsayos([ensayoId]));
    return asArray(res.data).filter(
      (r) => Number(r.codigo_ensayo_categoria_ensayo) === ensayoId && (r.estado || "A") === "A"
    );
  };

  /** Lo que la grilla muestra ahora, aunque la pestaña no esté montada. */
  const valoresEnPantalla = () => {
    const mostrados = new Map<number, string>();
    for (const c of allCells) {
      const ref = cellRefToken(c);
      if (c.tipo_celda === "calculated" || formulaIds.has(ref)) {
        mostrados.set(c.codigo_celda, formatValor(computed.values[ref]));
      } else if (esCeldaTexto(c)) {
        mostrados.set(c.codigo_celda, textValues[ref] ?? "");
      } else {
        mostrados.set(c.codigo_celda, inputTexts[ref] ?? "");
      }
    }
    return mostrados;
  };

  /**
   * Detector: relee la base y la compara con la pantalla. Si una celda no coincide,
   * escribe en esa misma fila lo que se está viendo. No crea ni borra filas.
   */
  const sincronizarConPantalla = async (mostrados: Map<number, string>) => {
    const correcciones = calcularCorrecciones(celdasValidables, await leerFilasGuardadas(), mostrados);
    if (correcciones.length === 0) return;

    const refPorCelda = new Map(allCells.map((c) => [c.codigo_celda, cellRefToken(c)]));
    const salidas = await Promise.allSettled(
      correcciones.map(async (c) => {
        const numerico = c.esTexto ? null : c.valorMostrado.trim().replace(",", ".");
        await resultadoService.save({
          codigo_resultado: c.codigo_resultado,
          codigo_ensayo_categoria_ensayo: item.codigo_ensayo_categoria_ensayo,
          codigo_celda: c.codigo_celda,
          toma: c.toma,
          valor: numerico,
          resultados: c.valorMostrado,
          estado: "A",
        });
        const ref = refPorCelda.get(c.codigo_celda);
        const previo = ref ? baselineRef.current.get(ref) : undefined;
        if (ref && previo) {
          baselineRef.current.set(ref, {
            ...previo,
            texto: c.valorMostrado,
            valor: numerico == null ? undefined : parseValorNumerico(numerico),
          });
        }
      })
    );
    console.info("[validacion-resultados] correcciones", item.codigo_ensayo_categoria_ensayo, correcciones);

    const fallidas = salidas.filter((s) => s.status === "rejected").length;
    const pendientes = calcularCorrecciones(celdasValidables, await leerFilasGuardadas(), mostrados);
    if (fallidas > 0 || pendientes.length > 0) {
      console.warn("[validacion-resultados] sin corregir", item.codigo_ensayo_categoria_ensayo, { fallidas, pendientes });
    }
  };

  useEffect(() => {
    const id = item.codigo_ensayo_categoria_ensayo;
    const contenedor = contenedorTablasRef.current;
    if (isLoading || !contenedor || validadoAlAbrirRef.current === id) return;
    validadoAlAbrirRef.current = id;
    sincronizarConPantalla(leerValoresMostrados(contenedor)).catch((error) => {
      console.warn("[validacion-resultados] no se pudo validar", id, error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, secciones, item.codigo_ensayo_categoria_ensayo]);

  /** Inserta o actualiza. No borra filas: una celda vacía se guarda vacía. */
  const persistirResultados = async () => {
    const now = new Date();
    const usuario = getCurrentUser();
    const baseline = baselineRef.current;
    const nextBaseline = new Map(baseline);
    const ops: Promise<void>[] = [];

    const encolar = (
      cell: FormCellSnapshot,
      texto: string,
      valor: string | null
    ) => {
      const ref = cellRefToken(cell);
      const prev = baseline.get(ref);
      const toma = tomaDeCelda(cell, allCells);
      const vacio = texto.trim() === "" && valor == null;
      if (vacio && !prev?.id) return;
      if (prev?.id && (prev.texto ?? "") === texto && prev.toma === toma) return;
      const id = prev?.id ?? 0;
      const n = valor == null ? undefined : parseValorNumerico(valor);
      ops.push(
        resultadoService
          .save({
            codigo_resultado: id,
            codigo_ensayo_categoria_ensayo: item.codigo_ensayo_categoria_ensayo,
            codigo_celda: cell.codigo_celda,
            toma,
            valor,
            resultados: texto,
            fecha_generacion: now,
            estado: "A",
            ...(id === 0 ? { fecha_creacion: now, usuario_creacion: usuario } : {}),
          })
          .then((res) => {
            const nuevoId = id || res.data?.codigo_resultado;
            if (nuevoId) nextBaseline.set(ref, { id: nuevoId, valor: n, texto, toma });
          })
      );
    };

    for (const cell of inputCells) {
      const ref = cellRefToken(cell);
      if (formulaIds.has(ref)) continue;
      if (esCeldaTexto(cell)) {
        encolar(cell, textValues[ref] ?? "", null);
        continue;
      }
      const escrito = inputTexts[ref] ?? "";
      const n = parseValorNumerico(escrito.trim().replace(",", "."));
      encolar(cell, escrito, n == null ? null : escrito.trim().replace(",", "."));
    }

    for (const cell of allCells) {
      const ref = cellRefToken(cell);
      if (cell.tipo_celda !== "calculated" && !formulaIds.has(ref)) continue;
      const mostrado = formatValor(computed.values[ref]);
      if (!mostrado) continue;
      encolar(cell, mostrado, mostrado);
    }

    await Promise.all(ops);
    baselineRef.current = nextBaseline;
    const idMap = new Map<string, number>();
    for (const [ref, guardado] of nextBaseline) idMap.set(ref, guardado.id);
    setResultadosById(idMap);

    await sincronizarConPantalla(valoresEnPantalla()).catch((error) => {
      console.warn("[validacion-resultados] no se pudo validar", item.codigo_ensayo_categoria_ensayo, error);
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await persistirResultados();
      toast({
        title: "Avance guardado",
        description: "Los valores capturados se guardaron correctamente. Puedes continuar más tarde.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo guardar el avance.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  /** Notifica al Jefe de Laboratorio que este ensayo culminó su fase de toma
   * de datos y queda pendiente de revisión/aprobación (2.3). El correo del
   * jefe se resuelve desde la configuración JEFE_LABORATORIO en seguridadesGuard
   * (tabla `configuracion`, app APP_ENSAYOS_LABORATORIO) — no está hardcodeado. */
  const handleNotificar = async () => {
    setNotificando(true);
    try {
      await persistirResultados();
      const correoJefe = await configuracionService.getValorConfiguracion("JEFE_LABORATORIO");
      if (!correoJefe) {
        toast({
          title: "Falta configuración",
          description: "No se encontró un correo configurado para JEFE_LABORATORIO (APP_ENSAYOS_LABORATORIO).",
          variant: "destructive",
        });
        return;
      }
      await ensayoCategoriaEnsayoService.marcarPendienteAprobacion(item.codigo_ensayo_categoria_ensayo, correoJefe);
      setEstadoAprobacion("PA");
      toast({
        title: "Notificación enviada",
        description: `Se avisó al Jefe de Laboratorio que ${etiquetaEnsayo(item)} está listo para revisión.`,
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo enviar la notificación.",
        variant: "destructive",
      });
    } finally {
      setNotificando(false);
    }
  };

  /** Registra la decisión del jefe de área (aprobar/rechazar) sobre este ensayo (2.4/2.5). */
  const handleDecision = async (decision: "AP" | "RE") => {
    if (decision === "RE" && !observaciones.trim()) {
      toast({
        title: "Observación requerida",
        description: "Indica el motivo del rechazo antes de continuar.",
        variant: "destructive",
      });
      return;
    }
    setProcesandoDecision(decision);
    try {
      await ensayoCategoriaEnsayoService.aprobarEnsayo(item.codigo_ensayo_categoria_ensayo, decision, {
        usuario_aprobacion: getCurrentUser(),
        observaciones_aprobacion: observaciones.trim() || undefined,
      });
      setEstadoAprobacion(decision);
      toast({
        title: decision === "AP" ? "Ensayo aprobado" : "Ensayo rechazado",
        description: `${etiquetaEnsayo(item)} · ${item.tipo_ensayo?.nombre_tipo_ensayo || ""} fue ${decision === "AP" ? "aprobado" : "rechazado"}.`,
        variant: decision === "AP" ? "success" : "destructive",
      });
      onDecidido?.();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo registrar la decisión.",
        variant: "destructive",
      });
    } finally {
      setProcesandoDecision(null);
    }
  };

  const todoCompletado = inputCells.length > 0 && completados === inputCells.length;
  const progresoPct = inputCells.length > 0 ? Math.round((completados / inputCells.length) * 100) : 0;

  useEffect(() => {
    onEstadoCapturaChange?.({
      codigoEnsayo: item.codigo_ensayo_categoria_ensayo,
      todoCompletado,
      estadoAprobacion,
    });
  }, [todoCompletado, estadoAprobacion, item.codigo_ensayo_categoria_ensayo, onEstadoCapturaChange]);

  useEffect(() => {
    if (!persistRegistry) return;
    const id = item.codigo_ensayo_categoria_ensayo;
    persistRegistry.current.set(id, persistirResultados);
    return () => {
      persistRegistry.current.delete(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistRegistry, item.codigo_ensayo_categoria_ensayo, inputCells, allCells, inputValues, textValues, computed.values, formulaIds]);

  return (
    <div className="flex flex-col gap-5">
      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <div className="h-1.5 bg-gradient-to-r from-[#0055b8] via-sky-500 to-emerald-400" />
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3 pt-5">
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
              <ClipboardList className="h-3.5 w-3.5 text-[#0055b8]" />
              Captura de resultados
            </div>
            <CardTitle className="truncate text-2xl font-bold tracking-tight text-slate-900">
              {contextoEnPadre ? (
                item.tipo_ensayo?.nombre_tipo_ensayo || "Tipo de ensayo"
              ) : (
                <EnsayoContexto item={item} />
              )}
            </CardTitle>
            {!contextoEnPadre && (
              <CardDescription className="text-sm text-slate-500">
                {item.tipo_ensayo?.nombre_tipo_ensayo || "Tipo de ensayo"}
              </CardDescription>
            )}
            {soloLectura && (
              <p className="text-xs text-slate-500">
                Realizado por: <span className="font-semibold text-slate-700">{nombreResponsable}</span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
            {soloLectura && <Badge className="bg-indigo-600 hover:bg-indigo-600">Modo revisión</Badge>}
            {soloConsulta && <Badge className="bg-slate-700 hover:bg-slate-700">Consulta · Solo lectura</Badge>}
            {!soloLectura && !soloConsulta && viewMode && (
              <Badge className="bg-emerald-600 hover:bg-emerald-600">Completo · Solo lectura</Badge>
            )}
            <Button type="button" variant="outline" className="border-slate-300" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver
            </Button>
            {!soloLectura &&
              !soloConsulta &&
              (viewMode ? (
                <Button type="button" variant="destructive" onClick={() => setViewMode(false)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </Button>
              ) : (
                <Button
                  type="button"
                  className="bg-[#0055b8] hover:bg-[#004494]"
                  onClick={handleSave}
                  disabled={saving || isLoading}
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Guardar avance
                </Button>
              ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pb-5">
          {inputCells.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-slate-700">Progreso de captura</span>
                <Badge
                  variant="secondary"
                  className={cn(
                    "font-semibold tabular-nums",
                    todoCompletado
                      ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                      : "bg-sky-100 text-sky-800 hover:bg-sky-100"
                  )}
                >
                  {completados}/{inputCells.length} campos · {progresoPct}%
                </Badge>
              </div>
              <Progress value={progresoPct} className="h-2" />
            </div>
          )}
          {!soloLectura && !soloConsulta && (
            <div className="flex gap-2.5 rounded-lg border border-sky-100 bg-sky-50/70 px-3.5 py-2.5 text-sm text-sky-900">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
              <p>
                Puedes guardar el avance en cualquier momento y continuar más tarde — no es necesario
                completar todos los campos de una sola vez.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando formulario…
        </div>
      ) : (
        <Tabs defaultValue="captura" className="space-y-4">
          <TabsList className="h-11 w-full justify-start gap-1 rounded-xl bg-slate-100 p-1 sm:w-auto">
            <TabsTrigger
              value="captura"
              className="rounded-lg px-4 data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              Captura de datos
            </TabsTrigger>
            {soloLectura ? (
              <TabsTrigger
                value="aprobacion"
                className="rounded-lg px-4 data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                Aprobación
              </TabsTrigger>
            ) : !ocultarNotificacion ? (
              <TabsTrigger
                value="notificacion"
                className="rounded-lg px-4 data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                Notificación
              </TabsTrigger>
            ) : null}
          </TabsList>

          <TabsContent value="captura" className="mt-0">
            {secciones.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 py-12 text-center text-sm text-muted-foreground">
                El formulario asignado no tiene tablas configuradas.
              </div>
            ) : (
              <div ref={contenedorTablasRef} className="flex flex-col gap-5">
                {secciones.map((sec, idx) => (
                  <Card key={sec.key} className="overflow-hidden border-slate-200 shadow-sm">
                    <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white py-3.5">
                      <CardTitle className="flex items-center gap-3 text-base font-semibold text-slate-800">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0055b8] text-xs font-bold text-white shadow-sm">
                          {idx + 1}
                        </span>
                        <span className="min-w-0 truncate">{sec.cabecera}</span>
                        {sec.tabla.version ? (
                          <Badge variant="outline" className="shrink-0 font-mono text-[11px] font-normal">
                            tabla #{sec.tabla.codigo_tabla} · v{sec.tabla.version}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="shrink-0 font-mono text-[11px] font-normal">
                            tabla #{sec.tabla.codigo_tabla}
                          </Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-5">
                      <FormularioResultadosGrid
                        tabla={sec.tabla}
                        celdas={sec.celdas}
                        columnas={columnsByTable.get(sec.tabla.codigo_tabla) || []}
                        valores={computed.values}
                        inputValues={inputValues}
                        inputTexts={inputTexts}
                        formulaIds={formulaIds}
                        textValues={textValues}
                        errors={computed.errors}
                        onChangeInput={handleChangeInput}
                        onChangeText={handleChangeText}
                        readOnly={efectivoViewMode}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {soloLectura ? (
            <TabsContent value="aprobacion">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Revisión de resultados</CardTitle>
                  <CardDescription>
                    Revisa los datos en la pestaña "Captura de datos" y registra tu decisión.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {estadoAprobacion === "AP" && (
                    <div className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      Este ensayo ya fue aprobado.
                    </div>
                  )}
                  {estadoAprobacion === "RE" && (
                    <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                      <XCircle className="h-4 w-4 shrink-0" />
                      Este ensayo fue rechazado.
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Observaciones
                    </label>
                    <Textarea
                      value={observaciones}
                      onChange={(e) => setObservaciones(e.target.value)}
                      placeholder="Obligatorio si rechazas el ensayo; opcional si lo apruebas."
                      rows={3}
                      disabled={estadoAprobacion === "AP" || estadoAprobacion === "RE"}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={() => handleDecision("AP")}
                      disabled={!!procesandoDecision || estadoAprobacion === "AP" || estadoAprobacion === "RE"}
                    >
                      {procesandoDecision === "AP" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      )}
                      Aprobar
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => handleDecision("RE")}
                      disabled={!!procesandoDecision || estadoAprobacion === "AP" || estadoAprobacion === "RE"}
                    >
                      {procesandoDecision === "RE" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <XCircle className="mr-2 h-4 w-4" />
                      )}
                      Rechazar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ) : !ocultarNotificacion ? (
            <TabsContent value="notificacion">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Culminación de fase de ensayos</CardTitle>
                  <CardDescription>
                    Avisa al Jefe de Laboratorio que este ensayo terminó su fase de toma de datos y
                    queda pendiente de revisión y aprobación.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {estadoAprobacion === "PA" && (
                    <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      <Clock className="h-4 w-4 shrink-0" />
                      Ya se notificó al Jefe de Laboratorio. Pendiente de revisión y aprobación.
                    </div>
                  )}
                  {estadoAprobacion === "AP" && (
                    <div className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      Este ensayo ya fue revisado y aprobado.
                    </div>
                  )}
                  {estadoAprobacion === "RE" && (
                    <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                      <XCircle className="h-4 w-4 shrink-0" />
                      Este ensayo fue rechazado en la revisión. Corrige los datos y vuelve a notificar.
                    </div>
                  )}
                  {!todoCompletado && (
                    <p className="text-xs text-muted-foreground">
                      Debes completar el 100% de los campos ({completados}/{inputCells.length}) antes de
                      poder notificar la culminación de esta fase.
                    </p>
                  )}
                  <div>
                    <Button
                      type="button"
                      onClick={handleNotificar}
                      disabled={notificando || !todoCompletado || estadoAprobacion === "PA" || estadoAprobacion === "AP"}
                    >
                      {notificando ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Notificar al Jefe de Laboratorio
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ) : null}
        </Tabs>
      )}
    </div>
  );
}
