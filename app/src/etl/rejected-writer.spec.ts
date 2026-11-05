import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { writeRejectedFile } from './rejected-writer.js';
import { RejectedRecord } from './types.js';

describe('ETL - Rejected Writer', () => {
  const testDir = path.resolve(__dirname, '../../test-temp');
  const testFile = path.join(testDir, 'test-rejected.json');

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('debe crear el archivo y su directorio si no existen', async () => {
    const rejections: RejectedRecord[] = [
      { id: '', nombre: 'Proyecto Sin ID', motivo: 'id_vacio' },
      { id: 'P-0002', nombre: '', motivo: 'nombre_vacio' },
    ];

    await writeRejectedFile(testFile, rejections);

    expect(fs.existsSync(testFile)).toBe(true);
    const content = JSON.parse(fs.readFileSync(testFile, 'utf-8'));
    expect(content).toEqual(rejections);
  });

  it('debe sobrescribir el contenido previo al reejecutar (no acumular)', async () => {
    const corrida1: RejectedRecord[] = [
      { id: 'P-0001', nombre: 'P1', motivo: 'monto_invalido' },
      { id: 'P-0002', nombre: 'P2', motivo: 'fecha_invalida' },
    ];
    await writeRejectedFile(testFile, corrida1);

    const corrida2: RejectedRecord[] = [
      { id: 'P-0099', nombre: 'P99', motivo: 'region_desconocida' },
    ];
    await writeRejectedFile(testFile, corrida2);

    const content = JSON.parse(fs.readFileSync(testFile, 'utf-8'));
    expect(content).toHaveLength(1);
    expect(content).toEqual(corrida2);
  });
});

