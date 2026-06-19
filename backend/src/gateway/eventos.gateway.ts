// src/gateway/eventos.gateway.ts

import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

// @WebSocketGateway le dice a NestJS que este archivo maneja
// conexiones de WebSocket usando socket.io por debajo.
// cors: le permitimos conexiones desde Vue que corre en puerto 5173
@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*', // En producción cambiarías esto a tu URL real
  },
})
export class EventosGateway {

  // @WebSocketServer() inyecta automáticamente la instancia
  // del servidor socket.io. Con "server" podemos emitir
  // eventos a TODOS los clientes conectados a la vez.
  @WebSocketServer()
  server: Server;

  // Este método lo llamamos desde AlertasService cuando
  // llega una alerta nueva de Python.
  // this.server.emit() envía el evento a TODOS los clientes Vue conectados.
  emitirAlerta(alerta: any) {
    this.server.emit('nuevaAlerta', alerta);
    console.log(`[WS] Alerta emitida al frontend: ${JSON.stringify(alerta.id)}`);
  }

  // Este método reenvía los logs de stdout de Python
  // al frontend para mostrarlos en la terminal visual.
  emitirLog(camaraId: number, linea: string) {
    this.server.emit('logCamara', { camaraId, linea });
  }
}