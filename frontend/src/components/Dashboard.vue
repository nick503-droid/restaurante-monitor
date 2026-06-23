<template>
  <div class="min-h-screen bg-slate-50 text-slate-800 p-6 space-y-6">

    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-slate-700">Monitor de Higiene</h1>
        <p class="text-slate-400 text-sm mt-1">Restaurante — En vivo</p>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2 bg-white border border-slate-200 rounded-full px-3 py-1.5">
          <div class="w-2 h-2 rounded-full"
            :class="conectado ? 'bg-teal-400 animate-pulse' : 'bg-rose-400'"></div>
          <span class="text-sm" :class="conectado ? 'text-teal-600' : 'text-rose-500'">
            {{ conectado ? 'Conectado' : 'Desconectado' }}
          </span>
        </div>
        <button @click="vistaActual = vistaActual === 'dashboard' ? 'estadisticas' : 'dashboard'"
          class="bg-white border border-slate-200 rounded-full px-3 py-1.5 text-sm text-slate-600
                 hover:bg-slate-50 transition-colors">
          {{ vistaActual === 'dashboard' ? '📊 Estadísticas' : '← Dashboard' }}
        </button>
        <a href="http://localhost:3000/api/alertas/exportar" download class="bg-emerald-500 hover:bg-emerald-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors font-semibold shadow-md">
        📥 Exportar a Excel
      </a>
      </div>
    </div>

    <template v-if="vistaActual === 'dashboard'">

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p class="text-slate-400 text-xs">Total alertas</p>
          <p class="text-3xl font-bold text-slate-700 mt-1">{{ alertas.length }}</p>
        </div>
        <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p class="text-slate-400 text-xs">Hoy</p>
          <p class="text-3xl font-bold text-rose-500 mt-1">{{ alertasHoy }}</p>
        </div>
        <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p class="text-slate-400 text-xs">Última detección</p>
          <p class="text-sm font-medium text-slate-700 mt-1">
            {{ alertas[0] ? formatHora(alertas[0].timestamp) : '—' }}
          </p>
        </div>
        <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p class="text-slate-400 text-xs">Clase más frecuente</p>
          <p class="text-sm font-medium text-amber-600 mt-1">{{ claseMasFrecuente }}</p>
        </div>
      </div>

      <CCTV />

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <div class="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div class="p-4 border-b border-slate-100 space-y-3">
            <div class="flex items-center justify-between">
              <h2 class="font-semibold text-slate-700">Infracciones detectadas</h2>
              <span class="text-xs bg-rose-50 text-rose-400 border border-rose-100 px-2 py-0.5 rounded-full">
                {{ alertasFiltradas.length }} resultados
              </span>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <select v-model="filtroClase"
                class="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white">
                <option value="">Todas las clases</option>
                <option v-for="c in clasesUnicas" :key="c" :value="c">{{ c }}</option>
              </select>
              <select v-model="filtroPeriodo"
                class="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white">
                <option value="todo">Todo el tiempo</option>
                <option value="hoy">Hoy</option>
                <option value="semana">Esta semana</option>
                <option value="mes">Este mes</option>
              </select>
            </div>

            <div class="flex gap-2">
              <select v-model="filtroCamara"
                class="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white flex-1">
                <option value="">Todas las cámaras</option>
                <option v-for="cam in camarasUnicas" :key="cam" :value="cam">{{ cam }}</option>
              </select>
              <button @click="limpiarFiltros"
                class="text-xs text-slate-400 hover:text-slate-600 px-2 transition-colors">
                Limpiar
              </button>
            </div>
          </div>

          <div class="divide-y divide-slate-50 max-h-96 overflow-y-auto">
            <div v-for="alerta in alertasFiltradas" :key="alerta.id"
              @click="$router.push(`/alerta/${alerta.id}`)"
              class="p-4 hover:bg-slate-50 transition-colors cursor-pointer">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="flex items-center gap-2">
                    <p class="font-medium text-rose-500">
                      {{ alerta.catalogoClase?.nombre ?? 'Clase ' + alerta.catalogoClaseId }}
                    </p>
                    <span v-if="alerta.rutaClip"
                      class="text-xs bg-teal-50 text-teal-600 border border-teal-100 px-1.5 py-0.5 rounded-full">
                      🎬 video
                    </span>
                  </div>
                  <p class="text-sm text-slate-400 mt-0.5">📷 {{ alerta.camara?.nombre }}</p>
                  <div class="flex gap-3 mt-1">
                    <span class="text-xs text-slate-400">
                      Conf: {{ (alerta.confianza * 100).toFixed(0) }}%
                    </span>
                    <span class="text-xs text-slate-400">
                      {{ alerta.duracion_seg.toFixed(1) }}s
                    </span>
                  </div>
                </div>
                <div class="flex flex-col items-end gap-1 shrink-0">
                  <span class="text-xs text-slate-400 whitespace-nowrap">
                    {{ formatHora(alerta.timestamp) }}
                  </span>
                  <span class="text-xs text-slate-300">Ver →</span>
                </div>
              </div>
            </div>
            <div v-if="alertasFiltradas.length === 0" class="p-8 text-center text-slate-300">
              Sin resultados con los filtros actuales
            </div>
          </div>
        </div>

        <div class="bg-slate-800 rounded-xl border border-slate-700 shadow-sm">
          <div class="p-3 border-b border-slate-700 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 rounded-full bg-rose-400"></div>
              <div class="w-3 h-3 rounded-full bg-amber-400"></div>
              <div class="w-3 h-3 rounded-full bg-teal-400"></div>
              <span class="text-slate-500 text-xs ml-2 font-mono">Python AI — stdout</span>
            </div>
            <button @click="logs = []"
              class="text-slate-600 hover:text-slate-400 text-xs transition-colors">
              Limpiar
            </button>
          </div>
          <div ref="terminalRef" class="h-96 overflow-y-auto p-4 font-mono text-xs leading-5">
            <div v-for="(linea, i) in logs" :key="i" :class="colorLinea(linea)">{{ linea }}</div>
            <div v-if="logs.length === 0" class="text-slate-600">Esperando logs...</div>
          </div>
        </div>

      </div>

      <SaludSistema />

      <ConfiguracionCamaras />

    </template>

    <template v-else-if="vistaActual === 'estadisticas'">
      <Estadisticas :alertas="alertas" />
    </template>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, provide } from 'vue'
import { io, Socket } from 'socket.io-client'


// 🔥 IMPORTAMOS NUESTRO NUEVO COMPONENTE DE CCTV EN VIVO
import CCTV from './CCTV.vue' 
import ConfiguracionCamaras from './ConfiguracionCamaras.vue'
import SaludSistema from './SaludSistema.vue'
import Estadisticas from './Estadisticas.vue'

// ── Estado principal ──
const alertas     = ref<any[]>([])
const logs        = ref<string[]>([])
const conectado   = ref(false)
provide('conectado', conectado)
const vistaActual = ref<'dashboard' | 'estadisticas'>('dashboard')
const terminalRef = ref<HTMLElement | null>(null)
let socket: Socket | null = null

// ── Filtros ──
const filtroClase   = ref('')
const filtroPeriodo = ref('todo')
const filtroCamara  = ref('')

// ── Computed ──
const alertasHoy = computed(() => {
  const hoy = new Date().toDateString()
  return alertas.value.filter(a => new Date(a.timestamp).toDateString() === hoy).length
})

const claseMasFrecuente = computed(() => {
  if (!alertas.value.length) return '—'
  const conteo: Record<string, number> = {}
  for (const a of alertas.value) {
    const nombre = a.catalogoClase?.nombre ?? 'Desconocida'
    conteo[nombre] = (conteo[nombre] || 0) + 1
  }
  return Object.entries(conteo).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
})

const clasesUnicas = computed(() => {
  const set = new Set(alertas.value.map(a => a.catalogoClase?.nombre).filter(Boolean))
  return [...set]
})

const camarasUnicas = computed(() => {
  const set = new Set(alertas.value.map(a => a.camara?.nombre).filter(Boolean))
  return [...set]
})

const alertasFiltradas = computed(() => {
  let resultado = [...alertas.value]

  // Filtro por clase
  if (filtroClase.value) {
    resultado = resultado.filter(a => a.catalogoClase?.nombre === filtroClase.value)
  }

  // Filtro por cámara
  if (filtroCamara.value) {
    resultado = resultado.filter(a => a.camara?.nombre === filtroCamara.value)
  }

  // Filtro por periodo
  if (filtroPeriodo.value !== 'todo') {
    const ahora = new Date()
    resultado = resultado.filter(a => {
      const fecha = new Date(a.timestamp)
      if (filtroPeriodo.value === 'hoy') {
        return fecha.toDateString() === ahora.toDateString()
      }
      if (filtroPeriodo.value === 'semana') {
        const hace7 = new Date(ahora)
        hace7.setDate(ahora.getDate() - 7)
        return fecha >= hace7
      }
      if (filtroPeriodo.value === 'mes') {
        const hace30 = new Date(ahora)
        hace30.setDate(ahora.getDate() - 30)
        return fecha >= hace30
      }
      return true
    })
  }

  return resultado
})

// ── Helpers ──
const formatHora = (ts: string) => new Date(ts).toLocaleTimeString('es-SV')

const limpiarFiltros = () => {
  filtroClase.value   = ''
  filtroPeriodo.value = 'todo'
  filtroCamara.value  = ''
}

const colorLinea = (linea: string) => {
  if (linea.includes('[ALERTA]'))   return 'text-rose-400'
  if (linea.includes('[ERROR]'))    return 'text-red-400'
  if (linea.includes('[THROTTLE]')) return 'text-orange-400'
  if (linea.includes('[COOLDOWN]')) return 'text-orange-300'
  if (linea.includes('[FPS]'))      return 'text-teal-400'
  if (linea.includes('[TRACK]'))    return 'text-sky-400'
  if (linea.includes('[API]'))      return 'text-violet-400'
  if (linea.includes('[CLIP]'))     return 'text-amber-300'
  if (linea.includes('[YOLO]'))     return 'text-slate-300'
  if (linea.includes('[ROI]'))      return 'text-cyan-400'
  if (linea.includes('[INFO]'))     return 'text-slate-400'
  if (linea.includes('[CONFIG]'))   return 'text-emerald-400'
  if (linea.includes('[STREAM]'))   return 'text-fuchsia-400'
  return 'text-slate-500'
}

const scrollTerminal = () => {
  nextTick(() => {
    if (terminalRef.value)
      terminalRef.value.scrollTop = terminalRef.value.scrollHeight
  })
}

// ── Ciclo de vida ──
onMounted(async () => {
  try {
    const res = await fetch('http://localhost:3000/api/alertas')
    alertas.value = await res.json()
  } catch {
    console.error('No se pudo conectar al backend')
  }

  socket = io('http://localhost:3000', { transports: ['websocket', 'polling'] })

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
    if (alertas.value.length > 200) alertas.value.pop()
  })

  socket.on('logCamara', ({ camaraId, linea }: any) => {
    logs.value.push(`[CAM-${camaraId}] ${linea}`)
    if (logs.value.length > 500) logs.value.shift()
    scrollTerminal()
  })
})

onUnmounted(() => socket?.disconnect())
</script>