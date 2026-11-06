"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { X, Equal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormulaMathPreview } from "@/components/formula/mathjax-preview";
import { formulaApi, MATH_TEMPLATES } from "@/lib/formula";
import type { FormulaValueMap } from "@/lib/formula";
import { cn } from "@/lib/utils";

interface Props {
  nombre: string;
  expresion: string;
  onNombreChange: (nombre: string) => void;
  onExpresionChange: (expresion: string) => void;
  /** Enter (sin Shift) en la caja de expresión: confirma/guarda la fórmula, como en Excel. */
  onCommit?: () => void;
  /** Escape en la caja de expresión: descarta cambios de esta edición y cierra. */
  onCancel?: () => void;
  className?: string;
}

export interface FormulaWolframEditorHandle {
  /** Inserta la referencia de una celda en la posición del cursor, con el separador
   * correcto según el contexto (coma dentro de una función, + fuera de ella). Estilo Excel:
   * clic en una función deja el cursor dentro de los paréntesis, listo para elegir celdas. */
  insertReference: (token: string) => void;
}

/**
 * Panel estilo WolframAlpha: caja grande + barra violeta de plantillas + preview MathJax.
 * La expresión es DSL Excel-like; LaTeX solo se previsualiza.
 */
export const FormulaWolframEditor = forwardRef<FormulaWolframEditorHandle, Props>(
  function FormulaWolframEditor(
    { nombre, expresion, onNombreChange, onExpresionChange, onCommit, onCancel, className },
    ref
  ) {
    const taRef = useRef<HTMLTextAreaElement>(null);
    const desiredCursorRef = useRef<number | null>(null);
    const [trialResult, setTrialResult] = useState<string | null>(null);

    const compiled = useMemo(() => {
      if (!expresion.trim()) return null;
      return formulaApi.compile(expresion);
    }, [expresion]);

    useEffect(() => {
      setTrialResult(null);
    }, [expresion]);

    useEffect(() => {
      if (desiredCursorRef.current == null) return;
      const el = taRef.current;
      if (!el) return;
      const pos = Math.max(0, Math.min(desiredCursorRef.current, expresion.length));
      el.focus();
      el.setSelectionRange(pos, pos);
    }, [expresion]);

    const syncDesiredCursor = () => {
      const el = taRef.current;
      if (el) desiredCursorRef.current = el.selectionStart;
    };

    const computeSeparator = (pos: number) => {
      const before = expresion.slice(0, pos);
      const lastChar = before.trimEnd().slice(-1);
      if (!lastChar || /[+\-*/^(,;]/.test(lastChar)) return "";
      let depth = 0;
      for (const ch of before) {
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
      }
      return depth > 0 ? ";" : "+";
    };

    const insertAtCursor = (chunk: string, cursorBack = 0, smart = false) => {
      const el = taRef.current;
      const start = desiredCursorRef.current ?? (el ? el.selectionStart ?? expresion.length : expresion.length);
      const end = el && el.selectionStart === start ? el.selectionEnd ?? start : start;
      const full = smart ? `${computeSeparator(start)}${chunk}` : chunk;
      const next = expresion.slice(0, start) + full + expresion.slice(end);
      desiredCursorRef.current = start + full.length - cursorBack;
      onExpresionChange(next);
    };

    useImperativeHandle(ref, () => ({
      insertReference: (token: string) => {
        insertAtCursor(token, 0, true);
      },
    }));

    const insertTemplate = (id: string, insert: string) => {
      if (id === "frac" || id === "pow") {
        insertAtCursor(insert, 4, true);
        return;
      }
      if (insert.endsWith("()")) {
        insertAtCursor(insert, 1, true);
        return;
      }
      insertAtCursor(insert, 0, true);
    };

    const clearExpr = () => onExpresionChange("");

    /** Evaluación de prueba: todas las refs = 1, 2, 3… para verificar la expresión. */
    const runTrialEval = () => {
      if (!expresion.trim()) {
        setTrialResult(null);
        return;
      }
      if (!compiled?.ok) {
        setTrialResult(compiled?.error || "Expresión inválida");
        return;
      }
      const values: FormulaValueMap = {};
      compiled.refs.forEach((r, i) => {
        values[r] = i + 1;
      });
      const result = formulaApi.evaluate(expresion, values);
      if (!result.ok) {
        setTrialResult(result.error);
        return;
      }
      const mapping =
        compiled.refs.length > 0
          ? compiled.refs.map((r, i) => `${r}=${i + 1}`).join(", ")
          : "sin refs";
      setTrialResult(`Prueba (${mapping}) → ${result.value}`);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onCommit?.();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel?.();
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      desiredCursorRef.current = e.target.selectionStart;
      onExpresionChange(e.target.value);
    };

    return (
      <div className={cn("space-y-3 min-w-0", className)}>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wide text-[#5b2d8e]">
            Nombre
          </Label>
          <Input
            value={nombre}
            onChange={(e) => onNombreChange(e.target.value)}
            className="border-[#c4a8e0] focus-visible:ring-[#5b2d8e]"
          />
        </div>

        <div className="relative rounded-xl border-2 border-[#7b4bb8] bg-white shadow-sm focus-within:ring-2 focus-within:ring-[#5b2d8e]/40">
          <Textarea
            ref={taRef}
            className="min-h-[108px] resize-y border-0 bg-transparent font-mono text-[15px] leading-relaxed focus-visible:ring-0 pr-16"
            rows={4}
            value={expresion}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onKeyUp={syncDesiredCursor}
            onClick={syncDesiredCursor}
            onSelect={syncDesiredCursor}
            placeholder="avg(Med1,Med2)  ·  sqrt(x)  ·  (a+b)/2"
            spellCheck={false}
          />
          <div className="absolute right-2 top-2 flex flex-col gap-1">
            <button
              type="button"
              title="Limpiar"
              aria-label="Limpiar expresión"
              onClick={clearExpr}
              className="h-8 w-8 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Evaluar con valores de prueba (refs = 1,2,3…)"
              aria-label="Evaluar expresión de prueba"
              className={cn(
                "h-8 w-8 rounded-md flex items-center justify-center text-white",
                compiled?.ok ? "bg-[#5b2d8e] hover:bg-[#3d1f66]" : "bg-[#5b2d8e]/50"
              )}
              onClick={runTrialEval}
            >
              <Equal className="h-4 w-4" />
            </button>
          </div>
        </div>

        {compiled && !compiled.ok ? (
          <p className="text-xs text-amber-700 px-0.5">{compiled.error}</p>
        ) : null}

        {trialResult ? (
          <p
            className={cn(
              "text-xs px-0.5 font-mono",
              trialResult.startsWith("Prueba") ? "text-emerald-800" : "text-amber-800"
            )}
          >
            {trialResult}
          </p>
        ) : null}

        <p className="text-[11px] text-muted-foreground px-0.5">
          Clic en una función e inserta celdas como en Excel.{" "}
          <strong>Enter</strong> valida y guarda en la base de datos.{" "}
          <strong>Esc</strong> descarta esta edición. El botón <strong>=</strong> evalúa con
          valores de prueba (no guarda). No pegues LaTeX: usa la barra violeta (DSL).
        </p>

        <div className="overflow-x-auto rounded-lg bg-[#5b2d8e] px-2 py-2 shadow-inner">
          <div className="flex min-w-max items-center gap-1">
            {MATH_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                title={t.hint}
                aria-label={t.hint}
                onClick={() => insertTemplate(t.id, t.insert)}
                className="h-9 min-w-[40px] rounded-md bg-white/10 px-2.5 text-sm font-semibold text-white hover:bg-white/20 transition-colors"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <FormulaMathPreview
          expresion={expresion}
          className="border-[#c4a8e0] bg-[#f7f4fb]"
        />

        <p className="text-[11px] text-muted-foreground">
          DSL tipo Excel: PROMEDIO→avg, SUMA→sum, DESVEST→stdev, RAIZ→sqrt. LaTeX solo es vista previa.
        </p>
      </div>
    );
  }
);
