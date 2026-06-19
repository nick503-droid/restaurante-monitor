import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EventosGateway } from '../gateway/eventos.gateway';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';

@Injectable()
export class CamarasService implements OnModuleInit, OnModuleDestroy {
  private procesos = new Map<number, ChildProcess>();

  constructor(
    private prisma: PrismaService,
    private gateway: EventosGateway,
  ) {}

  async onModuleInit() {
    // Esperamos 2 segundos para que NestJS termine de inicializar todo
    // antes de lanzar los procesos de Python
    await new Promise(r => setTimeout(r, 2000));

    const camaras = await this.prisma.camara.findMany({
      where: { activa: true },
    });

    console.log(`[Cámaras] Encontradas ${camaras.length} cámara(s) activa(s)`);

    for (const camara of camaras) {
      this.iniciarProceso(camara);
    }
  }

  onModuleDestroy() {
    for (const [id, proceso] of this.procesos) {
      console.log(`[Cámaras] Deteniendo cámara ${id}...`);
      proceso.kill('SIGTERM');
    }
    this.procesos.clear();
  }

  iniciarProceso(camara: any) {
    // Si ya hay un proceso corriendo para esta cámara, lo matamos primero
    if (this.procesos.has(camara.id)) {
      console.log(`[CAM ${camara.id}] Matando proceso anterior...`);
      this.procesos.get(camara.id)?.kill('SIGTERM');
      this.procesos.delete(camara.id);
    }

    const clases: number[] = JSON.parse(camara.clases_vigilar || '[]');

    if (clases.length === 0) {
      console.log(`[CAM ${camara.id}] Sin clases configuradas, omitiendo`);
      return;
    }

    const scriptPath = join(process.cwd(), '..', 'ia', 'visor_camaras.py');

    const args = [
      scriptPath,
      '--source',      camara.source,
      '--classes',     ...clases.map(String),
      '--camara_id',   String(camara.id),
      '--backend_url', 'http://localhost:3000',
    ];

    console.log(`[CAM ${camara.id}] Iniciando proceso Python...`);

    const proceso = spawn('python', args, {
      // stdio: pipe captura stdout y stderr para reenviarlos por WebSocket
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proceso.stdout.on('data', (data: Buffer) => {
      const lineas = data.toString().split('\n').filter(l => l.trim());
      for (const linea of lineas) {
        this.gateway.emitirLog(camara.id, linea);
      }
    });

    proceso.stderr.on('data', (data: Buffer) => {
      const texto = data.toString().trim();
      if (texto) {
        console.error(`[CAM ${camara.id} ERR] ${texto}`);
      }
    });

    proceso.on('close', (code) => {
      console.log(`[CAM ${camara.id}] Proceso terminó con código ${code}`);
      this.procesos.delete(camara.id);
    });

    this.procesos.set(camara.id, proceso);
  }

  async detenerProceso(camaraId: number) {
    const proceso = this.procesos.get(camaraId);
    if (proceso) {
      proceso.kill('SIGTERM');
      this.procesos.delete(camaraId);
      console.log(`[CAM ${camaraId}] Proceso detenido`);
    }
  }

  async listar() {
    return this.prisma.camara.findMany();
  }

  async actualizarClases(camaraId: number, clasesIds: number[]) {
    const camara = await this.prisma.camara.update({
      where: { id: camaraId },
      data:  { clases_vigilar: JSON.stringify(clasesIds) },
    });

    await this.detenerProceso(camaraId);
    // Esperamos 1.5s para que la webcam se libere antes de relanzar
    await new Promise(r => setTimeout(r, 1500));
    this.iniciarProceso(camara);

    return camara;
  }
}