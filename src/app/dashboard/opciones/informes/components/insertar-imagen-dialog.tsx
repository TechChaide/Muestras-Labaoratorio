"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { uploadService } from "@/services/muestrasLaboratorio/upload.service";

export type ImagenKind = "cuerpo" | "cabecera" | "pie";

interface Props {
  open: boolean;
  kind: ImagenKind;
  onOpenChange: (open: boolean) => void;
  onInsert: (url: string, tamano?: number) => void;
}

const TITULOS: Record<ImagenKind, string> = {
  cuerpo: "Insertar imagen",
  cabecera: "Imagen de cabecera (se repite en todas las páginas del PDF)",
  pie: "Imagen de pie de página (se repite en todas las páginas del PDF)",
};

const ETIQUETA_TAMANO: Record<ImagenKind, string> = {
  cuerpo: "Ancho en puntos (opcional, se ajusta solo si se deja vacío)",
  cabecera: "Alto en puntos (opcional)",
  pie: "Alto en puntos (opcional)",
};

/** Diálogo genérico para subir una imagen y traer de vuelta su URL — se usa
 * tanto para insertarla en el cuerpo como para fijarla como cabecera/pie de
 * página del PDF (ver informe-editor.tsx). Reutiliza el mismo endpoint de
 * subida que las celdas tipo_dato='imagen' de los formularios de ensayo. */
export default function InsertarImagenDialog({ open, kind, onOpenChange, onInsert }: Readonly<Props>) {
  const { toast } = useToast();
  const [subiendo, setSubiendo] = useState(false);
  const [tamano, setTamano] = useState("");

  const handleArchivo = async (file: File | undefined) => {
    if (!file) return;
    setSubiendo(true);
    try {
      const url = await uploadService.uploadImagen(file);
      const n = tamano.trim() ? Number(tamano) : undefined;
      onInsert(url, n !== undefined && Number.isFinite(n) ? n : undefined);
      onOpenChange(false);
      setTamano("");
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo subir la imagen.",
        variant: "destructive",
      });
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{TITULOS[kind]}</DialogTitle>
          <DialogDescription>Formatos admitidos: JPG, PNG, WEBP, GIF (máx. 8MB).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="informe-imagen-tamano">{ETIQUETA_TAMANO[kind]}</Label>
            <Input
              id="informe-imagen-tamano"
              type="number"
              min={1}
              value={tamano}
              onChange={(e) => setTamano(e.target.value)}
              placeholder="Automático"
            />
          </div>
          <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-sm text-muted-foreground cursor-pointer hover:bg-muted/40">
            {subiendo ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
            {subiendo ? "Subiendo..." : "Elegí un archivo de imagen"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              disabled={subiendo}
              onChange={(e) => handleArchivo(e.target.files?.[0])}
            />
          </label>
        </div>
      </DialogContent>
    </Dialog>
  );
}
