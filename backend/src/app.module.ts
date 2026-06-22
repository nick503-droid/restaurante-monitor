// src/app.module.ts
import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { EventosGateway } from './gateway/eventos.gateway';
import { AlertasModule } from './alertas/alertas.module';
import { CamarasModule } from './camaras/camaras.module';
import { CatalogoController } from './catalogo/catalogo.controller';
import { ServeStaticModule } from '@nestjs/serve-static'; // ← 1. IMPORTAMOS EL MÓDULO ESTÁTICO
import { join } from 'path'; // ← 2. IMPORTAMOS JOIN PARA MANEJAR RUTAS DE WINDOWS

@Module({
  imports: [
    AlertasModule,
    CamarasModule,
    // 3. LE DECIMOS A NESTJS QUE EXPONGA LA CARPETA DE EVIDENCIAS
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), '..', 'evidencias'), // Sube una carpeta y entra a 'evidencias'
      serveRoot: '/evidencias', // El prefijo que llevará la URL (ej: http://localhost:3000/evidencias/...)
    }),
  ],
  controllers: [CatalogoController],
  providers: [PrismaService, EventosGateway],
})
export class AppModule {}