# Roadmap & Plan de Trabajo – Prueba Técnica CBC

## 📌 Checklist Detallado por Etapas

### ⏳ Etapa 1: Funciones de Limpieza y Normalización (Lógica Pura)

> **Objetivo:** Escribir funciones que reciban el texto crudo y devuelvan el objeto limpio o lancen el motivo de rechazo exacto exigido por `CONTRATO.md`.

- [x] **1.1. Limpiador de ID y Nombres:**
  - `id`: Quitar espacios y pasar a mayúsculas (`P-0042`). Si queda vacío $\rightarrow$ rechazo `id_vacio`.
  - `nombre`: Trim y quitar espacios dobles interiores. Si queda vacío $\rightarrow$ rechazo `nombre_vacio`.
  - `titular`: Trim de espacios (puede quedar vacío, no rechaza).
- [x] **1.2. Conversor de Montos a Millones USD (`monto_musd`):**
  - `1.234,5 MM USD` $\rightarrow$ `1234.5`
  - `US$ 2,5 millones` $\rightarrow$ `2.5`
  - `850000` (sin unidad = dólares enteros) $\rightarrow$ `0.85`
  - No numérico $\rightarrow$ `monto_invalido`. Si es $\le 0$ $\rightarrow$ `monto_negativo`.
  - Guardar con máximo 3 decimales.
- [x] **1.3. Conversor de Fechas a ISO (`AAAA-MM-DD`):**
  - Formatos aceptados: `AAAA-MM-DD`, `DD/MM/AAAA` y `DD-mmm-AAAA` (meses en español: `ene`, `feb`, etc.).
  - Fecha inexistente (ej. `31/02/2024`) $\rightarrow$ `fecha_invalida`.
- [x] **1.4. Mapeador de Regiones:**
  - Convierte variantes (romanos como `II Región` o `Región de Antofagasta`) al nombre oficial (`Antofagasta`).
  - Si no existe en la lista oficial $\rightarrow$ `region_desconocida`.
- [x] **1.5. Mapeador de Estados:**
  - Unifica a `En evaluación`, `Aprobado` o `Rechazado` (insensible a mayúsculas y tildes).
  - Cualquier otro valor $\rightarrow$ `estado_desconocido`.
- [x] **1.6. Deduplicación y Escritor de Rechazos:**
  - Misma ID: conservar únicamente el que tenga `actualizado_en` más reciente (los duplicados no son rechazados).
  - Escribir registros inválidos en `rejected.json` con `{ id, nombre, motivo }`.
- [x] **1.7. Tests Unitarios:**
  - Probar con Vitest todos los casos borde de fechas, montos, estados, regiones, deduplicación y escritura de archivo.

---

### ⏳ Etapa 2: Proceso de Ingesta (El pipeline ETL)

> **Objetivo:** El proceso que se conecta a la `mock-api`, maneja los errores de red, aplica la limpieza y guarda en SQLite.

- [x] **2.1. Cliente HTTP con reintentos:**
  - Consultar paginado desde `page=1` hasta `total_pages`.
  - Ante error `429`: leer cabecera `Retry-After` y pausar los segundos requeridos antes de reintentar.
  - Ante error `500`: aplicar reintentos con backoff exponencial.
- [x] **2.2. Guardado Idempotente:**
  - Persistir los proyectos limpios en SQLite mediante `upsert`.
  - Asegurar que ejecutar la ingesta 2 o más veces seguidas deje la base de datos exactamente igual (sin registros duplicados).
- [x] **2.3. Disparador de Ingesta:**
  - Configurado para ejecutarse automáticamente al levantar el servicio (`onModuleInit` asíncrono con control por variable `AUTO_INGEST_ON_STARTUP`).

---

### ⏳ Etapa 3: Endpoints de la API REST

> **Objetivo:** Exponer los datos ya limpios desde SQLite hacia el exterior.

- [x] **3.1. Autenticación (`X-API-Key`):**
  - Validar cabecera contra la variable de entorno `API_KEY`. Responder `401` si no coincide.
- [x] **3.2. Endpoint `GET /proyectos`:**
  - Consulta únicamente sobre la base de datos SQLite.
  - Filtros opcionales: `region` (canónico), `estado` (canónico), `monto_min` (monto mínimo inclusivo).
  - Paginación: `page` (default 1), `page_size` (default 20, max 100).
  - Orden: Siempre por `id` ascendente.
  - Si mandan parámetros inválidos (ej. `monto_min=abc`, `region` no canónica, `estado` desconocido) $\rightarrow$ responder `400 Bad Request`.
  - Estructura exacta de respuesta: `{ items: [...], total, page, page_size }`.
- [x] **3.3. Endpoint `GET /resumen`:**
  - Retornar agrupado por región: `[{ region: "Antofagasta", cantidad: 14, monto_total_musd: 3926.07 }, ...]`.
- [x] **3.4. Tests de integración y e2e:**
  - Probar peticiones HTTP a los endpoints comprobando filtros, paginación, respuestas 200, 400 y 401 (`pnpm test:e2e`).

---

### ⏳ Etapa 4: Documentación y Entrega Final

- [x] **4.1. `DISENO.md` (Parte 2):** Respuestas de diseño y trade-offs listas.
- [x] **4.2. `README.md` (Parte 1):**
  - Comandos para levantar con Docker y local.
  - Variables de entorno, puertos y claves de prueba.
  - Explicación clara de la ingesta y archivo de rechazados.
  - Justificación técnica realista, supuestos y qué mejoraría con más tiempo.
- [x] **4.3. Entrega en GitHub:**
  - Dar permisos de lectura a `doyarce@cbc.cl` y `gleal@cbc.cl`, o dejar repositorio público y enviar enlace.
