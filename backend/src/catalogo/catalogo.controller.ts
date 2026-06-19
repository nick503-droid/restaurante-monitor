// src/catalogo/catalogo.controller.ts
import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Controller('api/catalogo')
export class CatalogoController {
  constructor(private prisma: PrismaService) {}

  // Vue necesita esto para mostrar los checkboxes de clases
  @Get()
  listar() {
    return this.prisma.catalogoClase.findMany({
      orderBy: { clase_id: 'asc' },
    });
  }
}