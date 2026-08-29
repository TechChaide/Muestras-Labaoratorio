"use client";

import { useMemo } from "react";
import { formulaApi, type FormulaValueMap, type LiveFormulaDef } from "@/lib/formula";

/**
 * Hook de cálculos en vivo para formularios de ensayo.
 * Pasa valores de entrada + definiciones de fórmulas; recibe mapa actualizado y errores.
 */
export function useLiveCalculations(
  formulas: LiveFormulaDef[],
  inputValues: FormulaValueMap
) {
  return useMemo(() => {
    if (!formulas.length) {
      return { values: inputValues, errors: {} as Record<string, string> };
    }
    return formulaApi.evaluateLive(formulas, inputValues);
  }, [formulas, inputValues]);
}

/** Evalúa una sola expresión (atajo para celdas sueltas). */
export function evaluateFormulaLive(
  expresion: string,
  values: FormulaValueMap
) {
  return formulaApi.evaluate(expresion, values);
}
