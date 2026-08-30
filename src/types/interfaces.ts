
// Este archivo es autogenerado. No lo modifiques manually.

export interface Aplicacion {
  codigo_aplicacion: string;
  nombre_aplicacion: string;
  estado: string;
}

export interface Clase {
  codigo_clase: number;
  nombre_clase: string;
  estado: string;
}

export interface Menu {
  codigo_menu: number;
  codigo_padre: number;
  nombre: string;
  icono: string;
  path: string;
  estado: string;
  codigo_aplicacion: string;
}

export interface MenuTipoUsuario {
  codigo_menu_tipo_usuario: number;
  estado: string;
  usuario_modificacion: string;
  fecha_modificacion: Date | string;
  codigo_menu: number;
  codigo_tipo_usuario: number;
}

export interface Permisos {
  codigo_permiso: number;
  estado: string;
  usuario_modificacion: string;
  fecha_modificacion: Date | string;
  codigo_tipo_permiso: number;
  codigo_menu_tipo_usuario: number;
}

export interface Propiedad {
  codigo_propiedad: number;
  nombre_propiedad: string;
  valor_propiedad: string;
  estado: string;
  codigo_aplicacion: string;
}

export interface TipoPermiso {
  codigo_tipo_permiso: number;
  nombre_tipo_permiso: string;
  mnemonico: string;
  estado: string;
}

export interface TipoUsuario {
  codigo_tipo_usuario: number;
  codigo_clase: number;
  nombre_tipo_usuario: string;
  estado: string;
  usuario_modificacion: string;
  fecha_modificacion: Date | string;
}

export interface TipoUsuarioAplicacion {
  codigo_tipo_usuario_aplicacion: number;
  estado: string;
  usuario_modificacion: string;
  fecha_modificacion: Date | string;
  codigo_aplicacion: string;
  codigo_tipo_usuario: number;
}

export interface Usuario {
  codigo_usuario: number;
  id_usuario: string;
  condicion: string;
  estado: string;
  usuario_modificacion: string;
  fecha_modificacion: Date | string;
  codigo_tipo_usuario: number;
}

export interface UsuarioTipoUsuario {
  codigo_usuario_tipo_usuario: number;
  estado: string;
  codigo_usuario: number;
  codigo_tipo_usuario: number;
}

export interface Auth {
  message: string;
  token: string;
  expiresIn: string;
  user:User;
  perfiles: any;
}

export interface User {
  codigo_usuario: number;
  usuario: string;
  correo_usuario: string;
  condicion: string;
  id_usuario: string;
  codigo_empleado: string;
}

export interface FichaSocialHistorica {
  CODIGO: string;
  NOMBRE: string;
  LOCALIDAD: string;
  CEDULA: string;
  MAIL: string;
  GRUPO_DEPARTAMENTO: string;
  DEPARTAMENTO: string;
  CARGO: string;
  CODIGO_JEFE: string;
}

export interface InformacionExterna {
  codigo_informacion_externa: number;
  codigo_usuario: number;
  identificador: string;
  nombres: string;
  passcode: string;
  estado: string;
  fecha_creacion: Date | string;
  usuario_creacion: string;
  fecha_modificacion: Date | string;
  usuario_modificacion: string;
} 


///////////////////////////////////////////////////////////////////////////////////////

export interface EnsayoCategoriaEnsayo {
    codigo_ensayo_categoria_ensayo: number;
    codigo_solicitud?: number;
    codigo_muestra?: number;
    codigo_tipo_ensayo?: number;
    codigo_formulario?: number;
    responsable_ensayo?: string;
    fecha_inicio?: Date;
    fecha_fin?: Date;
    fecha_extension?: Date;
    estado?: string;
    fecha_creacion?: Date;
    usuario_creacion?: string;
}

export interface EnsayoMediciones {
    codigo_ensayo_modificaciones: number;
    codigo_tipo_ensayo?: number;
    codigo_tipo_medicion?: number;
    numero_tabla?: number;
    nombre_tabla?: string;
    identificacion_campo?: number;
    nombre_campo?: string;
    mediciones_minimas?: string;
    estado?: string;
    fecha_modificacion?: Date;
    usuario_modificacion?: string;
}

export interface Familia {
    codigo_familia: number;
    nombre_familia?: string;
    mnemonico?: string;
    detalle?: string;
    estado?: string;
    fecha_modificacion?: Date;
    usuario_modificacion?: string;
}

export interface Muestra {
    codigo_muestra: number;
    codigo_familia_material?: number;
    nombre_material_muestra: string;
    area_material?: string;
    detalle_material?: string;
    material?: string;
    lote_serial?: string;
    fecha_fabricacion?: string; // En el SQL está como varchar(50)
    fecha_carga?: Date;
    estado?: string;
    fecha_creacion?: Date;
    usuario_creacion?: string;
}

export interface Resultado {
    codigo_resultado: number;
    codigo_ensayo_categoria_ensayo?: number;
    codigo_celda?: number;
    fecha_generacion?: Date;
    toma?: number;
    valor?: number;
    resultados?: string;
    estado?: string;
    fecha_creacion?: Date;
    usuario_creacion?: string;
    codigo_ensayo_modificaciones?: number;
}

/** Metadatos de plantilla — Logical Model V2 */
export interface Formulario {
    codigo_formulario: number;
    nombre_formulario?: string;
    version_formulario?: number;
    estado?: string;
    fecha_modificacion?: Date | string;
    usuario_modificacion?: string;
}

export interface FormularioTabla {
    codigo_formulario_tabla: number;
    codigo_formulario?: number;
    codigo_tabla?: number;
    cabecera_formulario?: string;
    posicion?: string;
    estado?: string;
    fecha_modificacion?: Date | string;
    usuario_modificacion?: string;
}

export interface Tabla {
    codigo_tabla: number;
    codigo_tipo_ensayo?: number;
    nombre_tabla?: string;
    tipo_tabla?: string;
    filas_muestra?: number;
    numero_columnas?: number;
    numero_filas_diseno?: number;
    version?: string;
    estado?: string;
    fecha_modificacion?: Date | string;
    usuario_modificacion?: string;
}

/** Eje de columna de la grilla (sin jerarquía padre/hijo). */
export interface Columna {
    codigo_columna: number;
    codigo_tabla?: number;
    indice?: number;
    nombre_columna?: string;
    unidades?: string;
    estado?: string;
    fecha_modificacion?: Date | string;
    usuario_modificacion?: string;
}

export type TipoCelda = "header" | "label" | "input" | "calculated";

/** Celda ancla de la grilla Excel (fusiones vía rowspan/colspan). */
export interface Celda {
    codigo_celda: number;
    codigo_tabla?: number;
    codigo_columna?: number;
    fila?: number;
    col?: number;
    rowspan?: number;
    colspan?: number;
    tipo_celda?: TipoCelda | string;
    alias?: string;
    campo_obligatorio?: boolean;
    estado?: string;
    fecha_modificacion?: Date | string;
    usuario_modificacion?: string;
}

export interface Formula {
    codigo_formula: number;
    codigo_celda?: number;
    nombre?: string;
    expresion?: string;
    latex?: string;
    ambito?: string;
    estado?: string;
    fecha_modificacion?: Date | string;
    usuario_modificacion?: string;
}

export interface Dependencias {
    codigo_dependencia: number;
    codigo_formula?: number;
    codigo_celda?: number;
    estado?: string;
    fecha_modificacion?: Date | string;
    usuario_modificacion?: string;
}

export interface Solicitud {
    codigo_solicitud: number;
    identificador_ensayo?: string;
    descripcion?: string;
    fecha_fab_adq?: Date;
    correos_objetivo?: string;
    aceptacion_terminos?: boolean; // Mapeado de bit
    estado_solicitud?: string;
    estado?: string;
    fecha_modificacion?: Date;
    usuario_mnodificacion?: string;
}

export interface TipoEnsayo {
    codigo_tipo_ensayo: number;
    codigo_familia?: number;
    nombre_tipo_ensayo?: string;
    mnemonico?: string;
    probetas_minimas?: number;
    estado?: string;
    fecha_creacion?: Date;
    usuario_creacion?: string;
}

export interface TipoMedicion {
    codigo_tipo_medicion: number;
    seccion?: string;
    nombre_tipo_medicion?: string;
    estado?: string;
    fecha_modificacion?: Date;
    usuario_modificaicon?: string;
}