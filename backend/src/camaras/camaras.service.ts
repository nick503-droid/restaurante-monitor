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
  // Ajusta estos valores para controlar el comportamiento de detección
  private readonly PYTHON_CONFIG = {
    umbral_seg: '5',    // segundos sostenidos para disparar alerta
    conf_min: '0.60', // confianza mínima YOLO (0.0 - 1.0)
    cooldown_seg: '300',  // segundos entre alertas del mismo track (5 min)
    max_alertas_hora: '10',   // máximo de alertas por hora por cámara
    clip_pre: '10',   // segundos a grabar ANTES del evento
    clip_post: '20',   // segundos a grabar DESPUÉS del evento
    // roi: ['10', '5', '90', '95'],  // descomenta para limitar zona vigilada
  };

  // ── Limpieza de evidencias ───────────────────────────────────────────
  private readonly EVIDENCIAS_DIR = join(process.cwd(), '..', 'evidencias');
  private readonly DIAS_RETENER = 30;   // borra clips más viejos que esto
  private readonly INTERVALO_LIMPIEZA_H = 24; // revisa cada 24 horas

  constructor(
    private prisma: PrismaService,
    private gateway: EventosGateway,
  ) { }

  // ════════════════════════════════════════════════════════════════════
  //  CICLO DE VIDA
  // ════════════════════════════════════════════════════════════════════

  async onModuleInit() {
    // Espera 2s para que NestJS termine de inicializar
    await new Promise(r => setTimeout(r, 2000));

    const camaras = await this.prisma.camara.findMany({ where: { activa: true } });
    this.logger.log(`Iniciando ${camaras.length} cámara(s) activa(s)`);

    for (const camara of camaras) {
      this.iniciarProceso(camara);
    }

    // Arranca el job de limpieza automática de evidencias
    this.iniciarLimpiezaAutomatica();
  }

  onModuleDestroy() {
    // Detiene todas las cámaras limpiamente
    for (const [id, proceso] of this.procesos) {
      this.logger.log(`Deteniendo cámara ${id}...`);
      proceso.kill('SIGTERM');
    }
    this.procesos.clear();

    // Detiene el job de limpieza
    if (this.limpieza) {
      clearInterval(this.limpieza);
      this.limpieza = null;
    }
  }

  // ════════════════════════════════════════════════════════════════════
  //  GESTIÓN DE PROCESOS PYTHON
  // ════════════════════════════════════════════════════════════════════

  iniciarProceso(camara: any) {
    // Mata el proceso anterior si existe
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

    // ── Argumentos base ──
    const args: string[] = [
      scriptPath,
      '--source', camara.source,
      '--classes', ...clases.map(String),
      '--camara_id', String(camara.id),
      '--backend_url', 'http://localhost:3000',
      '--umbral_seg', this.PYTHON_CONFIG.umbral_seg,
      '--conf_min', this.PYTHON_CONFIG.conf_min,
      '--cooldown_seg', this.PYTHON_CONFIG.cooldown_seg,
      '--max_alertas_hora', this.PYTHON_CONFIG.max_alertas_hora,
      '--clip_pre', this.PYTHON_CONFIG.clip_pre,
      '--clip_post', this.PYTHON_CONFIG.clip_post,
    ];

    // ── ROI opcional ──
    // if (this.PYTHON_CONFIG.roi) {
    //   args.push('--roi', ...this.PYTHON_CONFIG.roi);
    // }

    this.logger.log(`[CAM ${camara.id}] Lanzando Python con: conf≥${this.PYTHON_CONFIG.conf_min} umbral=${this.PYTHON_CONFIG.umbral_seg}s`);

    const proceso = spawn('python', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // ── stdout → WebSocket al frontend ──
    proceso.stdout?.on('data', (data: Buffer) => {
      const lineas = data.toString().split('\n').filter(l => l.trim());
      for (const linea of lineas) {
        this.gateway.emitirLog(camara.id, linea);
      }
    });

    // ── stderr → consola del backend ──
    proceso.stderr?.on('data', (data: Buffer) => {
      const texto = data.toString().trim();
      if (texto) {
        this.logger.error(`[CAM ${camara.id}] ${texto}`);
      }
    });

    // ── Cierre del proceso ──
    proceso.on('close', (code) => {
      this.logger.warn(`[CAM ${camara.id}] Proceso terminó con código ${code}`);
      this.procesos.delete(camara.id);

      // Auto-restart si muere inesperadamente (código distinto de 0 y 1)
      // código 1 = salió por lock duplicado o error de config → no reiniciar
      if (code !== 0 && code !== 1) {
        this.logger.warn(`[CAM ${camara.id}] Reiniciando en 5s...`);
        setTimeout(() => {
          // Verifica que la cámara siga activa antes de reiniciar
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

    // Detiene el proceso actual
    await this.detenerProceso(camaraId);

    // Espera 2s para que la webcam se libere completamente antes de relanzar
    this.logger.log(`[CAM ${camaraId}] Esperando liberación de webcam...`);
    await new Promise(r => setTimeout(r, 2000));

    // Relanza con las nuevas clases
    this.iniciarProceso(camara);

    return camara;
  }

  // ════════════════════════════════════════════════════════════════════
  //  SALUD DEL SISTEMA — para el endpoint de status
  // ════════════════════════════════════════════════════════════════════

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

    // Ejecuta una vez al arrancar (después de 10s para no solapar con el inicio)
    setTimeout(() => this.limpiarEvidenciasAntiguas(), 10_000);

    // Luego cada N horas
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
      // Recorre subcarpetas camara_X/
      const subcarpetas = fs.readdirSync(this.EVIDENCIAS_DIR);

      for (const sub of subcarpetas) {
        const subDir = path.join(this.EVIDENCIAS_DIR, sub);
        if (!fs.statSync(subDir).isDirectory()) continue;

        const archivos = fs.readdirSync(subDir);

        for (const archivo of archivos) {
          if (!archivo.endsWith('.mp4')) continue;

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
      } else {
        this.logger.log(`[Limpieza] Sin clips antiguos que eliminar`);
      }
    } catch (err: any) {
      this.logger.error(`[Limpieza] Error: ${err.message}`);
    }
  }
}