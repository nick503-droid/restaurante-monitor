import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });

  // process.cwd() siempre apunta a la carpeta desde donde arrancaste el proceso
  // Si corres "npm run start:dev" desde backend/, process.cwd() = backend/
  // Entonces: backend/ → .. → restaurante-monitor/ → evidencias/
  const evidenciasPath = join(process.cwd(), '..', 'evidencias');
  console.log(`[Static] Sirviendo evidencias desde: ${evidenciasPath}`);

  app.useStaticAssets(evidenciasPath, {
    prefix: '/evidencias',
  });

  await app.listen(3000);
  console.log('Backend corriendo en http://localhost:3000');
}
bootstrap();