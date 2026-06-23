import { Controller, Post, Get, Body, Param, Res } from '@nestjs/common';
import { AlertasService } from './alertas.service';
import type { Response } from 'express';
import * as ExcelJS from 'exceljs';

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

  // 🔥 AQUÍ VA EXPORTAR (ARRIBA DEL ID)
  @Get('exportar')
  async exportar(@Res() res: Response) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Alertas');

    ws.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Clase', key: 'clase', width: 15 },
      { header: 'Cámara', key: 'camara', width: 20 },
      { header: 'Confianza', key: 'confianza', width: 12 },
      { header: 'Duración (s)', key: 'duracion', width: 14 },
      { header: 'Timestamp', key: 'timestamp', width: 22 },
      { header: 'Clip', key: 'clip', width: 40 },
    ];

    // Estilo del header
    ws.getRow(1).fill = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: 'FF1E293B' },
    };
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    const alertas = await this.alertasService.listarTodas();

    alertas.forEach(a => {
      ws.addRow({
        id: a.id,
        clase: a.catalogoClase?.nombre ?? '—',
        camara: a.camara?.nombre ?? '—',
        confianza: `${(a.confianza * 100).toFixed(1)}%`,
        duracion: a.duracion_seg.toFixed(1),
        timestamp: new Date(a.timestamp).toLocaleString('es-SV'),
        clip: a.rutaClip ?? 'Sin clip',
      });
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename=alertas.xlsx');

    await wb.xlsx.write(res);
    res.end();
  }

  // 🔥 EL ':id' VA HASTA ABAJO DE TODO
  @Get(':id')
  obtener(@Param('id') id: string) {
    return this.alertasService.obtenerPorId(Number(id));
  }
}