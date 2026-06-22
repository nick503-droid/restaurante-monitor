import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '../components/Dashboard.vue'
import DetalleAlerta from '../components/DetalleAlerta.vue'
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: Dashboard,
    },
    {
      // :id es el ID de la alerta — ej: /alerta/3
      path: '/alerta/:id',
      component: DetalleAlerta,
    },
  ],
})

export default router