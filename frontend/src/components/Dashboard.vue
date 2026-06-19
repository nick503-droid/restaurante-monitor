<template>
  <div class="min-h-screen bg-slate-50 text-slate-800 p-6 space-y-6">

    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-slate-700">Monitor de Higiene</h1>
        <p class="text-slate-400 text-sm mt-1">Restaurante — En vivo</p>
      </div>
      <div class="flex items-center gap-2 bg-white border border-slate-200 rounded-full px-3 py-1.5">
        <div
          class="w-2 h-2 rounded-full"
          :class="conectado ? 'bg-teal-400 animate-pulse' : 'bg-rose-400'"
        ></div>
        <span class="text-sm" :class="conectado ? 'text-teal-600' : 'text-rose-500'">
          {{ conectado ? 'Conectado' : 'Desconectado' }}
        </span>
      </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-3 gap-4">
      <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <p class="text-slate-400 text-xs">Alertas registradas</p>
        <p class="text-3xl font-bold text-slate-700 mt-1">{{ alertas.length }}</p>
      </div>
      <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <p class="text-slate-400 text-xs">Última detección</p>
        <p class="text-sm font-medium text-slate-700 mt-1">
          {{ alertas[0] ? formatHora(alertas[0].timestamp) : '—' }}
        </p>
      </div>
      <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <p class="text-slate-400 text-xs">Cámara activa</p>
        <p class="text-sm font-medium text-teal-600 mt-1">Cocina Principal</p>
      </div>
    </div>

    <!-- Panel principal -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

      <!-- Alertas -->
      <div class="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div class="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 class="font-semibold text-slate-700">Infracciones detectadas</h2>
          <span class="text-xs bg-rose-50 text-rose-400 border border-rose-100 px-2 py-0.5 rounded-full">
            {{ alertas.length }} registros
          </span>
        </div>

        <div class="divide-y divide-slate-50 max-h-96 overflow-y-auto">
          <!-- Cada alerta es clickeable y lleva al detalle con el video -->
          <div
            v-for="alerta in alertas"
            :key="alerta.id"
            @click="$router.push(`/alerta/${alerta.id}`)"
            class="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="flex items-center gap-2">
                  <p class="font-medium text-rose-500">
                    {{ alerta.catalogoClase?.nombre ?? 'Clase ' + alerta.catalogoClaseId }}
                  </p>
                  <!-- Indicador de si tiene clip de video -->
                  <span
                    v-if="alerta.rutaClip"
                    class="text-xs bg-teal-50 text-teal-600 border border-teal-100
                           px-1.5 py-0.5 rounded-full"
                  >
                    🎬 video
                  </span>
                </div>
                <p class="text-sm text-slate-400 mt-0.5">
                  📷 {{ alerta.camara?.nombre }}
                </p>
                <div class="flex gap-3 mt-1">
                  <span class="text-xs text-slate-400">
                    Confianza: {{ (alerta.confianza * 100).toFixed(0) }}%
                  </span>
                  <span class="text-xs text-slate-400">
                    Duración: {{ alerta.duracion_seg.toFixed(1) }}s
                  </span>
                </div>
              </div>
              <div class="flex flex-col items-end gap-1">
                <span class="text-xs text-slate-400 whitespace-nowrap">
                  {{ formatHora(alerta.timestamp) }}
                </span>
                <span class="text-xs text-slate-300">Ver detalle →</span>
              </div>
            </div>
          </div>

          <div v-if="alertas.length === 0" class="p-8 text-center text-slate-300">
            Sin infracciones detectadas
          </div>
        </div>
      </div>

      <!-- Terminal -->
      <div class="bg-slate-800 rounded-xl border border-slate-700 shadow-sm">
        <div class="p-3 border-b border-slate-700 flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-rose-400"></div>
          <div class="w-3 h-3 rounded-full bg-amber-400"></div>
          <div class="w-3 h-3 rounded-full bg-teal-400"></div>
          <span class="text-slate-500 text-xs ml-2 font-mono">Python AI — stdout</span>
        </div>
        <div
          ref="terminalRef"
          class="h-96 overflow-y-auto p-4 font-mono text-xs leading-5"
        >
          <div
            v-for="(linea, i) in logs"
            :key="i"
            :class="colorLinea(linea)"
          >{{ linea }}</div>
          <div v-if="logs.length === 0" class="text-slate-600">
            Esperando logs...
          </div>
        </div>
      </div>

    </div>

    <!-- Configuración -->
    <ConfiguracionCamaras />

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { io, Socket } from 'socket.io-client'
import { useRouter } from 'vue-router'
import ConfiguracionCamaras from './ConfiguracionCamaras.vue'

const router     = useRouter()
const alertas    = ref<any[]>([])
const logs       = ref<string[]>([])
const conectado  = ref(false)
const terminalRef = ref<HTMLElement | null>(null)
let socket: Socket | null = null

const formatHora = (ts: string) =>
  new Date(ts).toLocaleTimeString('es-SV')

const colorLinea = (linea: string) => {
  if (linea.includes('[ALERTA]')) return 'text-rose-400'
  if (linea.includes('[ERROR]'))  return 'text-amber-400'
  if (linea.includes('[FPS]'))    return 'text-teal-400'
  if (linea.includes('[TRACK]'))  return 'text-sky-400'
  if (linea.includes('[API]'))    return 'text-violet-400'
  if (linea.includes('[CLIP]'))   return 'text-amber-300'
  if (linea.includes('[YOLO]'))   return 'text-slate-300'
  return 'text-slate-500'
}

const scrollTerminal = () => {
  nextTick(() => {
    if (terminalRef.value)
      terminalRef.value.scrollTop = terminalRef.value.scrollHeight
  })
}

onMounted(async () => {
  try {
    const res = await fetch('http://localhost:3000/api/alertas')
    alertas.value = await res.json()
  } catch {
    console.error('No se pudo conectar al backend')
  }

  socket = io('http://localhost:3000', {
    transports: ['websocket', 'polling'],
  })

  socket.on('connect', () => {
    conectado.value = true
    logs.value.push('[WS] Conectado al servidor ✓')
  })

  socket.on('disconnect', () => {
    conectado.value = false
    logs.value.push('[WS] Desconectado')
  })

  socket.on('nuevaAlerta', (alerta: any) => {
    alertas.value.unshift(alerta)
    if (alertas.value.length > 100) alertas.value.pop()
  })

  socket.on('logCamara', ({ camaraId, linea }: any) => {
    logs.value.push(`[CAM-${camaraId}] ${linea}`)
    if (logs.value.length > 300) logs.value.shift()
    scrollTerminal()
  })
})

onUnmounted(() => {
  socket?.disconnect()
})
</script>