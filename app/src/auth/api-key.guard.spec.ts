import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiKeyGuard } from './api-key.guard.js';
import { UnauthorizedException } from '@nestjs/common';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let mockConfigService: any;

  beforeEach(() => {
    mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === 'API_KEY') return 'dev-api-key';
        return undefined;
      }),
    };
    guard = new ApiKeyGuard(mockConfigService);
  });

  function createMockContext(headers: Record<string, string>): any {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    };
  }

  it('debe permitir el acceso si la cabecera x-api-key coincide con la variable API_KEY', () => {
    const context = createMockContext({ 'x-api-key': 'dev-api-key' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('debe permitir el acceso si la cabecera X-API-Key (con mayúsculas) coincide', () => {
    const context = createMockContext({ 'X-API-Key': 'dev-api-key' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('debe lanzar UnauthorizedException si la cabecera no viene', () => {
    const context = createMockContext({});
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('debe lanzar UnauthorizedException si la clave es incorrecta', () => {
    const context = createMockContext({ 'x-api-key': 'clave-falsa' });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});

