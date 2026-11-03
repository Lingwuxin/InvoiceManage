<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'

const authStore = useAuthStore()
const router = useRouter()

const form = ref({ username: '', password: '' })
const loading = ref(false)

async function handleLogin() {
  if (!form.value.username || !form.value.password) {
    ElMessage.warning('请输入用户名和密码')
    return
  }
  loading.value = true
  try {
    await authStore.login(form.value.username, form.value.password)
    ElMessage.success('登录成功')
    router.push('/')
  } catch {
    ElMessage.error('用户名或密码错误')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-icon">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect width="48" height="48" rx="11" fill="#1d1d1f"/>
          <path d="M14 24l7 7 13-14" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <h2 class="login-title">发票报销系统</h2>
      <p class="login-subtitle">登录以继续</p>
      <el-form :model="form" @submit.prevent="handleLogin" class="login-form">
        <el-form-item>
          <el-input
            v-model="form.username"
            placeholder="用户名"
            :prefix-icon="User"
            size="large"
          />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            :prefix-icon="Lock"
            size="large"
            show-password
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            native-type="submit"
            :loading="loading"
            size="large"
            class="login-btn"
          >
            登录
          </el-button>
        </el-form-item>
      </el-form>
    </div>
    <p class="login-footer">Taoshu · 企业费用管理平台</p>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--apple-parchment);
  padding: var(--space-xl);
}

.login-card {
  width: 100%;
  max-width: 400px;
  background: var(--apple-canvas);
  border-radius: var(--radius-lg);
  padding: var(--space-xxl) var(--space-xl);
  box-shadow: var(--shadow-hairline);
  text-align: center;
}

.login-icon {
  margin-bottom: var(--space-lg);
  display: inline-flex;
}

.login-title {
  font-size: var(--text-lead);
  font-weight: 600;
  color: var(--apple-ink);
  margin-bottom: var(--space-xs);
  letter-spacing: var(--tracking-display);
}

.login-subtitle {
  font-size: var(--text-body);
  color: var(--apple-ink-disabled);
  margin: 0 0 var(--space-xl);
  font-weight: 400;
}

.login-form {
  text-align: left;
}

.login-btn {
  width: 100%;
  font-weight: 400;
  font-size: var(--text-body);
  padding: 12px 0;
}

.login-footer {
  margin-top: var(--space-xl);
  font-size: var(--text-button-utility);
  color: var(--apple-ink-disabled);
  letter-spacing: var(--tracking-button);
}
</style>
