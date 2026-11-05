import { RawProject } from './types.js';

// Estructura de respuesta de cada página de la fuente de datos
export interface SourcePageResponse {
  items: RawProject[];
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
}

// Estructura de configuración para el cliente HTTP de la fuente
export interface SourceClientConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  maxRetries?: number;
  initialBackoffMs?: number;
}

/**
 Cliente HTTP para consultar mock-api:
 * - Soporta reintentos automáticos ante 429 respetando Retry-After.
 * - Soporta reintentos con backoff exponencial ante 500.
 * - No reintenta ante errores de configuración (401) o cliente (400).
 */
export class SourceApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly initialBackoffMs: number;

  constructor(config: SourceClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? 5000;
    this.maxRetries = config.maxRetries ?? 5;
    this.initialBackoffMs = config.initialBackoffMs ?? 500;
  }

  // Helper para esperar N milisegundos.
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Obtiene una página específica con reintentos inteligentes.
  async fetchPage(page: number, pageSize: number = 20): Promise<SourcePageResponse> {
    const url = `${this.baseUrl}/api/v1/proyectos?page=${page}&page_size=${pageSize}`;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'X-API-Key': this.apiKey,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Respuesta exitosa
        if (response.ok) {
          const data = (await response.json()) as SourcePageResponse;
          return data;
        }

        // Errores que NO se reintentan
        if (response.status === 401 || response.status === 400) {
          throw new Error(
            `Error de fuente ${response.status}: no se puede reintentar (clave o parámetros inválidos)`,
          );
        }

        // Error 429: Too Many Requests -> respetar cabecera Retry-After
        if (response.status === 429) {
          const retryAfterHeader = response.headers.get('Retry-After');
          const waitSeconds = retryAfterHeader ? parseFloat(retryAfterHeader) : 1;
          const waitMs = Math.max(waitSeconds * 1000, 200);

          attempt++;
          if (attempt > this.maxRetries) {
            throw new Error(`Máximo de reintentos superado tras 429 en página ${page}`);
          }

          await this.sleep(waitMs);
          continue;
        }

        // Error 500 o 5xx -> Backoff exponencial
        if (response.status >= 500) {
          attempt++;
          if (attempt > this.maxRetries) {
            throw new Error(`Máximo de reintentos superado tras ${response.status} en página ${page}`);
          }

          // Backoff exponencial: 500ms, 1000ms, 2000ms...
          const waitMs = this.initialBackoffMs * Math.pow(2, attempt - 1);
          await this.sleep(waitMs);
          continue;
        }

        // Cualquier otro código obtenido no esperado
        throw new Error(`Respuesta HTTP inesperada de la fuente: ${response.status}`);
      } catch (error: any) {
        // Si fue abort por timeout o error de red, reintentar si no excedió los intentos
        if (error.name === 'AbortError' || error.name === 'TypeError') {
          attempt++;
          if (attempt > this.maxRetries) {
            throw new Error(
              `Falla de red/timeout persistente en página ${page}: ${error.message}`,
            );
          }
          const waitMs = this.initialBackoffMs * Math.pow(2, attempt - 1);
          await this.sleep(waitMs);
          continue;
        }

        // Re-lanzar si es error no reintentable (ej: 401/400)
        throw error;
      }
    }

    throw new Error(`No se pudo obtener la página ${page} tras reintentos.`);
  }

  // Recorrer todas las páginas dinámicamente hasta obtener todos los proyectos.
  async fetchAllProjects(pageSize: number = 20): Promise<RawProject[]> {
    const allItems: RawProject[] = [];
    let currentPage = 1;
    let totalPages = 1;

    do {
      const pageData = await this.fetchPage(currentPage, pageSize);
      totalPages = pageData.total_pages;

      if (pageData.items && pageData.items.length > 0) {
        allItems.push(...pageData.items);
      }

      currentPage++;
    } while (currentPage <= totalPages);

    return allItems;
  }
}

