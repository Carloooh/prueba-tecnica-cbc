import * as fs from 'fs/promises';
import * as path from 'path';
import { CleanProject } from './types.js';
import {
  ChangesReportFile,
  NewProjectRecord,
  StateChangeRecord,
} from './change-tracker.types.js';

// Obtención de fecha y hora actual formateada a la zona horaria chilena, Ej: "2026-11-05T21:30:00-03:00"
export function getChileanIsoTimestamp(now: Date = new Date()): string {
  // Usar Intl para extraer partes exactas en la zona horaria oficial de Chile
  const formatter = new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'longOffset',
  });

  const parts = formatter.formatToParts(now);
  const findPart = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';

  const year = findPart('year');
  const month = findPart('month');
  const day = findPart('day');
  const hour = findPart('hour');
  const minute = findPart('minute');
  const second = findPart('second');

  // timeZoneName "longOffset" entrega "GMT-03:00" o "GMT-04:00"
  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-03:00';
  const offset = tzName.replace('GMT', '');

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
}

/**
 * Comparación de los proyectos que van a ingresar contra los ya existentes en la base de datos.
 * Detecta:
 * 1. Proyectos nuevos (no existían previamente en SQLite).
 * 2. Cambios de estado (el ID ya existía, pero su estado cambió respecto al guardado).
 */
export function detectChanges(
  incomingProjects: CleanProject[],
  existingProjects: Array<{ id: string; nombre: string; estado: string }>,
  executionTimestamp: string,
): {
  newProjects: NewProjectRecord[];
  stateChanges: StateChangeRecord[];
} {
  const existingMap = new Map(existingProjects.map((p) => [p.id, p]));
  const newProjects: NewProjectRecord[] = [];
  const stateChanges: StateChangeRecord[] = [];

  for (const incoming of incomingProjects) {
    const existing = existingMap.get(incoming.id);

    if (!existing) {
      // Proyecto nuevo
      newProjects.push({
        id: incoming.id,
        nombre: incoming.nombre,
        estado: incoming.estado,
        detectado_en: executionTimestamp,
      });
    } else if (existing.estado !== incoming.estado) {
      // Proyecto existente que cambió de estado
      stateChanges.push({
        id: incoming.id,
        nombre: incoming.nombre,
        estado_anterior: existing.estado,
        estado_nuevo: incoming.estado,
        fecha_cambio: executionTimestamp,
      });
    }
  }

  return { newProjects, stateChanges };
}

/**
 * Guarda o actualiza el archivo de reporte de cambios (changes.json).
 * - Actualiza la fecha de última ejecución y el resumen de la corrida actual.
 * - Acumula el historial de cambios de estado sin borrar los eventos anteriores.
 * - Registra los proyectos nuevos sin duplicarlos en el listado.
 */
export async function updateChangesFile(
  filePath: string,
  newProjects: NewProjectRecord[],
  stateChanges: StateChangeRecord[],
  executionTimestamp: string,
): Promise<ChangesReportFile> {
  let existingReport: ChangesReportFile = {
    ultima_ejecucion: executionTimestamp,
    resumen_ultima_ejecucion: {
      nuevos_detectados: 0,
      cambios_estado_detectados: 0,
    },
    proyectos_nuevos: [],
    historial_cambios_estado: [],
  };

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as ChangesReportFile;
    if (parsed && typeof parsed === 'object') {
      existingReport = {
        ...existingReport,
        ...parsed,
        proyectos_nuevos: Array.isArray(parsed.proyectos_nuevos)
          ? parsed.proyectos_nuevos
          : [],
        historial_cambios_estado: Array.isArray(parsed.historial_cambios_estado)
          ? parsed.historial_cambios_estado
          : [],
      };
    }
  } catch {
    // Si el archivo no existe aún, se inicializa con la plantilla base
  }

  // 1. Actualizar metadatos de la corrida actual
  existingReport.ultima_ejecucion = executionTimestamp;
  existingReport.resumen_ultima_ejecucion = {
    nuevos_detectados: newProjects.length,
    cambios_estado_detectados: stateChanges.length,
  };

  // 2. Acumular proyectos nuevos (evitar duplicar entradas del mismo ID en el array de nuevos)
  const knownNewIds = new Set(existingReport.proyectos_nuevos.map((p) => p.id));
  for (const n of newProjects) {
    if (!knownNewIds.has(n.id)) {
      existingReport.proyectos_nuevos.push(n);
      knownNewIds.add(n.id);
    }
  }

  // 3. Acumular historial de cambios de estado (se preserva la bitácora histórica completa)
  existingReport.historial_cambios_estado.push(...stateChanges);

  // 4. Guardar archivo formateado
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(existingReport, null, 2), 'utf-8');

  return existingReport;
}

