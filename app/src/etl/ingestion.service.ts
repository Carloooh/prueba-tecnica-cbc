import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { SourceApiClient } from './source-api.client.js';
import { cleanRawProject, deduplicateProjects } from './cleaner.js';
import { writeRejectedFile } from './rejected-writer.js';
import { CleanProject, RejectedRecord } from './types.js';
import {
  getChileanIsoTimestamp,
  detectChanges,
  updateChangesFile,
} from './change-tracker.js';
import {
  NewProjectRecord,
  StateChangeRecord,
} from './change-tracker.types.js';

export interface IngestionResult {
  total_fetched: number;
  total_clean: number;
  total_deduplicated: number;
  total_rejected: number;
  nuevos_detectados: number;
  cambios_estado_detectados: number;
  detalle_nuevos: NewProjectRecord[];
  detalle_cambios_estado: StateChangeRecord[];
}

@Injectable()
export class IngestionService implements OnModuleInit {
  private readonly logger = new Logger(IngestionService.name);
  private readonly client: SourceApiClient;
  private readonly rejectedFilePath: string;
  private readonly changesFilePath: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const baseUrl = this.config.getOrThrow<string>('SOURCE_BASE_URL');
    const apiKey = this.config.getOrThrow<string>('SOURCE_API_KEY');
    this.rejectedFilePath = this.config.get<string>(
      'REJECTED_FILE_PATH',
      './data/rejected.json',
    );
    this.changesFilePath = this.config.get<string>(
      'CHANGES_FILE_PATH',
      './data/changes.json',
    );

    this.client = new SourceApiClient({
      baseUrl,
      apiKey,
      timeoutMs: 8000,
      maxRetries: 6,
    });
  }

  // Ejecuta la ingesta automáticamente al arrancar la aplicación si está habilitado.
  async onModuleInit() {
    const autoRun = this.config.get<string>('AUTO_INGEST_ON_STARTUP', 'true');
    if (autoRun === 'true') {
      this.logger.log('Iniciando ingesta automática al arrancar el servicio...');
      // Ejecutar de forma asíncrona sin bloquear el arranque del servidor HTTP
      this.runIngestion().catch((err) => {
        this.logger.error(`Error durante la ingesta automática: ${err.message}`, err.stack);
      });
    }
  }

  /**
   * Proceso ETL completo:
   * 1. Extracción de datos desde mock-api.
   * 2. Limpieza y validación de cada fila según las reglas de negocio.
   * 3. Escritura de registros inválidos en el archivo rejected.json.
   * 4. Limpieza de registros válidos duplicados.
   * 5. Detección de cambios entre ejecuciones (nuevos vs cambio de estado).
   * 6. Persistencia de forma idempotente en SQLite.
   */
  async runIngestion(): Promise<IngestionResult> {
    this.logger.log('--- [Paso 1/5] Extracción: Obteniendo páginas desde mock-api ---');
    const rawItems = await this.client.fetchAllProjects();
    this.logger.log(`[Paso 1/5] Registros descargados: ${rawItems.length}`);

    this.logger.log('--- [Paso 2/5] Limpieza, Validación y Archivo de Rechazados ---');
    const validProjects: CleanProject[] = [];
    const rejections: RejectedRecord[] = [];

    for (const raw of rawItems) {
      const result = cleanRawProject(raw);
      if (result.success) {
        validProjects.push(result.data);
      } else {
        rejections.push(result.rejection);
      }
    }

    this.logger.log(
      `[Paso 2/5] Resultado: ${validProjects.length} válidos | ${rejections.length} inválidos`,
    );

    await writeRejectedFile(this.rejectedFilePath, rejections);
    this.logger.log(`[Paso 2/5] Archivo de rechazados sobrescrito en: ${this.rejectedFilePath}`);

    this.logger.log('--- [Paso 3/5] Deduplicación (conservando actualizado_en más reciente) ---');
    const deduplicated = deduplicateProjects(validProjects);
    this.logger.log(`[Paso 3/5] Proyectos únicos finales tras resolver duplicados: ${deduplicated.length}`);

    this.logger.log('--- [Paso 4/5] Detección de Cambios entre Ejecuciones ---');
    // Consultar proyectos existentes en base de datos antes de aplicar upsert
    const existingInDb = await this.prisma.project.findMany({
      select: { id: true, nombre: true, estado: true },
    });

    const executionTimestamp = getChileanIsoTimestamp();
    const { newProjects, stateChanges } = detectChanges(
      deduplicated,
      existingInDb,
      executionTimestamp,
    );

    this.logger.log(
      `[Paso 4/5] Detección: ${newProjects.length} nuevos | ${stateChanges.length} con cambio de estado`,
    );

    if (stateChanges.length > 0) {
      for (const change of stateChanges) {
        this.logger.log(
          `  -> [${change.id}] ${change.nombre}: "${change.estado_anterior}" -> "${change.estado_nuevo}"`,
        );
      }
    }

    await updateChangesFile(
      this.changesFilePath,
      newProjects,
      stateChanges,
      executionTimestamp,
    );
    this.logger.log(`[Paso 4/5] Archivo de historial de cambios actualizado en: ${this.changesFilePath}`);

    this.logger.log('--- [Paso 5/5] Persistencia en SQLite (Idempotente) ---');
    await this.prisma.$transaction(
      deduplicated.map((p) =>
        this.prisma.project.upsert({
          where: { id: p.id },
          create: {
            id: p.id,
            nombre: p.nombre,
            titular: p.titular,
            region: p.region,
            monto_musd: p.monto_musd,
            fecha_ingreso: p.fecha_ingreso,
            estado: p.estado,
            actualizado_en: p.actualizado_en,
          },
          update: {
            nombre: p.nombre,
            titular: p.titular,
            region: p.region,
            monto_musd: p.monto_musd,
            fecha_ingreso: p.fecha_ingreso,
            estado: p.estado,
            actualizado_en: p.actualizado_en,
          },
        }),
      ),
    );

    this.logger.log('--- Pipeline ETL finalizado con éxito ---');

    return {
      total_fetched: rawItems.length,
      total_clean: validProjects.length,
      total_deduplicated: deduplicated.length,
      total_rejected: rejections.length,
      nuevos_detectados: newProjects.length,
      cambios_estado_detectados: stateChanges.length,
      detalle_nuevos: newProjects,
      detalle_cambios_estado: stateChanges,
    };
  }
}
