// src/camaras/camaras.module.ts
import { Module } from '@nestjs/common';
import { CamarasService } from './camaras.service';
import { CamarasController } from './camaras.controller';
import { PrismaService } from '../prisma.service';
import { EventosGateway } from '../gateway/eventos.gateway';

@Module({
  controllers: [CamarasController],
  providers: [CamarasService, PrismaService, EventosGateway],
})
export class CamarasModule {}