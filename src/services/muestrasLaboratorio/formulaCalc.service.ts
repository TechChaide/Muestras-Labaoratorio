/**
 * API interna de front para cálculos de fórmulas en vivo.
 * Reexporta el motor (`formulaApi`) para uso desde formularios / UI de captura.
 *
 * @example
 * import { formulaCalcService } from '@/services/muestrasLaboratorio/formulaCalc.service';
 *
 * const preview = formulaCalcService.compile('(A+B)/2');
 * // preview.latex → "\\frac{\\mathrm{A} + \\mathrm{B}}{2}"
 *
 * const live = formulaCalcService.evaluateLive(
 *   [{ id: 'prom', expresion: 'avg(A,B,C)' }],
 *   { A: 10, B: 12, C: 14 }
 * );
 * // live.values.prom → 12
 */
export {
  formulaApi as formulaCalcService,
  type FormulaValueMap,
  type LiveFormulaDef,
  type FormulaCompileOutcome,
  type FormulaEvalOutcome,
} from "@/lib/formula";
