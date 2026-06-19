<template>
  <div class="min-h-screen bg-slate-50 p-6">

    <!-- Botón volver -->
    <button
      @click="$router.push('/')"
      class="flex items-center gap-2 text-slate-500 hover:text-slate-700
             transition-colors mb-6"
    >
      ← Volver al dashboard
    </button>

    <!-- Loading -->
    <div v-if="cargando" class="text-slate-400 text-center py-20">
      Cargando alerta...
    </div>

    <div v-else-if="alerta" class="max-w-4xl mx-auto space-y-6">

      <!-- Header de la alerta -->
      <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div class="flex items-start justify-between">
          <div>
            <h1 class="text-xl font-bold text-slate-700">
              Infracción #{{ alerta.id }}
            </h1>
            <p class="text-slate-400 text-sm mt-1">
              {{ formatFecha(alerta.timestamp) }}
            </p>
          </div>
          <span class="bg-rose-50 text-rose-500 border border-rose-100
                       px-3 py-1 rounded-full text-sm font-medium">
            {{ alerta.catalogoClase?.nombre }}
          </span>
        </div>

        <!-- Detalles -->
        <div class="grid grid-cols-3 gap-4 mt-6">
          <div class="bg-slate-50 rounded-lg p-3">
            <p class="text-xs text-slate-400">Cámara</p>
            <p class="font-medium text-slate-700 mt-0.5">
              {{ alerta.camara?.nombre }}
            </p>
          </div>
          <div class="bg-slate-50 rounded-lg p-3">
            <p class="text-xs text-slate-400">Confianza IA</p>
            <p class="font-medium text-slate-700 mt-0.5">
              {{ (alerta.confianza * 100).toFixed(1) }}%
            </p>
          </div>
          <div class="bg-slate-50 rounded-lg p-3">
            <p class="text-xs text-slate-400">Duración detectada</p>
            <p class="font-medium text-slate-700 mt-0.5">
              {{ alerta.duracion_seg.toFixed(1) }} segundos
            </p>
          </div>
        </div>
      </div>

      <!-- Reproductor de video -->
      <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="p-4 border-b border-slate-100">
          <h2 class="font-semibold text-slate-700">Evidencia en video</h2>
          <p class="text-xs text-slate-400 mt-0.5">
            Clip de 30 segundos — 10s previos + 20s del evento
          </p>
        </div>

        <!-- Video disponible -->
        <div v-if="alerta.rutaClip" class="p-4">
          <video
            :src="`http://localhost:3000/${alerta.rutaClip}`"
            controls
            class="w-full rounded-lg bg-black"
            style="max-height: 480px"
          >
            Tu navegador no soporta video HTML5.
          </video>
          <p class="text-xs text-slate-400 mt-2">
            📁 {{ alerta.rutaClip }}
          </p>
        </div>

        <!-- Sin clip todavía -->
        <div v-else class="p-12 text-center">
          <div class="text-4xl mb-3">🎬</div>
          <p class="text-slate-400">
            Esta alerta no tiene clip de evidencia asociado.
          </p>
          <p class="text-slate-300 text-xs mt-1">
            Las nuevas alertas generarán clips automáticamente.
          </p>
        </div>
      </div>

    </div>

    <!-- No encontrada -->
    <div v-else class="text-center py-20 text-slate-400">
      Alerta no encontrada.
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'

const route   = useRoute()
const alerta  = ref<any>(null)
const cargando = ref(true)

const formatFecha = (ts: string) =>
  new Date(ts).toLocaleString('es-SV')

onMounted(async () => {
  try {
    const res = await fetch(
      `http://localhost:3000/api/alertas/${route.params.id}`
    )
    alerta.value = await res.json()
  } catch {
    console.error('Error cargando alerta')
  } finally {
    cargando.value = false
  }
})
</script>