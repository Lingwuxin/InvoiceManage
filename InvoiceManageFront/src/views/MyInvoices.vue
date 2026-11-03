<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import request from '@/utils/request'
import { ElMessage } from 'element-plus'
import { UploadFilled, Delete, Tickets, Search } from '@element-plus/icons-vue'
import type { UploadInstance, UploadProps, UploadRequestOptions, UploadUserFile } from 'element-plus'

interface InvoiceAttachmentItem {
  id: number
  name: string
  file: string
  attachment_type?: string
  travel_start_date?: string | null
  travel_end_date?: string | null
  travel_total_amount?: string | null
  application_date?: string | null
  applicant_phone?: string
  created_at: string
}

interface InvoiceItem {
  id: number
  invoice_number: string
  amount: string | null
  invoice_date: string | null
  file: string
  created_at: string
  product_name?: string | null
  tax_rate?: string | null
  amount_in_words?: string | null
  is_submitted?: boolean
  invoice_type?: 'TRANSPORT' | 'ACCOMMODATION' | 'OTHER'
  departure_place?: string | null
  arrival_place?: string | null
  attachments?: InvoiceAttachmentItem[]
  trip_group_title?: string | null
  reimbursement_status?: 'APPROVED' | 'PENDING' | 'NONE'
}

const invoices = ref<InvoiceItem[]>([])
const loading = ref(false)
const filterType = ref('')
const searchText = ref('')
const dateFrom = ref('')
const dateTo = ref('')
const reimbStatusFilter = ref('')
const sortField = ref('created_at')
const sortOrder = ref<'asc' | 'desc'>('desc')
const invoiceDisplayMode = ref<'card' | 'table'>('card')
const currentPage = ref(1)
const pageSize = ref(calculateAdaptivePageSize())
const backendOrigin = window.location.origin
const previewVisible = ref(false)
const previewInvoice = ref<InvoiceItem | null>(null)
const uploadRef = ref<UploadInstance>()
const uploadList = ref<UploadUserFile[]>([])
const uploadingCount = ref(0)
const uploadedSuccessCount = ref(0)
const uploadedFailedCount = ref(0)
const previewFileUrl = computed(() => normalizeFileUrl(previewInvoice.value?.file || ''))
const previewIsPdf = computed(() => previewFileUrl.value.toLowerCase().includes('.pdf'))
const paginatedInvoices = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return invoices.value.slice(start, start + pageSize.value)
})
const invoiceTotal = computed(() => invoices.value.length)

function calculateAdaptivePageSize() {
  const width = window.innerWidth
  const height = window.innerHeight
  if (width >= 1600 && height >= 1000) return 25
  if (width >= 1280 && height >= 850) return 15
  if (width <= 768 || height <= 720) return 10
  return 15
}

function updateAdaptivePageSize() {
  const nextPageSize = calculateAdaptivePageSize()
  if (nextPageSize === pageSize.value) return
  pageSize.value = nextPageSize
  resetPagination()
}

function resetPagination() {
  currentPage.value = 1
}

function ensureValidCurrentPage() {
  const maxPage = Math.max(1, Math.ceil(invoiceTotal.value / pageSize.value))
  if (currentPage.value > maxPage) {
    currentPage.value = maxPage
  }
}

function handleCurrentPageChange(page: number) {
  currentPage.value = page
}

async function fetchInvoices(shouldResetPage = true) {
  loading.value = true
  try {
    const params: any = {}
    if (filterType.value) {
      params.invoice_type = filterType.value
    }
    if (searchText.value) {
      params.search = searchText.value
    }
    if (dateFrom.value) {
      params.date_from = dateFrom.value
    }
    if (dateTo.value) {
      params.date_to = dateTo.value
    }
    if (reimbStatusFilter.value) {
      params.reimbursement_status = reimbStatusFilter.value
    }
    const ordering = sortOrder.value === 'asc' ? sortField.value : `-${sortField.value}`
    params.ordering = ordering
    const { data } = await request.get('invoices/', { params })
    invoices.value = data
    if (shouldResetPage) {
      resetPagination()
    } else {
      ensureValidCurrentPage()
    }
  } finally {
    loading.value = false
  }
}

function toggleSort(field: string) {
  if (sortField.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortOrder.value = 'desc'
  }
  fetchInvoices()
}

function sortArrow(field: string): string {
  if (sortField.value !== field) return ''
  return sortOrder.value === 'asc' ? ' ↑' : ' ↓'
}

function resetFilters() {
  searchText.value = ''
  dateFrom.value = ''
  dateTo.value = ''
  filterType.value = ''
  reimbStatusFilter.value = ''
  sortField.value = 'created_at'
  sortOrder.value = 'desc'
  fetchInvoices()
}

function hasActiveFilters(): boolean {
  return !!(searchText.value || dateFrom.value || dateTo.value || filterType.value || reimbStatusFilter.value)
}

function normalizeFileUrl(file: string) {
  if (!file) return ''
  // 替换明确的 localhost/127.0.0.1 为当前窗口的 origin（避免局域网下访问其他电脑显示 localhost 拒绝连接）
  try {
    const url = new URL(file)
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return `${backendOrigin}${url.pathname}`
    }
  } catch (e) {
    // 忽略无效 URL 错误
  }
  if (/^https?:\/\//i.test(file)) return file
  if (file.startsWith('/')) return `${backendOrigin}${file}`
  return `${backendOrigin}/${file}`
}

function categoryText(category?: InvoiceItem['invoice_type']) {
  if (category === 'TRANSPORT') return '交通费'
  if (category === 'ACCOMMODATION') return '住宿费'
  return '其他费用'
}

function reimbursementStatusText(status?: InvoiceItem['reimbursement_status']) {
  if (status === 'APPROVED') return '已报销'
  if (status === 'PENDING') return '报销中'
  return '未报销'
}

function reimbursementStatusClass(status?: InvoiceItem['reimbursement_status']) {
  if (status === 'APPROVED') return 'reimb-approved'
  if (status === 'PENDING') return 'reimb-pending'
  return 'reimb-none'
}

function openInvoicePreview(invoice: InvoiceItem) {
  previewInvoice.value = {
    ...invoice,
    file: normalizeFileUrl(invoice.file),
  }
  previewVisible.value = true
}

function closeInvoicePreview() {
  previewVisible.value = false
  previewInvoice.value = null
}

function openPreviewInNewWindow() {
  if (!previewFileUrl.value) return
  window.open(previewFileUrl.value, '_blank')
}

function openAttachmentInNewWindow(attachment: InvoiceAttachmentItem) {
  if (!attachment.file) return
  window.open(normalizeFileUrl(attachment.file), '_blank')
}

function ensureInvoiceAttachmentList(invoiceId: number) {
  const invoice = invoices.value.find((item) => item.id === invoiceId)
  if (!invoice) return null
  invoice.attachments = invoice.attachments || []
  return invoice
}

function resolveUploadErrorMessage(error: unknown, uploadFile?: UploadUserFile) {
  const response = (uploadFile?.response || (error as any)?.response?.data) as
    | Record<string, any>
    | string
    | undefined
  const detail = typeof response === 'string'
    ? response
    : response?.detail || response?.non_field_errors || response?.message
  const messageText = Array.isArray(detail) ? detail[0] : detail

  if (messageText && String(messageText).includes('已存在')) return '发票编号重复，请检查'
  if (messageText && String(messageText).includes('发票解析失败')) return `上传失败：${messageText}`
  if (messageText && String(messageText).includes('只能上传PDF')) return '上传失败：仅支持 PDF 发票'
  return '上传失败，请重试'
}

const beforeUpload: UploadProps['beforeUpload'] = (rawFile) => {
  const isPdf = rawFile.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) {
    ElMessage.error('仅支持上传 PDF 格式的发票文件')
    return false
  }
  return true
}

const handleExceed: UploadProps['onExceed'] = () => {
  ElMessage.warning('单次最多选择 50 个文件')
}

const handleUploadSuccess = (response: any) => {
  uploadedSuccessCount.value += 1
  const uploadedInvoice = response as InvoiceItem
  const index = invoices.value.findIndex((item) => item.id === uploadedInvoice.id)
  if (index >= 0) {
    invoices.value.splice(index, 1, uploadedInvoice)
  } else {
    invoices.value.unshift(uploadedInvoice)
    resetPagination()
  }
}

const handleUploadError = (error: any, uploadFile: any) => {
  uploadedFailedCount.value += 1
  const msg = resolveUploadErrorMessage(error, uploadFile)
  const isDuplicate = msg.includes('重复')
  if (isDuplicate) {
    ElMessage.warning(`${uploadFile?.name || '文件'}：${msg}`)
  } else {
    ElMessage.error(`${uploadFile?.name || '文件'}：${msg}`)
  }
}

const handleUploadChange: UploadProps['onChange'] = (_, files) => {
  uploadList.value = files
}

const handleUploadRemove: UploadProps['onRemove'] = (_, files) => {
  uploadList.value = files
}

const handleUploadBatchComplete = () => {
  if (uploadingCount.value > 0) {
    uploadingCount.value -= 1
  }
  if (uploadingCount.value === 0) {
    const summary = `本次上传完成，成功 ${uploadedSuccessCount.value} 个，失败 ${uploadedFailedCount.value} 个`
    if (uploadedSuccessCount.value > 0) {
      ElMessage.success(summary)
    } else if (uploadedFailedCount.value > 0) {
      ElMessage.warning(summary)
    }
    uploadList.value = []
    uploadRef.value?.clearFiles()
    uploadedSuccessCount.value = 0
    uploadedFailedCount.value = 0
  }
}

const handleUploadBatchError = () => {
  if (uploadingCount.value > 0) {
    uploadingCount.value -= 1
  }
  if (uploadingCount.value === 0) {
    const summary = `本次上传完成，成功 ${uploadedSuccessCount.value} 个，失败 ${uploadedFailedCount.value} 个`
    ElMessage.warning(summary)
    uploadList.value = []
    uploadRef.value?.clearFiles()
    uploadedSuccessCount.value = 0
    uploadedFailedCount.value = 0
  }
}

const uploadInvoiceFile: UploadProps['httpRequest'] = async (options: UploadRequestOptions) => {
  const formData = new FormData()
  formData.append('file', options.file)
  try {
    const response = await request.post('invoices/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (!event.total) return
        options.onProgress?.({ percent: (event.loaded / event.total) * 100 } as any)
      },
    })
    options.onSuccess?.(response.data)
  } catch (error) {
    options.onError?.(error as any)
  }
}

function isTripStatementFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  return lower.includes('行程单') || lower.includes('trip') || lower.includes('itinerary')
}

async function submitUploadBatch() {
  if (!uploadList.value.length) {
    ElMessage.warning('请先选择要上传的发票文件')
    return
  }

  uploadedSuccessCount.value = 0
  uploadedFailedCount.value = 0
  uploadingCount.value = uploadList.value.length

  // 排序：普通发票 PDF 优先处理，行程单/附件 PDF 延后处理
  const sortedFiles = [...uploadList.value].sort((a, b) => {
    const aTrip = isTripStatementFile(a.name)
    const bTrip = isTripStatementFile(b.name)
    if (aTrip && !bTrip) return 1
    if (!aTrip && bTrip) return -1
    return 0
  })

  // 同步排序到 uploadList 以便 UI 反映实际处理顺序
  uploadList.value.splice(0, uploadList.value.length, ...sortedFiles)

  // 逐个顺序上传，确保发票 PDF 先于行程单进入后端处理
  for (const file of sortedFiles) {
    const options = {
      file: file.raw!,
      action: '',
      method: 'post',
      data: {} as Record<string, string>,
      filename: 'file',
      headers: {} as Record<string, string>,
      withCredentials: false,
      onProgress: (_event: any) => {},
      onSuccess: (response: any) => {
        handleUploadSuccess(response)
        handleUploadBatchComplete()
      },
      onError: (error: any) => {
        handleUploadError(error, file)
        handleUploadBatchError()
      },
    } satisfies UploadRequestOptions

    try {
      await uploadInvoiceFile!(options)
    } catch {
      // 错误已由 onError 回调处理
    }
  }
}

async function handleDelete(id: number) {
  try {
    await request.delete(`invoices/${id}/`)
    ElMessage.success('已删除')
    invoices.value = invoices.value.filter((i) => i.id !== id)
    ensureValidCurrentPage()
  } catch {
    ElMessage.error('删除失败')
  }
}

const uploadInvoiceAttachment = (invoiceId: number): UploadProps['httpRequest'] => async (options: UploadRequestOptions) => {
  const formData = new FormData()
  formData.append('file', options.file)
  try {
    const response = await request.post(`invoices/${invoiceId}/attachments/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    const invoice = ensureInvoiceAttachmentList(invoiceId)
    if (invoice) {
      invoice.attachments?.push({
        ...response.data,
        file: normalizeFileUrl(response.data.file),
      })
    }
    ElMessage.success('附件上传成功')
    options.onSuccess?.(response.data)
  } catch (error) {
    ElMessage.error('附件上传失败')
    options.onError?.(error as any)
  }
}

async function handleDeleteAttachment(invoiceId: number, attachmentId: number) {
  try {
    await request.delete(`invoices/${invoiceId}/attachments/${attachmentId}/`)
    const invoice = ensureInvoiceAttachmentList(invoiceId)
    if (invoice?.attachments) {
      invoice.attachments = invoice.attachments.filter((item) => item.id !== attachmentId)
    }
    ElMessage.success('附件已删除')
  } catch {
    ElMessage.error('删除附件失败')
  }
}

async function handleDeleteTripStatement(attachment: InvoiceAttachmentItem) {
  if (!previewInvoice.value) return
  await handleDeleteAttachment(previewInvoice.value.id, attachment.id)
  previewInvoice.value.attachments = previewInvoice.value.attachments?.filter((item) => item.id !== attachment.id) || []
}

onMounted(() => {
  updateAdaptivePageSize()
  window.addEventListener('resize', updateAdaptivePageSize)
  fetchInvoices()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateAdaptivePageSize)
})
</script>

<template>
  <div class="invoices-page">
    <!-- Page header -->
    <div class="page-header">
      <div>
        <p class="page-desc">{{ invoiceTotal }} 张发票</p>
      </div>
    </div>

    <!-- ── 筛选栏 ── -->
    <div class="filter-bar">
      <div class="filter-row">
        <el-input
          v-model="searchText"
          placeholder="搜索发票编号"
          clearable
          style="width: 200px"
          @clear="fetchInvoices"
          @keyup.enter="fetchInvoices"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-select
          v-model="filterType"
          placeholder="全部类型"
          style="width: 130px"
          clearable
          @change="fetchInvoices"
        >
          <el-option label="交通费" value="TRANSPORT" />
          <el-option label="住宿费" value="ACCOMMODATION" />
          <el-option label="其他费用" value="OTHER" />
        </el-select>
        <el-select
          v-model="reimbStatusFilter"
          placeholder="报销状态"
          style="width: 120px"
          clearable
          @change="fetchInvoices"
        >
          <el-option label="已报销" value="APPROVED" />
          <el-option label="报销中" value="PENDING" />
          <el-option label="未报销" value="NONE" />
        </el-select>
        <el-date-picker
          v-model="dateFrom"
          type="date"
          placeholder="起始日期"
          style="width: 140px"
          value-format="YYYY-MM-DD"
          @change="fetchInvoices"
        />
        <span class="date-sep">—</span>
        <el-date-picker
          v-model="dateTo"
          type="date"
          placeholder="截止日期"
          style="width: 140px"
          value-format="YYYY-MM-DD"
          @change="fetchInvoices"
        />
        <el-button v-if="hasActiveFilters()" text type="primary" @click="resetFilters">
          重置筛选
        </el-button>
        <div class="display-toggle" role="group" aria-label="发票展示方式">
          <button
            class="display-toggle-btn"
            :class="{ active: invoiceDisplayMode === 'card' }"
            @click="invoiceDisplayMode = 'card'"
          >卡片视图</button>
          <button
            class="display-toggle-btn"
            :class="{ active: invoiceDisplayMode === 'table' }"
            @click="invoiceDisplayMode = 'table'"
          >列表视图</button>
        </div>
      </div>
    </div>

    <!-- Upload panel -->
    <div class="upload-section">
      <el-upload
        ref="uploadRef"
        v-model:file-list="uploadList"
        class="invoice-uploader"
        drag
        multiple
        :limit="50"
        accept=".pdf"
        name="file"
        :auto-upload="false"
        :before-upload="beforeUpload"
        :http-request="uploadInvoiceFile"
        :on-success="(_response: any) => { handleUploadSuccess(_response); handleUploadBatchComplete() }"
        :on-error="(error: any, uploadFile: any) => { handleUploadError(error, uploadFile); handleUploadBatchError() }"
        :on-change="handleUploadChange"
        :on-remove="handleUploadRemove"
        :on-exceed="handleExceed"
      >
        <el-icon class="upload-icon"><UploadFilled /></el-icon>
        <div class="upload-text">将 PDF 发票或网约车行程单拖到此处，或 <em>点击选择本地文件</em></div>
        <template #tip>
          <div class="upload-tip">支持批量选择和拖拽上传，单次最多 50 个文件；行程单会按申请日期 + 金额自动绑定对应发票</div>
        </template>
      </el-upload>
      <div class="upload-actions" v-if="uploadList.length">
        <el-button type="primary" @click="submitUploadBatch" :loading="uploadingCount > 0">
          上传 {{ uploadList.length }} 个文件
        </el-button>
      </div>
    </div>

    <!-- Invoice list/card (list mode) -->
    <div v-loading="loading" class="invoice-list-section">
      <div v-if="invoiceDisplayMode === 'card' && invoices.length" class="invoice-card-grid">
        <article
          v-for="invoice in paginatedInvoices"
          :key="invoice.id"
          class="invoice-card"
          @click="openInvoicePreview(invoice)"
        >
          <div class="invoice-card-header">
            <div class="invoice-card-title">
              <span class="invoice-num">{{ invoice.invoice_number || '无编号' }}</span>
              <span class="type-tag" :class="'type-' + (invoice.invoice_type || 'OTHER').toLowerCase()">
                {{ categoryText(invoice.invoice_type) }}
              </span>
            </div>
            <button class="btn-icon btn-delete" @click.stop="handleDelete(invoice.id)" title="删除">
              <el-icon><Delete /></el-icon>
            </button>
          </div>
          <div class="invoice-card-amount">
            <span v-if="invoice.amount">¥{{ invoice.amount }}</span>
            <span v-else class="amount-placeholder">—</span>
          </div>
          <div class="invoice-card-meta">
            <div>
              <span>日期</span>
              <strong>{{ invoice.invoice_date || '—' }}</strong>
            </div>
            <div>
              <span>商品/服务</span>
              <strong>{{ invoice.product_name || '—' }}</strong>
            </div>
            <div>
              <span>归属行程</span>
              <strong>{{ invoice.trip_group_title || '—' }}</strong>
            </div>
            <div>
              <span>附件</span>
              <strong>{{ invoice.attachments?.length ? `${invoice.attachments.length} 个` : '—' }}</strong>
            </div>
          </div>
          <div class="invoice-card-footer">
            <span class="reimb-tag" :class="reimbursementStatusClass(invoice.reimbursement_status)">
              {{ reimbursementStatusText(invoice.reimbursement_status) }}
            </span>
            <span class="invoice-card-time">上传于 {{ invoice.created_at?.slice(0, 10) || '—' }}</span>
          </div>
        </article>
      </div>

      <div v-if="invoiceDisplayMode === 'table' && invoices.length" class="invoice-table-container">
        <table class="invoice-table">
        <thead>
          <tr>
            <th class="col-number sortable" @click="toggleSort('invoice_number')">
              发票编号<span class="sort-arrow">{{ sortArrow('invoice_number') }}</span>
            </th>
            <th class="col-type">类型</th>
            <th class="col-date sortable" @click="toggleSort('invoice_date')">
              日期<span class="sort-arrow">{{ sortArrow('invoice_date') }}</span>
            </th>
            <th class="col-product">商品/服务</th>
            <th class="col-amount sortable" @click="toggleSort('amount')">
              金额<span class="sort-arrow">{{ sortArrow('amount') }}</span>
            </th>
            <th class="col-trip">归属行程</th>
            <th class="col-reimb">报销状态</th>
            <th class="col-attachment">附件</th>
            <th class="col-action"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="invoice in paginatedInvoices" :key="invoice.id" class="invoice-row" @click="openInvoicePreview(invoice)">
            <td class="col-number">
              <span class="invoice-num">{{ invoice.invoice_number || '无编号' }}</span>
            </td>
            <td class="col-type">
              <span class="type-tag" :class="'type-' + (invoice.invoice_type || 'OTHER').toLowerCase()">
                {{ categoryText(invoice.invoice_type) }}
              </span>
            </td>
            <td class="col-date">{{ invoice.invoice_date || '—' }}</td>
            <td class="col-product">{{ invoice.product_name || '—' }}</td>
            <td class="col-amount">
              <span v-if="invoice.amount" class="amount-value">¥{{ invoice.amount }}</span>
              <span v-else class="amount-placeholder">—</span>
            </td>
            <td class="col-trip">
              <span v-if="invoice.trip_group_title" class="trip-title">{{ invoice.trip_group_title }}</span>
              <span v-else class="cell-placeholder">—</span>
            </td>
            <td class="col-reimb">
              <span class="reimb-tag" :class="reimbursementStatusClass(invoice.reimbursement_status)">
                {{ reimbursementStatusText(invoice.reimbursement_status) }}
              </span>
            </td>
            <td class="col-attachment">
              <span v-if="invoice.attachments?.length" class="attach-badge">
                {{ invoice.attachments.length }}<template v-if="invoice.attachments.some((item) => item.attachment_type === 'RIDE_HAILING_TRIP_STATEMENT')"> · 行程单</template>
              </span>
              <span v-else class="attach-empty">—</span>
            </td>
            <td class="col-action" @click.stop>
              <button class="btn-icon btn-delete" @click="handleDelete(invoice.id)" title="删除">
                <el-icon><Delete /></el-icon>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      </div>

      <div v-if="invoices.length" class="invoice-pagination">
        <span class="pagination-summary">
          第 {{ (currentPage - 1) * pageSize + 1 }}-{{ Math.min(currentPage * pageSize, invoiceTotal) }} 条，共 {{ invoiceTotal }} 条
        </span>
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="invoiceTotal"
          layout="prev, pager, next, jumper"
          background
          @current-change="handleCurrentPageChange"
        />
      </div>

      <div v-if="!invoices.length && !loading" class="empty-state">
        <el-icon class="empty-icon"><Tickets /></el-icon>
        <p>暂无发票，上传您的第一张发票吧</p>
      </div>
    </div>

    <!-- Preview drawer (reuses MyTrips approach) -->
    <el-drawer
      v-model="previewVisible"
      direction="btt"
      size="72%"
      :with-header="false"
      destroy-on-close
      class="invoice-preview-drawer"
      @close="closeInvoicePreview"
    >
      <div v-if="previewInvoice" class="preview-layout">
        <div class="preview-main">
          <div class="preview-section-title">发票预览</div>
          <div class="preview-frame-wrapper">
            <iframe
              v-if="previewIsPdf"
              :src="`${previewFileUrl}#toolbar=0&navpanes=0&scrollbar=1`"
              class="preview-frame"
              title="发票预览"
            />
            <img v-else :src="previewFileUrl" class="preview-image" alt="发票预览" />
          </div>
        </div>
        <div class="preview-side">
          <div class="preview-toolbar">
            <div class="preview-section-title">票据信息</div>
            <el-button type="primary" plain @click="openPreviewInNewWindow">新窗口打开</el-button>
          </div>
          <div class="preview-info-list">
            <div class="preview-info-item">
              <span class="preview-info-label">发票编号</span>
              <span class="preview-info-value">{{ previewInvoice.invoice_number || '—' }}</span>
            </div>
            <div class="preview-info-item">
              <span class="preview-info-label">类型</span>
              <span class="preview-info-value">{{ categoryText(previewInvoice.invoice_type) }}</span>
            </div>
            <div class="preview-info-item">
              <span class="preview-info-label">金额</span>
              <span class="preview-info-value">¥{{ previewInvoice.amount || '0.00' }}</span>
            </div>
            <div class="preview-info-item">
              <span class="preview-info-label">开票日期</span>
              <span class="preview-info-value">{{ previewInvoice.invoice_date || '—' }}</span>
            </div>
            <div class="preview-info-item">
              <span class="preview-info-label">发票内容</span>
              <span class="preview-info-value">{{ previewInvoice.product_name || '—' }}</span>
            </div>
            <div class="preview-info-item">
              <span class="preview-info-label">税率</span>
              <span class="preview-info-value">{{ previewInvoice.tax_rate || '—' }}</span>
            </div>
            <div class="preview-info-item preview-info-item-block">
              <span class="preview-info-label">大写金额</span>
              <span class="preview-info-value">{{ previewInvoice.amount_in_words || '—' }}</span>
            </div>
            <div class="preview-info-item">
              <span class="preview-info-label">归属行程</span>
              <span class="preview-info-value">{{ previewInvoice.trip_group_title || '—' }}</span>
            </div>
            <div class="preview-info-item">
              <span class="preview-info-label">报销状态</span>
              <span class="preview-info-value">
                <span class="reimb-tag" :class="reimbursementStatusClass(previewInvoice.reimbursement_status)">
                  {{ reimbursementStatusText(previewInvoice.reimbursement_status) }}
                </span>
              </span>
            </div>
            <div class="preview-info-item preview-info-item-block" v-if="previewInvoice.departure_place || previewInvoice.arrival_place">
              <span class="preview-info-label">行程路线</span>
              <span class="preview-info-value">{{ previewInvoice.departure_place || '—' }} → {{ previewInvoice.arrival_place || '—' }}</span>
            </div>
            <template v-for="attachment in previewInvoice.attachments || []" :key="attachment.id">
              <div v-if="attachment.attachment_type === 'RIDE_HAILING_TRIP_STATEMENT'" class="preview-info-item preview-info-item-block statement-info-card">
                <div class="statement-card-header">
                  <span class="preview-info-label">网约车行程单</span>
                  <div class="statement-card-actions">
                    <el-button type="primary" text size="small" @click="openAttachmentInNewWindow(attachment)">查看原件</el-button>
                    <el-button type="danger" text size="small" @click="handleDeleteTripStatement(attachment)">删除</el-button>
                  </div>
                </div>
                <div class="statement-detail-grid">
                  <div>
                    <span class="statement-detail-label">行程周期</span>
                    <strong>{{ attachment.travel_start_date || '—' }} 至 {{ attachment.travel_end_date || '—' }}</strong>
                  </div>
                  <div>
                    <span class="statement-detail-label">行程总金额</span>
                    <strong>¥{{ attachment.travel_total_amount || '0.00' }}</strong>
                  </div>
                  <div>
                    <span class="statement-detail-label">申请日期</span>
                    <strong>{{ attachment.application_date || '—' }}</strong>
                  </div>
                  <div>
                    <span class="statement-detail-label">申请人手机号</span>
                    <strong>{{ attachment.applicant_phone || '—' }}</strong>
                  </div>
                  <div class="statement-detail-full">
                    <span class="statement-detail-label">文件名称</span>
                    <strong>{{ attachment.name || '—' }}</strong>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
/* ============================================================
   MyInvoices — Apple‑Design Table
   ============================================================ */

.invoices-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

/* ---- Page Header ---- */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-lg);
}

.page-header h2 {
  font-size: var(--text-hero);
  font-weight: 700;
  letter-spacing: var(--tracking-hero);
  color: var(--apple-black);
  margin: 0;
  line-height: 1.2;
}

.page-desc {
  margin: var(--space-xs) 0 0;
  font-size: var(--text-caption);
  color: var(--apple-gray-500);
  letter-spacing: var(--tracking-caption);
}

.header-actions {
  flex-shrink: 0;
}

/* ---- Upload Section ---- */
.upload-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.invoice-uploader {
  width: 100%;
}

.invoice-uploader :deep(.el-upload-dragger) {
  border: 1px dashed var(--apple-gray-300);
  border-radius: var(--radius-md);
  background: var(--apple-white);
  padding: var(--space-lg);
  transition: border-color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out);
}

.invoice-uploader :deep(.el-upload-dragger:hover) {
  border-color: var(--apple-blue);
  background: color-mix(in srgb, var(--apple-blue) 4%, transparent);
}

.invoice-uploader :deep(.el-upload-dragger.is-dragover) {
  border-color: var(--apple-blue);
  background: color-mix(in srgb, var(--apple-blue) 8%, transparent);
}

.upload-icon {
  font-size: 32px;
  color: var(--apple-gray-400);
  margin-bottom: var(--space-sm);
}

.upload-text {
  font-size: var(--text-body);
  color: var(--apple-gray-600);
  letter-spacing: var(--tracking-body);
}

.upload-text em {
  font-style: normal;
  color: var(--apple-blue);
  font-weight: 500;
}

.upload-tip {
  font-size: var(--text-caption);
  color: var(--apple-gray-400);
  margin-top: var(--space-xs);
}

.upload-actions {
  display: flex;
  justify-content: flex-end;
}

/* ---- Invoice Table (Apple Style) ---- */
.invoice-list-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.invoice-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-md);
}

.invoice-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-lg);
  background: var(--apple-white);
  border: 1px solid var(--apple-gray-150, #e8ecf1);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out);
}

.invoice-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--apple-blue) 35%, transparent);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.08);
}

.invoice-card-header,
.invoice-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.invoice-card-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.invoice-card-title .invoice-num {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.invoice-card-amount {
  font-size: 28px;
  font-weight: 700;
  color: var(--apple-black);
  letter-spacing: -0.02em;
}

.invoice-card-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
}

.invoice-card-meta div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.invoice-card-meta span {
  font-size: 12px;
  color: var(--apple-gray-500);
}

.invoice-card-meta strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 500;
  color: var(--apple-black);
}

.invoice-card-time {
  font-size: 12px;
  color: var(--apple-gray-400);
}

.invoice-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background: var(--apple-white);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.pagination-summary {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--apple-gray-500);
}

.invoice-table-container {
  background: var(--apple-white);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.invoice-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-body);
  letter-spacing: var(--tracking-body);
}

.invoice-table thead {
  border-bottom: 1px solid var(--apple-gray-200);
}

.invoice-table th {
  text-align: left;
  padding: 12px var(--space-md);
  font-size: var(--text-caption);
  font-weight: 600;
  color: var(--apple-gray-500);
  letter-spacing: var(--tracking-caption);
  text-transform: uppercase;
  user-select: none;
  white-space: nowrap;
}

.invoice-table td {
  padding: 14px var(--space-md);
  color: var(--apple-black);
  border-bottom: 1px solid var(--apple-gray-100);
  vertical-align: middle;
}

.invoice-table tbody tr {
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out);
}

.invoice-table tbody tr:hover {
  background: color-mix(in srgb, var(--apple-blue) 4%, transparent);
}

.invoice-table tbody tr:last-child td {
  border-bottom: none;
}

/* Column widths */
.col-number { width: 16%; }
.col-type { width: 9%; }
.col-date { width: 10%; }
.col-product { width: 16%; }
.col-amount { width: 10%; text-align: right; }
.col-trip { width: 14%; }
.col-reimb { width: 9%; text-align: center; }
.col-attachment { width: 8%; text-align: center; }
.col-action { width: 8%; text-align: center; }

.invoice-table th.col-amount,
.invoice-table th.col-reimb,
.invoice-table th.col-attachment,
.invoice-table th.col-action {
  text-align: center;
}

/* Cell content */
.invoice-num {
  font-weight: 500;
  color: var(--apple-black);
}

.type-tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: var(--tracking-caption);
  white-space: nowrap;
}

.type-transport {
  background: color-mix(in srgb, var(--apple-blue) 10%, transparent);
  color: var(--apple-blue);
}

.type-accommodation {
  background: color-mix(in srgb, var(--apple-warning) 12%, transparent);
  color: color-mix(in srgb, var(--apple-warning) 90%, black);
}

.type-other {
  background: var(--apple-gray-100);
  color: var(--apple-gray-600);
}

.amount-value {
  font-weight: 600;
  color: var(--apple-black);
}

.amount-placeholder {
  color: var(--apple-gray-400);
}

.attach-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--apple-blue) 8%, transparent);
  color: var(--apple-blue);
  font-size: 12px;
  font-weight: 500;
}

.statement-info-card {
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--apple-blue) 12%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--apple-blue) 4%, transparent);
}

.statement-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.statement-card-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
}

.statement-detail-grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 14px;
}

.statement-detail-grid > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.statement-detail-label {
  font-size: 12px;
  color: var(--apple-gray-500);
}

.statement-detail-grid strong {
  font-size: 14px;
  color: var(--apple-black);
  font-weight: 600;
  word-break: break-word;
}

.statement-detail-full {
  grid-column: 1 / -1;
}

.attach-empty {
  color: var(--apple-gray-300);
}

.trip-title {
  font-weight: 500;
  color: var(--apple-black);
}

.cell-placeholder {
  color: var(--apple-gray-300);
}

/* Reimbursement status tag */
.reimb-tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: var(--tracking-caption);
  white-space: nowrap;
}

.reimb-approved {
  background: color-mix(in srgb, var(--apple-green, #34c759) 12%, transparent);
  color: var(--apple-green, #34c759);
}

.reimb-pending {
  background: color-mix(in srgb, var(--apple-warning) 12%, transparent);
  color: color-mix(in srgb, var(--apple-warning) 90%, black);
}

.reimb-none {
  background: var(--apple-gray-100);
  color: var(--apple-gray-500);
}

/* Action button */
.btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  color: var(--apple-gray-400);
  font-size: 16px;
  transition: all var(--duration-fast) var(--ease-out);
}

.btn-icon:hover {
  background: var(--apple-gray-100);
  color: var(--apple-gray-600);
}

.btn-delete:hover {
  background: color-mix(in srgb, var(--apple-red) 10%, transparent);
  color: var(--apple-red);
}

/* ---- Empty State ---- */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px var(--space-xl);
  color: var(--apple-gray-400);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: var(--space-md);
}

.empty-state p {
  font-size: var(--text-body);
  letter-spacing: var(--tracking-body);
  margin: 0;
}

/* ---- Preview Drawer (reuses MyTrips approach) ---- */
.preview-layout {
  height: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.85fr);
  gap: 20px;
}

.preview-main,
.preview-side {
  min-height: 0;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  padding: 16px;
}

.preview-section-title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.preview-frame-wrapper {
  margin-top: 16px;
  height: calc(100% - 42px);
  min-height: 420px;
  border-radius: 12px;
  background: var(--apple-gray-50);
  overflow: hidden;
}

.preview-frame,
.preview-image {
  width: 100%;
  height: 100%;
  border: 0;
  object-fit: contain;
  background: var(--apple-gray-50);
}

.preview-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.preview-info-list {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 16px;
}

.preview-info-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 10px;
  border-bottom: 1px solid #f0f2f5;
}

.preview-info-item-block {
  grid-column: 1 / -1;
}

.preview-info-label {
  font-size: 13px;
  color: var(--apple-gray-500);
}

.preview-info-value {
  font-size: 15px;
  color: var(--apple-black);
  word-break: break-word;
}

/* ---- View Toggle ---- */
.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.view-toggle {
  display: flex;
  background: var(--apple-gray-100);
  border-radius: var(--radius-pill);
  padding: 3px;
  gap: 0;
}

.toggle-btn {
  padding: 6px 18px;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  color: var(--apple-gray-500);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  letter-spacing: var(--tracking-caption);
}

.toggle-btn.active {
  background: var(--apple-white);
  color: var(--apple-black);
  box-shadow: var(--shadow-sm);
}

.toggle-btn:hover:not(.active) {
  color: var(--apple-gray-700);
}

/* ---- Timeline Container ---- */
.timeline-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.timeline-wrapper {
  position: relative;
  padding-left: 40px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* timeline vertical line */
.timeline-wrapper::before {
  content: '';
  position: absolute;
  left: 18px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--apple-gray-200);
  border-radius: 1px;
}

/* ---- Separator Spot (insertion point) ---- */
.separator-spot {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  height: 36px;
  margin: 2px 0;
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out);
}

.separator-spot.hover,
.separator-spot:hover {
  opacity: 1;
}

.separator-spot-top {
  height: 44px;
}

.add-separator-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border: 1px dashed var(--apple-gray-300);
  border-radius: var(--radius-pill);
  background: var(--apple-white);
  color: var(--apple-gray-400);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  white-space: nowrap;
}

.add-separator-btn:hover {
  border-color: var(--apple-blue);
  color: var(--apple-blue);
  background: color-mix(in srgb, var(--apple-blue) 4%, transparent);
}

.add-sep-icon {
  font-size: 16px;
  font-weight: 600;
  line-height: 1;
}

.add-sep-text {
  font-size: 11px;
  font-weight: 500;
}

/* ---- Timeline Invoice Card ---- */
.timeline-invoice-card {
  display: flex;
  gap: var(--space-md);
  padding: 14px 16px;
  background: var(--apple-white);
  border: 1px solid var(--apple-gray-150, #e8ecf1);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  position: relative;
  z-index: 1;
}

.timeline-invoice-card:hover {
  border-color: var(--apple-blue);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  transform: translateY(-1px);
}

.timeline-dot {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: -52px;
  position: relative;
  z-index: 2;
  background: var(--apple-white);
  border: 2px solid var(--apple-gray-300);
  font-size: 16px;
}

.timeline-dot.mode-air {
  border-color: #5b9bd5;
  background: #e8f0fe;
}

.timeline-dot.mode-rail {
  border-color: #7bc67e;
  background: #e8f5e9;
}

.timeline-dot.mode-other {
  border-color: var(--apple-gray-300);
  background: var(--apple-gray-50);
}

.dot-emoji {
  font-size: 14px;
  line-height: 1;
}

.timeline-card-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.timeline-card-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.timeline-invoice-num {
  font-weight: 600;
  font-size: 14px;
  color: var(--apple-black);
}

.timeline-mode-tag {
  display: inline-block;
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 500;
}

.timeline-mode-tag.mode-air {
  background: #e8f0fe;
  color: #5b9bd5;
}

.timeline-mode-tag.mode-rail {
  background: #e8f5e9;
  color: #5b9a5e;
}

.timeline-mode-tag.mode-other {
  background: var(--apple-gray-100);
  color: var(--apple-gray-500);
}

.timeline-date {
  font-size: 12px;
  color: var(--apple-gray-500);
  margin-left: auto;
}

.timeline-route {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.route-place {
  color: var(--apple-gray-600);
  font-weight: 500;
}

.route-place.home {
  color: var(--apple-blue);
  font-weight: 600;
}

.route-place.home::after {
  content: ' 🏠';
  font-size: 11px;
}

.route-arrow {
  color: var(--apple-gray-400);
  font-size: 11px;
}

.timeline-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.timeline-product {
  font-size: 12px;
  color: var(--apple-gray-500);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-amount {
  font-weight: 600;
  font-size: 14px;
  color: var(--apple-black);
  flex-shrink: 0;
}

/* 段尾发票卡片 */
.timeline-invoice-card.segment-end {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  border-bottom-color: transparent;
  margin-bottom: 0;
}

.timeline-invoice-card.end-auto {
  border-color: color-mix(in srgb, var(--apple-green, #34c759) 30%, transparent);
  background: color-mix(in srgb, var(--apple-green, #34c759) 2%, var(--apple-white));
}

.timeline-invoice-card.end-manual {
  border-color: color-mix(in srgb, var(--apple-warning) 30%, transparent);
  background: color-mix(in srgb, var(--apple-warning) 2%, var(--apple-white));
}

.timeline-invoice-card.end-both {
  border-color: color-mix(in srgb, var(--apple-blue) 30%, transparent);
  background: color-mix(in srgb, var(--apple-blue) 2%, var(--apple-white));
}

/* ---- Timeline Separator ---- */
.timeline-separator {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 6px 0;
  margin: 2px 0;
  position: relative;
  z-index: 1;
}

/* 自动闭环标记 */
.timeline-auto-close .separator-label {
  background: color-mix(in srgb, var(--apple-green, #34c759) 8%, transparent);
  border-color: color-mix(in srgb, var(--apple-green, #34c759) 25%, transparent);
  color: color-mix(in srgb, var(--apple-green, #34c759) 85%, black);
}

.auto-close-label .sep-icon {
  font-size: 14px;
}

/* 同时自动闭环的手动分隔符 */
.timeline-separator.also-auto .separator-label {
  background: color-mix(in srgb, var(--apple-blue) 6%, transparent);
  border-color: color-mix(in srgb, var(--apple-blue) 22%, transparent);
}

.both-label {
  color: var(--apple-blue);
}

.auto-hint {
  font-size: 10px;
  color: var(--apple-gray-400);
  font-weight: 400;
}

.separator-line {
  flex: 1;
  height: 1px;
  background: repeating-linear-gradient(
    to right,
    var(--apple-gray-300) 0,
    var(--apple-gray-300) 4px,
    transparent 4px,
    transparent 8px
  );
}

.separator-label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 14px;
  background: color-mix(in srgb, var(--apple-warning) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--apple-warning) 20%, transparent);
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 500;
  color: color-mix(in srgb, var(--apple-warning) 85%, black);
  white-space: nowrap;
  flex-shrink: 0;
}

.sep-icon {
  font-size: 13px;
}

.sep-delete-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--apple-gray-400);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  transition: all var(--duration-fast) var(--ease-out);
}

.sep-delete-btn:hover {
  background: color-mix(in srgb, var(--apple-red) 12%, transparent);
  color: var(--apple-red);
}

/* ---- Segments Overview ---- */
.segments-overview {
  background: var(--apple-white);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--space-lg);
}

.segments-title {
  font-size: var(--text-heading);
  font-weight: 600;
  color: var(--apple-black);
  margin: 0 0 var(--space-md);
}

.segment-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.segment-card {
  padding: 14px 18px;
  background: var(--apple-gray-50);
  border-radius: var(--radius-md);
  border: 1px solid var(--apple-gray-150, #e8ecf1);
}

.segment-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.segment-no {
  font-weight: 600;
  font-size: 14px;
  color: var(--apple-black);
}

.segment-count {
  font-size: 12px;
  color: var(--apple-gray-500);
  background: var(--apple-gray-200);
  padding: 2px 10px;
  border-radius: var(--radius-pill);
}

.segment-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.seg-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 8px;
  border-radius: var(--radius-pill);
}

.seg-badge-auto {
  background: color-mix(in srgb, var(--apple-green, #34c759) 10%, transparent);
  color: var(--apple-green, #34c759);
}

.seg-badge-manual {
  background: color-mix(in srgb, var(--apple-warning) 10%, transparent);
  color: color-mix(in srgb, var(--apple-warning) 85%, black);
}

.seg-badge-open {
  background: color-mix(in srgb, var(--apple-blue) 8%, transparent);
  color: var(--apple-blue);
  animation: badgePulse 2s ease-in-out infinite;
}

@keyframes badgePulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.segment-card.open-segment {
  border-color: color-mix(in srgb, var(--apple-blue) 20%, transparent);
  border-style: dashed;
}

.segment-dates {
  font-size: 13px;
  color: var(--apple-gray-600);
  margin-bottom: 6px;
}

.segment-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 12px;
}

.seg-arrow {
  color: var(--apple-gray-400);
  font-size: 10px;
}

.seg-place {
  color: var(--apple-gray-600);
  font-weight: 500;
}

.seg-place.home {
  color: var(--apple-blue);
  font-weight: 600;
}

/* ---- Filter Bar ---- */
.filter-bar {
  background: var(--apple-white);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--space-md) var(--space-lg);
}

.filter-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.date-sep {
  color: var(--apple-gray-400);
  font-size: 13px;
  flex-shrink: 0;
}

.display-toggle {
  display: inline-flex;
  margin-left: auto;
  padding: 3px;
  border-radius: var(--radius-pill);
  background: var(--apple-gray-100);
}

.display-toggle-btn {
  padding: 6px 14px;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--apple-gray-500);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.display-toggle-btn.active {
  background: var(--apple-white);
  color: var(--apple-black);
  box-shadow: var(--shadow-sm);
}

.display-toggle-btn:hover:not(.active) {
  color: var(--apple-gray-700);
}

/* ---- Sortable Table Headers ---- */
.invoice-table th.sortable {
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-out);
}

.invoice-table th.sortable:hover {
  color: var(--apple-blue);
}

.sort-arrow {
  font-size: 11px;
  color: var(--apple-blue);
  margin-left: 2px;
}

/* ---- Separator Dialog ---- */
.separator-dialog-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.separator-dialog-hint {
  font-size: 13px;
  color: var(--apple-gray-500);
  margin: 0;
  line-height: 1.5;
}

/* ---- Responsive ---- */
@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .header-actions {
    width: 100%;
  }

  .header-actions :deep(.el-select) {
    width: 100% !important;
  }

  .filter-bar {
    overflow-x: auto;
  }

  .filter-row {
    flex-wrap: wrap;
  }

  .display-toggle {
    width: 100%;
    margin-left: 0;
  }

  .display-toggle-btn {
    flex: 1;
  }

  .upload-actions {
    flex-direction: column;
  }

  .invoice-card-grid {
    grid-template-columns: 1fr;
  }

  .invoice-pagination {
    align-items: stretch;
    flex-direction: column;
  }

  .invoice-pagination :deep(.el-pagination) {
    justify-content: center;
    flex-wrap: wrap;
  }

  .invoice-table {
    font-size: 13px;
  }

  .invoice-table th,
  .invoice-table td {
    padding: 10px 8px;
  }

  .col-product { display: none; }
  .col-attachment { display: none; }

  .preview-layout {
    grid-template-columns: 1fr;
  }

  .preview-info-list {
    grid-template-columns: 1fr;
  }

  .timeline-wrapper {
    padding-left: 32px;
  }

  .timeline-dot {
    width: 28px;
    height: 28px;
    margin-left: -42px;
    font-size: 13px;
  }

  .timeline-invoice-card {
    padding: 12px;
  }

  .segment-list {
    gap: var(--space-sm);
  }
}
</style>
