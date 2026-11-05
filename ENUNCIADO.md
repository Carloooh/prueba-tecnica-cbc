# Prueba técnica – Desarrollador/a

Gracias por tu interés. Esta prueba busca ver cómo trabajas cuando resuelves solo/a un problema pequeño pero completo: datos desordenados, una fuente poco confiable, una API propia, pruebas y un par de decisiones de diseño. Usa el stack que mejor domines.

| | |
| --- | --- |
| Qué recibes | Este repositorio base: la fuente simulada (`mock-api`), `docker-compose.yml` y `CONTRATO.md` con el detalle de la API, las reglas de limpieza y la forma que debe tener tu API |
| Qué entregas | Tu solución en un repositorio de GitHub, con un `README.md` (Parte 1) y un `DISENO.md` (Parte 2) |
| Plazo | 2 días corridos desde que recibes la prueba |
| Tiempo de trabajo | No esperamos que dediques más de 5 horas efectivas |

Lee primero `CONTRATO.md`: ahí están las reglas exactas que usaremos para revisar tu entrega.

---

## Parte 1 – Ejercicio práctico: seguimiento de proyectos de inversión

Construirás un servicio que obtiene proyectos desde una API externa poco confiable, limpia los datos, los guarda y los expone por una API propia. Usa Python o TypeScript (Node.js), el que domines mejor.

### Escenario

Una organización quiere seguir proyectos de inversión publicados por una fuente externa. La fuente es una API paginada que a veces responde con error y cuyos datos vienen sucios. Te entregamos un repositorio base con un servidor simulado (`mock-api`) con un poco más de 100 registros, algunos de ellos repetidos, y un documento `CONTRATO.md` con el detalle de esa API, las reglas de limpieza y la forma que debe tener tu API.

Campos que entrega la fuente (todos como texto, pueden venir vacíos o repetidos):

| Campo | Ejemplos de lo que puede venir |
| --- | --- |
| `id` | `"P-0042"`, a veces repetido entre páginas |
| `nombre` | con espacios sobrantes o en mayúsculas |
| `titular` | `"Empresa X S.A."`, `"empresa x sa"` |
| `region` | `"Antofagasta"`, `"II Región"`, `"ANTOFAGASTA "` |
| `monto` | `"1.234,5 MM USD"`, `"US$ 2,5 millones"`, `"850000"` |
| `fecha_ingreso` | `"2024-03-15"`, `"15/03/2024"`, `"15-mar-2024"` |
| `estado` | `"En evaluación"`, `"aprobado"`, `"RECHAZADO"` |
| `actualizado_en` | fecha y hora de la última modificación del registro |

La API responde `429` y `500` de forma aleatoria (~15% de las llamadas).

### Requisitos obligatorios

1. **Ingesta robusta.** Recorre todas las páginas, usa timeouts y reintenta ante `429`/`5xx`. Ejecutarla dos veces no debe duplicar datos.
2. **Normalización y validación.** Fechas en ISO 8601, monto como número en millones de USD, región y estado con valores canónicos. Los registros inválidos no se descartan en silencio: se guardan en un archivo de rechazados con el motivo. Las reglas exactas (formatos, regiones, estados, duplicados) están en `CONTRATO.md`.
3. **Persistencia.** Usa la base de datos que prefieras (SQLite basta) y justifica la elección en una línea.
4. **API REST** con `GET /proyectos` (filtros por `region`, `estado` y monto mínimo, más paginación) y `GET /resumen` (cantidad y monto total por región). La API key se lee desde una variable de entorno, nunca desde el código. La forma de las respuestas está en `CONTRATO.md`.
5. **Tests y README.** Pruebas unitarias de la normalización con casos borde y una prueba de la API. El `README.md` indica cómo ejecutar (comando, puerto y clave de desarrollo de tu API), cómo se dispara la ingesta, dónde queda el archivo de rechazados, supuestos, uso de IA (si lo hubo) y qué harías con más tiempo.
6. **Docker.** Un `Dockerfile` o `docker-compose.yml` para ejecutar todo con un comando.

### Opcional (suma, no es requisito)

- Detección de cambios entre ejecuciones: informar qué proyectos son nuevos o cambiaron de estado.

No necesitas hacer todo. Preferimos una entrega acotada, correcta y bien explicada antes que una amplia a medias.

---

## Parte 2 – Diseño y trade-offs (respuesta escrita)

Responde en un archivo `DISENO.md` dentro del repositorio, con un máximo de media página. No hay que programar nada; buscamos criterio, no una respuesta única correcta.

**Escenario:** el servicio de la Parte 1 funciona bien con una fuente. Ahora la organización quiere monitorear 40 fuentes distintas, cada una con su formato. Algunas tardan hasta 20 minutos en responder, una de ellas cambia su estructura sin avisar cada pocas semanas, y unas 5 personas consultarán los datos todos los días.

Responde:

1. ¿Cómo organizarías el código para agregar una fuente nueva con el menor esfuerzo posible?
2. ¿Dónde ejecutarías las ingestas en la nube (Azure si lo conoces) y cómo te enterarías de que una fuente dejó de funcionar o cambió de formato?
3. Si tuvieras solo 2 días para llevar esto a producción, ¿qué dejarías fuera y qué no negociarías?

---

## Entrega y reglas

Parte desde el repositorio base que te entregamos y entrega tu solución en un repositorio de GitHub (público, o privado con acceso de lectura para doyarce@cbc.cl y gleal@cbc.cl) dentro de 2 días corridos desde que recibes la prueba. Cuando lo tengas listo, avísanos por correo con el enlace.

**Estructura esperada del repositorio:**

- Código del servicio, tests y dockerización.
- `README.md` (Parte 1) y `DISENO.md` (Parte 2).
- Historial de commits con mensajes claros: lo leeremos. No hace falta un solo commit final ni un historial perfecto, pero sí que se vea cómo avanzó el trabajo.

**Reglas:**

- Puedes usar documentación, buscadores y herramientas de IA. Si las usas, indícalo en el `README.md` y di para qué.
- Nunca subas credenciales reales al repositorio.
- Si algo del enunciado es ambiguo, toma una decisión razonable y anótala como supuesto.
- No esperamos que dediques más de 5 horas de trabajo efectivo. Si te falta tiempo, indica en el `README.md` qué dejaste pendiente.
- No modifiques `mock-api/` ni sus datos: revisaremos tu entrega contra la fuente original.
