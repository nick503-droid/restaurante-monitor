<template>
  <div class="bg-white rounded-xl border border-slate-200 shadow-sm">
    <div class="p-4 border-b border-slate-100">
      <h2 class="font-semibold text-slate-700">Configuración de reglas por cámara</h2>
      <p class="text-slate-400 text-xs mt-1">
        Marca qué clases vigilar. Al cambiar, Python se reinicia automáticamente.
      </p>
    </div>

    <div class="p-4 space-y-4">
      <div
        v-for="camara in camaras"
        :key="camara.id"
        class="bg-slate-50 rounded-lg p-4 border border-slate-100"
      >
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-medium text-slate-700">{{ camara.nombre }}</h3>
          <span
            class="text-xs px-2 py-0.5 rounded-full border"
            :class="camara.activa
              ? 'bg-teal-50 text-teal-600 border-teal-100'
              : 'bg-slate-100 text-slate-400 border-slate-200'"
          >
            {{ camara.activa ? 'Activa' : 'Inactiva' }}
          </span>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <label
            v-for="clase in catalogo"
            :key="clase.id"
            class="flex items-center gap-2 bg-white hover:bg-slate-50
                   border border-slate-200 rounded-lg p-2 cursor-pointer
                   transition-colors select-none"
          >
            <input
              type="checkbox"
              :checked="clasesActivas(camara).includes(clase.clase_id)"
              @change="toggleClase(camara, clase.clase_id)"
              class="accent-teal-500 w-4 h-4 cursor-pointer"
            />
            <span class="text-sm text-slate-600">{{ clase.nombre }}</span>
          </label>
        </div>
      </div>

      <div v-if="camaras.length === 0" class="text-center text-slate-300 py-6">
        Cargando cámaras...
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const camaras  = ref<any[]>([])
const catalogo = ref<any[]>([])

const clasesActivas = (camara: any): number[] => {
  try { return JSON.parse(camara.clases_vigilar || '[]') }
  catch { return [] }
}

const toggleClase = async (camara: any, claseId: number) => {
  const actuales = clasesActivas(camara)
  const nuevas   = actuales.includes(claseId)
    ? actuales.filter((c: number) => c !== claseId)
    : [...actuales, claseId]

  camara.clases_vigilar = JSON.stringify(nuevas)

  await fetch(`http://localhost:3000/api/camaras/${camara.id}/clases`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ clasesIds: nuevas }),
  })
}

onMounted(async () => {
  const [resCamaras, resCatalogo] = await Promise.all([
    fetch('http://localhost:3000/api/camaras'),
    fetch('http://localhost:3000/api/catalogo'),
  ])
  camaras.value  = await resCamaras.json()
  catalogo.value = await resCatalogo.json()
})
</script>