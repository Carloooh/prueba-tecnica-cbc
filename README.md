# Prueba Técnica CBC – Seguimiento de Proyectos de Inversión

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

1. **Crear archivo de entorno:**

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

En la consola se aprecian los logs en tiempo real indicando el avance de cada fase:

```
[IngestionService] --- [Paso 1/5] Extracción: Obteniendo páginas desde mock-api ---
[IngestionService] [Paso 1/5] Registros descargados: 112
[IngestionService] --- [Paso 2/5] Limpieza, Validación y Archivo de Rechazados ---
[IngestionService] [Paso 2/5] Resultado: 103 válidos | 9 inválidos
[IngestionService] [Paso 2/5] Archivo de rechazados sobrescrito en: ./data/rejected.json
[IngestionService] --- [Paso 3/5] Deduplicación (conservando actualizado_en más reciente) ---
[IngestionService] [Paso 3/5] Proyectos únicos finales tras resolver duplicados: 91
[IngestionService] --- [Paso 4/5] Detección de Cambios entre Ejecuciones ---
[IngestionService] [Paso 4/5] Detección: 91 nuevos | 0 con cambio de estado
[IngestionService] [Paso 4/5] Archivo de historial de cambios actualizado en: ./data/changes.json
[IngestionService] --- [Paso 5/5] Persistencia en SQLite (Idempotente) ---
[IngestionService] --- Pipeline ETL finalizado con éxito ---
```

### ¿Dónde quedan los datos generados?

- **Archivo de rechazados:** `app/data/rejected.json` (se sobrescribe en cada corrida para reflejar el estado de la última ingesta, con `id`, `nombre` y `motivo`).
- **Archivo de historial de cambios:** `app/data/changes.json` (se mantiene de forma acumulativa registrando fecha y hora en formato horario chileno, proyectos nuevos y la bitácora histórica de transiciones de estado).
- **Base de datos SQLite:** `app/data/dev.db` (almacena los proyectos normalizados y deduplicados con su estado actualizado).

---

## Funcionalidad Opcional Extra: Detección de Cambios entre Ejecuciones

En el enunciado de la prueba técnica se incluye como requerimiento extra:

> _"Detección de cambios entre ejecuciones: informar qué proyectos son nuevos o cambiaron de estado."_

Esta funcionalidad fue implementada en su totalidad para ofrecer trazabilidad continua del ciclo de vida de los proyectos entre ejecuciones sucesivas del pipeline.

### 1. Mecanismo de Detección

En el paso 4 del ETL, antes de persistir los datos en SQLite:

- Se consulta el estado actual de los proyectos almacenados en la base de datos mediante Prisma.
- Se compara cada registro entrante limpio contra la base de datos:
  - **Proyecto Nuevo:** Si el `id` no existe en la base de datos, se identifica como nuevo y se almacena en la lista de proyectos ingresados con su fecha de detección.
  - **Cambio de Estado:** Si el `id` ya existe pero su `estado` entrante difiere del que está en la base de datos, se registra la transición con `id`, `nombre`, `estado_anterior`, `estado_nuevo` y fecha de detección.
  - **Sin cambio:** Si el estado es idéntico al persistido, no genera falsos positivos.
- Adicionalmente, el estado del proyecto en la base de datos SQLite se actualiza al nuevo estado vía `upsert`, asegurando que tanto `GET /proyectos` como `GET /resumen` reflejen siempre el estado vigente del negocio.

### 2. Zona Horaria Chilena Oficial

Para asegurar consistencia en auditorías, todas las marcas de tiempo (`ultima_ejecucion`, `detectado_en`) se generan explícitamente en la zona horaria chilena (`America/Santiago`) bajo formato ISO 8601 (por ejemplo `2026-11-05T21:54:53-03:00`). Esto elimina desfases producidos por servidores configurados en UTC o variaciones por el cambio de horario de invierno/verano en Chile.

### 3. Historial Acumulativo en `app/data/changes.json`

El historial se guarda de manera acumulativa en el archivo `app/data/changes.json`:

- **¿Por qué en archivo JSON y no en la base de datos?** Se tomó esta decisión técnica para mantener la tabla de proyectos con la estructura exacta y canónica solicitada en el contrato de la prueba, asegurando que los scripts o suites de prueba automáticas del evaluador no fallen por diferencias de esquema en SQLite. Además, tener un archivo JSON dedicado permite una inspección humana directa y limpia de las ejecuciones.
- Si el archivo ya existía de corridas anteriores, se preserva todo el historial previo y se agregan los nuevos cambios detectados.

Estructura de `app/data/changes.json`:

```json
{
  "ultima_ejecucion": "2026-11-05T21:54:53-03:00",
  "resumen_ultima_ejecucion": {
    "nuevos_detectados": 0,
    "cambios_estado_detectados": 0
  },
  "proyectos_nuevos": [
    {
      "id": "P-0002",
      "nombre": "Parque Eólico Altiplano",
      "estado": "Aprobado",
      "detectado_en": "2026-11-05T21:49:46-03:00"
    }
  ],
  "historial_cambios_estado": [
    {
      "id": "P-0012",
      "nombre": "Planta Solar Los Andes",
      "estado_anterior": "En evaluación",
      "estado_nuevo": "Aprobado",
      "detectado_en": "2026-11-05T21:49:46-03:00"
    }
  ]
}
```

### 4. Disparo bajo demanda vía `POST /ingesta`

Para facilitar la verificación de esta funcionalidad sin necesidad de reiniciar contenedores, se implementó el endpoint administrativo **`POST /ingesta`** (protegido con `X-API-Key`):

```bash
curl -X POST -H "X-API-Key: dev-api-key" http://localhost:8000/ingesta
```

Retorna de inmediato el resultado de la corrida y los cambios detectados:

```json
{
  "mensaje": "Proceso de ingesta y detección de cambios ejecutado con éxito",
  "total_descargados": 112,
  "total_validos": 103,
  "total_rechazados": 9,
  "proyectos_unicos_guardados": 91,
  "nuevos_detectados": 0,
  "cambios_estado_detectados": 0,
  "cambios_estado": []
}
```

---

## Pruebas Automatizadas

```bash
cd app
pnpm test          # Pruebas unitarias de limpieza, tracking de cambios y lógica (55 tests)
pnpm test:e2e      # Pruebas de integración HTTP de la API (13 tests)
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
- **Historial de cambios en JSON y no en base de datos:** Se decidió almacenar el historial de auditoría de cambios en `app/data/changes.json` para facilitar el acceso rápido a la información, evitar modificar la estructura canónica exigida para la tabla de proyectos y asegurar que las pruebas automáticas del evaluador contra SQLite no tengan ninguna interferencia.

### Supuestos Adoptados

1. **Empate en duplicados:** El contrato especifica que gana la fila con `actualizado_en` más reciente. Si dos registros con el mismo ID tienen exactamente el mismo timestamp de actualización, se asume conservar el último registro procesado.
2. **Disparo automático de la ingesta:** Dado que el enunciado solicita que el servicio pueda ejecutarse con un solo comando, se asume que la ingesta debe iniciarse automáticamente al arrancar el contenedor (`onModuleInit`), sin requerir interacción manual adicional para poblar los datos iniciales.
3. **Persistencia de proyectos no presentes en nuevas corridas:** Si en una nueva ejecución de ingesta algún proyecto previo no viene en los datos de la fuente externa, se asume que mantiene su último estado conocido y no se elimina de la base de datos.
4. **Parámetros query sobrantes en la API:** Si el cliente envía parámetros query adicionales no contemplados en el contrato (por ejemplo `GET /proyectos?foo=bar` o `GET /resumen?orden=desc`), la API los ignora y procesa los filtros válidos sin fallar innecesariamente.

### Supuestos Funcionalidad Extra

1. **Trigger ingesta:** Se crea un disparador en POST /ingesta para iniciar el proceso y probar la funcionalidad sin reiniciar el servicio.
2. **Datos que cambian:** Se asume que solo el estado del proyecto cambiará en las nuevas ingestas.
3. **Almacenamiento cambios:** Se establece la forma de almacnar el registro de cambios completo en el mismo formato que los registros rechazados, en un archivo JSON, en la base de datos solo se actualiza el estado del proyecto, además de evitar posibles interferencias con el script para la revisión de los endpoints obligatorios.

### Aclaración sobre Variables de Entorno y Credenciales

Soy consciente de que subir archivos de entorno (`.env`) al repositorio y exponer variables directamente es una mala práctica y un fallo de seguridad crítico que nunca debe realizarse en proyectos reales. Los archivos `.env` reales se mantienen ignorados en `.gitignore`. Sin embargo, los archivos `.env.example` incluidos contienen las claves de desarrollo (`dev-source-key`, `dev-api-key`) que fueron provistas directamente en el enunciado de la prueba técnica. Dado que son credenciales falsas de prueba y no pertenecen a un entorno productivo ni a servicios externos reales, se proporcionan únicamente para facilitar la evaluación y cumplir con el requisito de que el proyecto levante sin fricciones.

### Fuentes de Información y Uso de IA

- **Documentación oficial:** Documentación de NestJS (Guards, Controllers, Config), Prisma ORM (agrupaciones y schema SQLite), especificación de Docker Compose y documentación de Azure para la respuesta de arquitectura en `DISENO.md`.
- **Uso de IA:** Utilicé herramientas de IA como apoyo para el scaffolding inicial del proyecto, creación de expresiones regulares, definición de pruebas para los tests, automatización de procesos repetitivos, solución de errores, y como herramienta de apoyo general durante el desarrollo.

Toda la lógica fue validada y ajustada contra los requerimientos de `CONTRATO.md`.

---

## ¿Qué mejoraría con más tiempo?

- **Trigger manual de ingesta (YA IMPLEMENTADO PARA LA FUNCIONALIDAD EXTRA):** Agregar un endpoint administrativo o un comando de consola (`CLI`) para ejecutar la ingesta bajo demanda sin reiniciar el contenedor.
- **Detección de cambios de proyectos (historial) (YA IMPLEMENTADO PARA LA FUNCIONALIDAD EXTRA):** Implementar una tabla que guarde un log de auditoría para saber qué proyectos cambiaron de estado o cuáles entraron como nuevos entre cada ejecución.
- **Documentación con Swagger:** Añadir `@nestjs/swagger` para tener una interfaz interactiva donde probar los endpoints visualmente.
- **Manejo de logs y monitoreo:** Mejorar el logging estructurado con herramientas especializadas para facilitar el seguimiento en caso de errores en producción, monitoreo de rendimiento y recursos.
- **Nuevos Endpoints y/o Filtros:** Crear nuevos endpoints y/o filtros, como por ejemplo para consultar un registro en específico, u obtener el resumen de proyectos por región bajo una cierta cantidad de proyectos o monto, para disponer de más información a los usuarios.
- **Seguridad:** Añadir controles de accesos más robustos, como por ejemplo con credenciales o tokens de sesión para los usuarios, encriptación, comunicaciones, etc.
