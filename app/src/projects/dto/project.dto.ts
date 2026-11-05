//Parámetros query para GET /proyectos
export class GetProjectsQueryDto {
  region?: string;
  estado?: string;
  monto_min?: string;
  page?: string;
  page_size?: string;
}

//Proyecto individual expuesto por la API (según CONTRATO.md)
export interface ProjectItemDto {
  id: string;
  nombre: string;
  titular: string | null;
  region: string;
  monto_musd: number;
  fecha_ingreso: string;
  estado: string;
}

//Respuesta paginada de GET /proyectos
export interface PaginatedProjectsResponse {
  items: ProjectItemDto[];
  total: number;
  page: number;
  page_size: number;
}

//Entrada individual del resumen agrupado por región (GET /resumen)
export interface RegionSummaryDto {
  region: string;
  cantidad: number;
  monto_total_musd: number;
}