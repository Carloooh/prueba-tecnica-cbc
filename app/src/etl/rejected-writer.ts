import * as fs from 'fs';
import * as path from 'path';
import { RejectedRecord } from './types.js';


/**
 Almacenamiento de registros rechazados en un archivo JSON:
 * - Formato: id, nombre y motivo.
 * - Se sobrescribe el archivo en cada ejecución.
 * - Crea el directorio contenedor automáticamente si no existe.
 */

export async function writeRejectedFile(
  filePath: string,
  rejections: RejectedRecord[],
): Promise<void> {
  const resolvedPath = path.resolve(filePath);
  const dir = path.dirname(resolvedPath);

  // Verificación de directorio
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Serialización con formato legible (2 espacios)
  const content = JSON.stringify(rejections, null, 2);

  // Sobrescritura del archivo
  await fs.promises.writeFile(resolvedPath, content, 'utf-8');
}