# Resolución Prueba Técnica CBC

Servicio backend desarrollado con **NestJS (TypeScript)** que ingesta proyectos desde una API externa (`mock-api`), normaliza y valida sus datos, descarta y documenta registros inválidos, resuelve duplicados quedándose con la versión más reciente, persiste los datos limpios en **SQLite (mediante Prisma ORM)** y los expone a través de una API REST protegida por API Key.

---

## 🚀 Requisitos Previos

- [Docker](https://www.docker.com/) y Docker Compose (recomendado para ejecución completa).
- [Node.js](https://nodejs.org/) v20+ y [pnpm](https://pnpm.io/) (para desarrollo local sin Docker).

---

## 🛠️ Variables de Entorno

Crea un archivo `.env` en la raíz copiando `.env.example`:

```bash
cp .env.example .env
```

| Variable             | Descripción                                              | Valor por Defecto                                                 |
| -------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| `PORT`               | Puerto donde escucha el servicio NestJS                  | `8000`                                                            |
| `API_KEY`            | Clave para autenticarse en **nuestra API** (`X-API-Key`) | `dev-api-key`                                                     |
| `SOURCE_BASE_URL`    | URL base de la fuente externa                            | `http://mock-api:8000` (Docker) / `http://localhost:8001` (Local) |
| `SOURCE_API_KEY`     | Clave requerida por la fuente externa                    | `dev-source-key`                                                  |
| `DATABASE_URL`       | Conexión a la base de datos SQLite                       | `file:./data/dev.db`                                              |
| `REJECTED_FILE_PATH` | Ruta del archivo de registros descartados                | `./data/rejected.json`                                            |

---

## 🐳 Ejecución con Docker Compose (Un solo comando)

Para levantar tanto la fuente de datos (`mock-api`) como nuestro servicio (`app`):

```bash
docker compose up --build
```

- **Mock API**: disponible en `http://localhost:8001`
- **Nuestra API**: disponible en `http://localhost:8000`

---

## 💻 Ejecución en Modo Desarrollo (Local)

1. **Instalar dependencias:**

   ```bash
   cd app
   pnpm install
   ```

2. **Generar cliente Prisma y base de datos:**

   ```bash
   pnpm prisma generate
   pnpm prisma db push
   ```

3. **Iniciar el servicio:**
   ```bash
   pnpm run start:dev
   ```

---

## 🔄 Disparo de la Ingesta de Datos

La ingesta puede ejecutarse de las siguientes formas:

- **Al iniciar el contenedor:** Ejecuta la sincronización automática una vez que la `mock-api` responde healthy.
- **Vía endpoint administrativo / CLI:** _(Se detallará en la implementación de la Fase 4)_.

---

## 📂 Archivo de Rechazados

Los registros con inconsistencias o formatos inválidos no entran a la base de datos y se escriben en:

- Ruta: `app/data/rejected.json` (o `./data/rejected.json` montado en volumen).
- Cada ejecución sobrescribe este archivo, reflejando el estado de la última ingesta.

---

## 🧪 Pruebas Automatizadas

```bash
cd app
pnpm test          # Pruebas unitarias
pnpm test:cov      # Cobertura de pruebas
```

---

## ⚖️ Justificaciones y Decisiones Técnicas

### 1. Framework: NestJS (TypeScript)

- **Modularidad y Arquitectura Empresarial:** Arquitectura desacoplada basada en controladores, servicios, inyección de dependencias y módulos.
- **Tipado Fuerte:** TypeScript previene errores de contrato en tiempo de compilación.
- **Ecosistema y Testing:** Soporte nativo para validación de DTOs, filtros de excepciones globales y testing ágil con Vitest/Jest.

### 2. Base de Datos: SQLite

- **Simplicidad y Portabilidad:** Base de datos basada en un único archivo, ideal para el volumen de datos del ejercicio (~100-200 proyectos) sin sobrecargar la infraestructura con contenedores pesados de bases de datos externas.
- **Idempotencia y Rendimiento:** Excelente soporte de transacciones ACID y velocidad de lectura para consultas agrupadas (`/resumen`) y paginadas (`/proyectos`).

### 3. ORM: Prisma

- **Type-safety de Extremo a Extremo:** Genera tipos TypeScript exactos a partir del schema, reduciendo desalineaciones con el contrato.
- **Migraciones Claras y Simples:** `prisma db push` permite inicializar y sincronizar esquemas SQLite rápidamente dentro de Docker sin configuraciones engorrosas.
- **Mantenibilidad:** Facilidad para realizar queries filtradas, paginadas y agregaciones (`groupBy`) para el endpoint `/resumen`.

---

## 🤖 Uso de Herramientas de IA y Supuestos

- **Herramientas:** Uso de IA asistencial para acelerar scaffolding de código, validaciones de expresiones regulares complejas (montos chilenos y fechas en español) y plantillas de pruebas unitarias.
- **Supuestos y Decisiones de Diseño:**
  - **Identificador (`id`):** Los IDs llegan como strings tipo `P-0042`, pero con variaciones de minúsculas (`p-0042`), espacios al inicio o final (`' P-0039 '`), o vacíos (`""`). Se limpian aplicando `trim().toUpperCase()`. Si un ID queda vacío, se rechaza inmediatamente con `id_vacio`.
  - **Montos:** Se procesan tanto el formato chileno con coma (`1.234,5 MM USD`), palabras como `millones` (`US$ 2,5 millones`), como dólares enteros sin unidad (`850000` -> `0.85 MM USD`). Los valores se redondean a un máximo de 3 decimales (`monto_musd`). Valores $\le 0$ son clasificados como `monto_negativo` y textos no numéricos (`N/D`, `a convenir`) como `monto_invalido`.
  - **Fechas:** Se admiten los formatos `AAAA-MM-DD`, `DD/MM/AAAA` (día primero) y `DD-mmm-AAAA` (meses en español). Se valida contra el calendario astronómico (incluyendo años bisiestos para el 29 de febrero); fechas inexistentes como `31/02/2024` o meses > 12 se rechazan como `fecha_invalida`.
  - **Regiones y Estados:** Se mapean insensible a mayúsculas, tildes, números romanos y apóstrofes (`O'Higgins`, `Biobío`, `II Región`). Valores no contemplados se rechazan como `region_desconocida` o `estado_desconocido`.
  - **Deduplicación:** Si un ID limpio llega más de una vez (incluso en distintas páginas o formatos de mayúsculas originales):
    - Si son idénticos, queda una sola fila.
    - Si difieren, **gana el registro con `actualizado_en` más reciente** (comparando `Date.getTime()`), sin importar el orden de llegada.
    - Si tienen exactamente el mismo timestamp, se conserva la versión más reciente procesada.
    - Los duplicados no se consideran rechazados.
  - **Archivo de Rechazados:** Se genera un archivo JSON en `data/rejected.json` con los registros inválidos (`id`, `nombre`, `motivo`) que se sobrescribe en cada ingesta.
  - **Autenticación:** La API rechaza con `401 Unauthorized` si la cabecera `X-API-Key` no coincide con la variable de entorno `API_KEY`.
