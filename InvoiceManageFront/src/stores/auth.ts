import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

interface UserInfo {
  id: number
  username: string
  email: string
  real_name?: string
  company?: string
  city?: string
  department?: string
  dept_leader?: string
  role: 'EMPLOYEE' | 'ACCOUNTANT'
  is_superuser: boolean
  is_active: boolean
}

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref(localStorage.getItem('access_token') || '')
  const refreshToken = ref(localStorage.getItem('refresh_token') || '')
  const userInfo = ref<UserInfo | null>(null)

  const isLoggedIn = computed(() => !!accessToken.value)
  const isAccountant = computed(() => userInfo.value?.role === 'ACCOUNTANT')
  const isSuperUser = computed(() => userInfo.value?.is_superuser === true)

  async function login(username: string, password: string) {
    const { data } = await axios.post('/api/token/', {
      username,
      password,
    })
    accessToken.value = data.access
    refreshToken.value = data.refresh
    localStorage.setItem('access_token', data.access)
    localStorage.setItem('refresh_token', data.refresh)
    await fetchUserInfo()
  }

  async function fetchUserInfo() {
    const { data } = await axios.get('/api/user/me/', {
      headers: { Authorization: `Bearer ${accessToken.value}` },
    })
    userInfo.value = data
  }

  function logout() {
    accessToken.value = ''
    refreshToken.value = ''
    userInfo.value = null
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
  }

  return {
    accessToken,
    refreshToken,
    userInfo,
    isLoggedIn,
    isAccountant,
    isSuperUser,
    login,
    fetchUserInfo,
    logout,
  }
})
