// Estructura de cambio de estado para un proyecto
export interface StateChangeRecord {
  id: string;
  nombre: string;
  estado_anterior: string;
  estado_nuevo: string;
  fecha_cambio: string; // ISO con offset chileno (-03:00 / -04:00)
}

// Estructura de nuevo proyecto detectado
export interface NewProjectRecord {
  id: string;
  nombre: string;
  estado: string;
  detectado_en: string; // ISO con offset chileno (-03:00 / -04:00)
}

// Resumen del resultado de detección en la última ejecución
export interface ExecutionChangeSummary {
  nuevos_detectados: number;
  cambios_estado_detectados: number;
}

// Estructura completa del archivo changes.json
export interface ChangesReportFile {
  ultima_ejecucion: string;
  resumen_ultima_ejecucion: ExecutionChangeSummary;
  proyectos_nuevos: NewProjectRecord[];
  historial_cambios_estado: StateChangeRecord[];
}

