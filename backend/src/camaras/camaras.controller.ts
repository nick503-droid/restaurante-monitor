// src/camaras/camaras.controller.ts
import { Controller, Get, Patch, Param, Body } from '@nestjs/common';
import { CamarasService } from './camaras.service';

@Controller('api/camaras')
export class CamarasController {
  constructor(private readonly camarasService: CamarasService) {}

  @Get()
  listar() {
    return this.camarasService.listar();
  }

  // Vue llama esto cuando el usuario cambia los checkboxes de clases
  @Patch(':id/clases')
  actualizarClases(
    @Param('id') id: string,
    @Body() body: { clasesIds: number[] },
  ) {
    return this.camarasService.actualizarClases(Number(id), body.clasesIds);
  }
}