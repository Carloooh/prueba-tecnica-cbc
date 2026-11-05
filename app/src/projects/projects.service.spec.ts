import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ProjectsService } from './projects.service.js';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      project: {
        count: vi.fn(),
        findMany: vi.fn(),
        groupBy: vi.fn(),
      },
    };
    service = new ProjectsService(mockPrisma);
  });

  describe('getProjects', () => {
    it('debe usar valores por defecto (page=1, page_size=20) cuando no se envían parámetros en la query', async () => {
      mockPrisma.project.count.mockResolvedValue(1);
      mockPrisma.project.findMany.mockResolvedValue([
        {
          id: 'P-0001',
          nombre: 'Proyecto Solar',
          titular: 'Empresa A',
          region: 'Antofagasta',
          monto_musd: 100,
          fecha_ingreso: '2024-01-01',
          estado: 'Aprobado',
        },
      ]);

      const result = await service.getProjects({});

      expect(result.page).toBe(1);
      expect(result.page_size).toBe(20);
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { id: 'asc' },
          skip: 0,
          take: 20,
        }),
      );
    });

    it('debe aplicar filtros de region, estado y monto_min (inclusivo gte)', async () => {
      mockPrisma.project.count.mockResolvedValue(0);
      mockPrisma.project.findMany.mockResolvedValue([]);

      await service.getProjects({
        region: 'Antofagasta',
        estado: 'Aprobado',
        monto_min: '50.5',
      });

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            region: 'Antofagasta',
            estado: 'Aprobado',
            monto_musd: { gte: 50.5 },
          },
        }),
      );
    });

    it('debe lanzar BadRequestException (400) si monto_min no es un número (ej: monto_min=abc)', async () => {
      await expect(service.getProjects({ monto_min: 'abc' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe lanzar BadRequestException (400) si region no es canónica', async () => {
      await expect(service.getProjects({ region: 'Región Inexistente' })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getProjects({ region: 'II Región' })).rejects.toThrow(
        BadRequestException, // La regla de negocio dice: "region (valor canónico)"
      );
    });

    it('debe lanzar BadRequestException (400) si estado no es canónico', async () => {
      await expect(service.getProjects({ estado: 'Pendiente' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe lanzar BadRequestException (400) si page es menor a 1 o inválido', async () => {
      await expect(service.getProjects({ page: '0' })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getProjects({ page: '-5' })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getProjects({ page: 'xyz' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe lanzar BadRequestException (400) si page_size excede 100 o es menor a 1', async () => {
      await expect(service.getProjects({ page_size: '150' })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getProjects({ page_size: '0' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getSummary', () => {
    it('debe agrupar por región con cantidad y suma de montos redondeada a 2 decimales', async () => {
      mockPrisma.project.groupBy.mockResolvedValue([
        {
          region: 'Antofagasta',
          _count: { id: 14 },
          _sum: { monto_musd: 3926.068 },
        },
      ]);

      const summary = await service.getSummary();

      expect(summary).toEqual([
        {
          region: 'Antofagasta',
          cantidad: 14,
          monto_total_musd: 3926.07,
        },
      ]);
    });
  });
});

