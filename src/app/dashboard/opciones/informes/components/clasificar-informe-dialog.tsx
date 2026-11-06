"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import type { Familia, TipoEnsayo } from "@/types/interfaces";

interface Props {
  open: boolean;
  cargando: boolean;
  familias: Familia[];
  tiposEnsayo: TipoEnsayo[];
  codigoFamiliaInicial?: number;
  codigoTipoEnsayoInicial?: number;
  onOpenChange: (open: boolean) => void;
  /** Devuelve los objetos completos (no solo los códigos) para que quien
   * abrió el diálogo pueda mostrar los nombres sin volver a pedir las listas. */
  onConfirmar: (familia: Familia, tipoEnsayo: TipoEnsayo) => void;
}

/** Se muestra antes de guardar un informe por primera vez (o al re-clasificar
 * uno existente) — pide a qué familia y tipo de ensayo corresponde, para
 * poder encontrar la plantilla correcta después. Mismo patrón dependiente
 * (familia -> filtra tipos de ensayo) que src/app/dashboard/opciones/newSol.
 * Las listas de familias/tipos de ensayo las carga y cachea informe-editor.tsx
 * (también las necesita para el badge de clasificación en la barra superior),
 * así este diálogo no dispara su propio fetch cada vez que se abre. */
export default function ClasificarInformeDialog({
  open,
  cargando,
  familias,
  tiposEnsayo,
  codigoFamiliaInicial,
  codigoTipoEnsayoInicial,
  onOpenChange,
  onConfirmar,
}: Readonly<Props>) {
  const [codigoFamilia, setCodigoFamilia] = useState<number | undefined>(codigoFamiliaInicial);
  const [codigoTipoEnsayo, setCodigoTipoEnsayo] = useState<number | undefined>(codigoTipoEnsayoInicial);

  useEffect(() => {
    if (open) {
      setCodigoFamilia(codigoFamiliaInicial);
      setCodigoTipoEnsayo(codigoTipoEnsayoInicial);
    }
    // Solo debe releerse cuando el diálogo se abre, no en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const tiposFiltrados = useMemo(
    () => tiposEnsayo.filter((t) => t.codigo_familia === codigoFamilia),
    [tiposEnsayo, codigoFamilia]
  );

  const handleFamiliaChange = (valor: string) => {
    const nueva = Number(valor);
    setCodigoFamilia(nueva);
    // Si el tipo de ensayo ya elegido no pertenece a la nueva familia, se
    // limpia — no tendría sentido dejarlo seleccionado.
    setCodigoTipoEnsayo((actual) =>
      tiposEnsayo.some((t) => t.codigo_tipo_ensayo === actual && t.codigo_familia === nueva) ? actual : undefined
    );
  };

  const handleConfirmar = () => {
    const familia = familias.find((f) => f.codigo_familia === codigoFamilia);
    const tipoEnsayo = tiposEnsayo.find((t) => t.codigo_tipo_ensayo === codigoTipoEnsayo);
    if (!familia || !tipoEnsayo) return;
    onConfirmar(familia, tipoEnsayo);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Para qué familia y tipo de ensayo es este informe?</DialogTitle>
          <DialogDescription>
            Esta clasificación ayuda a encontrar la plantilla correcta más adelante.
          </DialogDescription>
        </DialogHeader>

        {cargando ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Cargando...
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Familia</Label>
              <Select value={codigoFamilia ? String(codigoFamilia) : ""} onValueChange={handleFamiliaChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Elegí una familia" />
                </SelectTrigger>
                <SelectContent>
                  {familias.map((f) => (
                    <SelectItem key={f.codigo_familia} value={String(f.codigo_familia)}>
                      {f.nombre_familia}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de ensayo</Label>
              <Select
                value={codigoTipoEnsayo ? String(codigoTipoEnsayo) : ""}
                onValueChange={(v) => setCodigoTipoEnsayo(Number(v))}
                disabled={!codigoFamilia}
              >
                <SelectTrigger>
                  <SelectValue placeholder={codigoFamilia ? "Elegí un tipo de ensayo" : "Elegí primero una familia"} />
                </SelectTrigger>
                <SelectContent>
                  {tiposFiltrados.map((t) => (
                    <SelectItem key={t.codigo_tipo_ensayo} value={String(t.codigo_tipo_ensayo)}>
                      {t.nombre_tipo_ensayo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirmar} disabled={cargando || !codigoFamilia || !codigoTipoEnsayo}>
            Continuar y guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
