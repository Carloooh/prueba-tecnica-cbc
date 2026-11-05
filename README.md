# Prueba Técnica CBC – Seguimiento de Proyectos de Inversión

Servicio backend desarrollado en **NestJS (TypeScript)** con persistencia en **SQLite (Prisma ORM)**. El proyecto se encarga de extraer proyectos desde una API externa (`mock-api`), normalizar los datos según las reglas de negocio, registrar los descartados, resolver duplicados y exponer la información limpia mediante una API REST protegida por API Key.

---

## Cómo ejecutar el proyecto

Primero, clona el repositorio en tu máquina:

```bash
git clone <URL_DE_TU_REPOSITORIO>
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

## Proceso de Ingesta y Datos

Al levantar el servicio, la ingesta corre automáticamente en segundo plano (`IngestionService`) ejecutando 4 etapas:

1. **Paso 1/4 (Extracción resiliente):** Recorre todas las páginas de `mock-api` tolerando fallos de red (reintenta errores `500` con backoff exponencial y errores `429` esperando los segundos de `Retry-After`).
2. **Paso 2/4 (Normalización y Rechazos):** Valida cada registro. Si incumple una regla (formato de monto, fecha inexistente, región o estado inválido), se envía al archivo de rechazados indicando el motivo exacto del fallo.
3. **Paso 3/4 (Deduplicación):** Si el mismo proyecto llega más de una vez (incluso con el ID escrito con mayúsculas/minúsculas diferentes), se conserva el que tenga la fecha `actualizado_en` más reciente.
4. **Paso 4/4 (Persistencia Idempotente):** Guarda los registros limpios en SQLite usando `upsert`. Si ejecutas la ingesta múltiples veces, no se generan duplicados ni se alteran los datos válidos.

En la consola se aprecian los logs en tiempo real indicando el avance de cada fase:

```
[IngestionService] --- [Paso 1/4] Extracción: Obteniendo páginas desde mock-api ---
[IngestionService] [Paso 1/4] Registros descargados: 112
[IngestionService] --- [Paso 2/4] Limpieza, Validación y Archivo de Rechazados ---
[IngestionService] [Paso 2/4] Resultado: 103 válidos | 9 inválidos
[IngestionService] [Paso 2/4] Archivo de rechazados sobrescrito en: ./data/rejected.json
[IngestionService] --- [Paso 3/4] Deduplicación (conservando actualizado_en más reciente) ---
[IngestionService] [Paso 3/4] Proyectos únicos finales tras resolver duplicados: 91
[IngestionService] --- [Paso 4/4] Persistencia en SQLite (Idempotente) ---
[IngestionService] --- Pipeline ETL finalizado con éxito ---
```

### ¿Dónde quedan los datos generados?

- **Archivo de rechazados:** `app/data/rejected.json` (se sobrescribe en cada corrida para reflejar el estado de la última ingesta, con `id`, `nombre` y `motivo`).
- **Base de datos SQLite:** `app/data/dev.db` (almacena los proyectos normalizados y deduplicados).

---

## Pruebas Automatizadas

```bash
cd app
pnpm test          # Pruebas unitarias de limpieza y lógica
pnpm test:e2e      # Pruebas de integración HTTP de la API
```

Las pruebas cubren:

- **Limpieza de montos:** formato chileno con puntos y comas, millones (`MM USD`, `millones`) y enteros sin unidad (`850000` -> `0.85`).
- **Fechas:** formatos `AAAA-MM-DD`, `DD/MM/AAAA` y `DD-mmm-AAAA` (meses en español), así como validación de días reales en calendario (ej. rechazo de `31/02/2024`).
- **Regiones y Estados:** variantes romanas (`II Región`) a nombres canónicos, tolerancia a tildes y mayúsculas.
- **Deduplicación:** resolución por `actualizado_en` más reciente.
- **API REST:** respuestas `200` con estructura exacta del contrato, filtros (`region`, `estado`, `monto_min`), ordenamiento por `id` ascendente, errores `400 Bad Request` ante parámetros inválidos y `401 Unauthorized` por API Key.

---

## Decisiones Técnicas, Supuestos y Fuentes

### Decisiones Técnicas

- **NestJS y TypeScript:** Arquitectura por capas (módulos, controladores, servicios y guards) con inyección de dependencias. TypeScript garantiza cumplimiento estricto del contrato de datos.
- **SQLite + Prisma ORM:** Ideal para la escala del ejercicio (~100 proyectos) sin sobrecargar con bases de datos externas. Prisma asegura transacciones seguras, migraciones sencillas y consultas agregadas (`groupBy` para `/resumen`).
- **Separación Ingesta vs Servidor API:** La API consulta exclusivamente SQLite. Nunca hace peticiones a la fuente externa en tiempo de request, garantizando respuestas rápidas y desacoplamiento.

### Supuestos Adoptados

1. **Empate en duplicados:** El contrato especifica que gana la fila con `actualizado_en` más reciente. Si dos registros con el mismo ID tienen exactamente el mismo timestamp de actualización, se asume conservar el último registro procesado.
2. **Disparo automático de la ingesta:** Dado que el enunciado solicita que el servicio pueda ejecutarse con un solo comando, se asume que la ingesta debe iniciarse automáticamente al arrancar el contenedor (`onModuleInit`), sin requerir interacción manual adicional para poblar los datos iniciales.
3. **Parámetros query sobrantes en la API:** Si el cliente envía parámetros query adicionales no contemplados en el contrato (por ejemplo `GET /proyectos?foo=bar` o `GET /resumen?orden=desc`), la API los ignora y procesa los filtros válidos sin fallar innecesariamente.

### Aclaración sobre Variables de Entorno y Credenciales

Soy consciente de que subir archivos de entorno (`.env`) al repositorio y exponer variables directamente es una mala práctica y un fallo de seguridad crítico que nunca debe realizarse en proyectos reales. Los archivos `.env` reales se mantienen ignorados en `.gitignore`. Sin embargo, los archivos `.env.example` incluidos contienen las claves de desarrollo (`dev-source-key`, `dev-api-key`) que fueron provistas directamente en el enunciado de la prueba técnica. Dado que son credenciales falsas de prueba y no pertenecen a un entorno productivo ni a servicios externos reales, se proporcionan únicamente para facilitar la evaluación y cumplir con el requisito de que el proyecto levante sin fricciones.

### Fuentes de Información y Uso de IA

- **Documentación oficial:** Documentación de NestJS (Guards, Controllers, Config), Prisma ORM (agrupaciones y schema SQLite) y especificación de Docker Compose.
- **Uso de IA asistencial:** Utilicé herramientas de IA como apoyo para el scaffolding inicial del proyecto, afinación de expresiones regulares para formatos de fecha en español / montos chilenos, y generación de casos borde en las plantillas de tests. Toda la lógica fue validada y ajustada contra los requerimientos de `CONTRATO.md`.

---

## ¿Qué mejoraría con más tiempo?

- **Trigger manual de ingesta:** Agregar un endpoint administrativo o un comando de consola (`CLI`) para ejecutar la ingesta bajo demanda sin reiniciar el contenedor.
- **Detección de cambios (historial):** Implementar una tabla que guarde un log de auditoría para saber qué proyectos cambiaron de estado o cuáles entraron como nuevos entre cada ejecución.
- **Documentación con Swagger:** Añadir `@nestjs/swagger` para tener una interfaz interactiva donde probar los endpoints visualmente.
- **Manejo de logs y monitoreo:** Mejorar el logging estructurado con herramientas especializadas para facilitar el seguimiento en caso de errores en producción.
- **Nuevos Endpoints y/o Filtros:** Crear nuevos endpoints y/o filtros, como por ejemplo para consultar un registro en específico, u obtener el resumen de proeyctos por región bajo una cierta cantidad de proyectos o monto, para disponer de más información a los usuarios.
