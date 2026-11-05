# Prueba técnica – repositorio base

Empieza por `ENUNCIADO.md` y luego lee `CONTRATO.md`. Este repositorio trae lo necesario para trabajar sin montar la fuente de datos tú mismo/a:

```
.
├── ENUNCIADO.md         # qué debes hacer, qué entregar y las reglas de la prueba
├── CONTRATO.md          # fuente, reglas de limpieza y forma de tu API
├── docker-compose.yml   # hoy levanta solo el mock-api; agrega aquí tu servicio
├── .env.example
└── mock-api/            # fuente externa simulada (no necesitas modificarla)
```

## Cómo empezar

1. Copia este contenido a un repositorio nuevo tuyo (será el que nos entregues).
2. Levanta la fuente simulada:

   ```bash
   docker compose up --build mock-api
   ```

   Sin Docker: `python mock-api/server.py` (queda en `http://localhost:8000`; con `PORT=8001` replicas el puerto de compose).

3. Pruébala:

   ```bash
   curl -H "X-API-Key: dev-source-key" "http://localhost:8001/api/v1/proyectos?page=1&page_size=5"
   ```

   Es normal que algunas llamadas respondan `429` o `500`: es parte del ejercicio. Para depurar sin errores, `MOCK_ERROR_RATE=0`.

4. Construye tu solución (en una carpeta nueva, por ejemplo `app/`), súmala a `docker-compose.yml` y documenta en tu `README.md` cómo ejecutarla.

## Qué no debes hacer

- No subas credenciales reales. Las claves del ejemplo (`dev-source-key`) son de desarrollo.
- No modifiques `mock-api/` ni sus datos: revisaremos tu entrega contra la fuente original.
