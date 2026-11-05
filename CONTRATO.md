# Contrato de datos y de API

Este documento complementa el enunciado. Define cómo es la fuente externa (`mock-api`), las reglas de limpieza que aplican a sus datos y la forma mínima que debe tener **tu** API. Si algo no está aquí y te genera dudas, toma una decisión razonable y anótala como supuesto en tu README.

## 1. La fuente externa (`mock-api`)

| | |
| --- | --- |
| URL base | `http://localhost:8001` desde tu máquina con docker compose; `http://mock-api:8000` desde otro contenedor de la misma compose; `http://localhost:8000` si ejecutas `python mock-api/server.py` sin Docker |
| Autenticación | header `X-API-Key` con el valor de `SOURCE_API_KEY` (por defecto `dev-source-key`) |
| Endpoint | `GET /api/v1/proyectos?page=1&page_size=20` |
| Paginación | `page` desde 1; `page_size` entre 1 y 50 (por defecto 20) |
| Salud | `GET /health` (no falla ni exige clave) |

Respuesta exitosa (`200`):

```json
{
  "items": [ { "id": "...", "nombre": "...", "...": "..." } ],
  "page": 1,
  "page_size": 20,
  "total_items": 112,
  "total_pages": 6
}
```

Si pides una página mayor que `total_pages`, recibes `200` con `items` vacío.

Errores:

| Código | Cuándo | Qué hacer |
| --- | --- | --- |
| `401` | clave ausente o incorrecta | no reintentar: es un error de configuración |
| `400` | parámetros de paginación inválidos | no reintentar |
| `429` | aleatorio (~7,5% de las llamadas) | reintentar; trae header `Retry-After` en segundos |
| `500` | aleatorio (~7,5% de las llamadas) | reintentar con espera creciente |

Los errores aleatorios son reproducibles (misma semilla, misma secuencia). Para depurar sin ellos: `MOCK_ERROR_RATE=0`. La fuente sirve 112 filas porque algunas aparecen más de una vez.

### Campos

Todos llegan como texto y pueden venir con espacios al inicio o al final.

| Campo | Contenido |
| --- | --- |
| `id` | `P-0001` ... `P-0100`; puede venir en minúsculas, con espacios, repetido o vacío |
| `nombre` | nombre del proyecto |
| `titular` | empresa titular; puede venir vacío |
| `region` | ver tabla de regiones |
| `monto` | ver formatos de monto |
| `fecha_ingreso` | ver formatos de fecha |
| `estado` | ver estados |
| `actualizado_en` | fecha y hora UTC de la última modificación, siempre `AAAA-MM-DDTHH:MM:SSZ` y siempre bien formada |

## 2. Reglas de limpieza

Aplica estas reglas en este orden. Un registro que incumple cualquiera de ellas es **inválido**: no entra a la base y va al archivo de rechazados con su motivo.

| Campo | Regla | Motivo si falla |
| --- | --- | --- |
| `id` | quitar espacios y pasar a mayúsculas; no puede quedar vacío | `id_vacio` |
| `nombre` | quitar espacios sobrantes (también los repetidos en el medio); no puede quedar vacío. No se exige unificar mayúsculas | `nombre_vacio` |
| `monto` | convertir a número en **millones de USD** (ver formatos); debe ser mayor que cero | `monto_invalido`, `monto_negativo` |
| `fecha_ingreso` | convertir a ISO 8601 `AAAA-MM-DD` (ver formatos); debe ser una fecha real | `fecha_invalida` |
| `region` | convertir al nombre canónico (ver tabla); si no se reconoce, es inválido | `region_desconocida` |
| `estado` | convertir al valor canónico (ver estados); si no se reconoce, es inválido | `estado_desconocido` |
| `titular` | quitar espacios sobrantes. Puede quedar vacío. No se exige unificar mayúsculas ni puntuación | (no genera rechazo) |

### Formatos de monto

Los números usan el formato chileno: punto como separador de miles y coma decimal.

| Ejemplo | Significado | Valor en millones de USD |
| --- | --- | --- |
| `1.234,5 MM USD` | 1.234,5 millones de dólares | `1234.5` |
| `US$ 2,5 millones` | 2,5 millones de dólares | `2.5` |
| `850000` | **sin unidad: dólares enteros** | `0.85` |

Cualquier otro texto (por ejemplo `a convenir`, `N/D`) es `monto_invalido`. Un monto cero o negativo es `monto_negativo`. Guarda el valor con a lo más 3 decimales.

### Formatos de fecha

| Ejemplo | Formato |
| --- | --- |
| `2024-03-15` | `AAAA-MM-DD` |
| `15/03/2024` | `DD/MM/AAAA` (día primero, siempre) |
| `15-mar-2024` | `DD-mmm-AAAA` con mes abreviado **en español**: `ene feb mar abr may jun jul ago sep oct nov dic` (sin distinguir mayúsculas) |

Una fecha que no existe (por ejemplo `31/02/2024`) es `fecha_invalida`.

### Estados

Valores canónicos: `En evaluación`, `Aprobado`, `Rechazado`. Se reconocen sin distinguir mayúsculas, tildes ni espacios sobrantes (`en evaluacion`, `APROBADO `). Cualquier otro valor es `estado_desconocido`.

### Regiones

Valor canónico y variantes reconocidas. Todas se aceptan sin distinguir mayúsculas, tildes ni espacios sobrantes.

| Valor canónico | Variantes |
| --- | --- |
| Arica y Parinacota | `XV Región`, `Región de Arica y Parinacota` |
| Tarapacá | `I Región`, `Región de Tarapacá` |
| Antofagasta | `II Región`, `Región de Antofagasta` |
| Atacama | `III Región`, `Región de Atacama` |
| Coquimbo | `IV Región`, `Región de Coquimbo` |
| Valparaíso | `V Región`, `Región de Valparaíso` |
| Metropolitana de Santiago | `Región Metropolitana`, `Región de Metropolitana de Santiago` |
| O'Higgins | `VI Región`, `Región de O'Higgins` |
| Maule | `VII Región`, `Región de Maule` |
| Ñuble | `XVI Región`, `Región de Ñuble` |
| Biobío | `VIII Región`, `Región de Biobío` |
| La Araucanía | `IX Región`, `Región de La Araucanía` |
| Los Ríos | `XIV Región`, `Región de Los Ríos` |
| Los Lagos | `X Región`, `Región de Los Lagos` |
| Aysén | `XI Región`, `Región de Aysén` |
| Magallanes | `XII Región`, `Región de Magallanes` |

### Duplicados

El mismo proyecto puede llegar más de una vez, incluso en páginas distintas y con el `id` escrito distinto (`P-0042`, `p-0042`, ` P-0042 `). Después de normalizar el `id`:

- Si las filas son idénticas, queda una sola.
- Si difieren, **gana la de `actualizado_en` más reciente**, sin importar el orden en que llegaron.

Los duplicados no son rechazados: son un solo proyecto. Solo los registros inválidos van al archivo de rechazados.

### Archivo de rechazados

Formato libre (CSV o JSON), con al menos `id`, `nombre` y `motivo`; usa los códigos de motivo de las tablas de arriba. Al reejecutar la ingesta, el archivo debe reflejar la última ejecución (se sobrescribe, no acumula).

## 3. Tu API

Para que podamos revisarla con un script, respeta esta forma mínima. Todo lo demás (framework, estructura, códigos de error adicionales) lo decides tú.

**Autenticación:** header `X-API-Key`; el valor se lee de una variable de entorno de tu servicio. Sin clave o con clave incorrecta responde `401`.

**`GET /proyectos`** con filtros opcionales `region` (valor canónico), `estado` (valor canónico) y `monto_min` (millones de USD, inclusivo: devuelve los proyectos con `monto_musd` mayor o igual), más paginación con `page` (desde 1) y `page_size` (por defecto 20, máximo 100). Respuesta:

```json
{
  "items": [
    {
      "id": "P-0042",
      "nombre": "Planta Solar Los Andes",
      "titular": "Minera Andina S.A.",
      "region": "Antofagasta",
      "monto_musd": 125.5,
      "fecha_ingreso": "2024-03-15",
      "estado": "Aprobado"
    }
  ],
  "total": 91,
  "page": 1,
  "page_size": 20
}
```

`total` es la cantidad de proyectos que cumplen los filtros, no solo los de la página. Los resultados se ordenan por `id` ascendente, para que la paginación sea estable. Un filtro con valor inválido (por ejemplo `monto_min=abc`) responde `400`.

**`GET /resumen`:** una entrada por región que tenga proyectos:

```json
[
  { "region": "Antofagasta", "cantidad": 14, "monto_total_musd": 3926.07 }
]
```

Ambos endpoints trabajan sobre los proyectos **válidos y sin duplicados**.
