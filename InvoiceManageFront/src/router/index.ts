import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/Login.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/',
      name: 'Layout',
      component: () => import('@/views/Layout.vue'),
      redirect: '/invoices',
      meta: { requiresAuth: true },
      children: [
        {
          path: 'invoices',
          name: 'MyInvoices',
          component: () => import('@/views/MyInvoices.vue'),
        },
        {
          path: 'reimbursements',
          name: 'Reimbursements',
          component: () => import('@/views/MyReimbursements.vue'),
        },
        {
          path: 'trips',
          name: 'MyTrips',
          component: () => import('@/views/MyTrips.vue'),
        },
        {
          path: 'reimbursements/create',
          name: 'CreateReimbursement',
          component: () => import('@/views/CreateReimbursement.vue'),
        },
        {
          path: 'email-settings',
          name: 'EmailSettings',
          component: () => import('@/views/EmailSettings.vue'),
        },
        {
          path: 'approvals',
          name: 'Approvals',
          component: () => import('@/views/ApprovalDashboard.vue'),
          meta: { role: 'ACCOUNTANT' },
        },
        {
          path: 'users',
          name: 'UserManagement',
          component: () => import('@/views/UserManagement.vue'),
          meta: { superuser: true },
        },
      ],
    },
  ],
})

// 路由守卫
router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()

  if (to.meta.requiresAuth !== false && !authStore.isLoggedIn) {
    return next('/login')
  }

  // 已登录但没有用户信息，获取一下
  if (authStore.isLoggedIn && !authStore.userInfo) {
    try {
      await authStore.fetchUserInfo()
    } catch {
      authStore.logout()
      return next('/login')
    }
  }

  // 角色限制
  if (to.meta.role && authStore.userInfo?.role !== to.meta.role) {
    return next('/')
  }

  if (to.meta.superuser && !authStore.userInfo?.is_superuser) {
    return next('/')
  }

  next()
})

export default router
