// src/app.module.ts
import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { EventosGateway } from './gateway/eventos.gateway';
import { AlertasModule } from './alertas/alertas.module';
import { CamarasModule } from './camaras/camaras.module';
import { CatalogoController } from './catalogo/catalogo.controller';

@Module({
  imports: [
    AlertasModule,
    CamarasModule,
  ],
  controllers: [CatalogoController],
  providers: [PrismaService, EventosGateway],
})
export class AppModule {}