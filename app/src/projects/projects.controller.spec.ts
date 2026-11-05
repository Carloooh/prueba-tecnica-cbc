import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

describe('ProjectsController', () => {
  let controller: ProjectsController;
  let mockService: any;

  beforeEach(() => {
    mockService = {
      getProjects: vi.fn(),
      getSummary: vi.fn(),
    };
    controller = new ProjectsController(mockService as ProjectsService);
  });

  it('debe llamar a getProjects con la query recibida', async () => {
    const mockResult = {
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
    };
    mockService.getProjects.mockResolvedValue(mockResult);

    const query = { region: 'Antofagasta', page: '1' };
    const result = await controller.getProjects(query);

    expect(mockService.getProjects).toHaveBeenCalledWith(query);
    expect(result).toBe(mockResult);
  });

  it('debe llamar a getSummary y retornar el arreglo agrupado', async () => {
    const mockSummary = [
      { region: 'Antofagasta', cantidad: 14, monto_total_musd: 3926.07 },
    ];
    mockService.getSummary.mockResolvedValue(mockSummary);

    const result = await controller.getSummary();

    expect(mockService.getSummary).toHaveBeenCalled();
    expect(result).toBe(mockSummary);
  });
});

