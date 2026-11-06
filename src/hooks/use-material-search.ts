"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { serviciosService, type MaterialResult } from "@/services/muestrasLaboratorio/servicios.service";

const MIN_CHARS = 2;
const DEBOUNCE_MS = 300;

export function useMaterialSearch() {
  const [termino, setTermino] = useState("");
  const [resultados, setResultados] = useState<MaterialResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const abortar = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortar();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [abortar]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    abortar();

    const query = termino.trim();
    if (query.length < MIN_CHARS) {
      setResultados([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      controllerRef.current = controller;

      try {
        const json = await serviciosService.buscarMateriales(query, controller.signal);
        if (!mountedRef.current) return;
        setResultados(json.data ?? []);
        setError(null);
      } catch (err: unknown) {
        if (!mountedRef.current) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "Error al buscar materiales";
        setError(msg);
        setResultados([]);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [termino, abortar]);

  return { termino, setTermino, resultados, loading, error };
}
