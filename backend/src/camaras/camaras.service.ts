// src/camaras/camaras.service.ts
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EventosGateway } from '../gateway/eventos.gateway';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class CamarasService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CamarasService.name);
  private procesos = new Map<number, ChildProcess>();
  private limpieza: NodeJS.Timeout | null = null;

  // ── Configuración de parámetros Python ──────────────────────────────
  private readonly PYTHON_CONFIG = {
    umbral_seg: '5',
    conf_min: '0.60',
    cooldown_seg: '300',
    max_alertas_hora: '10',
    clip_pre: '10',
    clip_post: '20',
    // roi: ['10', '5', '90', '95'],  
  };

  // ── Limpieza de evidencias ───────────────────────────────────────────
  private readonly EVIDENCIAS_DIR = join(process.cwd(), '..', 'evidencias');
  private readonly DIAS_RETENER = 30;
  private readonly INTERVALO_LIMPIEZA_H = 24;

  constructor(
    private prisma: PrismaService,
    private gateway: EventosGateway,
  ) { }

  // ════════════════════════════════════════════════════════════════════
  //  CICLO DE VIDA
  // ════════════════════════════════════════════════════════════════════

  async onModuleInit() {
    await new Promise(r => setTimeout(r, 2000));

    const camaras = await this.prisma.camara.findMany({ where: { activa: true } });
    this.logger.log(`Iniciando ${camaras.length} cámara(s) activa(s)`);

    for (const camara of camaras) {
      this.iniciarProceso(camara);
    }

    this.iniciarLimpiezaAutomatica();
  }

  onModuleDestroy() {
    for (const [id, proceso] of this.procesos) {
      this.logger.log(`Deteniendo cámara ${id}...`);
      proceso.kill('SIGTERM');
    }
    this.procesos.clear();

    if (this.limpieza) {
      clearInterval(this.limpieza);
      this.limpieza = null;
    }
  }

  // ════════════════════════════════════════════════════════════════════
  //  GESTIÓN DE PROCESOS PYTHON
  // ════════════════════════════════════════════════════════════════════

  iniciarProceso(camara: any) {
    if (this.procesos.has(camara.id)) {
      this.logger.log(`[CAM ${camara.id}] Matando proceso anterior...`);
      this.procesos.get(camara.id)?.kill('SIGTERM');
      this.procesos.delete(camara.id);
    }

    const clases: number[] = JSON.parse(camara.clases_vigilar || '[]');

    if (clases.length === 0) {
      this.logger.warn(`[CAM ${camara.id}] Sin clases configuradas, omitiendo`);
      return;
    }

    const scriptPath = join(process.cwd(), '..', 'ia', 'visor_camaras.py');

    // 🔥 Calculamos el puerto de streaming para esta cámara (Ej: puerto 5001)
    const streamPort = 5000 + camara.id;

    // ── Argumentos base ──
    const args: string[] = [
      scriptPath,
      '--source', camara.source,
      '--classes', ...clases.map(String),
      '--camara_id', String(camara.id),
      '--backend_url', 'http://localhost:3000',
      '--stream_port', String(streamPort), // 🔥 AÑADIMOS LA BANDERA AL SCRIPT DE PYTHON
      '--umbral_seg', this.PYTHON_CONFIG.umbral_seg,
      '--conf_min', this.PYTHON_CONFIG.conf_min,
      '--cooldown_seg', this.PYTHON_CONFIG.cooldown_seg,
      '--max_alertas_hora', this.PYTHON_CONFIG.max_alertas_hora,
      '--clip_pre', this.PYTHON_CONFIG.clip_pre,
      '--clip_post', this.PYTHON_CONFIG.clip_post,
    ];

    this.logger.log(`[CAM ${camara.id}] Lanzando Python (Puerto en vivo: ${streamPort})`);

    const proceso = spawn('python', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proceso.stdout?.on('data', (data: Buffer) => {
      const lineas = data.toString().split('\n').filter(l => l.trim());
      for (const linea of lineas) {
        this.gateway.emitirLog(camara.id, linea);
      }
    });

    proceso.stderr?.on('data', (data: Buffer) => {
      const texto = data.toString().trim();
      if (texto) {
        this.logger.error(`[CAM ${camara.id}] ${texto}`);
      }
    });

    proceso.on('close', (code) => {
      this.logger.warn(`[CAM ${camara.id}] Proceso terminó con código ${code}`);
      this.procesos.delete(camara.id);

      if (code !== 0 && code !== 1) {
        this.logger.warn(`[CAM ${camara.id}] Reiniciando en 5s...`);
        setTimeout(() => {
          this.prisma.camara.findUnique({ where: { id: camara.id } })
            .then(cam => {
              if (cam?.activa) {
                this.logger.log(`[CAM ${camara.id}] Auto-restart`);
                this.iniciarProceso(cam);
              }
            })
            .catch(() => { });
        }, 5000);
      }
    });

    proceso.on('error', (err) => {
      this.logger.error(`[CAM ${camara.id}] Error al lanzar proceso: ${err.message}`);
    });

    this.procesos.set(camara.id, proceso);
  }

  async detenerProceso(camaraId: number) {
    const proceso = this.procesos.get(camaraId);
    if (proceso) {
      proceso.kill('SIGTERM');
      this.procesos.delete(camaraId);
      this.logger.log(`[CAM ${camaraId}] Proceso detenido`);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  //  ENDPOINTS
  // ════════════════════════════════════════════════════════════════════

  async listar() {
    return this.prisma.camara.findMany();
  }

  async actualizarClases(camaraId: number, clasesIds: number[]) {
    const camara = await this.prisma.camara.update({
      where: { id: camaraId },
      data: { clases_vigilar: JSON.stringify(clasesIds) },
    });

    await this.detenerProceso(camaraId);
    this.logger.log(`[CAM ${camaraId}] Esperando liberación de webcam...`);
    await new Promise(r => setTimeout(r, 2000));
    this.iniciarProceso(camara);

    return camara;
  }

  obtenerEstado() {
    const estado: Record<number, any> = {};
    for (const [id, proceso] of this.procesos) {
      estado[id] = {
        pid: proceso.pid,
        activo: !proceso.killed,
      };
    }
    return {
      camaras_activas: this.procesos.size,
      procesos: estado,
      timestamp: new Date().toISOString(),
    };
  }

  // ════════════════════════════════════════════════════════════════════
  //  LIMPIEZA AUTOMÁTICA DE EVIDENCIAS
  // ════════════════════════════════════════════════════════════════════

  private iniciarLimpiezaAutomatica() {
    const intervaloMs = this.INTERVALO_LIMPIEZA_H * 60 * 60 * 1000;
    setTimeout(() => this.limpiarEvidenciasAntiguas(), 10_000);
    this.limpieza = setInterval(
      () => this.limpiarEvidenciasAntiguas(),
      intervaloMs,
    );
    this.logger.log(
      `[Limpieza] Job programado cada ${this.INTERVALO_LIMPIEZA_H}h — ` +
      `borra clips de más de ${this.DIAS_RETENER} días`,
    );
  }

  private limpiarEvidenciasAntiguas() {
    if (!fs.existsSync(this.EVIDENCIAS_DIR)) return;

    const ahora = Date.now();
    const limite = this.DIAS_RETENER * 24 * 60 * 60 * 1000;
    let eliminados = 0;
    let liberadosMB = 0;

    try {
      const subcarpetas = fs.readdirSync(this.EVIDENCIAS_DIR);

      for (const sub of subcarpetas) {
        const subDir = path.join(this.EVIDENCIAS_DIR, sub);
        if (!fs.statSync(subDir).isDirectory()) continue;

        const archivos = fs.readdirSync(subDir);

        for (const archivo of archivos) {
          // Soporte tanto para .mp4 antiguos como .webm nuevos
          if (!archivo.endsWith('.mp4') && !archivo.endsWith('.webm')) continue;

          const rutaArchivo = path.join(subDir, archivo);
          const stat = fs.statSync(rutaArchivo);
          const edadMs = ahora - stat.mtimeMs;

          if (edadMs > limite) {
            const sizeMB = stat.size / (1024 * 1024);
            fs.unlinkSync(rutaArchivo);
            eliminados++;
            liberadosMB += sizeMB;
            this.logger.log(`[Limpieza] Eliminado: ${sub}/${archivo} (${sizeMB.toFixed(1)} MB)`);
          }
        }
      }

      if (eliminados > 0) {
        this.logger.log(
          `[Limpieza] ${eliminados} clip(s) eliminados — ` +
          `${liberadosMB.toFixed(1)} MB liberados`,
        );
      }
    } catch (err: any) {
      this.logger.error(`[Limpieza] Error: ${err.message}`);
    }
  }
}