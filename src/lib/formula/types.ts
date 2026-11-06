/** AST y tipos del motor de fórmulas (expresión computable ↔ LaTeX). */

export type FormulaToken =
  | { type: "number"; value: number; raw: string }
  | { type: "ident"; value: string; raw: string }
  | {
      type: "op";
      value:
        | "+"
        | "-"
        | "*"
        | "/"
        | "^"
        | ","
        | "("
        | ")"
        | ">"
        | "<"
        | ">="
        | "<="
        | "="
        | "<>";
      raw: string;
    };

export type FormulaNode =
  | { kind: "number"; value: number }
  | { kind: "ref"; name: string }
  | { kind: "unary"; op: "-"; arg: FormulaNode }
  | {
      kind: "binary";
      op: "+" | "-" | "*" | "/" | "^" | ">" | "<" | ">=" | "<=" | "=" | "<>";
      left: FormulaNode;
      right: FormulaNode;
    }
  | {
      kind: "call";
      name: SupportedFunction;
      args: FormulaNode[];
    };

export type FormulaValueMap = Record<string, number | null | undefined>;

export interface FormulaParseResult {
  ok: true;
  ast: FormulaNode;
  refs: string[];
}

export interface FormulaParseError {
  ok: false;
  error: string;
  position?: number;
}

export type FormulaParseOutcome = FormulaParseResult | FormulaParseError;

export interface FormulaEvalResult {
  ok: true;
  value: number;
}

export interface FormulaEvalError {
  ok: false;
  error: string;
  missingRefs?: string[];
}

export type FormulaEvalOutcome = FormulaEvalResult | FormulaEvalError;

export interface LiveFormulaDef {
  id: string;
  expresion: string;
  dependsOn?: string[];
}

/** Nombres canónicos en el AST / DSL. */
export const SUPPORTED_FUNCTIONS = [
  "avg",
  "sum",
  "min",
  "max",
  "abs",
  "sqrt",
  "pow",
  "median",
  "mode",
  "stdev",
  "roundup",
  "rounddown",
  "round",
  "mround",
  "if",
  "normpdf",
] as const;

export type SupportedFunction = (typeof SUPPORTED_FUNCTIONS)[number];

/** Alias ES/EN/Excel → nombre canónico del minimotor. */
export const FUNCTION_ALIASES: Record<string, SupportedFunction> = {
  avg: "avg",
  media: "avg",
  mean: "avg",
  promedio: "avg",
  average: "avg",
  sum: "sum",
  suma: "sum",
  min: "min",
  minimo: "min",
  mínimo: "min",
  max: "max",
  maximo: "max",
  máximo: "max",
  abs: "abs",
  sqrt: "sqrt",
  raiz: "sqrt",
  pow: "pow",
  potencia: "pow",
  power: "pow",
  median: "median",
  mediana: "median",
  mode: "mode",
  moda: "mode",
  stdev: "stdev",
  stddev: "stdev",
  sd: "stdev",
  desvest: "stdev",
  "desvest.m": "stdev",
  desviacion: "stdev",
  roundup: "roundup",
  "redondear.max": "roundup",
  "redondear.mas": "roundup",
  "redondear.más": "roundup",
  ceil: "roundup",
  ceiling: "roundup",
  rounddown: "rounddown",
  "redondear.min": "rounddown",
  "redondear.menos": "rounddown",
  floor: "rounddown",
  round: "round",
  redondear: "round",
  decimales: "round",
  mround: "mround",
  "redond.mult": "mround",
  redondmult: "mround",
  if: "if",
  si: "if",
  normpdf: "normpdf",
  distribucion_normal: "normpdf",
  distribucionnormal: "normpdf",
  normal: "normpdf",
};

/** Plantillas matemáticas estilo Wolfram (insertan DSL, no LaTeX crudo). */
export const MATH_TEMPLATES: {
  id: string;
  label: string;
  insert: string;
  hint: string;
  group: "math" | "excel";
}[] = [
  { id: "frac", label: "□/□", insert: "()/()", hint: "Fracción (a)/(b)", group: "math" },
  { id: "pow", label: "□ⁿ", insert: "()^()", hint: "Potencia a^b", group: "math" },
  { id: "sqrt", label: "√□", insert: "sqrt()", hint: "Raíz cuadrada", group: "math" },
  { id: "parens", label: "(□)", insert: "()", hint: "Paréntesis", group: "math" },
  { id: "avg", label: "x̄", insert: "avg()", hint: "PROMEDIO / media", group: "excel" },
  { id: "median", label: "Med", insert: "median()", hint: "MEDIANA", group: "excel" },
  { id: "mode", label: "Mo", insert: "mode()", hint: "MODA", group: "excel" },
  { id: "stdev", label: "σ", insert: "stdev()", hint: "DESVEST", group: "excel" },
  { id: "max", label: "Máx", insert: "max()", hint: "MAX", group: "excel" },
  { id: "min", label: "Mín", insert: "min()", hint: "MIN", group: "excel" },
  { id: "sum", label: "Σ", insert: "sum()", hint: "SUMA", group: "excel" },
  { id: "if", label: "SI", insert: "si()", hint: "Condicional: si(prueba; verdadero; falso)", group: "excel" },
  { id: "mround", label: "×n", insert: "redond.mult()", hint: "Redondear al múltiplo: redond.mult(número; múltiplo)", group: "excel" },
  { id: "roundup", label: "Red.↑", insert: "redondear.mas()", hint: "Redondear más: redondear.mas(número; decimales)", group: "excel" },
  { id: "rounddown", label: "Red.↓", insert: "redondear.menos()", hint: "Redondear menos: redondear.menos(número; decimales)", group: "excel" },
  { id: "round", label: "Dec.", insert: "decimales()", hint: "Redondear a N decimales: decimales(x, n) — REDONDEAR", group: "excel" },
  { id: "normpdf", label: "N(μ,σ)", insert: "distribucion_normal()", hint: "Densidad normal: distribucion_normal(x, media, desv_est)", group: "excel" },
];

/** Atajos de UI para el editor de fórmulas (compat). */
export const FUNCTION_SHORTCUTS: {
  id: string;
  label: string;
  fn: SupportedFunction;
  insert: string;
  hint: string;
}[] = [
  { id: "sqrt", label: "Raíz √", fn: "sqrt", insert: "sqrt(", hint: "RAIZ / sqrt(x)" },
  { id: "avg", label: "Media", fn: "avg", insert: "avg(", hint: "PROMEDIO / avg(a,b,…)" },
  { id: "median", label: "Mediana", fn: "median", insert: "median(", hint: "MEDIANA" },
  { id: "mode", label: "Moda", fn: "mode", insert: "mode(", hint: "MODA" },
  { id: "stdev", label: "Desv. est.", fn: "stdev", insert: "stdev(", hint: "DESVEST" },
  { id: "max", label: "Máximo", fn: "max", insert: "max(", hint: "MAX" },
  { id: "min", label: "Mínimo", fn: "min", insert: "min(", hint: "MIN" },
  { id: "sum", label: "Suma", fn: "sum", insert: "sum(", hint: "SUMA" },
  { id: "if", label: "SI", fn: "if", insert: "si(", hint: "si(prueba; verdadero; falso)" },
  { id: "mround", label: "Redond.mult", fn: "mround", insert: "redond.mult(", hint: "redond.mult(número; múltiplo)" },
  { id: "roundup", label: "Redondear.más", fn: "roundup", insert: "redondear.mas(", hint: "redondear.mas(número; decimales)" },
  { id: "rounddown", label: "Redondear.menos", fn: "rounddown", insert: "redondear.menos(", hint: "redondear.menos(número; decimales)" },
];
