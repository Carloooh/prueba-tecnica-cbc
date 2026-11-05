import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SourceApiClient } from './source-api.client.js';

describe('SourceApiClient', () => {
  const baseUrl = 'http://localhost:8001';
  const apiKey = 'dev-source-key';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('debe obtener los items exitosamente en status 200', async () => {
    const mockData = {
      items: [{ id: 'P-0001', nombre: 'Test' }],
      page: 1,
      page_size: 20,
      total_items: 1,
      total_pages: 1,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    } as any);

    const client = new SourceApiClient({ baseUrl, apiKey });
    const result = await client.fetchPage(1);

    expect(result).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8001/api/v1/proyectos?page=1&page_size=20',
      expect.objectContaining({
        headers: {
          'X-API-Key': apiKey,
          Accept: 'application/json',
        },
      }),
    );
  });

  it('debe fallar sin reintentar ante 401 (error de credenciales)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    } as any);

    const client = new SourceApiClient({ baseUrl, apiKey });
    await expect(client.fetchPage(1)).rejects.toThrow(/401/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('debe reintentar y esperar el tiempo indicado ante 429 Retry-After', async () => {
    const mockSuccess = {
      items: [{ id: 'P-0001' }],
      page: 1,
      page_size: 20,
      total_items: 1,
      total_pages: 1,
    };

    // Primera llamada da 429, segunda 200
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '0.1' }), // 100ms
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSuccess,
      } as any);

    const client = new SourceApiClient({
      baseUrl,
      apiKey,
      initialBackoffMs: 10,
    });

    const result = await client.fetchPage(1);
    expect(result).toEqual(mockSuccess);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('debe reintentar con backoff ante error 500', async () => {
    const mockSuccess = {
      items: [{ id: 'P-0001' }],
      page: 1,
      page_size: 20,
      total_items: 1,
      total_pages: 1,
    };

    // Primera llamada da 500, segunda 200
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSuccess,
      } as any);

    const client = new SourceApiClient({
      baseUrl,
      apiKey,
      initialBackoffMs: 10,
    });

    const result = await client.fetchPage(1);
    expect(result).toEqual(mockSuccess);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('debe recorrer todas las páginas con fetchAllProjects', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [{ id: 'P-0001' }, { id: 'P-0002' }],
          page: 1,
          page_size: 2,
          total_items: 3,
          total_pages: 2,
        }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [{ id: 'P-0003' }],
          page: 2,
          page_size: 2,
          total_items: 3,
          total_pages: 2,
        }),
      } as any);

    const client = new SourceApiClient({ baseUrl, apiKey });
    const all = await client.fetchAllProjects(2);

    expect(all).toHaveLength(3);
    expect(all.map((p) => p.id)).toEqual(['P-0001', 'P-0002', 'P-0003']);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

