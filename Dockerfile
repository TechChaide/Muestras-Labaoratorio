# === Etapa 1: Builder - Instala dependencias y construye la aplicación ===
FROM node:20-alpine AS builder

WORKDIR /app

# basePath se inyecta en build (NEXT_PUBLIC_*); debe coincidir con Traefik/compose.
ARG NEXT_PUBLIC_BASE_PATH=/Ensayos-Calidad
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH

COPY package*.json ./

RUN npm install

COPY . .

# La configuración 'output: standalone' en next.config es crucial aquí
RUN npm run build

# === Etapa 2: Runner - Crea la imagen final de producción ===
FROM node:20-alpine AS runner

WORKDIR /app

# Grupo nodejs + usuario nextjs (plantilla oficial Next) — el chown usa nextjs:nodejs
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Copia los artefactos de la construcción desde la etapa 'builder'
# Copia la carpeta 'public' para los assets estáticos (imágenes/plantillas de
# usuario YA NO viven acá — ver nota más abajo).
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Pre-crea las carpetas de subida (imágenes de celdas y plantillas de informes)
# con el dueño correcto. El código escribe directamente en estas rutas
# absolutas (environment.evidenciasFotosURL / environment.pantillasFormatos en
# src/environments/environments.prod.ts), NO bajo public/. docker-compose.yml
# monta volúmenes del host sobre estas mismas rutas exactas: esto solo sirve
# de respaldo si se corre el contenedor sin esos volúmenes montados; con los
# volúmenes del host, el dueño real lo determina el recurso montado (ver nota
# de despliegue: hay que crearlos con chown/uid 1001 antes del primer run — y
# si es un recurso SMB/CIFS de Windows, ese uid va en las opciones del mount,
# no en un chown posterior).
RUN mkdir -p /appdocs/Calidad/Ensayos_Laboratorio/EvidenciaFotos /appdocs/Calidad/Ensayos_Laboratorio/InformesPlantillas \
    && chown -R nextjs:nodejs /appdocs

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
