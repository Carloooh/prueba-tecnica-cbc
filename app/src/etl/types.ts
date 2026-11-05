// Datos de entrada
export interface RawProject {
  id?: string;
  nombre?: string;
  titular?: string;
  region?: string;
  monto?: string;
  fecha_ingreso?: string;
  estado?: string;
  actualizado_en?: string;
}

// Projecto limpio, fecha en formato AAAA-MM-DD
export interface CleanProject {
  id: string;
  nombre: string;
  titular: string | null;
  region: string;
  monto_musd: number;
  fecha_ingreso: string;
  estado: string;
  actualizado_en: Date;
}

// Motivos rechazo
export type RejectReason =
  | 'id_vacio'
  | 'nombre_vacio'
  | 'monto_invalido'
  | 'monto_negativo'
  | 'fecha_invalida'
  | 'region_desconocida'
  | 'estado_desconocido';

// Estrcuttura registro rechazado
export interface RejectedRecord {
  id: string;
  nombre: string;
  motivo: RejectReason;
}

// Resultado al procesar un registro
export type CleanResult =
  | { success: true; data: CleanProject }
  | { success: false; rejection: RejectedRecord };

