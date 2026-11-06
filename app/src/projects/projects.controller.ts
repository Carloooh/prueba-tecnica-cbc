import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ProjectsService } from './projects.service.js';
import { IngestionService } from '../etl/ingestion.service.js';
import { ApiKeyGuard } from '../auth/api-key.guard.js';
import {
  GetProjectsQueryDto,
  PaginatedProjectsResponse,
  RegionSummaryDto,
  TriggerIngestionResponseDto,
} from './dto/project.dto.js';

@Controller()
@UseGuards(ApiKeyGuard) // Protección de endpoints de este controlador con X-API-Key
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly ingestionService: IngestionService,
  ) {}

  //GET /proyectos con filtros, paginación y validaciones.
  @Get('proyectos')
  async getProjects(
    @Query() query: GetProjectsQueryDto,
  ): Promise<PaginatedProjectsResponse> {
    return this.projectsService.getProjects(query);
  }

  //GET /resumen con datos agrupados por región y con validaciones
  @Get('resumen')
  async getSummary(): Promise<RegionSummaryDto[]> {
    return this.projectsService.getSummary();
  }

  //POST /ingesta dispara el pipeline ETL bajo demanda y retorna el informe de cambios
  @Post('ingesta')
  async triggerIngestion(): Promise<TriggerIngestionResponseDto> {
    const result = await this.ingestionService.runIngestion();

    return {
      mensaje: 'Proceso de ingesta y detección de cambios ejecutado con éxito',
      total_descargados: result.total_fetched,
      total_validos: result.total_clean,
      total_rechazados: result.total_rejected,
      proyectos_unicos_guardados: result.total_deduplicated,
      nuevos_detectados: result.nuevos_detectados,
      cambios_estado_detectados: result.cambios_estado_detectados,
      cambios_estado: result.detalle_cambios_estado.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        estado_anterior: c.estado_anterior,
        estado_nuevo: c.estado_nuevo,
      })),
    };
  }
}
