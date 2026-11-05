import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module.js';
import { IngestionService } from './ingestion.service.js';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [IngestionService],
  exports: [IngestionService],
})
export class EtlModule {}

