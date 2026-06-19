import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { AlertasService } from './alertas.service';

@Controller('api/alertas')
export class AlertasController {
  constructor(private readonly alertasService: AlertasService) { }

  // Python llama esto cuando detecta una infracción
  @Post()
  crear(@Body() body: {
    camaraId: number;
    catalogoClaseId: number;
    confianza: number;
    duracion_seg: number;
    rutaClip?: string;
  }) {
    return this.alertasService.crearAlerta(body);
  }

  @Get()
  listar() {
    return this.alertasService.listarRecientes();
  }

  @Get(':id')
  obtener(@Param('id') id: string) {
    return this.alertasService.obtenerPorId(Number(id));
  }
}