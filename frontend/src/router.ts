import { useAuthStore } from '@/stores/auth'
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      component: () => import('@/routes/LoginPage.vue'),
      meta: { publicAuth: true },
    },
    {
      path: '/register',
      component: () => import('@/routes/RegisterPage.vue'),
      meta: { publicAuth: true },
    },
    {
      path: '/',
      component: () => import('@/routes/HomePage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/chat/:chatId',
      component: () => import('@/routes/ChatPage.vue'),
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.ready) {
    await auth.hydrate()
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return {
      path: '/login',
      query: to.path === '/' ? {} : { redirect: to.fullPath },
    }
  }

  if (to.meta.publicAuth && auth.isAuthenticated) {
    return '/'
  }

  return true
})

export default router
