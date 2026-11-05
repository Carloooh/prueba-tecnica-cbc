import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKeyHeader =
      request.headers['x-api-key'] || request.headers['X-API-Key'];

    // Se lee de la variable de entorno API_KEY (definida en .env)
    const expectedApiKey = this.config.get<string>('API_KEY');

    if (!apiKeyHeader || apiKeyHeader !== expectedApiKey) {
      throw new UnauthorizedException('API key inválida o ausente');
    }

    return true;
  }
}

