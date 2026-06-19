// src/prisma.service.ts

// Importamos PrismaClient (el cliente generado automáticamente cuando corriste migrate)
// e Injectable/OnModuleInit/OnModuleDestroy de NestJS
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// @Injectable() le dice a NestJS que este servicio puede ser
// "inyectado" en otros servicios — es decir, otros archivos
// pueden pedirlo y NestJS se lo da automáticamente
@Injectable()
export class PrismaService extends PrismaClient
  implements OnModuleInit, OnModuleDestroy {

  // OnModuleInit: NestJS llama esto automáticamente cuando arranca el servidor
  // Aquí abrimos la conexión con SQLite
  async onModuleInit() {
    await this.$connect();
    console.log('Base de datos SQLite conectada ✓');
  }

  // OnModuleDestroy: NestJS llama esto cuando el servidor se apaga
  // Cerramos la conexión limpiamente para no corromper la DB
  async onModuleDestroy() {
    await this.$disconnect();
    console.log('Conexión SQLite cerrada ✓');
  }
}