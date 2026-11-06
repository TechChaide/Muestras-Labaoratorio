"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eraser, Loader2, PenLine, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { uploadService } from "@/services/muestrasLaboratorio/upload.service";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (url: string, ancho?: number) => void;
}

/** Firma simple para el informe: dibujar en canvas o subir imagen.
 * No es firma electrónica certificada (PKI/DocuSign); es un sello visual
 * embebido en el PDF vía `{firma}url{/firma}`. */
export default function InsertarFirmaDialog({ open, onOpenChange, onInsert }: Readonly<Props>) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [subiendo, setSubiendo] = useState(false);
  const [ancho, setAncho] = useState("160");

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [open]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(e.pointerId);
    dibujando.current = true;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dibujando.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const onPointerUp = () => {
    dibujando.current = false;
  };

  const limpiar = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const blobDesdeCanvas = (): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        reject(new Error("Canvas no disponible"));
        return;
      }
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("No se pudo exportar la firma"))),
        "image/png"
      );
    });

  const insertarDesdeBlob = async (blob: Blob) => {
    setSubiendo(true);
    try {
      const file = new File([blob], `firma-${Date.now()}.png`, { type: blob.type || "image/png" });
      const url = await uploadService.uploadImagen(file);
      const n = Number(ancho);
      onInsert(url, Number.isFinite(n) && n > 0 ? n : 160);
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo guardar la firma.",
        variant: "destructive",
      });
    } finally {
      setSubiendo(false);
    }
  };

  const handleUsarDibujo = async () => {
    try {
      const blob = await blobDesdeCanvas();
      await insertarDesdeBlob(blob);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo usar el dibujo.",
        variant: "destructive",
      });
    }
  };

  const handleArchivo = async (file: File | undefined) => {
    if (!file) return;
    await insertarDesdeBlob(file);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="h-4 w-4" />
            Insertar firma
          </DialogTitle>
          <DialogDescription>
            Firma visual en el PDF (dibujo o imagen). No sustituye una firma
            electrónica certificada con validez legal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <canvas
            ref={canvasRef}
            width={480}
            height={160}
            className="w-full touch-none rounded-md border bg-white cursor-crosshair"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={limpiar}>
              <Eraser className="mr-1.5 h-3.5 w-3.5" />
              Limpiar
            </Button>
            <label className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-sm cursor-pointer hover:bg-muted">
              <Upload className="h-3.5 w-3.5" />
              Subir imagen
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={subiendo}
                onChange={(e) => handleArchivo(e.target.files?.[0])}
              />
            </label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="firma-ancho">Ancho (pt)</Label>
            <Input
              id="firma-ancho"
              type="number"
              min={60}
              value={ancho}
              onChange={(e) => setAncho(e.target.value)}
              className="max-w-[140px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleUsarDibujo} disabled={subiendo}>
            {subiendo ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Insertar dibujo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
