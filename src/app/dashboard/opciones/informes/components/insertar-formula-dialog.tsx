"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormulaMathPreview } from "@/components/formula/mathjax-preview";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (latex: string) => void;
}

/** Plantillas rápidas de LaTeX — se insertan en la posición del cursor dentro
 * del textarea, con el contenido de ejemplo preseleccionado para poder
 * sobreescribirlo enseguida. `cursorEnvueltoDesde`/`Hasta` marcan qué tramo
 * del snippet insertado queda seleccionado después. */
const PLANTILLAS: { etiqueta: string; snippet: string; seleccionar: [number, number] }[] = [
  { etiqueta: "Fracción", snippet: "\\frac{a}{b}", seleccionar: [6, 7] },
  { etiqueta: "Raíz", snippet: "\\sqrt{x}", seleccionar: [6, 7] },
  { etiqueta: "Raíz n-ésima", snippet: "\\sqrt[n]{x}", seleccionar: [9, 10] },
  { etiqueta: "( )", snippet: "\\left( x \\right)", seleccionar: [7, 8] },
  { etiqueta: "[ ]", snippet: "\\left[ x \\right]", seleccionar: [7, 8] },
  { etiqueta: "{ }", snippet: "\\left\\{ x \\right\\}", seleccionar: [8, 9] },
  { etiqueta: "Exponente", snippet: "x^{2}", seleccionar: [3, 4] },
  { etiqueta: "Subíndice", snippet: "x_{1}", seleccionar: [3, 4] },
  { etiqueta: "Suma (Σ)", snippet: "\\sum_{i=1}^{n} x_i", seleccionar: [0, 0] },
];

const EJEMPLO_INICIAL = "\\frac{a}{b} + \\sqrt{x}";

/** Diálogo para componer una fórmula algebraica en LaTeX real (fracciones,
 * raíces, paréntesis/corchetes/llaves que se autoajustan con \left\right,
 * exponentes, etc.) con vista previa tipografiada en vivo (MathJax). Se
 * inserta como su propio bloque {formula}...{/formula} — se renderiza
 * tipografiada (no como texto plano) tanto en la vista previa como en el PDF
 * final (ver src/lib/informe/formula-svg.ts). */
export default function InsertarFormulaDialog({ open, onOpenChange, onInsert }: Readonly<Props>) {
  const [latex, setLatex] = useState(EJEMPLO_INICIAL);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) setLatex(EJEMPLO_INICIAL);
  }, [open]);

  const insertarPlantilla = (snippet: string, seleccionar: [number, number]) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? latex.length;
    const end = el?.selectionEnd ?? latex.length;
    const nuevo = `${latex.slice(0, start)}${snippet}${latex.slice(end)}`;
    setLatex(nuevo);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + seleccionar[0], start + seleccionar[1]);
    });
  };

  const handleInsertar = () => {
    if (!latex.trim()) return;
    onInsert(latex.trim());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Insertar fórmula</DialogTitle>
          <DialogDescription>
            LaTeX real: fracciones, raíces, paréntesis/corchetes/llaves que se ajustan solos con{" "}
            <code className="text-xs">\left \right</code>, etc. Se muestra tipografiada, no como texto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {PLANTILLAS.map((p) => (
              <Button
                key={p.etiqueta}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => insertarPlantilla(p.snippet, p.seleccionar)}
              >
                {p.etiqueta}
              </Button>
            ))}
          </div>

          <Textarea
            ref={textareaRef}
            value={latex}
            onChange={(e) => setLatex(e.target.value)}
            className="font-mono text-sm"
            rows={3}
            placeholder="\frac{a}{b}"
          />

          <FormulaMathPreview latex={latex} display />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleInsertar} disabled={!latex.trim()}>
            Insertar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
