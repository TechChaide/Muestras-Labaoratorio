"use client";

import { useMemo, useRef } from "react";
import { X, Equal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormulaMathPreview } from "@/components/formula/mathjax-preview";
import {
  formulaApi,
  FUNCTION_SHORTCUTS,
  MATH_TEMPLATES,
  type SupportedFunction,
} from "@/lib/formula";
import { cn } from "@/lib/utils";

interface Props {
  nombre: string;
  expresion: string;
  depTokens: string[];
  onNombreChange: (nombre: string) => void;
  onExpresionChange: (expresion: string) => void;
  onInsertFunction: (insert: string, fn: SupportedFunction) => void;
  className?: string;
}

/**
 * Panel estilo WolframAlpha: caja grande + barra violeta de plantillas + preview MathJax.
 * La expresión es DSL Excel-like; LaTeX solo se previsualiza.
 */
export function FormulaWolframEditor({
  nombre,
  expresion,
  depTokens,
  onNombreChange,
  onExpresionChange,
  onInsertFunction,
  className,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  const compiled = useMemo(() => {
    if (!expresion.trim()) return null;
    return formulaApi.compile(expresion);
  }, [expresion]);

  const insertAtCursor = (chunk: string, cursorBack = 1) => {
    const el = taRef.current;
    if (!el) {
      onExpresionChange(expresion ? `${expresion}${chunk}` : chunk);
      return;
    }
    const start = el.selectionStart ?? expresion.length;
    const end = el.selectionEnd ?? expresion.length;
    const next = expresion.slice(0, start) + chunk + expresion.slice(end);
    onExpresionChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + chunk.length - cursorBack;
      el.setSelectionRange(Math.max(0, pos), Math.max(0, pos));
    });
  };

  const insertTemplate = (id: string, insert: string) => {
    const excelFns = new Set([
      "avg",
      "median",
      "mode",
      "stdev",
      "max",
      "min",
      "sum",
      "sqrt",
    ]);
    if (excelFns.has(id) && depTokens.length > 0) {
      const fn = id === "sqrt" ? "sqrt" : id;
      const args =
        id === "sqrt" ? depTokens[0] : depTokens.join(",");
      const chunk = `${fn}(${args})`;
      const cur = expresion.trim();
      const next = cur
        ? `${cur}${/[+\-*/^(,]$/.test(cur) ? "" : "+"}${chunk}`
        : chunk;
      onExpresionChange(next);
      return;
    }

    const cursorBack =
      id === "frac" ? 3 : id === "pow" ? 3 : insert.endsWith("()") ? 1 : insert.endsWith("(") ? 0 : 0;
    // frac ()/() → leave cursor in first (); pow ()^() same
    if (id === "frac" || id === "pow") {
      insertAtCursor(insert, id === "frac" ? 4 : 4);
      return;
    }
    if (insert.endsWith("()")) {
      insertAtCursor(insert, 1);
      return;
    }
    insertAtCursor(insert, cursorBack);
  };

  const clearExpr = () => onExpresionChange("");

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

      {/* Caja tipo Wolfram */}
      <div className="relative rounded-xl border-2 border-[#7b4bb8] bg-white shadow-sm focus-within:ring-2 focus-within:ring-[#5b2d8e]/40">
        <Textarea
          ref={taRef}
          className="min-h-[108px] resize-y border-0 bg-transparent font-mono text-[15px] leading-relaxed focus-visible:ring-0 pr-16"
          rows={4}
          value={expresion}
          onChange={(e) => onExpresionChange(e.target.value)}
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
            title={compiled?.ok ? "Expresión válida" : "Revisar expresión"}
            aria-label="Validar"
            className={cn(
              "h-8 w-8 rounded-md flex items-center justify-center text-white",
              compiled?.ok ? "bg-[#5b2d8e] hover:bg-[#3d1f66]" : "bg-[#5b2d8e]/50"
            )}
            onClick={() => taRef.current?.blur()}
          >
            <Equal className="h-4 w-4" />
          </button>
        </div>
      </div>

      {compiled && !compiled.ok ? (
        <p className="text-xs text-amber-700 px-0.5">{compiled.error}</p>
      ) : null}

      {/* Modo */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-[#5b2d8e] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white">
          Entrada matemática
        </span>
        <span className="rounded-md border border-[#c4a8e0] px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-[#5b2d8e]/60">
          Mini Excel
        </span>
      </div>

      {/* Barra violeta de plantillas */}
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

      {/* Chips Excel con nombres claros */}
      <div className="flex flex-wrap gap-1">
        {FUNCTION_SHORTCUTS.map((sc) => (
          <Button
            key={sc.id}
            type="button"
            size="sm"
            variant="outline"
            className="h-7 border-[#c4a8e0] text-[11px] text-[#5b2d8e] hover:bg-[#f7f4fb]"
            title={sc.hint}
            onClick={() => onInsertFunction(sc.insert, sc.fn)}
          >
            {sc.label}
          </Button>
        ))}
      </div>

      <FormulaMathPreview
        expresion={expresion}
        className="border-[#c4a8e0] bg-[#f7f4fb]"
      />

      <p className="text-[11px] text-muted-foreground">
        DSL tipo Excel: PROMEDIO→avg, SUMA→sum, DESVEST→stdev, RAIZ→sqrt. Clic en la
        tabla inserta alias; con deps verdes, los atajos rellenan argumentos.
      </p>
    </div>
  );
}
