# Plan de Trabajo

## Resumen

Construir un proceso ETL de datos y una API con dos partes principales:

---

### Fase 1: Entorno y Verificación Inicial

- [x] **1.1. Configuración de repositorio inicial:** Clonar / copiar proyecto base y subir al nuevo repositorio remoto.
- [x] **1.2. Probar la fuente externa (`mock-api`):**
  - Copiar `.env.example` a `.env`.
  - Levantar `mock-api` con Docker (`docker compose up --build mock-api`) o local con Python.
  - Probar llamada con curl agregando el header `X-API-Key: dev-source-key`. Verificado respondiendo 112 items.

---

### Fase 2: Configuración del Proyecto Propio

- [x] **2.1. Elegir stack tecnológico y crear estructura base:**
  - Creado en `app/` con NestJS, TypeScript y pnpm.
  - Scripts y tests configurados y verificados.
- [x] **2.2. Configuración de variables de entorno y Base de Datos:**
  - Variables de entorno definidas (`PORT`, `API_KEY`, `SOURCE_BASE_URL`, `SOURCE_API_KEY`, `DATABASE_URL`, `REJECTED_FILE_PATH`).
  - Prisma configurado con SQLite (`Project` model) y `PrismaModule` listo para inyección de dependencias.
  - Soporte de configuración global en NestJS vía `@nestjs/config`.

---

### Fase 3: Lógica de Normalización, Limpieza y Rechazos (Core de Negocio)

- [ ] **3.1. Normalizadores de campos:**
  - `id`: mayúsculas, sin espacios (`id_vacio`).
  - `nombre` y `titular`: trim y limpieza de espacios redundantes (`nombre_vacio`).
  - `monto`: parseo de formato chileno (`1.234,5 MM USD`, `US$ 2,5 millones`, `850000`) a millones USD (`monto_invalido`, `monto_negativo`).
  - `fecha_ingreso`: parsear formatos (`AAAA-MM-DD`, `DD/MM/AAAA`, `DD-mmm-AAAA` con meses en español) a ISO 8601 (`fecha_invalida`).
  - `region`: mapeo contra diccionario canónico y variantes romanas/regionales (`region_desconocida`).
  - `estado`: mapeo a canónicos (`En evaluación`, `Aprobado`, `Rechazado`) sin importar mayúsculas/tildes (`estado_desconocido`).
- [ ] **3.2. Manejo de duplicados y rechazados:**
  - Regla de duplicados: mismo ID normalizado -> conservar el de `actualizado_en` más reciente.
  - Generación/sobrescritura del archivo de rechazados (`rejected.json` o `rejected.csv`) con `id`, `nombre` y `motivo`.
- [ ] **3.3. Tests unitarios de normalización:**
  - Pruebas para casos borde de montos, fechas, regiones y estados según `CONTRATO.md`.

---

### Fase 4: Proceso de Ingesta Robusta

- [ ] **4.1. Cliente HTTP resiliente:**
  - Implementar paginación completa (`page=1` hasta `total_pages`).
  - Manejo de reintentos con backoff exponencial para `500` y lectura de cabecera `Retry-After` para `429`.
  - Configurar timeouts.
- [ ] **4.2. Flujo completo de ingesta:**
  - Extraer datos de la mock-api -> Normalizar -> Separar válidos y rechazados -> Resolver duplicados -> Persistir en SQLite.
  - Garantizar idempotencia (ejecutar dos veces seguidas no debe duplicar registros).
  - Exponer mecanismo para disparar la ingesta (comando CLI o endpoint específico).

---

### Fase 5: API REST Propia

- [ ] **5.1. Middleware de autenticación:**
  - Validar cabecera `X-API-Key` contra variable de entorno. Responder `401` si falla.
- [ ] **5.2. Endpoint `GET /proyectos`:**
  - Filtros opcionales: `region`, `estado`, `monto_min`.
  - Paginación: `page` (default 1), `page_size` (default 20, max 100).
  - Orden ascendente por `id`.
  - Manejo de `400` ante parámetros inválidos.
  - Formato exacto según contrato (`items`, `total`, `page`, `page_size`).
- [ ] **5.3. Endpoint `GET /resumen`:**
  - Agrupación por región: `region`, `cantidad`, `monto_total_musd`.
- [ ] **5.4. Tests de integración para la API:**
  - Probar endpoints, filtros, paginación y validación de `X-API-Key`.

---

### Fase 6: Dockerización y Orquestación

- [x] **6.1. Dockerfile del servicio:**
  - Creado `Dockerfile` multi-stage optimizado para NestJS + Prisma en Node 20 Alpine.
- [x] **6.2. Integración en `docker-compose.yml`:**
  - Agregado servicio `app` dependiente del healthcheck de `mock-api`, volumen de persistencia para SQLite y variables de entorno.

---

### Fase 7: Documentación y Entrega

- [ ] **7.1. Documento `DISENO.md` (Parte 2):**
  - Responder las 3 preguntas de arquitectura/diseño (40 fuentes, Azure, trade-offs a 2 días).
- [ ] **7.2. Documento `README.md` (Parte 1):**
  - Instrucciones claras de ejecución con Docker y sin Docker.
  - Puertos, variables y claves de prueba.
  - Explicación de cómo disparar la ingesta y dónde ver el archivo de rechazados.
  - Justificación de DB, supuestos y mención de uso de herramientas/IA.
- [ ] **7.3. Revisión final y entrega:**
  - Verificar historial de commits.
  - Validar accesos de lectura en GitHub para los evaluadores.
