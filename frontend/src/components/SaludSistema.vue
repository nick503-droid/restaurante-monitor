<template>
  <div class="bg-white rounded-xl border border-slate-200 shadow-sm">
    <div class="p-4 border-b border-slate-100 flex items-center justify-between">
      <h2 class="font-semibold text-slate-700">Salud del sistema</h2>
      <button @click="verificar"
        class="text-xs text-slate-400 hover:text-slate-600 transition-colors">
        ↻ Actualizar
      </button>
    </div>

    <div class="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">

      <!-- Backend -->
      <div class="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
        <div class="w-2.5 h-2.5 rounded-full shrink-0"
          :class="estado.backend ? 'bg-teal-400' : 'bg-rose-400'"></div>
        <div>
          <p class="text-xs font-medium text-slate-700">Backend</p>
          <p class="text-xs text-slate-400">{{ estado.backend ? 'Corriendo' : 'Sin respuesta' }}</p>
        </div>
      </div>

      <!-- Base de datos -->
      <div class="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
        <div class="w-2.5 h-2.5 rounded-full shrink-0"
          :class="estado.db ? 'bg-teal-400' : 'bg-rose-400'"></div>
        <div>
          <p class="text-xs font-medium text-slate-700">Base de datos</p>
          <p class="text-xs text-slate-400">{{ estado.db ? 'SQLite OK' : 'Error' }}</p>
        </div>
      </div>

      <!-- Cámaras activas -->
      <div class="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
        <div class="w-2.5 h-2.5 rounded-full shrink-0"
          :class="estado.camaras > 0 ? 'bg-teal-400 animate-pulse' : 'bg-amber-400'"></div>
        <div>
          <p class="text-xs font-medium text-slate-700">Procesos Python</p>
          <p class="text-xs text-slate-400">{{ estado.camaras }} cámara(s) activa(s)</p>
        </div>
      </div>

      <!-- WebSocket -->
      <div class="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
        <div class="w-2.5 h-2.5 rounded-full shrink-0"
          :class="conectado ? 'bg-teal-400 animate-pulse' : 'bg-rose-400'"></div>
        <div>
          <p class="text-xs font-medium text-slate-700">WebSocket</p>
          <p class="text-xs text-slate-400">{{ conectado ? 'Tiempo real OK' : 'Desconectado' }}</p>
        </div>
      </div>

    </div>

    <!-- Detalle de procesos -->
    <div v-if="estado.procesos && Object.keys(estado.procesos).length > 0"
      class="px-4 pb-4">
      <p class="text-xs text-slate-400 mb-2">Procesos activos:</p>
      <div class="flex flex-wrap gap-2">
        <span v-for="(info, camId) in estado.procesos" :key="camId"
          class="text-xs bg-teal-50 text-teal-700 border border-teal-100 px-2 py-1 rounded-full">
          CAM-{{ camId }} • PID {{ info.pid }}
        </span>
      </div>
    </div>

    <!-- Última verificación -->
    <div class="px-4 pb-3">
      <p class="text-xs text-slate-300">
        Última verificación: {{ ultimaVerificacion }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, inject } from 'vue'
import { provide } from 'vue'

const conectado = inject('conectado', ref(false))
provide('conectado', conectado)


const estado = ref({
  backend:  false,
  db:       false,
  camaras:  0,
  procesos: {} as Record<string, any>,
})
const ultimaVerificacion = ref('—')
let intervalo: ReturnType<typeof setInterval> | null = null

const verificar = async () => {
  // Verifica backend + estado de cámaras
  try {
    const [resCamaras, resAlertas] = await Promise.all([
      fetch('http://localhost:3000/api/camaras/estado'),
      fetch('http://localhost:3000/api/alertas?take=1'),
    ])

    if (resCamaras.ok) {
      const data = await resCamaras.json()
      estado.value.backend  = true
      estado.value.camaras  = data.camaras_activas ?? 0
      estado.value.procesos = data.procesos ?? {}
    }

    estado.value.db = resAlertas.ok
  } catch {
    estado.value.backend = false
    estado.value.db      = false
    estado.value.camaras = 0
  }

  ultimaVerificacion.value = new Date().toLocaleTimeString('es-SV')
}

onMounted(() => {
  verificar()
  intervalo = setInterval(verificar, 15_000) // cada 15 segundos
})

onUnmounted(() => {
  if (intervalo) clearInterval(intervalo)
})
</script>