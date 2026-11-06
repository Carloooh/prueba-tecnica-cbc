import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';
import { IngestionService } from '../etl/ingestion.service.js';

describe('ProjectsController', () => {
  let controller: ProjectsController;
  let mockProjectsService: any;
  let mockIngestionService: any;

  beforeEach(() => {
    mockProjectsService = {
      getProjects: vi.fn(),
      getSummary: vi.fn(),
    };
    mockIngestionService = {
      runIngestion: vi.fn(),
    };
    controller = new ProjectsController(
      mockProjectsService as ProjectsService,
      mockIngestionService as IngestionService,
    );
  });

  it('debe llamar a getProjects con la query recibida', async () => {
    const mockResult = {
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
    };
    mockProjectsService.getProjects.mockResolvedValue(mockResult);

    const query = { region: 'Antofagasta', page: '1' };
    const result = await controller.getProjects(query);

    expect(mockProjectsService.getProjects).toHaveBeenCalledWith(query);
    expect(result).toBe(mockResult);
  });

  it('debe llamar a getSummary y retornar el arreglo agrupado', async () => {
    const mockSummary = [
      { region: 'Antofagasta', cantidad: 14, monto_total_musd: 3926.07 },
    ];
    mockProjectsService.getSummary.mockResolvedValue(mockSummary);

    const result = await controller.getSummary();

    expect(mockProjectsService.getSummary).toHaveBeenCalled();
    expect(result).toBe(mockSummary);
  });

  it('debe llamar a triggerIngestion y retornar el resumen de cambios detectados', async () => {
    const mockIngestionResult = {
      total_fetched: 112,
      total_clean: 103,
      total_deduplicated: 91,
      total_rejected: 9,
      nuevos_detectados: 2,
      cambios_estado_detectados: 1,
      detalle_nuevos: [
        { id: 'P-0099', nombre: 'Nuevo Parque', estado: 'En evaluación', detectado_en: '2026-11-05T21:30:00-03:00' },
      ],
      detalle_cambios_estado: [
        {
          id: 'P-0012',
          nombre: 'Planta Solar',
          estado_anterior: 'En evaluación',
          estado_nuevo: 'Aprobado',
          fecha_cambio: '2026-11-05T21:30:00-03:00',
        },
      ],
    };
    mockIngestionService.runIngestion.mockResolvedValue(mockIngestionResult);

    const result = await controller.triggerIngestion();

    expect(mockIngestionService.runIngestion).toHaveBeenCalled();
    expect(result.total_descargados).toBe(112);
    expect(result.nuevos_detectados).toBe(2);
    expect(result.cambios_estado_detectados).toBe(1);
    expect(result.cambios_estado[0]).toEqual({
      id: 'P-0012',
      nombre: 'Planta Solar',
      estado_anterior: 'En evaluación',
      estado_nuevo: 'Aprobado',
    });
  });
});
