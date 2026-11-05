import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ProjectsService } from './projects.service.js';
import { ApiKeyGuard } from '../auth/api-key.guard.js';
import {
  GetProjectsQueryDto,
  PaginatedProjectsResponse,
  RegionSummaryDto,
} from './dto/project.dto.js';

@Controller()
@UseGuards(ApiKeyGuard) // Protección de endpoints de este controlador con X-API-Key
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

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
}

