import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IngestionService } from './ingestion.service.js';
import * as rejectedWriter from './rejected-writer.js';
import * as changeTracker from './change-tracker.js';

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
        if (key === 'CHANGES_FILE_PATH') return './data/test-changes.json';
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
        findMany: vi.fn().mockResolvedValue([
          // Simular que en la BD ya existía P-0001 en estado "En evaluación"
          { id: 'P-0001', nombre: 'Proyecto Solar', estado: 'En evaluación' },
        ]),
        upsert: vi.fn().mockImplementation((args) => args),
      },
      $transaction: vi.fn().mockImplementation(async (ops) => ops),
    };

    service = new IngestionService(mockConfigService, mockPrismaService);
  });

  it('debe ejecutar el pipeline ETL completo con detección de cambios', async () => {
    const rawItems = [
      {
        id: 'P-0001',
        nombre: 'Proyecto Solar',
        titular: 'Empresa A',
        region: 'Antofagasta',
        monto: '100 MM USD',
        fecha_ingreso: '2024-01-01',
        estado: 'Aprobado', // Cambia de "En evaluación" a "Aprobado"
        actualizado_en: '2024-01-01T00:00:00Z',
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
      {
        id: 'P-0003',
        nombre: 'Proyecto Nuevo',
        titular: 'Empresa C',
        region: 'Atacama',
        monto: '50 MM USD',
        fecha_ingreso: '2024-02-01',
        estado: 'En evaluación', // Nuevo en esta corrida
        actualizado_en: '2024-02-01T00:00:00Z',
      },
    ];

    vi.spyOn((service as any).client, 'fetchAllProjects').mockResolvedValue(rawItems);
    const writeSpy = vi.spyOn(rejectedWriter, 'writeRejectedFile').mockResolvedValue(undefined as any);
    const updateChangesSpy = vi.spyOn(changeTracker, 'updateChangesFile').mockResolvedValue({} as any);

    const result = await service.runIngestion();

    // Verificaciones de extracción y limpieza
    expect(result.total_fetched).toBe(3);
    expect(result.total_clean).toBe(2);
    expect(result.total_deduplicated).toBe(2);
    expect(result.total_rejected).toBe(1);

    // Verificaciones de detección de cambios
    expect(result.nuevos_detectados).toBe(1); // P-0003 es nuevo
    expect(result.cambios_estado_detectados).toBe(1); // P-0001 cambió de estado
    expect(result.detalle_cambios_estado[0]).toEqual(
      expect.objectContaining({
        id: 'P-0001',
        estado_anterior: 'En evaluación',
        estado_nuevo: 'Aprobado',
      }),
    );

    // Verificación de escritura de rejected y changes
    expect(writeSpy).toHaveBeenCalledWith('./data/test-rejected.json', expect.any(Array));
    expect(updateChangesSpy).toHaveBeenCalledWith(
      './data/test-changes.json',
      expect.any(Array),
      expect.any(Array),
      expect.any(String),
    );

    // Verificar que se guardó en Prisma mediante upsert
    expect(mockPrismaService.project.upsert).toHaveBeenCalledTimes(2);
  });
});
