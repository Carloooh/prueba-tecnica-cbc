import { describe, it, expect } from 'vitest';
import {
  cleanId,
  cleanNombre,
  cleanTitular,
  cleanMonto,
  cleanFechaIngreso,
  cleanRegion,
  cleanEstado,
  cleanRawProject,
  deduplicateProjects,
} from './cleaner.js';

describe('ETL Cleaner - Reglas Básicas', () => {
  describe('cleanId', () => {
    it('debe limpiar espacios y convertir a mayúsculas', () => {
      const res = cleanId('  p-0042  ');
      expect(res).toEqual({ id: 'P-0042' });
    });

    it('debe rechazar con id_vacio si viene vacío o solo espacios', () => {
      expect(cleanId('')).toEqual({ error: 'id_vacio' });
      expect(cleanId('   ')).toEqual({ error: 'id_vacio' });
      expect(cleanId(undefined)).toEqual({ error: 'id_vacio' });
    });
  });

  describe('cleanNombre', () => {
    it('debe quitar espacios sobrantes y colapsar espacios múltiples internos', () => {
      const res = cleanNombre('  Planta   Solar   Los   Andes  ');
      expect(res).toEqual({ nombre: 'Planta Solar Los Andes' });
    });

    it('debe rechazar con nombre_vacio si viene vacío', () => {
      expect(cleanNombre('')).toEqual({ error: 'nombre_vacio' });
      expect(cleanNombre('   ')).toEqual({ error: 'nombre_vacio' });
      expect(cleanNombre(undefined)).toEqual({ error: 'nombre_vacio' });
    });
  });

  describe('cleanTitular', () => {
    it('debe limpiar espacios y retornar null si viene vacío', () => {
      expect(cleanTitular('  Empresa   X S.A. ')).toBe('Empresa X S.A.');
      expect(cleanTitular('')).toBeNull();
      expect(cleanTitular('   ')).toBeNull();
      expect(cleanTitular(undefined)).toBeNull();
    });
  });

  describe('cleanMonto', () => {
    it('debe procesar montos con formato "1.234,5 MM USD"', () => {
      expect(cleanMonto('1.234,5 MM USD')).toEqual({ monto_musd: 1234.5 });
      expect(cleanMonto('1234,5 MM USD')).toEqual({ monto_musd: 1234.5 });
      expect(cleanMonto('1,8 MM USD')).toEqual({ monto_musd: 1.8 });
    });

    it('debe procesar montos con formato "US$ 2,5 millones"', () => {
      expect(cleanMonto('US$ 2,5 millones')).toEqual({ monto_musd: 2.5 });
      expect(cleanMonto('US$ 1.031,2 millones')).toEqual({ monto_musd: 1031.2 });
      expect(cleanMonto('  2.5 millones USD ')).toEqual({ monto_musd: 2.5 });
    });

    it('debe convertir dólares enteros a millones dividiendo por 1.000.000 ("850000" -> 0.85)', () => {
      expect(cleanMonto('850000')).toEqual({ monto_musd: 0.85 });
      expect(cleanMonto('110000')).toEqual({ monto_musd: 0.11 });
    });

    it('debe redondear a un máximo de 3 decimales', () => {
      expect(cleanMonto('1234567')).toEqual({ monto_musd: 1.235 });
    });

    it('debe rechazar montos cero o negativos con monto_negativo', () => {
      expect(cleanMonto('0')).toEqual({ error: 'monto_negativo' });
      expect(cleanMonto('-500000')).toEqual({ error: 'monto_negativo' });
      expect(cleanMonto('-500 MM USD')).toEqual({ error: 'monto_negativo' });
    });

    it('debe rechazar textos no numéricos o vacíos con monto_invalido', () => {
      expect(cleanMonto('a convenir')).toEqual({ error: 'monto_invalido' });
      expect(cleanMonto('N/D')).toEqual({ error: 'monto_invalido' });
      expect(cleanMonto('')).toEqual({ error: 'monto_invalido' });
      expect(cleanMonto('   ')).toEqual({ error: 'monto_invalido' });
      expect(cleanMonto(undefined)).toEqual({ error: 'monto_invalido' });
    });
  });

  describe('cleanFechaIngreso', () => {
    it('debe parsear formato AAAA-MM-DD', () => {
      expect(cleanFechaIngreso('2024-03-15')).toEqual({ fecha_ingreso: '2024-03-15' });
      expect(cleanFechaIngreso('2023-01-05')).toEqual({ fecha_ingreso: '2023-01-05' });
    });

    it('debe parsear formato DD/MM/AAAA con día siempre primero', () => {
      expect(cleanFechaIngreso('15/03/2024')).toEqual({ fecha_ingreso: '2024-03-15' });
      expect(cleanFechaIngreso('08/01/2025')).toEqual({ fecha_ingreso: '2025-01-08' });
    });

    it('debe parsear formato DD-mmm-AAAA con meses abreviados en español (insensible a mayúsculas)', () => {
      expect(cleanFechaIngreso('15-mar-2024')).toEqual({ fecha_ingreso: '2024-03-15' });
      expect(cleanFechaIngreso('01-OCT-2025')).toEqual({ fecha_ingreso: '2025-10-01' });
      expect(cleanFechaIngreso('06-Dic-2022')).toEqual({ fecha_ingreso: '2022-12-06' });
    });

    it('debe rechazar fechas irreales (ej. 31 de febrero o meses inexistentes) con fecha_invalida', () => {
      expect(cleanFechaIngreso('31/02/2024')).toEqual({ error: 'fecha_invalida' });
      expect(cleanFechaIngreso('2025-13-40')).toEqual({ error: 'fecha_invalida' });
      expect(cleanFechaIngreso('29/02/2023')).toEqual({ error: 'fecha_invalida' });
    });

    it('debe aceptar 29 de febrero en años bisiestos válidos', () => {
      expect(cleanFechaIngreso('29/02/2024')).toEqual({ fecha_ingreso: '2024-02-29' });
    });

    it('debe rechazar formatos no reconocidos o valores vacíos con fecha_invalida', () => {
      expect(cleanFechaIngreso('')).toEqual({ error: 'fecha_invalida' });
      expect(cleanFechaIngreso('   ')).toEqual({ error: 'fecha_invalida' });
      expect(cleanFechaIngreso('ayer')).toEqual({ error: 'fecha_invalida' });
      expect(cleanFechaIngreso(undefined)).toEqual({ error: 'fecha_invalida' });
    });
  });

  describe('cleanRegion', () => {
    it('debe normalizar nombres canónicos y variantes con números romanos', () => {
      expect(cleanRegion('Antofagasta')).toEqual({ region: 'Antofagasta' });
      expect(cleanRegion('ANTOFAGASTA ')).toEqual({ region: 'Antofagasta' });
      expect(cleanRegion('II Región')).toEqual({ region: 'Antofagasta' });
      expect(cleanRegion('Región de Antofagasta')).toEqual({ region: 'Antofagasta' });
    });

    it('debe procesar regiones con tildes y caracteres especiales (O\'Higgins, Ñuble, Biobío)', () => {
      expect(cleanRegion("O'Higgins")).toEqual({ region: "O'Higgins" });
      expect(cleanRegion('OHIGGINS ')).toEqual({ region: "O'Higgins" });
      expect(cleanRegion('VI Región')).toEqual({ region: "O'Higgins" });
      expect(cleanRegion('Biobío')).toEqual({ region: 'Biobío' });
      expect(cleanRegion('BIOBIO ')).toEqual({ region: 'Biobío' });
      expect(cleanRegion('VIII Región')).toEqual({ region: 'Biobío' });
      expect(cleanRegion('Región de Ñuble')).toEqual({ region: 'Ñuble' });
      expect(cleanRegion('XVI Región')).toEqual({ region: 'Ñuble' });
    });

    it('debe procesar Metropolitana de Santiago y sus variantes', () => {
      expect(cleanRegion('Región Metropolitana')).toEqual({ region: 'Metropolitana de Santiago' });
      expect(cleanRegion('METROPOLITANA DE SANTIAGO')).toEqual({ region: 'Metropolitana de Santiago' });
    });

    it('debe rechazar regiones no listadas con region_desconocida', () => {
      expect(cleanRegion('Región Desconocida')).toEqual({ error: 'region_desconocida' });
      expect(cleanRegion('Buenos Aires')).toEqual({ error: 'region_desconocida' });
      expect(cleanRegion('')).toEqual({ error: 'region_desconocida' });
      expect(cleanRegion(undefined)).toEqual({ error: 'region_desconocida' });
    });
  });

  describe('cleanEstado', () => {
    it('debe normalizar los 3 estados canónicos ignorando mayúsculas, tildes y espacios', () => {
      expect(cleanEstado('En evaluación')).toEqual({ estado: 'En evaluación' });
      expect(cleanEstado('en evaluacion')).toEqual({ estado: 'En evaluación' });
      expect(cleanEstado('EN EVALUACIÓN ')).toEqual({ estado: 'En evaluación' });

      expect(cleanEstado('Aprobado')).toEqual({ estado: 'Aprobado' });
      expect(cleanEstado('APROBADO ')).toEqual({ estado: 'Aprobado' });
      expect(cleanEstado('aprobado')).toEqual({ estado: 'Aprobado' });

      expect(cleanEstado('Rechazado')).toEqual({ estado: 'Rechazado' });
      expect(cleanEstado('RECHAZADO')).toEqual({ estado: 'Rechazado' });
      expect(cleanEstado('rechazado ')).toEqual({ estado: 'Rechazado' });
    });

    it('debe rechazar estados no canónicos con estado_desconocido', () => {
      expect(cleanEstado('Suspendido')).toEqual({ error: 'estado_desconocido' });
      expect(cleanEstado('Pendiente')).toEqual({ error: 'estado_desconocido' });
      expect(cleanEstado('')).toEqual({ error: 'estado_desconocido' });
      expect(cleanEstado(undefined)).toEqual({ error: 'estado_desconocido' });
    });
  });

  describe('cleanRawProject (Integración de orden de validación)', () => {
    it('debe retornar éxito cuando todos los datos son válidos', () => {
      const res = cleanRawProject({
        id: '  p-0042  ',
        nombre: '  Planta Solar Los Andes ',
        titular: 'Minera Andina S.A.',
        region: 'II Región',
        monto: '1.234,5 MM USD',
        fecha_ingreso: '15/03/2024',
        estado: 'aprobado',
        actualizado_en: '2024-03-15T12:00:00Z',
      });

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.id).toBe('P-0042');
        expect(res.data.nombre).toBe('Planta Solar Los Andes');
        expect(res.data.region).toBe('Antofagasta');
        expect(res.data.monto_musd).toBe(1234.5);
        expect(res.data.fecha_ingreso).toBe('2024-03-15');
        expect(res.data.estado).toBe('Aprobado');
      }
    });

    it('debe rechazar con motivo en el orden estricto del contrato', () => {
      // 1. Si falla id, debe dar id_vacio sin importar el resto
      const res1 = cleanRawProject({
        id: '',
        nombre: '',
        monto: 'N/D',
      });
      expect(res1.success).toBe(false);
      if (!res1.success) {
        expect(res1.rejection.motivo).toBe('id_vacio');
      }

      // 2. Si id es válido pero nombre falla, debe dar nombre_vacio
      const res2 = cleanRawProject({
        id: 'P-0001',
        nombre: '',
        monto: 'N/D',
      });
      expect(res2.success).toBe(false);
      if (!res2.success) {
        expect(res2.rejection.motivo).toBe('nombre_vacio');
      }

      // 3. Si id y nombre son válidos pero monto falla, debe dar monto_invalido o monto_negativo
      const res3 = cleanRawProject({
        id: 'P-0001',
        nombre: 'Parque Eolico',
        monto: 'a convenir',
        fecha_ingreso: '31/02/2024',
      });
      expect(res3.success).toBe(false);
      if (!res3.success) {
        expect(res3.rejection.motivo).toBe('monto_invalido');
      }

      // 4. Si id, nombre y monto son válidos pero fecha falla, debe dar fecha_invalida
      const res4 = cleanRawProject({
        id: 'P-0001',
        nombre: 'Parque Eolico',
        monto: '100 MM USD',
        fecha_ingreso: '31/02/2024',
        region: 'Región Inexistente',
      });
      expect(res4.success).toBe(false);
      if (!res4.success) {
        expect(res4.rejection.motivo).toBe('fecha_invalida');
      }

      // 5. Si todo es válido hasta la fecha pero región falla, debe dar region_desconocida
      const res5 = cleanRawProject({
        id: 'P-0001',
        nombre: 'Parque Eolico',
        monto: '100 MM USD',
        fecha_ingreso: '2024-03-15',
        region: 'Región Desconocida',
        estado: 'Inexistente',
      });
      expect(res5.success).toBe(false);
      if (!res5.success) {
        expect(res5.rejection.motivo).toBe('region_desconocida');
      }

      // 6. Si todo es válido excepto el estado, debe dar estado_desconocido
      const res6 = cleanRawProject({
        id: 'P-0001',
        nombre: 'Parque Eolico',
        monto: '100 MM USD',
        fecha_ingreso: '2024-03-15',
        region: 'Antofagasta',
        estado: 'Suspendido',
      });
      expect(res6.success).toBe(false);
      if (!res6.success) {
        expect(res6.rejection.motivo).toBe('estado_desconocido');
      }
    });
  });

  describe('deduplicateProjects', () => {
    it('debe conservar una sola copia si dos registros son idénticos', () => {
      const p1 = {
        id: 'P-0082',
        nombre: 'Proyecto Inmobiliario Salar Grande',
        titular: 'Agrícola Valle Verde S.A.',
        region: 'Los Lagos',
        monto_musd: 0.78,
        fecha_ingreso: '2024-12-13',
        estado: 'Aprobado',
        actualizado_en: new Date('2024-12-22T15:00:00Z'),
      };
      const p2 = { ...p1 };

      const result = deduplicateProjects([p1, p2]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('P-0082');
    });

    it('debe conservar el registro con actualizado_en más reciente si difieren, sin importar el orden', () => {
      const antiguo = {
        id: 'P-0042',
        nombre: 'Planta Solar Los Andes',
        titular: 'Minera Andina S.A.',
        region: 'Antofagasta',
        monto_musd: 100,
        fecha_ingreso: '2024-01-10',
        estado: 'En evaluación',
        actualizado_en: new Date('2024-01-10T10:00:00Z'),
      };

      const nuevo = {
        id: 'P-0042',
        nombre: 'Planta Solar Los Andes',
        titular: 'Minera Andina S.A.',
        region: 'Antofagasta',
        monto_musd: 125.5,
        fecha_ingreso: '2024-01-10',
        estado: 'Aprobado',
        actualizado_en: new Date('2024-03-15T12:00:00Z'), // Fecha más reciente
      };

      // Caso A: Llega primero el antiguo y luego el nuevo
      const resA = deduplicateProjects([antiguo, nuevo]);
      expect(resA).toHaveLength(1);
      expect(resA[0].estado).toBe('Aprobado');
      expect(resA[0].monto_musd).toBe(125.5);

      // Caso B: Llega primero el nuevo y luego el antiguo
      const resB = deduplicateProjects([nuevo, antiguo]);
      expect(resB).toHaveLength(1);
      expect(resB[0].estado).toBe('Aprobado');
      expect(resB[0].monto_musd).toBe(125.5);
    });

    it('debe mantener proyectos con IDs diferentes separados', () => {
      const p1 = {
        id: 'P-0001',
        nombre: 'Proyecto 1',
        titular: null,
        region: 'Maule',
        monto_musd: 10,
        fecha_ingreso: '2024-01-01',
        estado: 'Aprobado',
        actualizado_en: new Date('2024-01-01T00:00:00Z'),
      };
      const p2 = {
        id: 'P-0002',
        nombre: 'Proyecto 2',
        titular: null,
        region: 'Atacama',
        monto_musd: 20,
        fecha_ingreso: '2024-01-02',
        estado: 'En evaluación',
        actualizado_en: new Date('2024-01-02T00:00:00Z'),
      };

      const result = deduplicateProjects([p1, p2]);
      expect(result).toHaveLength(2);
    });
  });
});


