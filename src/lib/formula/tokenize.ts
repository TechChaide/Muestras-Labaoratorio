import type { FormulaToken } from "./types";

/** Tokeniza expresión DSL: números, refs, operadores y funciones. */
export function tokenize(input: string): { tokens: FormulaToken[]; error?: string } {
  const tokens: FormulaToken[] = [];
  let i = 0;
  const src = input.trim();

  while (i < src.length) {
    const ch = src[i];

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      const start = i;
      let sawDot = ch === ".";
      i += 1;
      while (i < src.length && /[0-9.]/.test(src[i])) {
        if (src[i] === ".") {
          if (sawDot) {
            return { tokens, error: `Número inválido cerca de posición ${start}` };
          }
          sawDot = true;
        }
        i += 1;
      }
      const raw = src.slice(start, i);
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        return { tokens, error: `Número inválido: ${raw}` };
      }
      tokens.push({ type: "number", value, raw });
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      const start = i;
      i += 1;
      while (i < src.length && /[A-Za-z0-9_.]/.test(src[i])) i += 1;
      const raw = src.slice(start, i);
      tokens.push({ type: "ident", value: raw, raw });
      continue;
    }

    if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "^" || ch === "(" || ch === ")" || ch === ",") {
      tokens.push({ type: "op", value: ch, raw: ch });
      i += 1;
      continue;
    }

    return { tokens, error: `Carácter no soportado '${ch}' en posición ${i}` };
  }

  return { tokens };
}
