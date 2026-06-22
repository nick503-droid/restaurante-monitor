<template>
    <div class="bg-slate-50 p-6 rounded-xl border border-slate-200 mb-6 shadow-sm">
        <div class="flex items-center gap-3 mb-5">
            <div class="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
            <h2 class="text-xl font-bold text-slate-700">Centro de Monitoreo CCTV</h2>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
            <div>
                <label class="block text-sm font-medium text-slate-500 mb-1">Pantalla 1</label>
                <select v-model="cam1"
                    class="w-full border border-slate-300 p-2.5 rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    <option :value="null">-- Apagada --</option>
                    <option v-for="cam in camaras" :key="cam.id" :value="cam.id">
                        {{ cam.nombre }} (Ubicación: {{ cam.ubicacion }})
                    </option>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-slate-500 mb-1">Pantalla 2</label>
                <select v-model="cam2"
                    class="w-full border border-slate-300 p-2.5 rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    <option :value="null">-- Apagada --</option>
                    <option v-for="cam in camaras" :key="cam.id" :value="cam.id">
                        {{ cam.nombre }} (Ubicación: {{ cam.ubicacion }})
                    </option>
                </select>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

            <div class="bg-black rounded-xl aspect-video overflow-hidden relative shadow-lg border border-slate-800">
                <img v-if="cam1" :src="`http://localhost:${5000 + cam1}/video_feed`"
                    class="w-full h-full object-cover" />
                <div v-else class="flex flex-col items-center justify-center h-full text-slate-600">
                    <svg class="w-12 h-12 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z">
                        </path>
                    </svg>
                    <span class="font-medium text-sm tracking-wide">SIN SEÑAL</span>
                </div>
                <div v-if="cam1"
                    class="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-white text-xs px-3 py-1 rounded-md border border-white/10 flex items-center gap-2">
                    <div class="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div> EN VIVO
                </div>
            </div>

            <div class="bg-black rounded-xl aspect-video overflow-hidden relative shadow-lg border border-slate-800">
                <img v-if="cam2" :src="`http://localhost:${5000 + cam2}/video_feed`"
                    class="w-full h-full object-cover" />
                <div v-else class="flex flex-col items-center justify-center h-full text-slate-600">
                    <svg class="w-12 h-12 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z">
                        </path>
                    </svg>
                    <span class="font-medium text-sm tracking-wide">SIN SEÑAL</span>
                </div>
                <div v-if="cam2"
                    class="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-white text-xs px-3 py-1 rounded-md border border-white/10 flex items-center gap-2">
                    <div class="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div> EN VIVO
                </div>
            </div>

        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const camaras = ref([])
const cam1 = ref(null)
const cam2 = ref(null)

onMounted(async () => {
    try {
        const res = await fetch('http://localhost:3000/api/camaras')
        camaras.value = await res.json()
        // Auto-seleccionar la primera cámara si existe
        if (camaras.value.length > 0) {
            cam1.value = camaras.value[0].id
        }
    } catch (error) {
        console.error('Error cargando cámaras:', error)
    }
})
</script>