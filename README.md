# Prueba Técnica CBC – Seguimiento de Proyectos de Inversión

Servicio backend desarrollado en **NestJS (TypeScript)** con persistencia en **SQLite (Prisma ORM)**. El sistema realiza la ingesta resiliente de datos desde una API externa inestable (`mock-api`), normaliza los registros bajo reglas chilenas de negocio, documenta los rechazados, resuelve duplicados conservando la versión más reciente y expone los datos limpios mediante una API REST protegida por API Key.

---

## 🚀 Inicio Rápido con Docker (Recomendado)

Requisito: tener Docker y Docker Compose instalados.

1. **Crear archivo de variables de entorno:**

   ```bash
   cp .env.example .env
   ```

2. **Levantar todos los servicios con un solo comando:**
   ```bash
   docker compose up --build
   ```

- **Tu API (NestJS):** escuchando en `http://localhost:8000`
- **Fuente simulada (mock-api):** escuchando en `http://localhost:8001`
- **Clave de desarrollo de tu API:** `dev-api-key` (cabecera `X-API-Key`)

---

## 🔄 Cómo funciona la Ingesta (ETL)

Al iniciar el contenedor de la aplicación, el proceso de ingesta se ejecuta automáticamente en segundo plano en 4 etapas claras:

1. **Paso 1/4 (Extracción resiliente):** Recorre todas las páginas de `mock-api` tolerando fallos de red (reintenta errores `500` con backoff exponencial y errores `429` esperando los segundos de `Retry-After`).
2. **Paso 2/4 (Normalización y Rechazos):** Valida cada registro. Si incumple una regla (formato de monto, fecha inexistente, región o estado inválido), se envía a `app/data/rejected.json` indicando el motivo exacto del fallo.
3. **Paso 3/4 (Deduplicación):** Si el mismo proyecto llega más de una vez (incluso con el ID escrito con mayúsculas/minúsculas diferentes), se conserva el que tenga la fecha `actualizado_en` más reciente.
4. **Paso 4/4 (Persistencia Idempotente):** Guarda los registros limpios en SQLite usando `upsert`. Si ejecutas la ingesta múltiples veces, no se generan duplicados ni se alteran los datos válidos.

> **Dónde revisar los resultados:**
>
> - **Archivo de rechazados:** `app/data/rejected.json` (se sobrescribe en cada corrida para reflejar el estado actual).
> - **Base de datos SQLite:** `app/data/dev.db`.

---

## 🧪 Pruebas Automatizadas

Las pruebas unitarias y de integración se ejecutan de forma manual cuando desees verificar la lógica:

```bash
cd app
pnpm test
```

Cubren casos borde de normalización de montos, validación de fechas reales en el calendario (incluyendo años bisiestos), mapeo de regiones/estados, deduplicación y sobreescritura de rechazados.

---

## ⚖️ Decisiones de Diseño y Supuestos

1. **Framework (NestJS + TypeScript):** Elegido por su arquitectura modular por capas (servicios, controladores, guards), inyección de dependencias y tipado estricto que previene desajustes de contrato en tiempo de compilación.
2. **Base de Datos (SQLite + Prisma):** Ideal para la portabilidad del ejercicio (~100 proyectos) sin requerir contenedores pesados de bases de datos externas. Prisma asegura tipos exactos y transacciones seguras para operaciones de agregación y filtros.
3. **Manejo de Duplicados:** Si dos registros válidos comparten el mismo ID pero difieren en datos, se conserva el que tiene `actualizado_en` más reciente. Si tienen exactamente el mismo timestamp, se preserva la última instancia procesada.
4. **Seguridad:** La API exige la cabecera `X-API-Key` validada contra la variable `API_KEY`. Respuestas no autenticadas devuelven `401 Unauthorized`.
5. **Herramientas:** Se utilizó asistencia de IA para acelerar el scaffolding del proyecto, expresiones regulares complejas para parsing chileno y plantillas de pruebas.

---

## ⏱️ ¿Qué haría con más tiempo?

- **Mecanismo de Trigger Manual:** Implementar un endpoint administrativo (ej. `POST /api/v1/ingesta`) protegido con rol de admin para disparar ingestas bajo demanda sin reiniciar la app.
- **Detección de Cambios (Diffing):** Agregar una tabla de auditoría para registrar histórico de transiciones de estado de los proyectos entre ejecuciones sucesivas.
- **Métricas:** Integrar Prometheus y OpenTelemetry para registrar métricas de tasa de fallos de fuentes externas y latencia por página.

podría añadirse el endpoint para consultar un proyecto por id o nombre, más específico en vez de traer todos,
seguridad de conexión mediante credenciales/token
Swagger para documentar la api y pruebas en interfaz
