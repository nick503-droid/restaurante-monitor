// src/alertas/alertas.module.ts
import { Module } from '@nestjs/common';
import { AlertasService } from './alertas.service';
import { AlertasController } from './alertas.controller';
import { PrismaService } from '../prisma.service';
import { EventosGateway } from '../gateway/eventos.gateway';

@Module({
  controllers: [AlertasController],
  providers: [AlertasService, PrismaService, EventosGateway],
})
export class AlertasModule {}