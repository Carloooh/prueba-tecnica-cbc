# Prueba Técnica CBC

Servicio backend desarrollado en **NestJS (TypeScript)** con persistencia en **SQLite (Prisma ORM)**. El proyecto se encarga de extraer proyectos desde una API externa (`mock-api`), normalizar los datos según las reglas de negocio, registrar los descartados, resolver duplicados y exponer la información limpia mediante una API REST protegida por API Key.

---

## Cómo ejecutar el proyecto

Primero, clona el repositorio en tu máquina:

```bash
git clone https://github.com/Carloooh/prueba-tecnica-cbc.git
cd prueba-tecnica-cbc
```

### Opción 1: Con Docker (Recomendado - Un solo comando)

Requisito: tener Docker y Docker Compose activos.

1. **Crear archivo de entorno (opcional):**

   ```bash
   cp .env.example .env
   ```

2. **Levantar los servicios:**
   ```bash
   docker compose up --build
   ```

_(Nota: `docker-compose.yml` también incluye valores por defecto listos para desarrollo por si no se define el archivo `.env`)._

- **API propia:** `http://localhost:8000`
- **Fuente externa (mock-api):** `http://localhost:8001`
- **API Key para probar endpoints:** `dev-api-key` (enviar en la cabecera `X-API-Key`)

---

### Opción 2: Sin Docker (Ejecución Local)

Requisitos: **Python 3.10+**, **Node.js 20+** y **pnpm** instalados.

1. **Levantar la fuente externa simulada:**
   En una terminal, desde la raíz del proyecto:

   ```bash
   cp .env.example .env
   PORT=8001 python mock-api/server.py
   ```

   _(Queda disponible en `http://localhost:8001`)_

2. **Iniciar el servicio NestJS:**
   En otra terminal:
   ```bash
   cd app
   cp .env.example .env
   pnpm install
   pnpm prisma db push
   pnpm run start:dev
   ```

---

## Proceso del Pipeline ETL y Logs

Al levantar el servicio, la ingesta corre automáticamente en segundo plano (`IngestionService`) ejecutando 5 etapas secuenciales:

1. **Paso 1/5 (Extracción resiliente):** Recorre todas las páginas de `mock-api` tolerando fallos de red (reintenta errores `500` con backoff exponencial y errores `429` esperando los segundos indicados en la cabecera `Retry-After`).
2. **Paso 2/5 (Normalización y Rechazos):** Valida cada registro contra las reglas de negocio. Si incumple el formato de monto, la fecha es inválida o la región/estado no son reconocidos, se descarta y se envía al archivo de rechazados con el motivo detallado.
3. **Paso 3/5 (Deduplicación):** Si el mismo proyecto llega más de una vez (incluso con variantes en mayúsculas/minúsculas en el ID), se conserva el registro que tenga la fecha `actualizado_en` más reciente.
4. **Paso 4/5 (Detección de Cambios):** Compara los registros entrantes contra el estado actual en la base de datos para identificar proyectos nuevos o cambios de estado respecto a la corrida previa.
5. **Paso 5/5 (Persistencia Idempotente):** Inserta o actualiza los registros limpios en SQLite mediante `upsert`. Corridas sucesivas no duplican información ni alteran datos válidos.

En la consola se aprecian los logs en tiempo real indicando el avance de cada fase, como por ejemplo:

```
[IngestionService] --- [Paso 1/5] Extracción: Obteniendo páginas desde mock-api ---
[IngestionService] [Paso 1/5] Registros descargados: 112
[IngestionService] --- [Paso 2/5] Limpieza, Validación y Archivo de Rechazados ---
```

### ¿Dónde quedan los datos generados?

- **Base de datos SQLite:** `app/data/dev.db` (almacena los proyectos normalizados y deduplicados con su estado actualizado).
- **Archivo de rechazados:** `app/data/rejected.json` (se sobrescribe en cada corrida con los registros inválidos y el motivo del descarte).
- **Archivo de historial de cambios:** `app/data/changes.json` (bitácora acumulativa con la fecha oficial chilena, proyectos nuevos y transiciones de estado).

---

## Funcionalidad Opcional: Detección de Cambios entre Ejecuciones

En el enunciado se planteó como desafío extra:

> _"Detección de cambios entre ejecuciones: informar qué proyectos son nuevos o cambiaron de estado."_

Para abordarlo de forma limpia y verificable, se implementó lo siguiente:

1. **Mecanismo de detección:** En el paso 4 del ETL, antes del `upsert`, se comparan los registros limpios contra SQLite. Si el ID no existía, se clasifica como proyecto nuevo; si ya existía pero su estado cambió, se registra la transición (`estado_anterior` -> `estado_nuevo`). Además, SQLite se actualiza con el nuevo estado para que `GET /proyectos` y `GET /resumen` reflejen siempre la información vigente.
2. **Historial acumulativo y zona horaria chilena:** La bitácora se persiste en `app/data/changes.json` con marcas de tiempo en formato ISO 8601 bajo la zona horaria oficial de Chile (`America/Santiago`, ej. `2026-11-05T21:54:53-03:00`), evitando desfasajes UTC. Se eligió guardarlo en JSON para no alterar el esquema de SQLite solicitado en el contrato y prevenir interferencias con los scripts de corrección del evaluador.
3. **Disparo bajo demanda (`POST /ingesta`):** Para probar la detección sin reiniciar el servicio, se habilitó el endpoint administrativo `POST /ingesta` (protegido por `X-API-Key`):
   ```bash
   curl -X POST -H "X-API-Key: dev-api-key" http://localhost:8000/ingesta
   ```
   Retorna de inmediato el resultado de la corrida y el detalle de novedades detectadas.

_(Nota: Dado que la fuente `mock-api` es estática y por contrato no debe modificarse en el repositorio, ejecuciones repetidas contra la misma fuente reportarán 0 cambios. Toda la lógica de detección ante proyectos nuevos y cambios de estado reales está cubierta y comprobada en las pruebas automatizadas, por ende al ejecutarlas, se verá reflejado que la funcionalidad está correcta)._

---

## Pruebas Automatizadas

```bash
cd app
pnpm test          # Pruebas unitarias de limpieza, tracking de cambios y lógica
pnpm test:e2e      # Pruebas de integración HTTP de la API
```

Las pruebas cubren:

- **Limpieza de montos:** formato chileno con puntos y comas, millones (`MM USD`, `millones`) y enteros sin unidad (`850000` -> `0.85`).
- **Fechas:** formatos `AAAA-MM-DD`, `DD/MM/AAAA` y `DD-mmm-AAAA` (meses en español), así como validación de días reales en calendario (ej. rechazo de `31/02/2024`).
- **Regiones y Estados:** variantes romanas (`II Región`) a nombres canónicos, tolerancia a tildes y mayúsculas.
- **Deduplicación:** resolución por `actualizado_en` más reciente.
- **Detección de Cambios:** identificación de proyectos nuevos, transiciones de estado, zonas horarias chilenas y preservación del archivo `changes.json`.
- **API REST:** respuestas `200` con estructura exacta del contrato (`GET /proyectos` y `GET /resumen`), disparador bajo demanda (`POST /ingesta`), filtros, ordenamiento por `id` ascendente, errores `400 Bad Request` y `401 Unauthorized`.

---

## Decisiones Técnicas, Supuestos y Fuentes

### Decisiones Técnicas

- **NestJS y TypeScript:** Arquitectura por capas (módulos, controladores, servicios y guards) con inyección de dependencias. TypeScript garantiza cumplimiento estricto del contrato de datos.
- **SQLite + Prisma ORM:** Ideal para la escala del ejercicio (~100 proyectos) sin sobrecargar con bases de datos externas. Prisma asegura transacciones seguras, migraciones sencillas y consultas agregadas (`groupBy` para `/resumen`).
- **Separación Ingesta vs Servidor API:** La API consulta exclusivamente SQLite. Nunca hace peticiones a la fuente externa en tiempo de request, garantizando respuestas rápidas y desacoplamiento.
- **Historial de cambios en JSON:** Se almacena en `app/data/changes.json` para mantener intacto el esquema canónico de SQLite y asegurar que las pruebas automáticas del evaluador no tengan interferencias.

### Supuestos Adoptados

1. **Empate en duplicados:** El contrato especifica que gana la fila con `actualizado_en` más reciente. Si dos registros con el mismo ID tienen exactamente el mismo timestamp de actualización, se asume conservar el último registro procesado.
2. **Disparo automático de la ingesta:** Dado que el enunciado solicita que el servicio pueda ejecutarse con un solo comando, se asume que la ingesta debe iniciarse automáticamente al arrancar el contenedor (`onModuleInit`), sin requerir interacción manual adicional para poblar los datos iniciales.
3. **Persistencia de proyectos no presentes en nuevas corridas:** Si en una nueva ejecución de ingesta algún proyecto previo no viene en los datos de la fuente externa, se asume que mantiene su último estado conocido y no se elimina de la base de datos.
4. **Parámetros query sobrantes en la API:** Si el cliente envía parámetros query adicionales no contemplados en el contrato (por ejemplo `GET /proyectos?foo=bar` o `GET /resumen?orden=desc`), la API los ignora y procesa los filtros válidos sin fallar innecesariamente.
5. **Alcance de cambios en nuevas ejecuciones de ingesta:** Para la detección de cambios entre ejecuciones, se asume que el cambio de negocio son solo cambios de estado del proyecto.

### Aclaración sobre Variables de Entorno y Credenciales

Soy consciente de que subir archivos de entorno (`.env`) al repositorio y exponer variables directamente es una mala práctica y un fallo de seguridad crítico que nunca debe realizarse en proyectos reales. Los archivos `.env` reales se mantienen ignorados en `.gitignore`. Sin embargo, los archivos `.env.example` incluidos contienen las claves de desarrollo (`dev-source-key`, `dev-api-key`) que fueron provistas directamente en el enunciado de la prueba técnica. Dado que son credenciales falsas de prueba y no pertenecen a un entorno productivo ni a servicios externos reales, se proporcionan únicamente para facilitar la evaluación y cumplir con el requisito de que el proyecto levante sin fricciones.

### Fuentes de Información y Uso de IA

- **Documentación oficial:** Documentación de NestJS (Guards, Controllers, Config), Prisma ORM (agrupaciones y schema SQLite), especificación de Docker Compose y documentación de Azure para la respuesta de arquitectura en `DISENO.md`.
- **Uso de IA:** Utilicé herramientas de IA como apoyo para el scaffolding inicial del proyecto, creación de expresiones regulares, definición de pruebas para los tests, automatización de procesos repetitivos, solución de errores, y como herramienta de apoyo general durante el desarrollo.

Toda la lógica fue validada y ajustada contra los requerimientos de `CONTRATO.md`.

---

## ¿Qué mejoraría con más tiempo?

- **Documentación con Swagger:** Añadir `@nestjs/swagger` para tener una interfaz interactiva donde probar los endpoints visualmente.
- **Manejo de logs y monitoreo:** Mejorar el logging estructurado con herramientas especializadas (ej. Winston o Pino) para facilitar el seguimiento en caso de errores en producción, monitoreo de rendimiento y recursos.
- **Nuevos Endpoints y/o Filtros:** Crear nuevos endpoints y filtros, como consultar un registro específico por ID (`GET /proyectos/:id`) o filtrar el resumen por montos y rangos de fecha.
- **Seguridad avanzada:** Añadir controles de accesos más robustos con tokens de sesión (JWT) para usuarios, expiración, roles y cifrado de comunicaciones.
