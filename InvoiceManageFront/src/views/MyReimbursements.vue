<script setup lang="ts">
import { ref, onMounted } from 'vue'
import request from '@/utils/request'
import { ElMessage } from 'element-plus'

interface ReimbursementItem {
  id: number
  status: string
  created_at: string
  updated_at: string
  invoices_details: {
    id: number
    amount: string | null
    invoice_date: string | null
  }[]
  applicant: { username: string }
  reviewer?: { id: number; username: string } | null
  details?: {
    reimbursement_name?: string
    project_name?: string
    project_code?: string
    departure_date?: string
    return_date?: string
    transport_items?: { amount: number }[]
    accommodation_items?: { amount: number }[]
    expense_items?: { amount: number }[]
  }
}

const list = ref<ReimbursementItem[]>([])
const loading = ref(false)

function calculateTotalAmount(row: ReimbursementItem) {
  // 优先使用 details JSON 中的明细项合计（更精确），避免与 invoices_details 重复计算
  if (row.details) {
    const { transport_items = [], accommodation_items = [], expense_items = [] } = row.details
    let total = 0
    total += transport_items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    total += accommodation_items.reduce((sum, item) => sum + (Number(item.actual_cost || 0)), 0)
    total += expense_items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    return total.toFixed(2)
  }
  
  // 回退：从关联发票计算
  if (row.invoices_details?.length) {
    return row.invoices_details.reduce((sum, i) => sum + (parseFloat(i.amount || '0') || 0), 0).toFixed(2)
  }
  
  return '0.00'
}

function calculateInvoiceCount(row: ReimbursementItem) {
  // 优先使用关联发票的真实数量，避免与 details 中的条目重复计算
  if (row.invoices_details?.length) {
    return row.invoices_details.length
  }

  // 回退：从 details JSON 中的明细条目计算
  if (row.details) {
    const { transport_items = [], accommodation_items = [], expense_items = [] } = row.details
    let count = 0
    count += transport_items.reduce((sum, item: any) => sum + (Number(item.quantity) || 1), 0)
    count += expense_items.reduce((sum, item: any) => sum + (Number(item.quantity) || 1), 0)
    count += accommodation_items.length
    return count
  }

  return 0
}

function statusType(s: string) {
  if (s === 'APPROVED') return 'success'
  if (s === 'REJECTED') return 'danger'
  return 'warning'
}

function statusText(s: string) {
  if (s === 'APPROVED') return '已通过'
  if (s === 'REJECTED') return '已拒绝'
  return '待审批'
}

function reimbursementName(row: ReimbursementItem) {
  return row.details?.reimbursement_name || `报销单-${row.id}`
}

function projectText(row: ReimbursementItem) {
  const projectName = row.details?.project_name || ''
  const projectCode = row.details?.project_code || ''
  if (projectName && projectCode) {
    return `${projectName} (${projectCode})`
  }
  return projectName || projectCode || '—'
}

function travelTimeText(row: ReimbursementItem) {
  const departureDate = row.details?.departure_date || ''
  const returnDate = row.details?.return_date || ''
  if (!departureDate && !returnDate) {
    return '—'
  }
  if (departureDate && returnDate) {
    return `${departureDate} 至 ${returnDate}`
  }
  return departureDate || returnDate
}

async function fetchList() {
  loading.value = true
  try {
    const { data } = await request.get('reimbursements/')
    list.value = data
  } finally {
    loading.value = false
  }
}

async function handleDownload(id: number) {
  try {
    const response = await request.post(`reimbursements/${id}/export/`, {}, { responseType: 'blob' })
    const blobUrl = window.URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = `reimbursement-${id}.docx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(blobUrl)
  } catch {
    ElMessage.error('下载失败')
  }
}

async function handleCancel(id: number) {
  try {
    await request.delete(`reimbursements/${id}/`)
    ElMessage.success('报销单已撤销')
    list.value = list.value.filter((item) => item.id !== id)
  } catch (error: any) {
    const detail = error?.response?.data?.detail
    ElMessage.error(detail || '撤销失败')
  }
}

onMounted(fetchList)
</script>

<template>
  <div>
    <h2>我的报销单</h2>

    <el-table :data="list" v-loading="loading" stripe border>
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column label="报销单名称" min-width="220">
        <template #default="{ row }">
          {{ reimbursementName(row) }}
        </template>
      </el-table-column>
      <el-table-column label="所属项目" min-width="220">
        <template #default="{ row }">
          {{ projectText(row) }}
        </template>
      </el-table-column>
      <el-table-column label="出差时间" min-width="220">
        <template #default="{ row }">
          {{ travelTimeText(row) }}
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)">{{ statusText(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="发票数" width="100">
        <template #default="{ row }">
          {{ calculateInvoiceCount(row) }}
        </template>
      </el-table-column>
      <el-table-column label="总金额 (¥)" width="120">
        <template #default="{ row }">
          {{ calculateTotalAmount(row) }}
        </template>
      </el-table-column>
      <el-table-column label="审批人" width="120">
        <template #default="{ row }">
          {{ row.reviewer?.username ?? '—' }}
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="提交时间" min-width="180" />
      <el-table-column label="操作" width="200">
        <template #default="{ row }">
          <el-button type="primary" size="small" @click="handleDownload(row.id)">
            下载报销单
          </el-button>
          <el-popconfirm
            v-if="row.status === 'PENDING'"
            title="确定撤销这张待审批报销单吗？"
            @confirm="handleCancel(row.id)"
          >
            <template #reference>
              <el-button type="danger" size="small">撤销</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>
