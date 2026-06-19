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

  app.useStaticAssets(join(__dirname, '..', '..', 'evidencias'), {
    prefix: '/evidencias',
  });

  await app.listen(3000);
  console.log('Backend corriendo en http://localhost:3000');
}
bootstrap();