import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { IngestionService } from '../src/etl/ingestion.service.js';

describe('Projects API (e2e) - Contrato Oficial', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ingestionService: IngestionService;
  const validApiKey = 'dev-api-key';

  beforeAll(async () => {
    process.env.AUTO_INGEST_ON_STARTUP = 'false';
    process.env.API_KEY = validApiKey;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    ingestionService = app.get(IngestionService);

    // Insertar un par de registros de prueba limpios en SQLite
    await prisma.project.deleteMany({});
    await prisma.project.createMany({
      data: [
        {
          id: 'P-0001',
          nombre: 'Parque Eólico del Norte',
          titular: 'Eólica S.A.',
          region: 'Antofagasta',
          monto_musd: 150.5,
          fecha_ingreso: '2024-01-10',
          estado: 'Aprobado',
          actualizado_en: new Date('2024-01-10T10:00:00Z'),
        },
        {
          id: 'P-0002',
          nombre: 'Planta Solar Los Andes',
          titular: 'Minera Andina S.A.',
          region: 'Antofagasta',
          monto_musd: 80.0,
          fecha_ingreso: '2024-02-15',
          estado: 'En evaluación',
          actualizado_en: new Date('2024-02-15T10:00:00Z'),
        },
        {
          id: 'P-0003',
          nombre: 'Puerto Central',
          titular: null,
          region: 'Valparaíso',
          monto_musd: 30.0,
          fecha_ingreso: '2024-03-20',
          estado: 'Aprobado',
          actualizado_en: new Date('2024-03-20T10:00:00Z'),
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.project.deleteMany({});
    await app.close();
  });

  describe('Autenticación con X-API-Key', () => {
    it('debe responder 401 si no se envía el header X-API-Key', async () => {
      await request(app.getHttpServer()).get('/proyectos').expect(401);
    });

    it('debe responder 401 si la clave es incorrecta', async () => {
      await request(app.getHttpServer())
        .get('/proyectos')
        .set('X-API-Key', 'clave-falsa')
        .expect(401);
    });
  });

  describe('GET /proyectos', () => {
    it('debe responder 200 con la estructura exacta { items, total, page, page_size }', async () => {
      const res = await request(app.getHttpServer())
        .get('/proyectos')
        .set('X-API-Key', validApiKey)
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total', 3);
      expect(res.body).toHaveProperty('page', 1);
      expect(res.body).toHaveProperty('page_size', 20);
      expect(res.body.items).toHaveLength(3);
      // Validar orden ascendente por id
      expect(res.body.items[0].id).toBe('P-0001');
      expect(res.body.items[1].id).toBe('P-0002');
      expect(res.body.items[2].id).toBe('P-0003');
    });

    it('debe filtrar por region (canónica)', async () => {
      const res = await request(app.getHttpServer())
        .get('/proyectos?region=Valparaíso')
        .set('X-API-Key', validApiKey)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.items[0].region).toBe('Valparaíso');
    });

    it('debe filtrar por estado (canónico)', async () => {
      const res = await request(app.getHttpServer())
        .get('/proyectos?estado=En evaluación')
        .set('X-API-Key', validApiKey)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.items[0].id).toBe('P-0002');
    });

    it('debe filtrar por monto_min inclusivo (>= monto_min)', async () => {
      const res = await request(app.getHttpServer())
        .get('/proyectos?monto_min=80.0')
        .set('X-API-Key', validApiKey)
        .expect(200);

      // P-0001 (150.5) y P-0002 (80.0) cumplen, P-0003 (30.0) queda fuera
      expect(res.body.total).toBe(2);
    });

    it('debe responder 400 Bad Request ante filtro inválido (monto_min=abc)', async () => {
      await request(app.getHttpServer())
        .get('/proyectos?monto_min=abc')
        .set('X-API-Key', validApiKey)
        .expect(400);
    });

    it('debe responder 400 Bad Request si region no es canónica', async () => {
      await request(app.getHttpServer())
        .get('/proyectos?region=II Región')
        .set('X-API-Key', validApiKey)
        .expect(400);
    });
  });

  describe('GET /resumen', () => {
    it('debe responder 200 con el resumen por región [{ region, cantidad, monto_total_musd }]', async () => {
      const res = await request(app.getHttpServer())
        .get('/resumen')
        .set('X-API-Key', validApiKey)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toEqual([
        {
          region: 'Antofagasta',
          cantidad: 2,
          monto_total_musd: 230.5, // 150.5 + 80.0
        },
        {
          region: 'Valparaíso',
          cantidad: 1,
          monto_total_musd: 30.0,
        },
      ]);
    });

    it('debe responder 200 e ignorar parámetros query sobrantes si alguien se los envía', async () => {
      const res = await request(app.getHttpServer())
        .get('/resumen?foo=bar&page=1')
        .set('X-API-Key', validApiKey)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
    });
  });

  describe('POST /ingesta (Disparador bajo demanda)', () => {
    it('debe responder 401 si se intenta disparar la ingesta sin API Key', async () => {
      await request(app.getHttpServer()).post('/ingesta').expect(401);
    });

    it('debe responder 200 y retornar el reporte de ejecución y cambios detectados', async () => {
      vi.spyOn(ingestionService, 'runIngestion').mockResolvedValue({
        total_fetched: 112,
        total_clean: 103,
        total_deduplicated: 91,
        total_rejected: 9,
        nuevos_detectados: 2,
        cambios_estado_detectados: 1,
        detalle_nuevos: [
          { id: 'P-0099', nombre: 'Proyecto Nuevo', estado: 'En evaluación', detectado_en: '2026-11-05T21:30:00-03:00' },
        ],
        detalle_cambios_estado: [
          {
            id: 'P-0002',
            nombre: 'Planta Solar Los Andes',
            estado_anterior: 'En evaluación',
            estado_nuevo: 'Aprobado',
            fecha_cambio: '2026-11-05T21:30:00-03:00',
          },
        ],
      });

      const res = await request(app.getHttpServer())
        .post('/ingesta')
        .set('X-API-Key', validApiKey)
        .expect(201);

      expect(res.body).toHaveProperty('mensaje');
      expect(res.body.total_descargados).toBe(112);
      expect(res.body.nuevos_detectados).toBe(2);
      expect(res.body.cambios_estado_detectados).toBe(1);
      expect(res.body.cambios_estado).toHaveLength(1);
      expect(res.body.cambios_estado[0].id).toBe('P-0002');
      expect(res.body.cambios_estado[0].estado_nuevo).toBe('Aprobado');
    });
  });
});
