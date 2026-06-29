import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EventosGateway } from '../gateway/eventos.gateway';
import * as nodemailer from 'nodemailer';

@Injectable()
export class AlertasService {
  // Usamos el Logger nativo de NestJS para la consola
  private readonly logger = new Logger(AlertasService.name);

  constructor(
    private prisma: PrismaService,
    private gateway: EventosGateway,
  ) { }

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
        camaraId: dto.camaraId,
        catalogoClaseId: catalogoClase.id,
        confianza: dto.confianza,
        duracion_seg: dto.duracion_seg,
        rutaClip: dto.rutaClip ?? null,
      },
      include: {
        camara: true,
        catalogoClase: true,
      },
    });

    this.gateway.emitirAlerta(alerta);

    // 🔥 CREDENCIALES RESTAURADAS DIRECTAMENTE PARA LA DEMO 🔥
    const TELEGRAM_TOKEN = '8952522238:AAG3AG2HEqMWXBqRvEGhtg4OKiQSnQLF4Lc';
    const CHAT_ID = '8862401955';
    
    const EMAIL_USER = 'walteredenilsonramirezderas@gmail.com';
    const EMAIL_PASS = 'fjadrclmkktabdoz';
    const EMAIL_DESTINO = 'nicky70022040@gmail.com';

    const mensaje = `🚨 *NUEVA INFRACCIÓN DETECTADA*\n\n` +
      `📷 *Cámara:* ${alerta.camara.nombre}\n` +
      `⚠️ *Infracción:* ${alerta.catalogoClase.nombre}\n` +
      `📊 *Confianza:* ${(alerta.confianza * 100).toFixed(1)}%\n` +
      `⏱️ *Duración:* ${alerta.duracion_seg.toFixed(1)}s`;

    // 🔥 1. MAGIA DE TELEGRAM 🔥
    try {
      if (alerta.rutaClip) {
        // Ruta original restaurada para no romper tu entorno
        const rutaAbsoluta = path.join(process.cwd(), '..', alerta.rutaClip);

        if (fs.existsSync(rutaAbsoluta)) {
          this.logger.log(`[Telegram] Adjuntando video: ${rutaAbsoluta}`);
          const fileBuffer = fs.readFileSync(rutaAbsoluta);
          const blob = new Blob([fileBuffer as any], { type: 'video/webm' });

          const formData = new FormData();
          formData.append('chat_id', CHAT_ID);
          formData.append('caption', mensaje);
          formData.append('parse_mode', 'Markdown');
          formData.append('video', blob, 'infraccion.webm');

          const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendVideo`, {
            method: 'POST',
            body: formData
          });

          const data = await response.json();
          if (!data.ok) this.logger.error(`❌ [Telegram] Falló el video: ${data.description}`);
          else this.logger.log('✅ [Telegram] ¡Video entregado con éxito!');
        }
      } else {
        this.logger.log('[Telegram] No se encontró video, enviando solo texto...');
        const responseTxt = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: CHAT_ID, text: mensaje, parse_mode: 'Markdown' })
        });
        const dataTxt = await responseTxt.json();
        if (!dataTxt.ok) this.logger.error(`❌ [Telegram] Falló el texto: ${dataTxt.description}`);
      }
    } catch (error) {
      this.logger.error('❌ [Telegram] Error crítico de red:', error);
    }

    // ✉️ 2. MAGIA DE CORREO ELECTRÓNICO (SMTP) ✉️
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: EMAIL_USER, pass: EMAIL_PASS },
      });

      const mailOptions: any = {
        from: `"Sistema CCTV IA" <${EMAIL_USER}>`,
        to: EMAIL_DESTINO,
        subject: `[${alerta.camara.nombre}] 🚨 Infracción: ${alerta.catalogoClase.nombre}`,
        text: `Hola Jefe,\n\nSe ha detectado una nueva incidencia en el sistema automático:\n\n` +
          `Cámara: ${alerta.camara.nombre}\n` +
          `Confianza de la IA: ${(alerta.confianza * 100).toFixed(1)}%\n` +
          `Duración: ${alerta.duracion_seg.toFixed(1)}s\n\n` +
          `Adjunto encontrará el videoclip de evidencia.`,
        attachments: [],
      };

      if (alerta.rutaClip) {
        const rutaAbsoluta = path.join(process.cwd(), '..', alerta.rutaClip);
        if (fs.existsSync(rutaAbsoluta)) {
          mailOptions.attachments.push({
            filename: 'evidencia_infraccion.webm',
            path: rutaAbsoluta,
          });
          this.logger.log('[Email] Video adjuntado correctamente al correo.');
        }
      }

      await transporter.sendMail(mailOptions);
      this.logger.log('✅ [Email] ¡Reporte enviado por correo exitosamente!');
    } catch (error) {
      this.logger.error('❌ [Email] Error al enviar el correo:', error);
    }

    return alerta;
  }

  async listarRecientes() {
    return this.prisma.alertaInfraccion.findMany({
      take: 50,
      orderBy: { timestamp: 'desc' },
      include: { camara: true, catalogoClase: true },
    });
  }

  async obtenerPorId(id: number) {
    return this.prisma.alertaInfraccion.findUnique({
      where: { id },
      include: { camara: true, catalogoClase: true },
    });
  }

  async listarTodas() {
    return this.prisma.alertaInfraccion.findMany({
      orderBy: { timestamp: 'desc' },
      include: { camara: true, catalogoClase: true },
    });
  }
}