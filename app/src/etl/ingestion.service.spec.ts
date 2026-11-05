import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IngestionService } from './ingestion.service.js';
import * as rejectedWriter from './rejected-writer.js';

describe('IngestionService', () => {
  let service: IngestionService;
  let mockConfigService: any;
  let mockPrismaService: any;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockConfigService = {
      get: vi.fn((key: string, defaultValue?: string) => {
        if (key === 'SOURCE_BASE_URL') return 'http://localhost:8001';
        if (key === 'SOURCE_API_KEY') return 'dev-source-key';
        if (key === 'REJECTED_FILE_PATH') return './data/test-rejected.json';
        if (key === 'AUTO_INGEST_ON_STARTUP') return 'false';
        return defaultValue;
      }),
      getOrThrow: vi.fn((key: string) => {
        if (key === 'SOURCE_BASE_URL') return 'http://localhost:8001';
        if (key === 'SOURCE_API_KEY') return 'dev-source-key';
        throw new Error(`Missing config ${key}`);
      }),
    };

    mockPrismaService = {
      project: {
        upsert: vi.fn().mockImplementation((args) => args),
      },
      $transaction: vi.fn().mockImplementation(async (ops) => ops),
    };

    service = new IngestionService(mockConfigService, mockPrismaService);
  });

  it('debe ejecutar el pipeline ETL completo: fetch -> clean -> deduplicate -> save -> write rejected', async () => {
    // Simular que el cliente HTTP obtiene 3 items:
    // - 1 válido
    // - 1 duplicado con fecha más reciente
    // - 1 con error (monto inválido)
    const rawItems = [
      {
        id: 'P-0001',
        nombre: 'Proyecto Solar',
        titular: 'Empresa A',
        region: 'Antofagasta',
        monto: '100 MM USD',
        fecha_ingreso: '2024-01-01',
        estado: 'Aprobado',
        actualizado_en: '2024-01-01T00:00:00Z',
      },
      {
        id: 'p-0001',
        nombre: 'Proyecto Solar Actualizado',
        titular: 'Empresa A',
        region: 'Antofagasta',
        monto: '120 MM USD',
        fecha_ingreso: '2024-01-01',
        estado: 'Aprobado',
        actualizado_en: '2024-05-01T00:00:00Z', // Más reciente
      },
      {
        id: 'P-0002',
        nombre: 'Proyecto Rechazado',
        titular: 'Empresa B',
        region: 'Antofagasta',
        monto: 'a convenir', // Error
        fecha_ingreso: '2024-01-01',
        estado: 'Aprobado',
        actualizado_en: '2024-01-01T00:00:00Z',
      },
    ];

    vi.spyOn((service as any).client, 'fetchAllProjects').mockResolvedValue(rawItems);
    const writeSpy = vi.spyOn(rejectedWriter, 'writeRejectedFile').mockResolvedValue(undefined as any);

    const result = await service.runIngestion();

    // Verificaciones
    expect(result.total_fetched).toBe(3);
    expect(result.total_clean).toBe(2); // Los 2 P-0001 eran válidos
    expect(result.total_deduplicated).toBe(1); // Queda 1 P-0001
    expect(result.total_rejected).toBe(1); // P-0002 se rechazó

    // Verificar que se escribió el archivo de rechazados con el motivo correcto
    expect(writeSpy).toHaveBeenCalledWith(
      './data/test-rejected.json',
      expect.arrayContaining([
        expect.objectContaining({
          id: 'P-0002',
          nombre: 'Proyecto Rechazado',
          motivo: 'monto_invalido',
        }),
      ]),
    );

    // Verificar que se guardó en Prisma mediante upsert con los datos del más reciente
    expect(mockPrismaService.project.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrismaService.project.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'P-0001' },
        create: expect.objectContaining({
          nombre: 'Proyecto Solar Actualizado',
          monto_musd: 120,
        }),
      }),
    );
  });
});

