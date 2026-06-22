<template>
  <div class="space-y-6">

    <!-- Resumen numérico -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <p class="text-slate-400 text-xs">Total alertas</p>
        <p class="text-3xl font-bold text-slate-700 mt-1">{{ alertas.length }}</p>
      </div>
      <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <p class="text-slate-400 text-xs">Promedio confianza</p>
        <p class="text-3xl font-bold text-teal-600 mt-1">{{ promedioConfianza }}%</p>
      </div>
      <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <p class="text-slate-400 text-xs">Duración promedio</p>
        <p class="text-3xl font-bold text-amber-500 mt-1">{{ promedioDuracion }}s</p>
      </div>
      <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <p class="text-slate-400 text-xs">Con video</p>
        <p class="text-3xl font-bold text-violet-500 mt-1">{{ conVideo }}</p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

      <!-- Alertas por clase -->
      <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h3 class="font-semibold text-slate-700 mb-4">Infracciones por clase</h3>
        <div class="space-y-3">
          <div v-for="item in porClase" :key="item.nombre" class="space-y-1">
            <div class="flex items-center justify-between text-sm">
              <span class="text-slate-600">{{ item.nombre }}</span>
              <span class="font-medium text-slate-700">{{ item.total }}</span>
            </div>
            <div class="w-full bg-slate-100 rounded-full h-2">
              <div class="h-2 rounded-full transition-all duration-500"
                :style="{ width: item.pct + '%' }"
                :class="barColor(item.nombre)">
              </div>
            </div>
          </div>
          <div v-if="porClase.length === 0" class="text-slate-300 text-sm text-center py-4">
            Sin datos
          </div>
        </div>
      </div>

      <!-- Alertas por hora del día -->
      <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h3 class="font-semibold text-slate-700 mb-4">Distribución por hora del día</h3>
        <div class="flex items-end gap-1 h-32">
          <div v-for="(val, hora) in porHora" :key="hora"
            class="flex-1 flex flex-col items-center gap-1 group">
            <span class="text-xs text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
              {{ val }}
            </span>
            <div class="w-full bg-rose-400 rounded-t transition-all duration-500"
              :style="{ height: alturaBar(val) }">
            </div>
            <span class="text-xs text-slate-300" style="font-size:9px">
              {{ hora % 6 === 0 ? hora + 'h' : '' }}
            </span>
          </div>
        </div>
        <p class="text-xs text-slate-400 mt-2 text-center">
          Hora del día con más alertas: <span class="font-medium text-slate-600">{{ horaPico }}:00</span>
        </p>
      </div>

      <!-- Alertas por día (últimos 14 días) -->
      <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 lg:col-span-2">
        <h3 class="font-semibold text-slate-700 mb-4">Alertas últimos 14 días</h3>
        <div class="flex items-end gap-2 h-28">
          <div v-for="dia in porDia" :key="dia.fecha"
            class="flex-1 flex flex-col items-center gap-1 group">
            <span class="text-xs text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
              {{ dia.total }}
            </span>
            <div class="w-full rounded-t transition-all duration-500"
              :class="dia.total > 0 ? 'bg-rose-400' : 'bg-slate-100'"
              :style="{ height: alturaBarDia(dia.total) }">
            </div>
            <span class="text-slate-400" style="font-size:9px">{{ dia.label }}</span>
          </div>
        </div>
      </div>

    </div>

    <!-- Tabla top infracciones -->
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div class="p-4 border-b border-slate-100">
        <h3 class="font-semibold text-slate-700">Últimas 10 alertas</h3>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-100">
              <th class="text-left p-3 text-xs text-slate-400 font-medium">Clase</th>
              <th class="text-left p-3 text-xs text-slate-400 font-medium">Cámara</th>
              <th class="text-left p-3 text-xs text-slate-400 font-medium">Confianza</th>
              <th class="text-left p-3 text-xs text-slate-400 font-medium">Duración</th>
              <th class="text-left p-3 text-xs text-slate-400 font-medium">Fecha</th>
              <th class="text-left p-3 text-xs text-slate-400 font-medium">Video</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">
            <tr v-for="a in alertas.slice(0, 10)" :key="a.id"
              @click="$router.push(`/alerta/${a.id}`)"
              class="hover:bg-slate-50 cursor-pointer transition-colors">
              <td class="p-3 font-medium text-rose-500">
                {{ a.catalogoClase?.nombre ?? '—' }}
              </td>
              <td class="p-3 text-slate-600">{{ a.camara?.nombre ?? '—' }}</td>
              <td class="p-3">
                <span class="text-xs px-2 py-0.5 rounded-full"
                  :class="a.confianza >= 0.8
                    ? 'bg-teal-50 text-teal-600'
                    : a.confianza >= 0.65
                      ? 'bg-amber-50 text-amber-600'
                      : 'bg-rose-50 text-rose-500'">
                  {{ (a.confianza * 100).toFixed(0) }}%
                </span>
              </td>
              <td class="p-3 text-slate-600">{{ a.duracion_seg.toFixed(1) }}s</td>
              <td class="p-3 text-slate-400 text-xs">
                {{ new Date(a.timestamp).toLocaleString('es-SV') }}
              </td>
              <td class="p-3">
                <span v-if="a.rutaClip" class="text-teal-500 text-xs">🎬</span>
                <span v-else class="text-slate-300 text-xs">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

const props  = defineProps<{ alertas: any[] }>()
const $router = useRouter()

// ── Métricas generales ──
const promedioConfianza = computed(() => {
  if (!props.alertas.length) return '0'
  const sum = props.alertas.reduce((acc, a) => acc + a.confianza, 0)
  return (sum / props.alertas.length * 100).toFixed(1)
})

const promedioDuracion = computed(() => {
  if (!props.alertas.length) return '0'
  const sum = props.alertas.reduce((acc, a) => acc + a.duracion_seg, 0)
  return (sum / props.alertas.length).toFixed(1)
})

const conVideo = computed(() =>
  props.alertas.filter(a => a.rutaClip).length
)

// ── Por clase ──
const porClase = computed(() => {
  const conteo: Record<string, number> = {}
  for (const a of props.alertas) {
    const nombre = a.catalogoClase?.nombre ?? 'Desconocida'
    conteo[nombre] = (conteo[nombre] || 0) + 1
  }
  const max = Math.max(...Object.values(conteo), 1)
  return Object.entries(conteo)
    .sort((a, b) => b[1] - a[1])
    .map(([nombre, total]) => ({
      nombre,
      total,
      pct: Math.round((total / max) * 100),
    }))
})

const barColor = (nombre: string) => {
  const colores: Record<string, string> = {
    'Celular':  'bg-rose-400',
    'Persona':  'bg-sky-400',
    'Cuchillo': 'bg-amber-400',
    'Tenedor':  'bg-teal-400',
    'Botella':  'bg-violet-400',
    'Vaso':     'bg-pink-400',
  }
  return colores[nombre] ?? 'bg-slate-400'
}

// ── Por hora del día (0-23) ──
const porHora = computed(() => {
  const horas = Array(24).fill(0)
  for (const a of props.alertas) {
    const h = new Date(a.timestamp).getHours()
    horas[h]++
  }
  return horas
})

const maxHora = computed(() => Math.max(...porHora.value, 1))

const alturaBar = (val: number) =>
  val === 0 ? '4px' : `${Math.max(8, (val / maxHora.value) * 100)}%`

const horaPico = computed(() => {
  const idx = porHora.value.indexOf(Math.max(...porHora.value))
  return idx
})

// ── Por día (últimos 14) ──
const porDia = computed(() => {
  const dias: { fecha: string; label: string; total: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const fechaStr = d.toDateString()
    const label    = d.toLocaleDateString('es-SV', { day: '2-digit', month: '2-digit' })
    const total    = props.alertas.filter(
      a => new Date(a.timestamp).toDateString() === fechaStr
    ).length
    dias.push({ fecha: fechaStr, label, total })
  }
  return dias
})

const maxDia = computed(() => Math.max(...porDia.value.map(d => d.total), 1))

const alturaBarDia = (val: number) =>
  val === 0 ? '4px' : `${Math.max(8, (val / maxDia.value) * 100)}%`
</script>