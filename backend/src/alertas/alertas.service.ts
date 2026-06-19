import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EventosGateway } from '../gateway/eventos.gateway';

@Injectable()
export class AlertasService {
  constructor(
    private prisma: PrismaService,
    private gateway: EventosGateway,
  ) {}

  async crearAlerta(dto: {
    camaraId: number;
    catalogoClaseId: number;
    confianza: number;
    duracion_seg: number;
    rutaClip?: string;
  }) {
    const catalogoClase = await this.prisma.catalogoClase.findUnique({
      where: { clase_id: dto.catalogoClaseId },
    });

    if (!catalogoClase) {
      throw new Error(`Clase ${dto.catalogoClaseId} no encontrada en catálogo`);
    }

    const alerta = await this.prisma.alertaInfraccion.create({
      data: {
        camaraId:        dto.camaraId,
        catalogoClaseId: catalogoClase.id,
        confianza:       dto.confianza,
        duracion_seg:    dto.duracion_seg,
        rutaClip:        dto.rutaClip ?? null,
      },
      include: {
        camara:        true,
        catalogoClase: true,
      },
    });

    this.gateway.emitirAlerta(alerta);
    return alerta;
  }

  async listarRecientes() {
    return this.prisma.alertaInfraccion.findMany({
      take:    50,
      orderBy: { timestamp: 'desc' },
      include: { camara: true, catalogoClase: true },
    });
  }

  async obtenerPorId(id: number) {
    return this.prisma.alertaInfraccion.findUnique({
      where:   { id },
      include: { camara: true, catalogoClase: true },
    });
  }
}