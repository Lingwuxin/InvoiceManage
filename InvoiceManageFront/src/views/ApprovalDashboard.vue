<script setup lang="ts">
import { ref, onMounted } from 'vue'
import request from '@/utils/request'
import { ElMessage } from 'element-plus'

interface ReimbursementItem {
  id: number
  status: string
  created_at: string
  invoices_details: {
    id: number
    amount: string | null
    invoice_date: string | null
    file: string
  }[]
  applicant: { id: number; username: string }
  details?: {
    transport_items?: { amount: number }[]
    accommodation_items?: { actual_cost: number }[]
    expense_items?: { amount: number }[]
  }
}

const list = ref<ReimbursementItem[]>([])
const loading = ref(false)
const filter = ref('PENDING')

function calculateTotalAmount(row: ReimbursementItem) {
  if (row.details) {
    const { transport_items = [], accommodation_items = [], expense_items = [] } = row.details
    let total = 0
    total += transport_items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    total += accommodation_items.reduce((sum, item) => sum + (Number(item.actual_cost || 0)), 0)
    total += expense_items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    return total.toFixed(2)
  }
  if (row.invoices_details?.length) {
    return row.invoices_details.reduce((sum, i) => sum + (parseFloat(i.amount || '0') || 0), 0).toFixed(2)
  }
  return '0.00'
}

async function fetchList() {
  loading.value = true
  try {
    const { data } = await request.get('reimbursements/', {
      params: filter.value !== 'ALL' ? { status: filter.value } : undefined,
    })
    list.value = data
  } finally {
    loading.value = false
  }
}

async function handleAction(id: number, action: 'approve' | 'reject') {
  try {
    await request.post(`reimbursements/${id}/approve/`, { action })
    ElMessage.success(action === 'approve' ? '已通过' : '已拒绝')
    await fetchList()
  } catch {
    ElMessage.error('操作失败')
  }
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

onMounted(fetchList)
</script>

<template>
  <div>
    <el-row :gutter="20" style="margin-bottom: 20px;" align="middle">
      <el-col :span="12">
        <h2 style="margin: 0;">审批中心</h2>
      </el-col>
      <el-col :span="12" style="text-align: right;">
        <el-radio-group v-model="filter" @change="fetchList">
          <el-radio-button value="PENDING">待审批</el-radio-button>
          <el-radio-button value="APPROVED">已通过</el-radio-button>
          <el-radio-button value="REJECTED">已拒绝</el-radio-button>
          <el-radio-button value="ALL">全部</el-radio-button>
        </el-radio-group>
      </el-col>
    </el-row>

    <el-table :data="list" v-loading="loading" stripe border>
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column label="申请人" width="120">
        <template #default="{ row }">
          {{ row.applicant?.username }}
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)">{{ statusText(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="发票数" width="100">
        <template #default="{ row }">
          {{ row.invoices_details?.length ?? 0 }}
        </template>
      </el-table-column>
      <el-table-column label="总金额 (¥)" width="120">
        <template #default="{ row }">
          {{ calculateTotalAmount(row) }}
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="提交时间" min-width="180" />
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <template v-if="row.status === 'PENDING'">
            <el-button type="success" size="small" @click="handleAction(row.id, 'approve')">
              通过
            </el-button>
            <el-button type="danger" size="small" @click="handleAction(row.id, 'reject')">
              拒绝
            </el-button>
          </template>
          <span v-else style="color: #909399;">已处理</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>
