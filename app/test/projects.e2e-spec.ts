import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Projects API (e2e) - Contrato Oficial', () => {
  let app: INestApplication;
  let prisma: PrismaService;
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
          nombre: 'Centro Logístico Valparaíso',
          titular: 'Logística SpA',
          region: 'Valparaíso',
          monto_musd: 30.0,
          fecha_ingreso: '2024-03-01',
          estado: 'Rechazado',
          actualizado_en: new Date('2024-03-01T10:00:00Z'),
        },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // --- Autenticación ---
  describe('Seguridad X-API-Key', () => {
    it('debe responder 401 si no se envía el header X-API-Key', async () => {
      await request(app.getHttpServer()).get('/proyectos').expect(401);
      await request(app.getHttpServer()).get('/resumen').expect(401);
    });

    it('debe responder 401 si la clave es incorrecta', async () => {
      await request(app.getHttpServer())
        .get('/proyectos')
        .set('X-API-Key', 'clave-falsa')
        .expect(401);
    });
  });

  // --- GET /proyectos ---
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
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items).toHaveLength(3);

      // Orden id asc obligatorio
      expect(res.body.items[0].id).toBe('P-0001');
      expect(res.body.items[1].id).toBe('P-0002');
      expect(res.body.items[2].id).toBe('P-0003');
    });

    it('debe filtrar por region (canónica)', async () => {
      const res = await request(app.getHttpServer())
        .get('/proyectos?region=Antofagasta')
        .set('X-API-Key', validApiKey)
        .expect(200);

      expect(res.body.total).toBe(2);
      expect(res.body.items.every((p: any) => p.region === 'Antofagasta')).toBe(true);
    });

    it('debe filtrar por estado (canónico)', async () => {
      const res = await request(app.getHttpServer())
        .get('/proyectos?estado=Aprobado')
        .set('X-API-Key', validApiKey)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.items[0].id).toBe('P-0001');
    });

    it('debe filtrar por monto_min inclusivo (>= monto_min)', async () => {
      const res = await request(app.getHttpServer())
        .get('/proyectos?monto_min=80')
        .set('X-API-Key', validApiKey)
        .expect(200);

      expect(res.body.total).toBe(2); // 150.5 y 80.0
      expect(res.body.items.map((p: any) => p.id)).toEqual(['P-0001', 'P-0002']);
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

  // --- GET /resumen ---
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
});
