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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import type { TipoEnsayo, Familia } from '@/types/interfaces';
import { tipoEnsayoService } from '@/services/muestrasLaboratorio/tipoEnsayo.service';
import { familiaService } from '@/services/muestrasLaboratorio/familia.service';
import { useState, useEffect } from 'react';

const formSchema = z.object({
    codigo_tipo_ensayo: z.number().optional(),
    codigo_familia: z.number().optional(),
    nombre_tipo_ensayo: z.string().min(1, "El nombre del tipo de ensayo es requerido."),
    mnemonico: z.string().max(10, "Máximo 10 caracteres.").optional(),
    probetas_minimas: z.number().min(0, "Las probetas no pueden ser negativas.").optional(),
    estado: z.string({ required_error: "El estado es requerido." }),
});

interface TipoEnsayoFormProps {
    record: TipoEnsayo | null;
    onSuccess: () => void;
    onCancel: () => void;
}

export default function TipoEnsayoForm({ record, onSuccess, onCancel }: TipoEnsayoFormProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [familias, setFamilias] = useState<Familia[]>([]);
    const [familiaLoading, setFamiliaLoading] = useState(true);
    const { toast } = useToast();

    // Cargar familias
    useEffect(() => {
        const loadFamilias = async () => {
            try {
                const response = await familiaService.getAll();
                const data = response.data || [];
                const familiasList = Array.isArray(data) ? data : [data];
                setFamilias(familiasList);
            } catch (error) {
                console.error('Error cargando familias:', error);
                toast({
                    title: "Error",
                    description: "No se pudieron cargar las familias.",
                    variant: "destructive",
                });
            } finally {
                setFamiliaLoading(false);
            }
        };

        loadFamilias();
    }, [toast]);

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            codigo_tipo_ensayo: record?.codigo_tipo_ensayo ?? 0,
            codigo_familia: record?.codigo_familia ?? undefined,
            nombre_tipo_ensayo: record?.nombre_tipo_ensayo ?? '',
            mnemonico: record?.mnemonico ?? '',
            probetas_minimas: record?.probetas_minimas ?? 0,
            estado: record?.estado ?? 'A',
        },
    });

    useEffect(() => {
        form.reset({
            codigo_tipo_ensayo: record?.codigo_tipo_ensayo ?? 0,
            codigo_familia: record?.codigo_familia ?? undefined,
            nombre_tipo_ensayo: record?.nombre_tipo_ensayo ?? '',
            mnemonico: record?.mnemonico ?? '',
            probetas_minimas: record?.probetas_minimas ?? 0,
            estado: record?.estado ?? 'A',
        });
    }, [record, form]);

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        setIsLoading(true);
        
        const data: any = {
            codigo_tipo_ensayo: values.codigo_tipo_ensayo || 0,
            codigo_familia: values.codigo_familia || undefined,
            nombre_tipo_ensayo: values.nombre_tipo_ensayo,
            mnemonico: (values.mnemonico || '').toUpperCase(),
            probetas_minimas: values.probetas_minimas || 0,
            estado: values.estado,
        };

        try {
            await tipoEnsayoService.save(data);
            toast({
                title: "Éxito",
                description: `Tipo de ensayo ${record ? 'actualizado' : 'creado'} correctamente.`,
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
                <CardTitle>{record ? 'Editar Tipo de Ensayo' : 'Nuevo Tipo de Ensayo'}</CardTitle>
            </CardHeader>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="nombre_tipo_ensayo"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Nombre del Tipo de Ensayo</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ej: Resistencia a la Tracción" {...field} />
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
                                        <Input placeholder="Ej: TRA" {...field} />
                                    </FormControl>
                                    <FormDescription>
                                        Código abreviado para identificar el tipo de ensayo (máx. 10 caracteres).
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="codigo_familia"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Familia (Relación)</FormLabel>
                                    <Select 
                                        onValueChange={(val) => field.onChange(val ? Number(val) : undefined)} 
                                        value={field.value ? String(field.value) : undefined}
                                    >
                                        <FormControl>
                                            <SelectTrigger disabled={familiaLoading}>
                                                <SelectValue placeholder={familiaLoading ? "Cargando familias..." : "Seleccionar familia (Opcional)"} />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {familias.map((familia) => (
                                                <SelectItem key={familia.codigo_familia} value={String(familia.codigo_familia)}>
                                                    {familia.nombre_familia}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="probetas_minimas"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Probetas Mínimas</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            min="0"
                                            placeholder="Ej: 3"
                                            {...field}
                                            onChange={(e) => field.onChange(Number(e.target.value))}
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
