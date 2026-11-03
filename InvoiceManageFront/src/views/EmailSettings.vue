<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import request from '@/utils/request'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Connection, DeleteFilled, Setting } from '@element-plus/icons-vue'

interface EmailAccount {
  id: number
  email_address: string
  imap_host: string
  imap_port: number
  use_ssl: boolean
  username: string
  password?: string
  has_password: boolean
  folder: string
  keywords: string
  poll_interval_minutes: number
  enabled: boolean
  last_checked_at: string | null
  last_error: string
}

interface ProcessedLog {
  id: number
  message_uid: string
  subject: string
  received_at: string | null
  processed_at: string
  invoices_created: number
  attachments_attached: number
  note: string
}

interface SyncResult {
  checked: number
  matched: number
  invoices_created: number
  attachments_attached: number
  skipped: number
  errors: string[]
}

const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const syncing = ref(false)
const configDialogVisible = ref(false)
const account = ref<EmailAccount | null>(null)
const logs = ref<ProcessedLog[]>([])
const totalLogs = ref(0)
const currentPage = ref(1)
const pageSize = ref(10)
const lastSync = ref<SyncResult | null>(null)
const isNew = ref(true)

const form = reactive<EmailAccount & { password: string }>({
  id: 0,
  email_address: '',
  imap_host: '',
  imap_port: 993,
  use_ssl: true,
  username: '',
  password: '',
  has_password: false,
  folder: 'INBOX',
  keywords: '发票,行程单,机票,电子客票',
  poll_interval_minutes: 15,
  enabled: true,
  last_checked_at: null,
  last_error: '',
})

const lastCheckedDisplay = computed(() => {
  if (!form.last_checked_at) return '从未'
  return new Date(form.last_checked_at).toLocaleString()
})

async function fetchAccount() {
  loading.value = true
  try {
    const { data } = await request.get('/email-account/')
    if (data) {
      account.value = data
      isNew.value = false
      Object.assign(form, data, { password: '' })
    } else {
      account.value = null
      isNew.value = true
    }
  } finally {
    loading.value = false
  }
}

async function fetchLogs() {
  if (isNew.value) {
    logs.value = []
    totalLogs.value = 0
    return
  }
  try {
    const { data } = await request.get('/email-account/logs/', {
      params: {
        page: currentPage.value,
        page_size: pageSize.value,
      },
    })
    logs.value = data.results || []
    totalLogs.value = data.count || 0
  } catch {
    logs.value = []
    totalLogs.value = 0
  }
}

async function save() {
  if (!form.email_address || !form.imap_host) {
    ElMessage.warning('请填写邮箱地址和 IMAP 服务器')
    return
  }
  saving.value = true
  try {
    const payload: Partial<EmailAccount & { password: string }> = {
      email_address: form.email_address,
      imap_host: form.imap_host,
      imap_port: form.imap_port,
      use_ssl: form.use_ssl,
      username: form.username,
      folder: form.folder,
      keywords: form.keywords,
      poll_interval_minutes: form.poll_interval_minutes,
      enabled: form.enabled,
    }
    if (form.password) payload.password = form.password
    if (isNew.value) {
      await request.post('/email-account/', payload)
      ElMessage.success('邮箱配置已创建')
    } else {
      await request.patch('/email-account/update/', payload)
      ElMessage.success('邮箱配置已更新')
    }
    await fetchAccount()
    await fetchLogs()
  } finally {
    saving.value = false
  }
}

async function testConnection() {
  if (isNew.value) {
    ElMessage.warning('请先保存配置')
    return
  }
  testing.value = true
  try {
    const { data } = await request.post('/email-account/test/')
    ElMessage.success(data.message || '连接成功')
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '连接失败')
  } finally {
    testing.value = false
  }
}

async function syncNow() {
  if (isNew.value) {
    ElMessage.warning('请先保存配置')
    return
  }
  syncing.value = true
  try {
    const { data } = await request.post('/email-account/sync/')
    lastSync.value = data
    ElMessage.success(`同步完成：检查 ${data.checked} 封，新增发票 ${data.invoices_created} 张`)
    await fetchAccount()
    await fetchLogs()
  } finally {
    syncing.value = false
  }
}

function openConfigDialog() {
  configDialogVisible.value = true
}

function handleCurrentPageChange(page: number) {
  currentPage.value = page
  fetchLogs()
}

function handlePageSizeChange(size: number) {
  pageSize.value = size
  currentPage.value = 1
  fetchLogs()
}

async function removeAccount() {
  await ElMessageBox.confirm('确认删除当前邮箱配置吗？已抓取的发票不会被删除。', '提示', {
    type: 'warning',
  })
  await request.delete('/email-account/remove/')
  ElMessage.success('已删除')
  Object.assign(form, {
    id: 0,
    email_address: '',
    imap_host: '',
    imap_port: 993,
    use_ssl: true,
    username: '',
    password: '',
    has_password: false,
    folder: 'INBOX',
    keywords: '发票,行程单,机票,电子客票',
    poll_interval_minutes: 15,
    enabled: true,
    last_checked_at: null,
    last_error: '',
  })
  account.value = null
  isNew.value = true
  logs.value = []
}

onMounted(async () => {
  await fetchAccount()
  await fetchLogs()
})
</script>

<template>
  <div class="email-settings">
    <div class="page-header">
      <div>
        <h2>邮箱处理记录</h2>
        <p class="hint">系统会自动同步邮箱中的发票邮件，并显示最近的处理记录。</p>
      </div>
      <el-button type="primary" :icon="Setting" @click="openConfigDialog">邮箱配置</el-button>
    </div>

    <el-card v-loading="loading" class="logs-card">
      <template #header><span>最近处理记录</span></template>

      <div v-if="isNew" class="empty-state">
        <p>要使用邮箱自动同步功能，请先
          <span class="link-like" @click="openConfigDialog">配置邮箱</span>
        </p>
      </div>

      <div v-else>
        <el-table :data="logs" stripe size="small" empty-text="暂无记录">
          <el-table-column prop="processed_at" label="处理时间" width="170">
            <template #default="{ row }">{{ new Date(row.processed_at).toLocaleString() }}</template>
          </el-table-column>
          <el-table-column prop="subject" label="邮件主题" min-width="240" show-overflow-tooltip />
          <el-table-column prop="invoices_created" label="新增发票" width="100" align="center" />
          <el-table-column prop="attachments_attached" label="关联行程单" width="120" align="center" />
          <el-table-column prop="note" label="备注" min-width="160" show-overflow-tooltip />
        </el-table>

        <div v-if="totalLogs > 0" class="pagination-row">
          <el-pagination
            v-model:current-page="currentPage"
            :page-size="pageSize"
            :total="totalLogs"
            :page-sizes="[10, 25, 50, 100]"
            layout="sizes, prev, pager, next, jumper"
            background
            @current-change="handleCurrentPageChange"
            @size-change="handlePageSizeChange"
          />
        </div>
      </div>
    </el-card>

    <el-dialog v-model="configDialogVisible" width="720px" title="邮箱配置" :destroy-on-close="false">
      <el-card class="form-card">
        <template #header>
          <div class="card-header">
            <span>{{ isNew ? '新建邮箱配置' : '当前邮箱配置' }}</span>
            <el-tag v-if="!isNew && form.enabled" type="success" size="small">已启用</el-tag>
            <el-tag v-else-if="!isNew" type="info" size="small">已禁用</el-tag>
          </div>
        </template>

        <el-form label-width="120px" label-position="right">
          <el-form-item label="邮箱地址" required>
            <el-input v-model="form.email_address" placeholder="例如 you@example.com" />
          </el-form-item>
          <el-form-item label="IMAP 服务器" required>
            <el-input v-model="form.imap_host" placeholder="例如 imap.qq.com / imap.exmail.qq.com" />
          </el-form-item>
          <el-form-item label="端口">
            <el-input-number v-model="form.imap_port" :min="1" :max="65535" />
            <el-checkbox v-model="form.use_ssl" style="margin-left: 16px">使用 SSL</el-checkbox>
          </el-form-item>
          <el-form-item label="登录用户名">
            <el-input v-model="form.username" placeholder="留空则使用邮箱地址" />
          </el-form-item>
          <el-form-item label="密码 / 授权码">
            <el-input
              v-model="form.password"
              type="password"
              show-password
              :placeholder="form.has_password ? '已保存（留空则不修改）' : '邮箱授权码或密码'"
            />
          </el-form-item>
          <el-form-item label="收件文件夹">
            <el-input v-model="form.folder" />
          </el-form-item>
          <el-form-item label="标题关键词">
            <el-input v-model="form.keywords" placeholder="逗号分隔，命中任一即处理" />
          </el-form-item>
          <el-form-item label="轮询间隔(分钟)">
            <el-input-number v-model="form.poll_interval_minutes" :min="1" :max="1440" />
          </el-form-item>
          <el-form-item label="启用">
            <el-switch v-model="form.enabled" />
          </el-form-item>
        </el-form>

        <div class="actions">
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
          <el-button :icon="Connection" :loading="testing" :disabled="isNew" @click="testConnection">测试连接</el-button>
          <el-button type="success" :icon="Refresh" :loading="syncing" :disabled="isNew" @click="syncNow">立即同步</el-button>
          <el-button v-if="!isNew" type="danger" :icon="DeleteFilled" plain @click="removeAccount">删除配置</el-button>
        </div>

        <div v-if="!isNew" class="status-row">
          <span>上次检查时间：{{ lastCheckedDisplay }}</span>
          <span v-if="form.last_error" class="error-text">最近错误：{{ form.last_error }}</span>
        </div>

        <el-alert
          v-if="lastSync"
          class="sync-summary"
          type="info"
          show-icon
          :closable="false"
          :title="`本次同步：检查 ${lastSync.checked} 封，命中关键词 ${lastSync.matched} 封，新增发票 ${lastSync.invoices_created} 张，关联行程单 ${lastSync.attachments_attached} 个`"
        >
          <template v-if="lastSync.errors?.length" #default>
            <div v-for="(err, idx) in lastSync.errors" :key="idx" class="error-text">{{ err }}</div>
          </template>
        </el-alert>
      </el-card>
    </el-dialog>
  </div>
</template>

<style scoped>
.email-settings {
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  width: 100%;
  max-width: 100%;
}

.email-settings > .el-card,
.email-settings > .logs-card {
  width: 100%;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-md);
}

.page-header h2 {
  margin: 0 0 var(--space-xs);
}

.hint {
  margin: 0;
  color: var(--apple-warm-gray);
  font-size: var(--text-body);
}

.empty-state {
  min-height: 260px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--apple-warm-gray);
  font-size: 16px;
}

.link-like {
  color: var(--el-color-primary);
  cursor: pointer;
  text-decoration: underline;
}

.card-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.actions {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
  margin-top: var(--space-sm);
}

.status-row {
  margin-top: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--apple-warm-gray);
}

.error-text {
  color: var(--el-color-danger);
}

.sync-summary {
  margin-top: var(--space-md);
}

.logs-card :deep(.el-card__body) {
  padding: 0;
}
</style>
