import { RawProject, CleanResult, CleanProject, RejectedRecord, RejectReason } from './types.js';


// Limpieza de ID, quitar espacios y pasar a mayúsculas, que no esté vacío.
export function cleanId(rawId?: string): { id: string } | { error: RejectReason } {
  const cleaned = rawId ? rawId.trim().toUpperCase() : '';
  return cleaned ? {id: cleaned} : {error: 'id_vacio'}
}


// Limpieza de nombre, quitar espacios correspondientes, que no esté vacío
export function cleanNombre(rawNombre?: string): { nombre: string } | { error: RejectReason } {
  const cleaned = rawNombre ? rawNombre.trim().replace(/\s+/g, ' ') : '';
  return cleaned ? {nombre: cleaned} : {error: 'nombre_vacio'}
}


// Limpieza y conversión de monto según CONTRATO.md, no puede ser monto inválido, vacío ni negativo
/*
 * - '1.234,5 MM USD' -> 1234.5 millones
 * - 'US$ 2,5 millones' -> 2.5 millones
 * - '850000' (sin unidad = dólares enteros) -> 0.85 millones (850000 / 1_000_000)
 * - Punto es separador de miles y coma es decimal.
 * - Guardar con a lo más 3 decimales
 */
export function cleanMonto(rawMonto?: string): { monto_musd: number } | { error: RejectReason } {
  // Si no trae el monto, es inválido
  if (!rawMonto || !rawMonto.trim()) {
    return { error: 'monto_invalido' };
  }

  const raw = rawMonto.trim().toLowerCase();

  // Validar patrones permitidos
  const isMillions = raw.includes('mm') || raw.includes('millon');

  // Si no contiene ningún dígito (ej: "N/D", "a convenir"), es inválido
  if (!/\d/.test(raw)) {
    return { error: 'monto_invalido' };
  }

  // Extracción del bloque numérico con su puntuación
  const match = raw.match(/[-+]?[\d.]+(?:,\d+)?/);
  if (!match) {
    return { error: 'monto_invalido' };
  }

  const numberPart = match[0];

  // Si tiene coma, es el formato de miles con punto y coma para decimal
  let standardized: string;
  if (numberPart.includes(',')) {
    // Formato: quitar puntos de miles y cambiar coma por punto
    standardized = numberPart.replace(/\./g, '').replace(',', '.');
  } else if ((numberPart.match(/\./g) || []).length === 1 && /\.\d{1,2}$/.test(numberPart) && isMillions) {
    // Notación alternativa con punto decimal (ej. "2.5 millones")
    standardized = numberPart;
  } else {
    // Entero con posibles separadores de miles con punto (ej. "1.500.000" o "850000")
    standardized = numberPart.replace(/\./g, '');
  }

  const parsedValue = parseFloat(standardized);

  if (isNaN(parsedValue)) {
    return { error: 'monto_invalido' };
  }

  // Si es <= 0 antes o después de la conversión
  if (parsedValue <= 0) {
    return { error: 'monto_negativo' };
  }

  // Si no tiene unidad explícita de millones, son dólares enteros y se divide por 1.000.000
  let finalMusd = isMillions ? parsedValue : parsedValue / 1_000_000;

  // Redondear a lo más 3 decimales
  finalMusd = Math.round(finalMusd * 1000) / 1000;

  if (finalMusd <= 0) {
    return { error: 'monto_negativo' };
  }

  return { monto_musd: finalMusd };
}


// Mapa de meses abreviados en español a número de mes (01 a 12).
const MESES_ES: Record<string, string> = {
  ene: '01',
  feb: '02',
  mar: '03',
  abr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  ago: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dic: '12',
};

// Validación de que la fecha exista en el calendario
function isValidDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) {
    return false;
  }

  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

// Limpieza de fecha de ingreso, convertir a formato ISO 8601 AAAA-MM-DD, debe ser una fecha real y válida
export function cleanFechaIngreso(rawFecha?: string): { fecha_ingreso: string } | { error: RejectReason } {
  if (!rawFecha || !rawFecha.trim()) {
    return { error: 'fecha_invalida' };
  }

  const raw = rawFecha.trim().toLowerCase();

  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;

  // Formato 1: AAAA-MM-DD
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    year = parseInt(isoMatch[1], 10);
    month = parseInt(isoMatch[2], 10);
    day = parseInt(isoMatch[3], 10);
  }

  // Formato 2: DD/MM/AAAA
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    day = parseInt(slashMatch[1], 10);
    month = parseInt(slashMatch[2], 10);
    year = parseInt(slashMatch[3], 10);
  }

  // Formato 3: DD-mmm-AAAA
  const textMonthMatch = raw.match(/^(\d{1,2})-([a-z]{3})-(\d{4})$/);
  if (textMonthMatch) {
    day = parseInt(textMonthMatch[1], 10);
    const mesStr = textMonthMatch[2];
    year = parseInt(textMonthMatch[3], 10);

    const mesNum = MESES_ES[mesStr];
    if (mesNum) {
      month = parseInt(mesNum, 10);
    }
  }

  // Si no coincide con ningún formato, es inválida
  if (year === null || month === null || day === null) {
    return { error: 'fecha_invalida' };
  }

  // Comprobación de que sea una fecha real en el calendario
  if (!isValidDate(year, month, day)) {
    return { error: 'fecha_invalida' };
  }

  // Estandarizar a fecha a formato AAAA-MM-DD
  const formattedMonth = String(month).padStart(2, '0');
  const formattedDay = String(day).padStart(2, '0');

  return { fecha_ingreso: `${year}-${formattedMonth}-${formattedDay}` };
}

// Función para normalización de texto y poder comparar, convierte a minúsculas, quita tildes, puntuación especial y espacios múltiples
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes: á->a, é->e, etc.
    .replace(/['’]/g, '')          // unifica o'higgins -> ohiggins
    .trim()
    .replace(/\s+/g, ' ');
}

// Mapa de regiones y variantes reconocidas
const REGIONES_MAP: Record<string, string> = {
  // Arica y Parinacota
  [normalizeText('Arica y Parinacota')]: 'Arica y Parinacota',
  [normalizeText('XV Región')]: 'Arica y Parinacota',
  [normalizeText('Región de Arica y Parinacota')]: 'Arica y Parinacota',

  // Tarapacá
  [normalizeText('Tarapacá')]: 'Tarapacá',
  [normalizeText('I Región')]: 'Tarapacá',
  [normalizeText('Región de Tarapacá')]: 'Tarapacá',

  // Antofagasta
  [normalizeText('Antofagasta')]: 'Antofagasta',
  [normalizeText('II Región')]: 'Antofagasta',
  [normalizeText('Región de Antofagasta')]: 'Antofagasta',

  // Atacama
  [normalizeText('Atacama')]: 'Atacama',
  [normalizeText('III Región')]: 'Atacama',
  [normalizeText('Región de Atacama')]: 'Atacama',

  // Coquimbo
  [normalizeText('Coquimbo')]: 'Coquimbo',
  [normalizeText('IV Región')]: 'Coquimbo',
  [normalizeText('Región de Coquimbo')]: 'Coquimbo',

  // Valparaíso
  [normalizeText('Valparaíso')]: 'Valparaíso',
  [normalizeText('V Región')]: 'Valparaíso',
  [normalizeText('Región de Valparaíso')]: 'Valparaíso',

  // Metropolitana de Santiago
  [normalizeText('Metropolitana de Santiago')]: 'Metropolitana de Santiago',
  [normalizeText('Región Metropolitana')]: 'Metropolitana de Santiago',
  [normalizeText('Región de Metropolitana de Santiago')]: 'Metropolitana de Santiago',

  // O'Higgins
  [normalizeText("O'Higgins")]: "O'Higgins",
  [normalizeText('VI Región')]: "O'Higgins",
  [normalizeText("Región de O'Higgins")]: "O'Higgins",

  // Maule
  [normalizeText('Maule')]: 'Maule',
  [normalizeText('VII Región')]: 'Maule',
  [normalizeText('Región de Maule')]: 'Maule',

  // Ñuble
  [normalizeText('Ñuble')]: 'Ñuble',
  [normalizeText('XVI Región')]: 'Ñuble',
  [normalizeText('Región de Ñuble')]: 'Ñuble',

  // Biobío
  [normalizeText('Biobío')]: 'Biobío',
  [normalizeText('VIII Región')]: 'Biobío',
  [normalizeText('Región de Biobío')]: 'Biobío',

  // La Araucanía
  [normalizeText('La Araucanía')]: 'La Araucanía',
  [normalizeText('IX Región')]: 'La Araucanía',
  [normalizeText('Región de La Araucanía')]: 'La Araucanía',

  // Los Ríos
  [normalizeText('Los Ríos')]: 'Los Ríos',
  [normalizeText('XIV Región')]: 'Los Ríos',
  [normalizeText('Región de Los Ríos')]: 'Los Ríos',

  // Los Lagos
  [normalizeText('Los Lagos')]: 'Los Lagos',
  [normalizeText('X Región')]: 'Los Lagos',
  [normalizeText('Región de Los Lagos')]: 'Los Lagos',

  // Aysén
  [normalizeText('Aysén')]: 'Aysén',
  [normalizeText('XI Región')]: 'Aysén',
  [normalizeText('Región de Aysén')]: 'Aysén',

  // Magallanes
  [normalizeText('Magallanes')]: 'Magallanes',
  [normalizeText('XII Región')]: 'Magallanes',
  [normalizeText('Región de Magallanes')]: 'Magallanes',
};

// Mapeo de Región canónica, insensible a formato, se convierte a nombre canónico, se rechaza si es una región desconocida
export function cleanRegion(rawRegion?: string): { region: string } | { error: RejectReason } {
  if (!rawRegion || !rawRegion.trim()) {
    return { error: 'region_desconocida' };
  }

  const normalized = normalizeText(rawRegion);
  const canonical = REGIONES_MAP[normalized];

  if (!canonical) {
    return { error: 'region_desconocida' };
  }

  return { region: canonical };
}


// Mapa de estados aceptados
const ESTADOS_MAP: Record<string, string> = {
  [normalizeText('En evaluación')]: 'En evaluación',
  [normalizeText('En evaluacion')]: 'En evaluación',
  [normalizeText('Aprobado')]: 'Aprobado',
  [normalizeText('Rechazado')]: 'Rechazado',
};

// Mapeo de estado, insensible a formato, se reachaza si es un estado desconocido
export function cleanEstado(rawEstado?: string): { estado: string } | { error: RejectReason } {
  if (!rawEstado || !rawEstado.trim()) {
    return { error: 'estado_desconocido' };
  }

  const normalized = normalizeText(rawEstado);
  const canonical = ESTADOS_MAP[normalized];

  if (!canonical) {
    return { error: 'estado_desconocido' };
  }

  return { estado: canonical };
}


// Limpieza de titular, quitar espacios correspondientes, puede quedar vacío
export function cleanTitular(rawTitular?: string): string | null {
  const cleaned = rawTitular ? rawTitular.trim().replace(/\s+/g, ' ') : '';
  return cleaned || null;
}



// Función principal, aplica las reglas para validar todos los campos del formato
export function cleanRawProject(raw: RawProject): CleanResult {
  // 1. Validación de ID
  const idResult = cleanId(raw.id);
  if ('error' in idResult) {
    return {
      success: false,
      rejection: { id: raw.id || '', nombre: raw.nombre || '', motivo: idResult.error },
    };
  }

  // 2. Validación de Nombre
  const nombreResult = cleanNombre(raw.nombre);
  if ('error' in nombreResult) {
    return {
      success: false,
      rejection: { id: idResult.id, nombre: raw.nombre || '', motivo: nombreResult.error },
    };
  }

  // 3. Validación de Monto
  const montoResult = cleanMonto(raw.monto);
  if ('error' in montoResult) {
    return {
      success: false,
      rejection: { id: idResult.id, nombre: nombreResult.nombre, motivo: montoResult.error },
    };
  }

  // 4. Validación de Fecha Ingreso
  const fechaResult = cleanFechaIngreso(raw.fecha_ingreso);
  if ('error' in fechaResult) {
    return {
      success: false,
      rejection: { id: idResult.id, nombre: nombreResult.nombre, motivo: fechaResult.error },
    };
  }

  // 5. Validación de Región
  const regionResult = cleanRegion(raw.region);
  if ('error' in regionResult) {
    return {
      success: false,
      rejection: { id: idResult.id, nombre: nombreResult.nombre, motivo: regionResult.error },
    };
  }

  // 6. Validación de Estado
  const estadoResult = cleanEstado(raw.estado);
  if ('error' in estadoResult) {
    return {
      success: false,
      rejection: { id: idResult.id, nombre: nombreResult.nombre, motivo: estadoResult.error },
    };
  }

  // 7. Limpieza de titular
  const titular = cleanTitular(raw.titular);

  // 8. Fecha de actualización
  const actualizado_en = raw.actualizado_en ? new Date(raw.actualizado_en) : new Date();

  return {
    success: true,
    data: {
      id: idResult.id,
      nombre: nombreResult.nombre,
      titular,
      monto_musd: montoResult.monto_musd,
      fecha_ingreso: fechaResult.fecha_ingreso,
      region: regionResult.region,
      estado: estadoResult.estado,
      actualizado_en,
    },
  };
}

/**
 Limpieza de duplicados:
  - El mismo proyecto puede llegar más de una vez con el ID escrito distinto (P-0042, p-0042).
  - Si las filas son idénticas, queda una sola.
  - Si difieren, gana la de `actualizado_en` más reciente, sin importar el orden en que llegaron.
  - Los duplicados NO son rechazados: son un solo proyecto válido.
 */
export function deduplicateProjects(projects: CleanProject[]): CleanProject[] {
  const map = new Map<string, CleanProject>();

  for (const project of projects) {
    const existing = map.get(project.id);

    if (!existing) {
      map.set(project.id, project);
    } else {
      // Si ya existe el proyecto, se elije la fecha de actualizado_en más reciente
      const existingTime = existing.actualizado_en.getTime();
      const newTime = project.actualizado_en.getTime();
      if (newTime > existingTime) {
        map.set(project.id, project);
      }
    }
  }

  return Array.from(map.values());
}

