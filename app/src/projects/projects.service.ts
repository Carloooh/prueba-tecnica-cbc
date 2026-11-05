import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  GetProjectsQueryDto,
  PaginatedProjectsResponse,
  ProjectItemDto,
  RegionSummaryDto,
} from './dto/project.dto.js';

const REGIONES_CANONICAS = new Set([
  'Arica y Parinacota',
  'Tarapacá',
  'Antofagasta',
  'Atacama',
  'Coquimbo',
  'Valparaíso',
  'Metropolitana de Santiago',
  "O'Higgins",
  'Maule',
  'Ñuble',
  'Biobío',
  'La Araucanía',
  'Los Ríos',
  'Los Lagos',
  'Aysén',
  'Magallanes',
]);

const ESTADOS_CANONICOS = new Set(['En evaluación', 'Aprobado', 'Rechazado']);

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtención de lista de proyectos con filtros opcionales y paginación.
   * - Filtros: region (canónico), estado (canónico), monto_min (inclusivo: >= monto_min)
   * - Paginación: page (>= 1, default 1), page_size (1 a 100, default 20)
   * - Orden: id ascendente obligatorio para paginación estable
   * - Respuesta: { items, total, page, page_size } donde total es el total que cumple filtros
   * - Si un filtro o parámetro es inválido (ej. monto_min=abc, page=-1) -> 400 Bad Request
   */
  async getProjects(query: GetProjectsQueryDto): Promise<PaginatedProjectsResponse> {
    // 1. Validar y parsear page (default 1)
    let page = 1;
    if (query.page !== undefined) {
      page = parseInt(query.page, 10);
      if (isNaN(page) || page < 1) {
        throw new BadRequestException('El parámetro "page" debe ser un entero mayor o igual a 1');
      }
    }

    // 2. Validar y parsear page_size (default 20, max 100)
    let pageSize = 20;
    if (query.page_size !== undefined) {
      pageSize = parseInt(query.page_size, 10);
      if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) {
        throw new BadRequestException('El parámetro "page_size" debe estar entre 1 y 100');
      }
    }

    // 3. Validar y parsear monto_min
    let montoMinNumber: number | undefined;
    if (query.monto_min !== undefined) {
      montoMinNumber = parseFloat(query.monto_min);
      if (isNaN(montoMinNumber)) {
        throw new BadRequestException('El parámetro "monto_min" debe ser un número válido');
      }
    }

    // 4. Validar región canónica si viene en el query
    if (query.region !== undefined && !REGIONES_CANONICAS.has(query.region)) {
      throw new BadRequestException(
        `El filtro "region" tiene un valor inválido: "${query.region}". Debe ser un valor canónico.`,
      );
    }

    // 5. Validar estado canónico si viene en el query
    if (query.estado !== undefined && !ESTADOS_CANONICOS.has(query.estado)) {
      throw new BadRequestException(
        `El filtro "estado" tiene un valor inválido: "${query.estado}". Debe ser uno de: En evaluación, Aprobado, Rechazado.`,
      );
    }

    // 6. Construir cláusula where para Prisma
    const where: any = {};

    if (query.region) {
      where.region = query.region;
    }

    if (query.estado) {
      where.estado = query.estado;
    }

    if (montoMinNumber !== undefined) {
      where.monto_musd = { gte: montoMinNumber };
    }

    // 5. Consultar conteo total que cumple filtros y la página solicitada
    const [total, projects] = await Promise.all([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        orderBy: { id: 'asc' }, // Orden obligatorio por id ascendente
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          nombre: true,
          titular: true,
          region: true,
          monto_musd: true,
          fecha_ingreso: true,
          estado: true,
        },
      }),
    ]);

    return {
      items: projects,
      total,
      page,
      page_size: pageSize,
    };
  }

  /**
   * Obtiene el resumen estadístico agrupado por región (GET /resumen).
   * Reglas de CONTRATO.md:
   * - Una entrada por cada región que tenga proyectos.
   * - Retorna: [{ region, cantidad, monto_total_musd }]
   * - Redondeo de monto total a 2 decimales según ejemplo del contrato.
   */
  async getSummary(): Promise<RegionSummaryDto[]> {
    // Agrupación nativa con Prisma groupBy
    const grouped = await this.prisma.project.groupBy({
      by: ['region'],
      _count: {
        id: true,
      },
      _sum: {
        monto_musd: true,
      },
      orderBy: {
        region: 'asc',
      },
    });

    return grouped.map((g: { region: any; _count: { id: any; }; _sum: { monto_musd: any; }; }) => ({
      region: g.region,
      cantidad: g._count.id,
      monto_total_musd: Math.round((g._sum.monto_musd ?? 0) * 100) / 100,
    }));
  }
}

