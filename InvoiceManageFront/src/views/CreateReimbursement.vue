<script setup lang="ts">
import { ref, onMounted, reactive, computed, watch } from 'vue'
import request from '@/utils/request'
import { ElMessage, type UploadProps, type UploadFile, type UploadRequestOptions } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { Upload, Plus, Delete, Document } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'

const TRIP_DRAFT_STORAGE_KEY = 'trip-reimbursement-draft'

const backendOrigin = window.location.origin
function normalizeFileUrl(file: string) {
  if (!file) return ''
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

interface Company {
  id: number
  name: string
}

interface Invoice {
  id: number
  invoice_number: string
  invoice_date: string
  amount: number
  file: string
  product_name: string
  invoice_type: string
  departure_place?: string
  arrival_place?: string
}

interface TransportItem {
  id: string
  departure_date: string
  departure_place: string
  arrival_date: string
  arrival_place: string
  transport_type: string
  quantity: number
  amount: number
  remark: string
}

interface AccommodationItem {
  id: string
  city: string
  num_nights: number
  standard_cost: number
  actual_cost: number
  amount: number
  remark: string
  subsidy_manual?: boolean
}

interface ExpenseItem {
  id: string
  expense_type: string
  expense_name: string
  quantity: number
  amount: number
  remark: string
}

interface ReimbursementForm {
  reimbursement_name: string
  company_id: number | null
  dept: string
  dept_leader: string
  traveler: string
  project_code: string
  project_name: string
  departure_date: string
  return_date: string
  departure_place: string
  purpose: string
  approver: string
  invoices: number[]
  transport_items: TransportItem[]
  accommodation_items: AccommodationItem[]
  expense_items: ExpenseItem[]
}

type ReimbursementDraft = Partial<ReimbursementForm> & {
  destination?: string
  travel_days?: string | number
}

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const companies = ref<Company[]>([])
const availableInvoices = ref<Invoice[]>([])
const invoiceDialogVisible = ref(false)
const currentInvoiceSection = ref<'transport' | 'accommodation' | 'expense'>('transport')
const selectedInvoices = ref<Invoice[]>([])
const dialogFilterType = ref('')

const form = reactive<ReimbursementForm>({
  reimbursement_name: '',
  company_id: null,
  dept: '',
  dept_leader: '',
  traveler: '',
  project_code: '',
  project_name: '',
  departure_date: '',
  return_date: '',
  departure_place: '',
  purpose: '',
  approver: '',
  invoices: [],
  transport_items: [],
  accommodation_items: [],
  expense_items: [],
})

const loading = ref(false)
const uploading = ref(false)
const signedContract = ref('是')
const advanceAmount = ref(0)
const supplementAmount = ref(0)
const refundAmount = ref(0)
const manualTravelDays = ref<number | null>(null)
const travelDaysManuallyEdited = ref(false)

const costDept = computed({
  get: () => form.dept,
  set: (value: string) => {
    form.dept = value
  },
})

const travelRange = computed({
  get: () => {
    if (!form.departure_date || !form.return_date) {
      return [] as string[]
    }
    return [form.departure_date, form.return_date]
  },
  set: (value: string[]) => {
    form.departure_date = value?.[0] ?? ''
    form.return_date = value?.[1] ?? ''
  },
})

const autoTravelDays = computed<number | null>(() => {
  if (!form.departure_date || !form.return_date) {
    return null
  }
  const start = new Date(form.departure_date)
  const end = new Date(form.return_date)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null
  }
  const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  return diff > 0 ? diff : null
})

const travelDays = computed(() => manualTravelDays.value ?? autoTravelDays.value)

const defaultTravelSubsidy = computed(() => {
  const days = travelDays.value ?? 0
  return days > 0 ? days * 60 : 0
})

watch(
  autoTravelDays,
  (value) => {
    if (!travelDaysManuallyEdited.value) {
      manualTravelDays.value = value
    }
  },
  { immediate: true }
)

watch(
  [defaultTravelSubsidy, () => form.accommodation_items.length] as const,
  () => {
    const value = defaultTravelSubsidy.value
    form.accommodation_items.forEach((item) => {
      if (!item.subsidy_manual) {
        item.amount = value
      }
    })
  },
  { immediate: true }
)

const exportTravelRange = computed(() => {
  if (!form.departure_date && !form.return_date) {
    return ''
  }
  if (form.departure_date && form.return_date) {
    return `${form.departure_date} 至 ${form.return_date}`
  }
  return form.departure_date || form.return_date
})

function handleTravelDaysChange(value: number | null | undefined) {
  if (value === null || value === undefined) {
    manualTravelDays.value = autoTravelDays.value
    travelDaysManuallyEdited.value = false
    return
  }

  manualTravelDays.value = value
  travelDaysManuallyEdited.value = true
}

const totalAmount = computed(() => {
  const sumTransport = form.transport_items.reduce((total, item) => total + (item.amount || 0), 0)
  // 差旅补贴(amount)不计入报销金额
  const sumAccommodation = form.accommodation_items.reduce(
    (total, item) => total + (item.actual_cost || 0),
    0
  )
  const sumExpense = form.expense_items.reduce((total, item) => total + (item.amount || 0), 0)
  return Number((sumTransport + sumAccommodation + sumExpense).toFixed(2))
})

const CITY_RATES: Record<string, number> = {
  '一线城市': 350,
  '新一线城市': 300,
  '二线城市': 250,
  '三线及以下城市': 200,
}

function calculateStandardCost(row: AccommodationItem) {
  const rate = CITY_RATES[row.city]
  if (rate) {
    row.standard_cost = rate * (row.num_nights || 0)
  }
}

function formatCnyUpper(amount: number) {
  if (!amount) {
    return '零元整'
  }
  const units = ['元', '拾', '佰', '仟', '万', '拾', '佰', '仟', '亿']
  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
  const fractionUnits = ['角', '分']
  const [integerPart = '0', fractionPart = ''] = amount.toFixed(2).split('.')
  let result = ''

  const intChars = integerPart.split('').reverse()
  intChars.forEach((char, index) => {
    const num = Number(char)
    const unit = units[index] || ''
    if (num === 0) {
      if (!result.startsWith('零') && !result.startsWith('元') && result !== '') {
        result = '零' + result
      }
    } else {
      result = (digits[num] || '') + unit + result
    }
  })

  result = result
    .replace(/零+/g, '零')
    .replace(/零(万|亿)/g, '$1')
    .replace(/零元/g, '元')

  const fractionChars = fractionPart.split('')
  const fractionText = fractionChars
    .map((char, index) => {
      const num = Number(char)
      return num ? `${digits[num]}${fractionUnits[index]}` : ''
    })
    .join('')

  return (result || '零元') + (fractionText || '整')
}

const totalAmountUpper = computed(() => formatCnyUpper(totalAmount.value))
const headerDate = computed(() => {
  const now = new Date()
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`
})

async function fetchCompanies() {
  loading.value = true
  try {
    // 模拟获取公司列表
    companies.value = [
      { id: 1, name: '淘数郑州' },
      { id: 2, name: '淘数北京' },
      { id: 3, name: '淘数上海' },
    ]
  } finally {
    loading.value = false
  }
}

async function fetchAvailableInvoices() {
  try {
    const params: any = { available_only: true }
    if (dialogFilterType.value) {
      params.invoice_type = dialogFilterType.value
    }
    const { data } = await request.get('invoices/', { params })
    availableInvoices.value = data
  } catch (error) {
    console.error('获取发票列表失败', error)
  }
}

function openInvoiceDialog(section: 'transport' | 'accommodation' | 'expense') {
  currentInvoiceSection.value = section
  selectedInvoices.value = []
  
  // 设置默认筛选条件
  if (section === 'transport') {
    dialogFilterType.value = 'TRANSPORT'
  } else if (section === 'accommodation') {
    dialogFilterType.value = 'ACCOMMODATION'
  } else {
    dialogFilterType.value = 'OTHER'
  }
  
  //fetchAvailableInvoices()
  invoiceDialogVisible.value = true
}

function handleInvoiceSelection() {
  if (selectedInvoices.value.length === 0) {
    ElMessage.warning('请选择至少一张发票')
    return
  }
  
  selectedInvoices.value.forEach(invoice => {
    processInvoiceData(invoice.amount, currentInvoiceSection.value, invoice)
  })
  
  invoiceDialogVisible.value = false
  ElMessage.success(`已添加 ${selectedInvoices.value.length} 张发票`)
}

function processInvoiceData(amount: number, section: 'transport' | 'accommodation' | 'expense', invoiceData: any = null) {
  if (invoiceData?.id && !form.invoices.includes(Number(invoiceData.id))) {
    form.invoices.push(Number(invoiceData.id))
  }
  if (section === 'transport') {
      const lastItem = form.transport_items.length > 0 ? form.transport_items[form.transport_items.length - 1] : undefined
      if (!lastItem || (lastItem.amount && lastItem.amount > 0)) {
        addTransportItem()
      }
      const newItem = form.transport_items[form.transport_items.length - 1]
      if (newItem) {
        newItem.amount = Number(amount) || 0
        if (invoiceData) {
          if (invoiceData.invoice_date) {
            newItem.departure_date = invoiceData.invoice_date
            // 铁路客票不填充到达时间（因为没有到达时间，且出发与到达通常同一天但逻辑上到达时间不必要）
            if (invoiceData.product_name !== '铁路客票') {
              newItem.arrival_date = invoiceData.invoice_date
            }
          }
          if (invoiceData.departure_place) newItem.departure_place = invoiceData.departure_place
          if (invoiceData.arrival_place) newItem.arrival_place = invoiceData.arrival_place
        }
      }
  } else if (section === 'accommodation') {
      const lastItem = form.accommodation_items.length > 0 ? form.accommodation_items[form.accommodation_items.length - 1] : undefined
      if (!lastItem || (lastItem.actual_cost && lastItem.actual_cost > 0)) {
        addAccommodationItem()
      }
      const newItem = form.accommodation_items[form.accommodation_items.length - 1]
      if (newItem) {
        newItem.actual_cost = Number(amount) || 0
      }
  } else if (section === 'expense') {
      const lastItem = form.expense_items.length > 0 ? form.expense_items[form.expense_items.length - 1] : undefined
      if (!lastItem || (lastItem.amount && lastItem.amount > 0)) {
        addExpenseItem()
      }
      const newItem = form.expense_items[form.expense_items.length - 1]
      if (newItem) {
        newItem.amount = Number(amount) || 0
        if (invoiceData?.product_name) {
             if (invoiceData.product_name.includes('餐饮')) newItem.expense_type = '餐饮费'
             else if (invoiceData.product_name.includes('通讯')) newItem.expense_type = '通讯费'
             else if (invoiceData.product_name.includes('车')) newItem.expense_type = '网约车'
        }
      }
  }
}

function addTransportItem() {
  form.transport_items.push({
    id: `transport-${Date.now()}`,
    departure_date: '',
    departure_place: '',
    arrival_date: '',
    arrival_place: '',
    transport_type: '高铁',
    quantity: 1,
    amount: 0,
    remark: '',
  })
}

function removeTransportItem(id: string) {
  const index = form.transport_items.findIndex((item) => item.id === id)
  if (index > -1) {
    form.transport_items.splice(index, 1)
  }
}

function addAccommodationItem() {
  form.accommodation_items.push({
    id: `accommodation-${Date.now()}`,
    city: '',
    num_nights: 1,
    standard_cost: 0,
    actual_cost: 0,
    amount: defaultTravelSubsidy.value,
    remark: '',
    subsidy_manual: false,
  })
}

function removeAccommodationItem(id: string) {
  const index = form.accommodation_items.findIndex((item) => item.id === id)
  if (index > -1) {
    form.accommodation_items.splice(index, 1)
  }
}

function handleAccommodationSubsidyChange(row: AccommodationItem) {
  row.subsidy_manual = row.amount !== defaultTravelSubsidy.value
}

function addExpenseItem() {
  form.expense_items.push({
    id: `expense-${Date.now()}`,
    expense_type: '通讯费',
    expense_name: '',
    quantity: 1,
    amount: 0,
    remark: '',
  })
}

function removeExpenseItem(id: string) {
  const index = form.expense_items.findIndex((item) => item.id === id)
  if (index > -1) {
    form.expense_items.splice(index, 1)
  }
}

const beforeUpload: UploadProps['beforeUpload'] = (rawFile) => {
  if (rawFile.type !== 'application/pdf') {
    ElMessage.error('仅支持上传 PDF 格式的发票文件')
    return false
  }
  return true
}

async function handleFileUpload(file: File, section: 'transport' | 'accommodation' | 'expense' = 'transport') {
  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await request.post('invoices/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    const parsedAmount = data?.amount ?? data?.amount_in_figures
    if (parsedAmount) {
      processInvoiceData(parsedAmount, section, data)
    }
    ElMessage.success('发票已上传并解析')
  } catch {
    ElMessage.error('发票上传失败')
  } finally {
    uploading.value = false
  }
}

function uploadInvoiceBySection(
  options: UploadRequestOptions,
  section: 'transport' | 'accommodation' | 'expense'
) {
  return handleFileUpload(options.file as File, section)
}

const uploadTransportInvoice: UploadProps['httpRequest'] = (options) =>
  uploadInvoiceBySection(options, 'transport')

const uploadAccommodationInvoice: UploadProps['httpRequest'] = (options) =>
  uploadInvoiceBySection(options, 'accommodation')

const uploadExpenseInvoice: UploadProps['httpRequest'] = (options) =>
  uploadInvoiceBySection(options, 'expense')

async function handleSubmit() {
  if (!form.company_id) {
    ElMessage.warning('请选择公司')
    return
  }
  if (!form.traveler) {
    ElMessage.warning('请输入出差人')
    return
  }

  const totalItems =
    form.transport_items.length + form.accommodation_items.length + form.expense_items.length
  if (totalItems === 0) {
    ElMessage.warning('请至少添加一条费用记录')
    return
  }

  loading.value = true
  try {
    await request.post('reimbursements/', {
      ...form,
      invoices: form.invoices,
      contract_signed: signedContract.value,
      destination: form.departure_place,
      travel_range: exportTravelRange.value,
      travel_days: travelDays.value ? String(travelDays.value) : '',
      advance_amount: advanceAmount.value,
      supplement_amount: supplementAmount.value,
      refund_amount: refundAmount.value,
      payee: form.traveler,
    })
    ElMessage.success('报销单已创建')
    router.push('/reimbursements')
  } catch {
    ElMessage.error('创建失败')
  } finally {
    loading.value = false
  }
}

function handleCancel() {
  router.back()
}

function applyTripDraft() {
  if (route.query.tripDraft !== '1') {
    return
  }

  const rawDraft = sessionStorage.getItem(TRIP_DRAFT_STORAGE_KEY)
  if (!rawDraft) {
    return
  }

  try {
    const draft = JSON.parse(rawDraft) as ReimbursementDraft
    form.reimbursement_name = draft.reimbursement_name ?? ''
    form.company_id = draft.company_id ?? form.company_id
    form.dept = draft.dept ?? form.dept
    form.dept_leader = draft.dept_leader ?? form.dept_leader
    form.traveler = draft.traveler ?? form.traveler
    form.project_code = draft.project_code ?? ''
    form.project_name = draft.project_name ?? ''
    form.departure_date = draft.departure_date ?? ''
    form.return_date = draft.return_date ?? ''
    form.departure_place = draft.destination ?? draft.departure_place ?? ''
    if (draft.travel_days !== undefined && draft.travel_days !== null && draft.travel_days !== '') {
      manualTravelDays.value = Number(draft.travel_days)
      travelDaysManuallyEdited.value = true
    }
    form.purpose = draft.purpose ?? ''
    form.approver = draft.approver ?? ''
    form.invoices = Array.isArray(draft.invoices) ? [...draft.invoices] : []
    form.transport_items = Array.isArray(draft.transport_items) ? [...draft.transport_items] : []
    form.accommodation_items = Array.isArray(draft.accommodation_items)
      ? draft.accommodation_items.map((item) => {
          const savedManual = (item.amount || 0) !== defaultTravelSubsidy.value
          return {
            ...item,
            subsidy_manual: savedManual,
            // 非手动修改的行：自动按当前出差天数 * 60 更新差旅补贴
            amount: savedManual ? (item.amount || 0) : defaultTravelSubsidy.value,
          }
        })
      : []
    form.expense_items = Array.isArray(draft.expense_items) ? [...draft.expense_items] : []
    ElMessage.success('已根据行程预填报销单，可继续调整明细')
  } catch {
    ElMessage.warning('行程草稿读取失败，请重新从我的行程进入')
  } finally {
    sessionStorage.removeItem(TRIP_DRAFT_STORAGE_KEY)
  }
}

onMounted(() => {
  fetchCompanies()
  if (authStore.userInfo) {
    if (authStore.userInfo.real_name) {
        form.traveler = authStore.userInfo.real_name
    } else {
        form.traveler = authStore.userInfo.username
    }
    
    if (authStore.userInfo.department) {
        form.dept = authStore.userInfo.department
    }
    if (authStore.userInfo.dept_leader) {
      form.dept_leader = authStore.userInfo.dept_leader
    }
  }
  applyTripDraft()
})
</script>

<template>
  <div class="create-reimbursement">
    <div class="top-nav">
      <div class="company-chip">
        <span class="company-icon">🏢</span>
        <el-select v-model="form.company_id" placeholder="选择公司" size="small">
          <el-option
            v-for="company in companies"
            :key="company.id"
            :label="company.name"
            :value="company.id"
          />
        </el-select>
      </div>
      <div class="page-title">差旅费报销单</div>
      <div class="page-date">{{ headerDate }}</div>
    </div>

    <div class="page-content">
      <div class="page-card">
        <div class="card-header">基本信息</div>
        <div class="card-body">
          <el-form :model="form" label-position="top" class="info-form">
            <div class="info-grid grid-1">
              <el-form-item label="报销单名称">
                <el-input v-model="form.reimbursement_name" placeholder="请输入报销单名称，如：长沙项目出差报销" />
              </el-form-item>
            </div>

            <div class="info-grid grid-5">
              <el-form-item label="出差人">
                <el-input v-model="form.traveler" placeholder="请输入出差人" />
              </el-form-item>
              <el-form-item label="部门领导">
                <el-input v-model="form.dept_leader" placeholder="请输入部门领导" />
              </el-form-item>
              <el-form-item label="出差部门">
                <el-input v-model="form.dept" placeholder="请输入部门" />
              </el-form-item>
              <el-form-item label="项目编号">
                <el-input v-model="form.project_code" placeholder="请输入项目编号" />
              </el-form-item>
              <el-form-item label="项目名称">
                <el-input v-model="form.project_name" placeholder="请输入项目名称" />
              </el-form-item>
              <el-form-item label="已签署合同">
                <el-select v-model="signedContract" placeholder="请选择">
                  <el-option label="是" value="是" />
                  <el-option label="否" value="否" />
                </el-select>
              </el-form-item>
            </div>

            <div class="info-grid grid-4">
              <el-form-item label="出差时间">
                <el-date-picker
                  v-model="travelRange"
                  type="daterange"
                  range-separator="至"
                  start-placeholder="开始日期"
                  end-placeholder="结束日期"
                  value-format="YYYY-MM-DD"
                  style="width: 100%;"
                />
              </el-form-item>
              <el-form-item label="出差天数">
                <el-input-number
                  :model-value="travelDays"
                  :min="1"
                  :precision="0"
                  placeholder="请输入出差天数"
                  style="width: 100%;"
                  @update:model-value="handleTravelDaysChange"
                />
                <div class="field-hint">最后一天酒店比较特殊，要注意是否需要多填写一天差旅补贴哦~~</div>
              </el-form-item>
              <el-form-item label="出差地">
                <el-input v-model="form.departure_place" placeholder="请输入出差地点" />
              </el-form-item>
              <el-form-item label="出差事由">
                <el-input v-model="form.purpose" placeholder="请输入出差事由" />
              </el-form-item>
            </div>

            <div class="info-grid grid-4">
              <el-form-item label="费用所属部门">
                <el-input v-model="costDept" placeholder="请输入费用部门" />
              </el-form-item>
              <el-form-item label="预借差旅费">
                <el-input-number v-model="advanceAmount" :min="0" :precision="2" style="width: 100%;" />
              </el-form-item>
              <el-form-item label="补领金额">
                <el-input-number v-model="supplementAmount" :min="0" :precision="2" style="width: 100%;" />
              </el-form-item>
              <el-form-item label="退还金额">
                <el-input-number v-model="refundAmount" :min="0" :precision="2" style="width: 100%;" />
              </el-form-item>
            </div>

            <div class="amount-row">
              <div class="amount-label">报销金额（大写）：</div>
              <div class="amount-cn">{{ totalAmountUpper }}</div>
              <div class="amount-num">¥ {{ totalAmount.toFixed(2) }}</div>
            </div>
          </el-form>
        </div>
      </div>

      <div class="page-card">
        <div class="card-header card-header-actions">
          <span>交通明细</span>
          <div class="header-buttons">
            <el-button :icon="Document" type="info" plain size="small" @click="openInvoiceDialog('transport')">
              选择已有发票
            </el-button>
            <el-upload
              :auto-upload="true"
              accept=".pdf"
              :show-file-list="false"
              :before-upload="beforeUpload"
              :http-request="uploadTransportInvoice"
            >
              <template #trigger>
                <el-button :icon="Upload" type="primary" size="small">
                  上传发票
                </el-button>
              </template>
            </el-upload>
          </div>
        </div>
        <div class="card-body">
          <el-table :data="form.transport_items" stripe border class="plain-table" style="width: 100%">
            <el-table-column prop="departure_date" label="出发时间" min-width="140">
              <template #default="{ row }">
                <el-date-picker
                  v-model="row.departure_date"
                  type="date"
                  placeholder="请选择日期"
                  value-format="YYYY-MM-DD"
                />
              </template>
            </el-table-column>
            <el-table-column prop="departure_place" label="出发地" min-width="100">
              <template #default="{ row }">
                <el-input v-model="row.departure_place" placeholder="如：郑州东" size="small" />
              </template>
            </el-table-column>
            <el-table-column prop="arrival_date" label="到达时间" min-width="140">
              <template #default="{ row }">
                <el-date-picker
                  v-model="row.arrival_date"
                  type="date"
                  placeholder="请选择日期"
                  value-format="YYYY-MM-DD"
                />
              </template>
            </el-table-column>
            <el-table-column prop="arrival_place" label="到达地" min-width="100">
              <template #default="{ row }">
                <el-input v-model="row.arrival_place" placeholder="如：长沙南" size="small" />
              </template>
            </el-table-column>
            <el-table-column prop="transport_type" label="交通工具" min-width="100">
              <template #default="{ row }">
                <el-select v-model="row.transport_type" placeholder="选择" size="small">
                  <el-option label="高铁" value="高铁" />
                  <el-option label="飞机" value="飞机" />
                  <el-option label="汽车" value="汽车" />
                  <el-option label="客车" value="客车" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column prop="quantity" label="单据张数" min-width="100">
              <template #default="{ row }">
                <el-input-number v-model="row.quantity" :min="1" size="small" controls-position="right" />
              </template>
            </el-table-column>
            <el-table-column prop="amount" label="金额" min-width="110">
              <template #default="{ row }">
                <el-input-number v-model="row.amount" :precision="2" :min="0" size="small" controls-position="right" />
              </template>
            </el-table-column>
            <el-table-column label="归属部门" min-width="130">
              <template #default>
                <el-input v-model="costDept" placeholder="请输入部门" size="small" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="72" fixed="right" align="center">
              <template #default="{ row }">
                <el-button :icon="Delete" type="danger" text @click="removeTransportItem(row.id)" />
              </template>
            </el-table-column>
          </el-table>

          <div class="table-actions">
            <el-tooltip content="添加一行" placement="top" :show-after="300">
              <el-button :icon="Plus" @click="addTransportItem" type="primary" plain class="collapse-btn">
                <span class="btn-text">添加一行</span>
              </el-button>
            </el-tooltip>
          </div>
        </div>
      </div>

      <div class="page-card">
        <div class="card-header card-header-actions">
          <span>住宿费明细</span>
          <div class="header-buttons">
            <el-button :icon="Document" type="info" plain size="small" @click="openInvoiceDialog('accommodation')">
              选择已有发票
            </el-button>
            <el-upload
              :auto-upload="true"
              accept=".pdf"
              :show-file-list="false"
              :before-upload="beforeUpload"
              :http-request="uploadAccommodationInvoice"
            >
              <template #trigger>
                <el-button :icon="Upload" type="primary" size="small">
                  上传发票
                </el-button>
              </template>
            </el-upload>
          </div>
        </div>
        <div class="card-body">
          <el-table :data="form.accommodation_items" stripe border class="plain-table" style="width: 100%">
            <el-table-column label="住宿人" min-width="80">
              <template #default>
                <span class="table-muted">{{ form.traveler || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="remark" label="同住人员" min-width="130">
              <template #default="{ row }">
                <el-input v-model="row.remark" placeholder="如：同住人员" size="small" />
              </template>
            </el-table-column>
            <el-table-column prop="city" label="城市级别" min-width="190">
              <template #default="{ row }">
                <el-select
                  v-model="row.city"
                  placeholder="请选择"
                  size="small"
                  @change="calculateStandardCost(row)"
                >
                  <el-option label="一线城市 (350/天)" value="一线城市" />
                  <el-option label="新一线城市 (300/天)" value="新一线城市" />
                  <el-option label="二线城市 (250/天)" value="二线城市" />
                  <el-option label="三线及以下城市 (200/天)" value="三线及以下城市" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column prop="num_nights" label="晚数" min-width="70">
              <template #default="{ row }">
                <el-input-number
                  v-model="row.num_nights"
                  :min="1"
                  size="small"
                  controls-position="right"
                  @change="calculateStandardCost(row)"
                />
              </template>
            </el-table-column>
            <el-table-column prop="standard_cost" label="住宿标准合计" min-width="120">
              <template #default="{ row }">
                <el-input-number
                  v-model="row.standard_cost"
                  :precision="2"
                  :min="0"
                  size="small"
                  controls-position="right"
                  disabled
                />
              </template>
            </el-table-column>
            <el-table-column prop="actual_cost" label="实际住宿费用" min-width="120">
              <template #default="{ row }">
                <el-input-number v-model="row.actual_cost" :precision="2" :min="0" size="small" controls-position="right" />
              </template>
            </el-table-column>
            <el-table-column label="住宿差额" min-width="90">
              <template #default="{ row }">
                <span class="table-muted" :class="{ 'text-danger': ((row.standard_cost || 0) - (row.actual_cost || 0)) < 0 }">
                  {{ ((row.standard_cost || 0) - (row.actual_cost || 0)).toFixed(2) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="amount" min-width="120">
              <template #header>
                <el-tooltip content="差旅补贴不计入报销总额，请勿随意修改" placement="top">
                  <span style="cursor: help; border-bottom: 1px dashed #999">差旅补贴</span>
                </el-tooltip>
              </template>
              <template #default="{ row }">
                <el-input-number
                  v-model="row.amount"
                  :min="0"
                  :step="60"
                  step-strictly
                  size="small"
                  controls-position="right"
                  @change="handleAccommodationSubsidyChange(row)"
                />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="72" fixed="right" align="center">
              <template #default="{ row }">
                <el-button
                  :icon="Delete"
                  type="danger"
                  text
                  @click="removeAccommodationItem(row.id)"
                />
              </template>
            </el-table-column>
          </el-table>

          <div class="table-actions">
            <el-tooltip content="添加一行" placement="top" :show-after="300">
              <el-button :icon="Plus" @click="addAccommodationItem" type="primary" plain class="collapse-btn">
                <span class="btn-text">添加一行</span>
              </el-button>
            </el-tooltip>
          </div>
        </div>
      </div>

      <div class="page-card">
        <div class="card-header card-header-actions">
          <span>费用明细</span>
          <div class="header-buttons">
            <el-button :icon="Document" type="info" plain size="small" @click="openInvoiceDialog('expense')">
              选择已有发票
            </el-button>
            <el-upload
              :auto-upload="true"
              accept=".pdf"
              :show-file-list="false"
              :before-upload="beforeUpload"
              :http-request="uploadExpenseInvoice"
            >
              <template #trigger>
                <el-button :icon="Upload" type="primary" size="small">
                  上传发票
                </el-button>
              </template>
            </el-upload>
          </div>
        </div>
        <div class="card-body">
          <el-table :data="form.expense_items" stripe border class="plain-table" style="width: 100%">
            <el-table-column prop="expense_type" label="实际报销科目" min-width="120">
              <template #default="{ row }">
                <el-select v-model="row.expense_type" placeholder="选择" size="small">
                  <el-option label="网约车" value="网约车" />
                  <el-option label="停车费" value="停车费" />
                  <el-option label="文件费" value="文件费" />
                  <el-option label="通讯费" value="通讯费" />
                  <el-option label="其他" value="其他" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column prop="expense_name" label="发票据科目" min-width="150">
              <template #default="{ row }">
                <el-input v-model="row.expense_name" placeholder="如：客运服务费" size="small" />
              </template>
            </el-table-column>
            <el-table-column prop="quantity" label="单据张数" min-width="100">
              <template #default="{ row }">
                <el-input-number v-model="row.quantity" :min="1" size="small" controls-position="right" />
              </template>
            </el-table-column>
            <el-table-column prop="amount" label="金额" min-width="110">
              <template #default="{ row }">
                <el-input-number v-model="row.amount" :precision="2" :min="0" size="small" controls-position="right" />
              </template>
            </el-table-column>
            <el-table-column prop="remark" label="说明" min-width="170">
              <template #default="{ row }">
                <el-input v-model="row.remark" placeholder="如：客户现场往返" size="small" />
              </template>
            </el-table-column>
            <el-table-column label="归属部门" min-width="130">
              <template #default>
                <el-input v-model="costDept" placeholder="请输入部门" size="small" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="72" fixed="right" align="center">
              <template #default="{ row }">
                <el-button :icon="Delete" type="danger" text @click="removeExpenseItem(row.id)" />
              </template>
            </el-table-column>
          </el-table>

          <div class="table-actions">
            <el-tooltip content="添加一行" placement="top" :show-after="300">
              <el-button :icon="Plus" @click="addExpenseItem" type="primary" plain class="collapse-btn">
                <span class="btn-text">添加一行</span>
              </el-button>
            </el-tooltip>
          </div>
        </div>
      </div>

      <div class="action-bar">
        <el-button @click="handleCancel">取消</el-button>
        <el-button type="primary" :loading="loading" @click="handleSubmit">
          提交报销单
        </el-button>
      </div>
    </div>

    <!-- 选择已上传发票的弹窗 -->
    <el-dialog
      v-model="invoiceDialogVisible"
      title="选择已有未提报发票"
      width="800px"
    >
      <div style="margin-bottom: 16px;">
        <el-select 
          v-model="dialogFilterType" 
          placeholder="筛选发票类型" 
          clearable 
          style="width: 200px"
          @change="fetchAvailableInvoices"
        >
          <el-option label="全部类型" value="" />
          <el-option label="交通费" value="TRANSPORT" />
          <el-option label="住宿费" value="ACCOMMODATION" />
          <el-option label="其他费用" value="OTHER" />
        </el-select>
      </div>

      <el-table
        :data="availableInvoices"
        border
        stripe
        @selection-change="(val: Invoice[]) => selectedInvoices = val"
      >
        <el-table-column type="selection" width="55" />
        <el-table-column label="类型" width="90">
             <template #default="{ row }">
                 <el-tag v-if="row.invoice_type === 'TRANSPORT'" type="success" size="small">交通</el-tag>
                 <el-tag v-else-if="row.invoice_type === 'ACCOMMODATION'" type="warning" size="small">住宿</el-tag>
                 <el-tag v-else size="small">其他</el-tag>
             </template>
        </el-table-column>
        <el-table-column prop="invoice_date" label="开票日期" width="120" />
        <el-table-column prop="invoice_number" label="发票号码" width="150" />
        <el-table-column prop="amount" label="金额" width="120">
          <template #default="{ row }">
            ¥{{ row.amount }}
          </template>
        </el-table-column>
        <el-table-column prop="product_name" label="商品名称" show-overflow-tooltip />
        <el-table-column label="查看" width="80">
          <template #default="{ row }">
            <!-- 增加 normalizeFileUrl 处理跨域时的 localhost -->
            <a :href="normalizeFileUrl(row.file)" target="_blank" style="color: #409eff">预览</a>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="invoiceDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleInvoiceSelection">
            确认添加
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.create-reimbursement {
  min-height: 100vh;
  background: #f5f7fa;
  color: #1f2d3d;
}

.top-nav {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 16px;
  align-items: center;
  background: #ffffff;
  height: 56px;
  padding: 0 24px;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04);
}

.company-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f0f2f5;
  border-radius: 6px;
  padding: 0 10px;
  height: 36px;
}

.company-icon {
  font-size: 14px;
}

.company-chip :deep(.el-select) {
  width: 130px;
}

.company-chip :deep(.el-input__wrapper) {
  box-shadow: none;
  background: transparent;
  padding: 0;
}

.page-title {
  text-align: center;
  font-size: 22px;
  font-weight: 600;
}

.page-date {
  font-size: 13px;
  color: #606266;
}

.page-content {
  max-width: 1440px;
  margin: 0 auto;
  padding: 20px 32px 40px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-card {
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
  overflow: hidden;
}

.card-header {
  height: 48px;
  display: flex;
  align-items: center;
  padding: 0 20px;
  font-size: 15px;
  font-weight: 600;
  border-bottom: 1px solid #f0f2f5;
  background: #ffffff;
}

.card-header-actions {
  justify-content: space-between;
}

.header-buttons {
  display: flex;
  gap: 12px;
  align-items: center;
}

.card-body {
  padding: 16px 20px 20px;
}

.info-form :deep(.el-form-item__label) {
  font-size: 12px;
  color: #606266;
  margin-bottom: 6px;
}

.info-grid {
  display: grid;
  gap: 16px;
}

.grid-1 {
  grid-template-columns: 1fr;
}

.grid-5 {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.grid-4 {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.amount-row {
  margin-top: 4px;
  background: #fff8e6;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 6px;
}

.amount-label,
.amount-cn {
  font-size: 14px;
  color: #303133;
}

.amount-num {
  margin-left: auto;
  font-size: 18px;
  font-weight: 600;
  color: #1f2d3d;
}

.field-hint {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: #d97706;
}

.plain-table :deep(.el-table__header) {
  background: #f2f6fc;
}

.table-actions {
  display: flex;
  justify-content: center;
  padding-top: 12px;
}

.collapse-btn {
  width: auto;
  padding-left: 12px;
  padding-right: 12px;
  transition: padding 0.25s ease, background-color 0.25s ease, border-color 0.25s ease;
  white-space: nowrap;
}

.collapse-btn .el-icon + span {
  margin-left: 6px;
}

.collapse-btn:hover {
  width: auto;
  padding-left: 16px;
  padding-right: 16px;
}

.table-muted {
  color: #606266;
  font-size: 12px;
}

.text-danger {
  color: #f56c6c;
  font-weight: 600;
}

.action-bar {
  display: flex;
  gap: 12px;
  align-items: center;
}

:deep(.el-table) {
  font-size: 12px;
}

:deep(.el-form-item) {
  margin-bottom: 0;
}

/* ---- 表格内 input-number 紧凑化，避免增减按钮挤占数字空间 ---- */
.plain-table :deep(.el-input-number) {
  width: 100%;
}

.plain-table :deep(.el-input-number .el-input-number__decrease),
.plain-table :deep(.el-input-number .el-input-number__increase) {
  width: 22px;
  font-size: 11px;
}

.plain-table :deep(.el-input-number .el-input__wrapper) {
  padding-left: 24px;
  padding-right: 24px;
}

/* ---- 表格内 date-picker 自适应 ---- */
.plain-table :deep(.el-date-editor) {
  width: 100% !important;
}

.plain-table :deep(.el-date-editor .el-input__wrapper) {
  width: 100%;
}

/* ---- 表格内 select 自适应 ---- */
.plain-table :deep(.el-select) {
  width: 100%;
}

/* ---- 表格表头防止换行 ---- */
.plain-table :deep(.el-table__header-wrapper th .cell) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---- 表格单元格内容溢出时显示省略号（对含表单控件的列禁用裁剪） ---- */
.plain-table :deep(.el-table__body-wrapper td .cell) {
  overflow: visible;
}

@media (max-width: 1200px) {
  .grid-5 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .grid-4 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .top-nav {
    grid-template-columns: 1fr;
    height: auto;
    padding: 12px 16px;
  }

  .page-title {
    text-align: left;
  }

  .page-content {
    padding: 16px;
  }

  .grid-5,
  .grid-4 {
    grid-template-columns: 1fr;
  }
}
</style>
