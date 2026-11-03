<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import type { FormInstance } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '@/utils/request'

const COMPANY_CITY_OPTIONS = [
  { company: '淘数郑州', city: '郑州' },
  { company: '淘数北京', city: '北京' },
  { company: '淘数上海', city: '上海' },
]

const CITY_OPTIONS = ['郑州', '北京', '上海']

interface UserItem {
  id: number
  username: string
  real_name?: string
  company?: string
  city?: string
  department?: string
  dept_leader?: string
  email: string
  role: 'EMPLOYEE' | 'ACCOUNTANT'
  is_active: boolean
  is_superuser: boolean
}

const list = ref<UserItem[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const currentId = ref<number | null>(null)
const formRef = ref<FormInstance>()

const form = reactive({
  username: '',
  real_name: '',
  company: '',
  city: '',
  department: '',
  dept_leader: '',
  email: '',
  role: 'EMPLOYEE' as 'EMPLOYEE' | 'ACCOUNTANT',
  is_active: true,
  password: '',
})

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  real_name: [{ required: true, message: '请输入真实姓名', trigger: 'blur' }],
  company: [{ required: true, message: '请选择所属公司', trigger: 'change' }],
  city: [{ required: true, message: '请选择所属城市', trigger: 'change' }],
  email: [{ required: true, message: '请输入邮箱', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
}

async function fetchList() {
  loading.value = true
  try {
    const { data } = await request.get('users/')
    list.value = data
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.username = ''
  form.real_name = ''
  form.company = ''
  form.city = ''
  form.department = ''
  form.dept_leader = ''
  form.email = ''
  form.role = 'EMPLOYEE'
  form.is_active = true
  form.password = ''
  formRef.value?.clearValidate()
}

function handleCreate() {
  isEdit.value = false
  currentId.value = null
  resetForm()
  dialogVisible.value = true
}

function handleEdit(row: UserItem) {
  isEdit.value = true
  currentId.value = row.id
  form.username = row.username
  form.real_name = row.real_name || ''
  form.company = row.company || ''
  form.city = row.city || ''
  form.department = row.department || ''
  form.dept_leader = row.dept_leader || ''
  form.email = row.email
  form.role = row.role
  form.is_active = row.is_active
  form.password = ''
  dialogVisible.value = true
  formRef.value?.clearValidate()
}

function handleCompanyChange(value: string) {
  const matchedOption = COMPANY_CITY_OPTIONS.find((item) => item.company === value)
  if (matchedOption) {
    form.city = matchedOption.city
  }
}

async function handleDelete(row: UserItem) {
  try {
    await ElMessageBox.confirm(`确定要删除用户 ${row.username} 吗？`, '提示', { type: 'warning' })
    await request.delete(`users/${row.id}/`)
    ElMessage.success('已删除')
    await fetchList()
  } catch {
    // ignore cancel
  }
}

async function toggleActive(row: UserItem) {
  const nextActive = !row.is_active
  const actionText = nextActive ? '启用' : '禁用'
  try {
    await ElMessageBox.confirm(`确定要${actionText}用户 ${row.username} 吗？`, '提示', { type: 'warning' })
    await request.patch(`users/${row.id}/`, { is_active: nextActive })
    row.is_active = nextActive
    ElMessage.success(`${actionText}成功`)
  } catch {
    // ignore cancel
  }
}

async function handleSubmit() {
  if (!formRef.value) return
  await formRef.value.validate()
  if (!isEdit.value && !form.password) {
    ElMessage.warning('请输入密码')
    return
  }

  const payload: Record<string, unknown> = {
    username: form.username,
    real_name: form.real_name,
    company: form.company,
    city: form.city,
    department: form.department,
    dept_leader: form.dept_leader,
    email: form.email,
    role: form.role,
    is_active: form.is_active,
  }
  if (form.password) {
    payload.password = form.password
  }

  try {
    if (isEdit.value && currentId.value !== null) {
      await request.put(`users/${currentId.value}/`, payload)
      ElMessage.success('已更新')
    } else {
      await request.post('users/', payload)
      ElMessage.success('已创建')
    }
    dialogVisible.value = false
    await fetchList()
  } catch {
    ElMessage.error('操作失败')
  }
}

function roleText(role: string) {
  return role === 'ACCOUNTANT' ? '财务' : '员工'
}

function roleType(role: string) {
  return role === 'ACCOUNTANT' ? 'warning' : 'primary'
}

onMounted(fetchList)
</script>

<template>
  <div>
    <el-row :gutter="20" style="margin-bottom: 20px;" align="middle">
      <el-col :span="12">
        <h2 style="margin: 0;">用户管理</h2>
      </el-col>
      <el-col :span="12" style="text-align: right;">
        <el-button type="primary" @click="handleCreate">新增用户</el-button>
        <el-button @click="fetchList">刷新</el-button>
      </el-col>
    </el-row>

    <el-table :data="list" v-loading="loading" stripe border>
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="username" label="用户名" width="120" />
      <el-table-column prop="real_name" label="姓名" width="120" />
      <el-table-column prop="company" label="所属公司" width="160" />
      <el-table-column prop="city" label="所属城市" width="120" />
      <el-table-column prop="department" label="部门" width="150" />
      <el-table-column prop="dept_leader" label="部门领导" width="140" />
      <el-table-column prop="email" label="邮箱" min-width="180" />
      <el-table-column label="角色" width="100">
        <template #default="{ row }">
          <el-tag :type="roleType(row.role)">{{ roleText(row.role) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="管理员" width="100">
        <template #default="{ row }">
          <el-tag v-if="row.is_superuser" type="danger">是</el-tag>
          <span v-else style="color: #909399;">否</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <el-tag :type="row.is_active ? 'success' : 'info'">
            {{ row.is_active ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" size="small" @click="handleEdit(row)">编辑</el-button>
          <el-button type="warning" size="small" @click="toggleActive(row)">
            {{ row.is_active ? '禁用' : '启用' }}
          </el-button>
          <el-button type="danger" size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑用户' : '新增用户'" width="480px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item label="姓名" prop="real_name">
          <el-input v-model="form.real_name" placeholder="请输入真实姓名" />
        </el-form-item>
        <el-form-item label="所属公司" prop="company">
          <el-select
            v-model="form.company"
            placeholder="请选择所属公司"
            style="width: 100%;"
            @change="handleCompanyChange"
          >
            <el-option
              v-for="item in COMPANY_CITY_OPTIONS"
              :key="item.company"
              :label="item.company"
              :value="item.company"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="所属城市" prop="city">
          <el-select v-model="form.city" placeholder="请选择所属城市" style="width: 100%;">
            <el-option v-for="item in CITY_OPTIONS" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="部门" prop="department">
          <el-input v-model="form.department" placeholder="请输入所属部门" />
        </el-form-item>
        <el-form-item label="部门领导" prop="dept_leader">
          <el-input v-model="form.dept_leader" placeholder="请输入部门领导" />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="form.email" placeholder="请输入邮箱" />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="form.role" placeholder="请选择角色" style="width: 100%;">
            <el-option label="员工" value="EMPLOYEE" />
            <el-option label="财务" value="ACCOUNTANT" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.is_active" active-text="启用" inactive-text="禁用" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" placeholder="新增用户必填，编辑可留空" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
