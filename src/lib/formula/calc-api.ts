import { parseExpression } from "./parse";
import { evaluateAst } from "./evaluate";
import { astToLatex } from "./toLatex";
import type {
  FormulaEvalOutcome,
  FormulaParseOutcome,
  FormulaValueMap,
  LiveFormulaDef,
} from "./types";

export interface FormulaCompileResult {
  ok: true;
  expresion: string;
  latex: string;
  refs: string[];
}

export interface FormulaCompileError {
  ok: false;
  error: string;
}

export type FormulaCompileOutcome = FormulaCompileResult | FormulaCompileError;

/**
 * API interna de front para fórmulas:
 * - compilar expresión → LaTeX + refs (preview MathJax)
 * - evaluar con valores en vivo
 * - recalcular un grafo de celdas calculadas
 */
export const formulaApi = {
  /** Valida y produce LaTeX ligado 1:1 a la expresión computable. */
  compile(expresion: string): FormulaCompileOutcome {
    const parsed = parseExpression(expresion);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    return {
      ok: true,
      expresion: expresion.trim(),
      latex: astToLatex(parsed.ast),
      refs: parsed.refs,
    };
  },

  parse(expresion: string): FormulaParseOutcome {
    return parseExpression(expresion);
  },

  /** Evalúa una expresión con mapa nombreRef → número. */
  evaluate(expresion: string, values: FormulaValueMap): FormulaEvalOutcome {
    const parsed = parseExpression(expresion);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    return evaluateAst(parsed.ast, values);
  },

  /**
   * Recalcula fórmulas en vivo.
   * `values` incluye entradas del usuario; las calculadas se escriben sobre el mismo mapa.
   * Orden topológico simple por dependencias inferidas de refs (o dependsOn).
   */
  evaluateLive(
    formulas: LiveFormulaDef[],
    inputValues: FormulaValueMap
  ): { values: FormulaValueMap; errors: Record<string, string> } {
    const values: FormulaValueMap = { ...inputValues };
    const errors: Record<string, string> = {};

    const compiled = formulas.map((f) => {
      const parsed = parseExpression(f.expresion);
      const deps =
        f.dependsOn && f.dependsOn.length > 0
          ? f.dependsOn
          : parsed.ok
            ? parsed.refs
            : [];
      return { ...f, parsed, deps };
    });

    // Kahn-ish: repetir hasta estabilizar (soporta cadenas cortas)
    const pending = new Set(compiled.map((c) => c.id));
    let guard = compiled.length * compiled.length + 2;

    while (pending.size > 0 && guard-- > 0) {
      let progressed = false;
      for (const f of compiled) {
        if (!pending.has(f.id)) continue;
        if (!f.parsed.ok) {
          errors[f.id] = f.parsed.error;
          pending.delete(f.id);
          progressed = true;
          continue;
        }
        const missingDep = f.deps.some(
          (d) => values[d] === null || values[d] === undefined || Number.isNaN(Number(values[d]))
        );
        // Si la dep es otra fórmula aún pendiente, esperar
        const waitsForFormula = f.deps.some((d) => pending.has(d));
        if (waitsForFormula) continue;

        if (missingDep) {
          // Falta input de usuario: no error duro, simplemente no calcula aún
          pending.delete(f.id);
          progressed = true;
          continue;
        }

        const result = evaluateAst(f.parsed.ast, values);
        if (result.ok) {
          values[f.id] = result.value;
        } else {
          errors[f.id] = result.error;
        }
        pending.delete(f.id);
        progressed = true;
      }
      if (!progressed) {
        for (const id of pending) {
          errors[id] = "Dependencia circular o incompleta";
        }
        break;
      }
    }

    return { values, errors };
  },

  /** Sanitiza nombre de columna a identificador válido en el DSL. */
  toRefName(nombre: string, fallback = "Ref"): string {
    const base = (nombre || fallback)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9_.]+/g, "_")
      .replace(/^([^A-Za-z_])/, "_$1");
    return base || fallback;
  },
};

export type FormulaApi = typeof formulaApi;
