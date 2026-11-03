<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useRouter, useRoute } from 'vue-router'
import { computed } from 'vue'
import {
  Tickets,
  Position,
  Document,
  Plus,
  Check,
  User,
  SwitchButton,
  Message,
} from '@element-plus/icons-vue'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

const menuItems = computed(() => {
  const items = [
    { index: '/invoices', title: '我的发票', icon: Tickets },
    { index: '/trips', title: '我的行程', icon: Position },
    { index: '/reimbursements', title: '我的报销单', icon: Document },
    { index: '/reimbursements/create', title: '创建报销单', icon: Plus },
    { index: '/email-settings', title: '邮箱设置', icon: Message },
  ]
  if (authStore.isAccountant) {
    items.push({ index: '/approvals', title: '审批中心', icon: Check })
  }
  if (authStore.isSuperUser) {
    items.push({ index: '/users', title: '用户管理', icon: User })
  }
  return items
})

function handleSelect(index: string) {
  router.push(index)
}

function handleLogout() {
  authStore.logout()
  router.push('/login')
}
</script>

<template>
  <div class="app-layout">
    <!-- Sidebar -->
    <aside class="app-sidebar">
      <div class="sidebar-brand">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" class="brand-icon">
          <rect width="32" height="32" rx="8" fill="#fff" fill-opacity="0.15"/>
          <path d="M9 16l5 5 9-10" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="brand-text">报销系统</span>
      </div>
      <nav class="sidebar-nav">
        <a
          v-for="item in menuItems"
          :key="item.index"
          :class="['nav-item', { active: route.path === item.index }]"
          @click="handleSelect(item.index)"
        >
          <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
          <span>{{ item.title }}</span>
        </a>
      </nav>
      <div class="sidebar-footer">
        <div class="user-info">
          <div class="user-avatar">{{ ((authStore.userInfo?.username || 'U')[0] || 'U').toUpperCase() }}</div>
          <div class="user-details">
            <span class="user-name">{{ authStore.userInfo?.username }}</span>
            <span class="user-role">
              <span class="role-dot" :class="authStore.isAccountant ? 'dot-warning' : 'dot-primary'"></span>
              {{ authStore.isAccountant ? '财务' : '员工' }}
              <template v-if="authStore.isSuperUser"> · 管理员</template>
            </span>
          </div>
        </div>
        <el-button text class="logout-btn" @click="handleLogout">
          <el-icon><SwitchButton /></el-icon>
        </el-button>
      </div>
    </aside>

    <!-- Main -->
    <div class="app-main">
      <main class="main-content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  background: var(--apple-parchment);
}

/* ---- Sidebar ---- */
.app-sidebar {
  width: 240px;
  min-width: 240px;
  background: var(--apple-black);
  display: flex;
  flex-direction: column;
  color: #fff;
  user-select: none;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-lg) var(--space-xl);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.brand-icon {
  flex-shrink: 0;
}

.brand-text {
  font-size: var(--text-body);
  font-weight: 600;
  letter-spacing: var(--tracking-body);
  color: #fff;
}

/* ---- Nav Items ---- */
.sidebar-nav {
  flex: 1;
  padding: var(--space-sm) var(--space-xs);
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 10px var(--space-md);
  border-radius: var(--radius-sm);
  font-size: var(--text-body);
  font-weight: 400;
  color: rgba(255, 255, 255, 0.65);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  text-decoration: none;
  letter-spacing: var(--tracking-body);
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.nav-item.active {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-weight: 500;
}

.nav-icon {
  font-size: 18px;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
}

/* ---- Sidebar Footer ---- */
.sidebar-footer {
  display: flex;
  align-items: center;
  padding: var(--space-md) var(--space-lg);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  gap: var(--space-sm);
}

.user-info {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex: 1;
  min-width: 0;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0;
  flex-shrink: 0;
}

.user-details {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.user-name {
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-role {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  display: flex;
  align-items: center;
  gap: 4px;
  letter-spacing: 0;
}

.role-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot-primary { background: var(--apple-blue); }
.dot-warning { background: var(--apple-warning); }

.logout-btn {
  color: rgba(255, 255, 255, 0.4) !important;
  font-size: 18px;
}
.logout-btn:hover {
  color: rgba(255, 255, 255, 0.8) !important;
  background: rgba(255, 255, 255, 0.08) !important;
}

/* ---- Main Content ---- */
.app-main {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.main-content {
  flex: 1;
  padding: var(--space-xl) 48px;
  width: 100%;
}
</style>
