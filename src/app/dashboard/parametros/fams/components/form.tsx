"use client";

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import type { Familia } from '@/types/interfaces';
import { familiaService } from '@/services/muestrasLaboratorio/familia.service';
import { useState } from 'react';

const formSchema = z.object({
    codigo_familia: z.number().optional(),
    nombre_familia: z.string().min(1, "El nombre de la familia es requerido."),
    mnemonico: z.string().min(1, "El mnemónico es requerido."),
    detalle: z.string().optional(),
    estado: z.string({ required_error: "El estado es requerido." }),
});

interface FamiliaFormProps {
    record: Familia | null;
    onSuccess: () => void;
    onCancel: () => void;
}

export default function FamiliaForm({ record, onSuccess, onCancel }: FamiliaFormProps) {
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            codigo_familia: record?.codigo_familia ?? 0,
            nombre_familia: record?.nombre_familia ?? '',
            mnemonico: record?.mnemonico ?? '',
            detalle: record?.detalle ?? '',
            estado: record?.estado ?? 'A',
        },
    });

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        setIsLoading(true);
        
        const data: any = {
            codigo_familia: values.codigo_familia || 0,
            nombre_familia: values.nombre_familia,
            mnemonico: values.mnemonico.toUpperCase(),
            detalle: values.detalle || '',
            estado: values.estado,
        };

        try {
            await familiaService.save(data);
            toast({
                title: "Éxito",
                description: `Familia ${record ? 'actualizada' : 'creada'} correctamente.`,
            });
            onSuccess();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Ocurrió un error inesperado.";
            toast({
                title: "Error al guardar",
                description: errorMessage,
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>{record ? 'Editar Familia' : 'Nueva Familia'}</CardTitle>
            </CardHeader>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="nombre_familia"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Nombre de la Familia</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ej: Acero Inoxidable" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="mnemonico"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Mnemónico</FormLabel>
                                    <FormControl>
                                        <Input 
                                            placeholder="Ej: ACERO_INX" 
                                            {...field}
                                            onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="estado"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Estado</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Seleccione un estado" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="A">
                                                <div className="flex items-center">
                                                    Activo
                                                    <span className="ml-2 h-2 w-2 rounded-full bg-green-500"></span>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="I">
                                                <div className="flex items-center">
                                                    Inactivo
                                                    <span className="ml-2 h-2 w-2 rounded-full bg-red-500"></span>
                                                </div>
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </CardContent>
                    <CardContent>
                        <FormField
                            control={form.control}
                            name="detalle"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Detalle</FormLabel>
                                    <FormControl>
                                        <Textarea 
                                            placeholder="Descripción adicional (opcional)" 
                                            rows={4}
                                            className="resize-none"
                                            {...field} 
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </CardContent>
                    <CardFooter className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
                            Cancelar
                        </Button>
                        <Button 
                            type="submit" 
                            disabled={isLoading}
                            className={record ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}
                        >
                            {isLoading ? (record ? 'Actualizando...' : 'Guardando...') : (record ? 'Actualizar' : 'Guardar')}
                        </Button>
                    </CardFooter>
                </form>
            </Form>
        </Card>
    );
}
