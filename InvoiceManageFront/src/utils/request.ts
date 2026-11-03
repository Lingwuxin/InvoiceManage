import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import router from '@/router'
import { ElMessage } from 'element-plus'

const request = axios.create({
  baseURL: '/api/',
  timeout: 10000,
})

// 请求拦截器：自动附加 JWT Token
request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// 响应拦截器：处理 401 未授权
request.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken && !error.config._retry) {
        error.config._retry = true
        try {
          const { data } = await axios.post('/api/token/refresh/', {
            refresh: refreshToken,
          })
          localStorage.setItem('access_token', data.access)
          error.config.headers.Authorization = `Bearer ${data.access}`
          return request(error.config)
        } catch {
          // Refresh 也失败，登出
          const authStore = useAuthStore()
          authStore.logout()
          router.push('/login')
        }
      } else {
        const authStore = useAuthStore()
        authStore.logout()
        router.push('/login')
      }
    } else if (error.response) {
      // 处理后端返回的业务错误
      const { data } = error.response
      const message = data.message || data.detail || '请求失败'
      
      // 避免重复提示或对特定状态码不提示（如果需要）
      const isDuplicate = typeof message === 'string' && message.includes('已存在')
      if (isDuplicate) {
        ElMessage.warning(message)
      } else {
        ElMessage.error(message)
      }
    } else {
       ElMessage.error(error.message || '网络错误')
    }
    return Promise.reject(error)
  },
)

export default request
