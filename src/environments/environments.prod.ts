
// Este archivo ya no es necesario para la configuración de la API_URL en Next.js.
// La configuración se ha movido al archivo .env en la raíz del proyecto.
// Puedes eliminar este archivo si lo deseas, o mantenerlo si tiene otras configuraciones.

export const environment = {
    production: true,
    nombreAplicacion: "APP_BASE",

    aplicaciones: ["APP_ENSAYOS_LABORATORIO"],

    basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',

    evidenciasFotosURL: process.env.NEXT_PUBLIC_EVIDENCIAS_FOTOS_URL || '/appdocs/Calidad/Ensayos_Laboratorio/EvidenciaFotos',
    pantillasFormatos: process.env.NEXT_PUBLIC_PANTILLAS_FORMATOS || '/appdocs/Calidad/Ensayos_Laboratorio/InformesPlantillas',
    ////////////////////////////////////////Api de Seguridades
    //apiURL : '/seguridades/api',
    //apiURL : 'http://localhost:5400',
    apiURL : 'https://apps.chaide.com/seguridadesGuard',
    apiSeguridadesINIT : 'https://apps.chaide.com/seguridades',
    

    ///////////////////////////////////////Api de reconocimiento Facial
    apiAuthFacial: 'https://apps.chaide.com/AServiceUth2',


    /////////////////////////////////////Api Propia de la Aplicación
    //apiAPP: 'http://localhost:5400',
    apiAPP: 'https://apps.chaide.com/ensayosLaboratorioBA',

    tituloSistema: 'SISTEMA INTEGRADO DE SEGURIDADES',
};
