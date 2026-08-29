"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formulaApi } from "@/lib/formula";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    MathJax?: {
      typesetPromise?: (els?: HTMLElement[]) => Promise<void>;
      texReset?: () => void;
      startup?: { promise?: Promise<void> };
    };
  }
}

const MATHJAX_SRC = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js";

let mathJaxLoader: Promise<void> | null = null;

function loadMathJax(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.MathJax?.typesetPromise) return Promise.resolve();
  if (mathJaxLoader) return mathJaxLoader;

  mathJaxLoader = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${MATHJAX_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("MathJax CDN error")));
      if (window.MathJax?.typesetPromise) resolve();
      return;
    }
    (window as unknown as { MathJax: Record<string, unknown> }).MathJax = {
      tex: {
        inlineMath: [
          ["$", "$"],
          ["\\(", "\\)"],
        ],
        displayMath: [
          ["$$", "$$"],
          ["\\[", "\\]"],
        ],
      },
      startup: { typeset: false },
    };
    const script = document.createElement("script");
    script.src = MATHJAX_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar MathJax"));
    document.head.appendChild(script);
  });

  return mathJaxLoader;
}

interface Props {
  expresion?: string;
  latex?: string;
  className?: string;
  display?: boolean;
}

/** Preview MathJax ligado a la expresión del intérprete (misma semántica del cálculo). */
export function FormulaMathPreview({
  expresion,
  latex: latexProp,
  className,
  display = true,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const [status, setStatus] = useState<"idle" | "ready" | "error">("idle");
  const [loadError, setLoadError] = useState("");

  const compiled = useMemo(() => {
    if (latexProp?.trim()) {
      return { ok: true as const, latex: latexProp.trim(), error: "" };
    }
    if (!expresion?.trim()) {
      return { ok: false as const, latex: "", error: "Escribe una expresión" };
    }
    const r = formulaApi.compile(expresion);
    if (!r.ok) return { ok: false as const, latex: "", error: r.error };
    return { ok: true as const, latex: r.latex, error: "" };
  }, [expresion, latexProp]);

  useEffect(() => {
    let cancelled = false;
    loadMathJax()
      .then(() => {
        if (!cancelled) setStatus("ready");
      })
      .catch((e) => {
        if (!cancelled) {
          setStatus("error");
          setLoadError(e instanceof Error ? e.message : "Error MathJax");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status !== "ready" || !compiled.ok || !hostRef.current) return;
    const el = hostRef.current;
    const wrapped = display ? `\\[${compiled.latex}\\]` : `\\(${compiled.latex}\\)`;
    el.textContent = wrapped;

    const run = async () => {
      try {
        await window.MathJax?.startup?.promise;
        await window.MathJax?.typesetPromise?.([el]);
      } catch {
        /* typeset puede fallar con latex incompleto mientras escriben */
      }
    };
    void run();
  }, [status, compiled, display, reactId]);

  return (
    <div className={cn("rounded-xl border border-[#c4a8e0] bg-[#f7f4fb] px-3 py-3 min-h-[88px]", className)}>
      <p className="text-[10px] uppercase tracking-wide text-[#5b2d8e]/80 mb-2 font-semibold">
        Vista matemática (MathJax)
      </p>
      {status === "error" && (
        <p className="text-xs text-destructive">{loadError}</p>
      )}
      {!compiled.ok ? (
        <p className="text-xs text-amber-700">{compiled.error}</p>
      ) : (
        <div ref={hostRef} className="overflow-x-auto text-center text-lg py-1" />
      )}
      {compiled.ok && (
        <p className="mt-2 text-[10px] text-[#5b2d8e]/70 font-mono break-all">
          {compiled.latex}
        </p>
      )}
    </div>
  );
}
