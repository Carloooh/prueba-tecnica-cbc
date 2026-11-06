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

//Respuesta del endpoint administrativo POST /ingesta
export interface TriggerIngestionResponseDto {
  mensaje: string;
  total_descargados: number;
  total_validos: number;
  total_rechazados: number;
  proyectos_unicos_guardados: number;
  nuevos_detectados: number;
  cambios_estado_detectados: number;
  cambios_estado: Array<{
    id: string;
    nombre: string;
    estado_anterior: string;
    estado_nuevo: string;
  }>;
}
