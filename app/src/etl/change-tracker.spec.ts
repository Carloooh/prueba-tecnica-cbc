import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  getChileanIsoTimestamp,
  detectChanges,
  updateChangesFile,
} from './change-tracker.js';
import { CleanProject } from './types.js';

describe('change-tracker', () => {
  const testChangesPath = path.join(process.cwd(), 'data', 'test-changes.json');

  beforeEach(async () => {
    try {
      await fs.unlink(testChangesPath);
    } catch {
      // Ignorar si no existía
    }
  });

  afterEach(async () => {
    try {
      await fs.unlink(testChangesPath);
    } catch {
      // Ignorar si no existía
    }
  });

  it('getChileanIsoTimestamp debe generar un timestamp con formato ISO y offset chileno', () => {
    const timestamp = getChileanIsoTimestamp();
    // Debe cumplir con el patrón AAAA-MM-DDTHH:mm:ss-0X:00
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-\d{2}:\d{2}$/);
  });

  it('detectChanges debe identificar proyectos nuevos y cambios de estado con precisión', () => {
    const incoming: CleanProject[] = [
      {
        id: 'P-0001',
        nombre: 'Parque Solar A',
        titular: 'Empresa 1',
        region: 'Antofagasta',
        monto_musd: 100,
        fecha_ingreso: '2024-01-01',
        estado: 'Aprobado', // Cambió de "En evaluación" a "Aprobado"
        actualizado_en: new Date('2024-02-01T00:00:00Z'),
      },
      {
        id: 'P-0002',
        nombre: 'Parque Eólico B',
        titular: 'Empresa 2',
        region: 'Atacama',
        monto_musd: 80,
        fecha_ingreso: '2024-01-01',
        estado: 'En evaluación', // Sin cambios
        actualizado_en: new Date('2024-01-01T00:00:00Z'),
      },
      {
        id: 'P-0003',
        nombre: 'Nueva Línea Transmisión',
        titular: 'Empresa 3',
        region: 'Biobío',
        monto_musd: 45,
        fecha_ingreso: '2024-03-01',
        estado: 'En evaluación', // Nuevo en esta corrida
        actualizado_en: new Date('2024-03-01T00:00:00Z'),
      },
    ];

    const existingInDb = [
      { id: 'P-0001', nombre: 'Parque Solar A', estado: 'En evaluación' },
      { id: 'P-0002', nombre: 'Parque Eólico B', estado: 'En evaluación' },
    ];

    const executionTime = '2026-11-05T21:30:00-03:00';
    const result = detectChanges(incoming, existingInDb, executionTime);

    // Debe detectar 1 nuevo (P-0003)
    expect(result.newProjects).toHaveLength(1);
    expect(result.newProjects[0]).toEqual({
      id: 'P-0003',
      nombre: 'Nueva Línea Transmisión',
      estado: 'En evaluación',
      detectado_en: executionTime,
    });

    // Debe detectar 1 cambio de estado (P-0001)
    expect(result.stateChanges).toHaveLength(1);
    expect(result.stateChanges[0]).toEqual({
      id: 'P-0001',
      nombre: 'Parque Solar A',
      estado_anterior: 'En evaluación',
      estado_nuevo: 'Aprobado',
      fecha_cambio: executionTime,
    });
  });

  it('updateChangesFile debe acumular el historial de cambios entre ejecuciones sucesivas', async () => {
    const t1 = '2026-11-05T20:00:00-03:00';
    const report1 = await updateChangesFile(
      testChangesPath,
      [{ id: 'P-0001', nombre: 'Proyecto A', estado: 'En evaluación', detectado_en: t1 }],
      [],
      t1,
    );

    expect(report1.resumen_ultima_ejecucion.nuevos_detectados).toBe(1);
    expect(report1.proyectos_nuevos).toHaveLength(1);
    expect(report1.historial_cambios_estado).toHaveLength(0);

    // Segunda ejecución: detecta un cambio de estado en P-0001
    const t2 = '2026-11-05T21:00:00-03:00';
    const report2 = await updateChangesFile(
      testChangesPath,
      [],
      [
        {
          id: 'P-0001',
          nombre: 'Proyecto A',
          estado_anterior: 'En evaluación',
          estado_nuevo: 'Aprobado',
          fecha_cambio: t2,
        },
      ],
      t2,
    );

    // Debe preservar el proyecto nuevo de t1 y sumar el cambio de estado de t2
    expect(report2.ultima_ejecucion).toBe(t2);
    expect(report2.resumen_ultima_ejecucion.nuevos_detectados).toBe(0);
    expect(report2.resumen_ultima_ejecucion.cambios_estado_detectados).toBe(1);
    expect(report2.proyectos_nuevos).toHaveLength(1);
    expect(report2.historial_cambios_estado).toHaveLength(1);
    expect(report2.historial_cambios_estado[0].estado_nuevo).toBe('Aprobado');
  });
});

