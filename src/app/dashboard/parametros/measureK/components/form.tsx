"use client";

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { TipoMedicion } from '@/types/interfaces';
import { tipoMedicionService } from '@/services/muestrasLaboratorio/tipoMedicion.service';
import { useState } from 'react';

const formSchema = z.object({
    codigo_tipo_medicion: z.number().optional(),
    seccion: z.string().optional(),
    nombre_tipo_medicion: z.string().min(1, "El nombre del tipo de medición es requerido."),
    estado: z.string({ required_error: "El estado es requerido." }),
});

interface TipoMedicionFormProps {
    record: TipoMedicion | null;
    onSuccess: () => void;
    onCancel: () => void;
}

export default function TipoMedicionForm({ record, onSuccess, onCancel }: TipoMedicionFormProps) {
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            codigo_tipo_medicion: record?.codigo_tipo_medicion ?? 0,
            seccion: record?.seccion ?? '',
            nombre_tipo_medicion: record?.nombre_tipo_medicion ?? '',
            estado: record?.estado ?? 'A',
        },
    });

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        setIsLoading(true);
        
        const data: any = {
            codigo_tipo_medicion: values.codigo_tipo_medicion || 0,
            seccion: values.seccion || '',
            nombre_tipo_medicion: values.nombre_tipo_medicion,
            estado: values.estado,
        };

        try {
            await tipoMedicionService.save(data);
            toast({
                title: "Éxito",
                description: `Tipo de medición ${record ? 'actualizado' : 'creado'} correctamente.`,
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
                <CardTitle>{record ? 'Editar Tipo de Medición' : 'Nuevo Tipo de Medición'}</CardTitle>
            </CardHeader>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="nombre_tipo_medicion"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Nombre del Tipo de Medición</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ej: Resistencia a la Tracción" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="seccion"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Sección</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ej: Laboratorio A" {...field} />
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
                                                <SelectValue placeholder="Seleccionar estado" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="A">Activo</SelectItem>
                                            <SelectItem value="I">Inactivo</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </CardContent>
                    <CardFooter className="flex gap-2 justify-end">
                        <Button 
                            type="button" 
                            variant="outline" 
                            onClick={onCancel}
                            disabled={isLoading}
                        >
                            Cancelar
                        </Button>
                        <Button 
                            type="submit" 
                            disabled={isLoading}
                            className={record ? "bg-red-600 hover:bg-red-700" : ""}
                        >
                            {isLoading ? 'Guardando...' : 'Guardar'}
                        </Button>
                    </CardFooter>
                </form>
            </Form>
        </Card>
    );
}
