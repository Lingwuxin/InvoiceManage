<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'
import request from '@/utils/request'
import { useAuthStore } from '@/stores/auth'

const TRIP_DRAFT_STORAGE_KEY = 'trip-reimbursement-draft'
const COMPANY_OPTIONS = [
  { id: 1, name: '淘数郑州' },
  { id: 2, name: '淘数北京' },
  { id: 3, name: '淘数上海' },
]

type InvoiceCategory = 'TRANSPORT' | 'ACCOMMODATION' | 'OTHER'

interface TripStatementInfo {
  id: number
  name: string
  file: string
  travel_start_date: string | null
  travel_end_date: string | null
  travel_departure_place: string | null
  travel_arrival_place: string | null
  travel_details: Array<{
    date?: string
    departure_place?: string
    arrival_place?: string
    amount?: string
  }>
  travel_total_amount: string | null
  application_date: string | null
  applicant_phone: string
}

interface TripInvoiceItem {
  id: number
  invoice_number: string
  invoice_date: string | null
  service_start_date: string | null
  amount: string | null
  file: string
  product_name: string | null
  invoice_type: InvoiceCategory
  reimbursement_category: InvoiceCategory
  departure_place: string | null
  arrival_place: string | null
  travel_start_date?: string | null
  travel_end_date?: string | null
  has_trip_statement?: boolean
  trip_statement?: TripStatementInfo | null
  mode: 'AIR' | 'RAIL' | 'OTHER'
  is_depart_from_home: boolean
  is_arrive_home: boolean
  trip_group_id: number | null
}

interface TripItem {
  id: number
  title: string
  trip_no: number
  source: 'AUTO' | 'MANUAL'
  manual_adjusted: boolean
  home_city: string
  start_date: string | null
  end_date: string | null
  duration_days: number | null
  is_complete: boolean
  destinations: string[]
  transport_modes: Array<'AIR' | 'RAIL' | 'OTHER'>
  invoices: TripInvoiceItem[]
}

interface TripResponse {
  home_city: string
  total_trips: number
  trips: TripItem[]
  unmatched_invoices: TripInvoiceItem[]
  available_invoices: TripInvoiceItem[]
}

// ── 时间线模式 ──
interface TimelineSeparator {
  id: number
  after_invoice_id: number | null
  after_invoice_number: string | null
  after_invoice_date: string | null
  label: string
  created_at: string | null
}

interface TimelineSegmentItem {
  segment_no: number
  trip_group_id: number | null
  start_date: string | null
  end_date: string | null
  invoice_count: number
  close_reason: 'auto' | 'manual' | 'both' | null
  is_open: boolean
  invoices: TimelineInvoiceItem[]
}

interface TimelineInvoiceItem {
  id: number
  invoice_number: string
  invoice_date: string | null
  service_start_date: string | null
  travel_start_date: string | null
  travel_end_date: string | null
  has_trip_statement: boolean
  amount: string | null
  file: string
  product_name: string | null
  invoice_type: string
  departure_place: string | null
  arrival_place: string | null
  trip_statement: TripStatementInfo | null
  mode: string
  reimbursement_category?: InvoiceCategory
  is_depart_from_home: boolean
  is_arrive_home: boolean
  is_segment_end: boolean
  segment_end_reason: 'auto' | 'manual' | 'both' | null
}

interface TimelineDataResponse {
  home_city: string
  total_invoices: number
  total_separators: number
  total_segments: number
  separators: TimelineSeparator[]
  segments: TimelineSegmentItem[]
  all_invoices: TimelineInvoiceItem[]
  available_invoices: TimelineInvoiceItem[]
}

const router = useRouter()
const authStore = useAuthStore()
const backendOrigin = window.location.origin
const pageRootRef = ref<HTMLElement | null>(null)
const scrollContainer = ref<HTMLElement | null>(null)
const loading = ref(false)
const homeCityOverride = ref('')
const dateRangeFilter = ref<string[] | null>(null)
const stationFilter = ref('')
const draggedInvoice = ref<TripInvoiceItem | null>(null)
const attachDialogVisible = ref(false)
const attachCategory = ref<InvoiceCategory>('OTHER')
const pendingInvoice = ref<TripInvoiceItem | null>(null)
const pendingTripId = ref<number | null>(null)
const assigningInvoiceId = ref<number | null>(null)
const selectedSegmentMap = ref<Record<number, number>>({})
const editingTripId = ref<number | null>(null)
const editingTripTitle = ref('')
const previewVisible = ref(false)
const previewInvoice = ref<TripInvoiceItem | null>(null)
const hoveredTripId = ref<number | null>(null)
const edgeMaskDirection = ref<'up' | 'down' | null>(null)
let autoScrollFrame: number | null = null
const tripData = ref<TripResponse>({
  home_city: '',
  total_trips: 0,
  trips: [],
  unmatched_invoices: [],
  available_invoices: [],
})

// ── 时间线状态 ──
const viewMode = ref<'cards' | 'timeline'>('cards')
const timelineData = ref<TimelineDataResponse | null>(null)
const timelineLoading = ref(false)
const separatorDialogVisible = ref(false)
const separatorAfterInvoiceId = ref<number | null>(null)
const separatorLabel = ref('')
const separatorSubmitting = ref(false)
const hoveredSeparatorSpot = ref<number | null>(null)

const effectiveHomeCity = computed(() => homeCityOverride.value.trim() || tripData.value.home_city || '')
const completeTripCount = computed(() => tripData.value.trips.filter((item) => item.is_complete).length)
const availableInvoiceCount = computed(() => tripData.value.available_invoices.length)
const previewFileUrl = computed(() => normalizeFileUrl(previewInvoice.value?.file || ''))
const previewIsPdf = computed(() => previewFileUrl.value.toLowerCase().includes('.pdf'))
const isDraggingInvoice = computed(() => draggedInvoice.value !== null)

function logDragDebug(message: string, payload?: Record<string, unknown>) {
  if (payload) {
    console.log(`[MyTrips drag] ${message}`, payload)
    return
  }
  console.log(`[MyTrips drag] ${message}`)
}

function resolveScrollContainer() {
  const container = pageRootRef.value?.closest('.app-main') as HTMLElement | null
  scrollContainer.value = container
  logDragDebug('resolve scroll container', {
    found: Boolean(container),
    className: container?.className || null,
    scrollTop: container?.scrollTop ?? null,
    clientHeight: container?.clientHeight ?? null,
    scrollHeight: container?.scrollHeight ?? null,
  })
}

function getScrollState() {
  const container = scrollContainer.value
  if (container) {
    return {
      viewportHeight: container.clientHeight,
      scrollOffset: container.scrollTop,
      maxScrollTop: Math.max(container.scrollHeight - container.clientHeight, 0),
      target: 'container',
    }
  }

  const scrollingElement = document.scrollingElement || document.documentElement
  return {
    viewportHeight: window.innerHeight,
    scrollOffset: scrollingElement.scrollTop,
    maxScrollTop: Math.max(scrollingElement.scrollHeight - window.innerHeight, 0),
    target: 'window',
  }
}

function performScroll(delta: number) {
  if (scrollContainer.value) {
    const before = scrollContainer.value.scrollTop
    scrollContainer.value.scrollBy({ top: delta, behavior: 'auto' })
    logDragDebug('perform scroll', {
      target: 'container',
      delta,
      before,
      after: scrollContainer.value.scrollTop,
    })
    return
  }

  const scrollingElement = document.scrollingElement || document.documentElement
  const before = scrollingElement.scrollTop
  window.scrollBy({ top: delta, behavior: 'auto' })
  logDragDebug('perform scroll', {
    target: 'window',
    delta,
    before,
    after: scrollingElement.scrollTop,
  })
}

function modeText(mode: 'AIR' | 'RAIL' | 'OTHER') {
  if (mode === 'AIR') return '飞机'
  if (mode === 'RAIL') return '火车'
  return '其他'
}

function modeTagType(mode: 'AIR' | 'RAIL' | 'OTHER') {
  if (mode === 'AIR') return 'warning'
  if (mode === 'RAIL') return 'success'
  return 'info'
}

function categoryText(category: InvoiceCategory) {
  if (category === 'TRANSPORT') return '交通'
  if (category === 'ACCOMMODATION') return '住宿'
  return '其他'
}

function categoryTagType(category: InvoiceCategory) {
  if (category === 'TRANSPORT') return 'success'
  if (category === 'ACCOMMODATION') return 'warning'
  return 'info'
}

function formatDateRange(trip: TripItem) {
  if (!trip.start_date && !trip.end_date) return '—'
  if (trip.start_date === trip.end_date) return trip.start_date || '—'
  return `${trip.start_date || '—'} 至 ${trip.end_date || '—'}`
}

function destinationText(trip: TripItem) {
  return trip.destinations.length ? trip.destinations.join(' / ') : '—'
}

function normalizeSearchTerm(value: string) {
  return value.trim().toLowerCase()
}

function tripMatchesDateRange(trip: TripItem) {
  if (!dateRangeFilter.value?.length) return true
  const [start, end] = dateRangeFilter.value
  if (!start || !end) return true
  const tripStart = trip.start_date || trip.end_date
  const tripEnd = trip.end_date || trip.start_date
  if (!tripStart || !tripEnd) return false
  return !(tripEnd < start || tripStart > end)
}

function tripMatchesStation(trip: TripItem) {
  const term = normalizeSearchTerm(stationFilter.value)
  if (!term) return true
  if (trip.destinations.some((dest) => dest.toLowerCase().includes(term))) {
    return true
  }
  for (const invoice of trip.invoices) {
    const departure = invoice.departure_place || ''
    const arrival = invoice.arrival_place || ''
    if (departure.toLowerCase().includes(term) || arrival.toLowerCase().includes(term)) {
      return true
    }
    if (invoice.trip_statement) {
      const departurePlace = invoice.trip_statement.travel_departure_place || ''
      const arrivalPlace = invoice.trip_statement.travel_arrival_place || ''
      if (departurePlace.toLowerCase().includes(term) || arrivalPlace.toLowerCase().includes(term)) {
        return true
      }
      for (const detail of invoice.trip_statement.travel_details || []) {
        if (
          String(detail.departure_place || '').toLowerCase().includes(term) ||
          String(detail.arrival_place || '').toLowerCase().includes(term)
        ) {
          return true
        }
      }
    }
  }
  return false
}

const filteredTrips = computed(() =>
  tripData.value.trips.filter(
    (trip) => tripMatchesDateRange(trip) && tripMatchesStation(trip)
  )
)

function clearTripFilters() {
  dateRangeFilter.value = null
  stationFilter.value = ''
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

function openInvoicePreview(invoice: TripInvoiceItem) {
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

function downloadInvoice() {
  if (!previewFileUrl.value) return
  const link = document.createElement('a')
  link.href = previewFileUrl.value
  const ext = previewIsPdf.value ? 'pdf' : 'jpg'
  link.download = `${previewInvoice.value?.invoice_number || 'invoice'}.${ext}`
  document.body.appendChild(link)
  link.click()
  link.remove()
}

async function downloadTripInvoices(trip: TripItem) {
  try {
    const response = await request.get(`trip-groups/${trip.id}/download-invoices/`, { responseType: 'blob' })
    const blobUrl = window.URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = `${trip.title || '行程'}_发票合并.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(blobUrl)
  } catch {
    ElMessage.error('下载合并发票失败')
  }
}

async function downloadSegmentInvoices(seg: TimelineSegmentItem) {
  if (!seg.trip_group_id) return
  try {
    const response = await request.get(`trip-groups/${seg.trip_group_id}/download-invoices/`, { responseType: 'blob' })
    const blobUrl = window.URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = `第${seg.segment_no}段_发票合并.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(blobUrl)
  } catch {
    ElMessage.error('下载合并发票失败')
  }
}

function openTripStatementInNewWindow(statement?: TripStatementInfo | null) {
  if (!statement?.file) return
  window.open(normalizeFileUrl(statement.file), '_blank')
}

function startEditTitle(trip: TripItem) {
  editingTripId.value = trip.id
  editingTripTitle.value = trip.title || ''
}

function cancelEditTitle() {
  editingTripId.value = null
  editingTripTitle.value = ''
}

async function saveTripTitle(trip: TripItem) {
  try {
    const { data } = await request.post(`trip-groups/${trip.id}/update-title/`, {
      title: editingTripTitle.value,
    })
    applySummary(data)
    cancelEditTitle()
    ElMessage.success('行程标题已保存')
  } catch {
    ElMessage.error('保存行程标题失败')
  }
}

function canDragInvoice(_invoice: TripInvoiceItem) {
  // 允许拖拽所有类型票据（火车票、飞机票、其他）到行程中
  return true
}

function canEditGroupedInvoice(_invoice: TripInvoiceItem) {
  // 允许编辑所有票据的报销类型，并允许移出行程
  return true
}

function applySummary(data: TripResponse) {
  tripData.value = {
    home_city: data.home_city,
    total_trips: data.total_trips,
    trips: data.trips,
    unmatched_invoices: data.unmatched_invoices || [],
    available_invoices: data.available_invoices || data.unmatched_invoices || [],
  }
}

async function fetchTrips() {
  loading.value = true
  try {
    const params = homeCityOverride.value.trim()
      ? { home_city: homeCityOverride.value.trim() }
      : undefined
    const { data } = await request.get('user/trips/', { params })
    applySummary(data)
  } catch {
    ElMessage.error('获取行程失败')
  } finally {
    loading.value = false
  }
}

// ── 时间线 API ──
async function fetchTimeline() {
  timelineLoading.value = true
  try {
    const { data } = await request.get('user/timeline/')
    timelineData.value = data as TimelineDataResponse
  } finally {
    timelineLoading.value = false
  }
}

function switchToTimeline() {
  viewMode.value = 'timeline'
  fetchTimeline()
}

function switchToCards() {
  viewMode.value = 'cards'
  fetchTrips()
}

function openSeparatorDialog(afterInvoiceId: number | null) {
  separatorAfterInvoiceId.value = afterInvoiceId
  separatorLabel.value = ''
  separatorDialogVisible.value = true
}

async function submitSeparator() {
  separatorSubmitting.value = true
  try {
    await request.post('user/separators/', {
      after_invoice_id: separatorAfterInvoiceId.value,
      label: separatorLabel.value || '',
    })
    ElMessage.success('行程分隔符已添加')
    separatorDialogVisible.value = false
    await fetchTimeline()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '添加分隔符失败')
  } finally {
    separatorSubmitting.value = false
  }
}

async function deleteSeparator(separatorId: number) {
  try {
    await request.delete(`user/separators/${separatorId}/`)
    ElMessage.success('分隔符已删除')
    await fetchTimeline()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '删除分隔符失败')
  }
}

/**
 * 格式化交通发票时间：优先显示 service_start_date 的 HH:mm，
 * 若没有则回退到 invoice_date（仅日期）。
 */
function formatInvoiceTime(invoice: TripInvoiceItem | TimelineInvoiceItem): string {
  if (invoice.has_trip_statement) {
    if (invoice.travel_start_date && invoice.travel_end_date && invoice.travel_start_date !== invoice.travel_end_date) {
      return `${invoice.travel_start_date} 至 ${invoice.travel_end_date}`
    }
    return invoice.travel_start_date || invoice.invoice_date || '—'
  }

  if (invoice.service_start_date) {
    // service_start_date 是 ISO 格式的 datetime 字符串，提取 HH:mm
    const dt = new Date(invoice.service_start_date)
    if (!isNaN(dt.getTime())) {
      const hh = String(dt.getHours()).padStart(2, '0')
      const mm = String(dt.getMinutes()).padStart(2, '0')
      return `${invoice.invoice_date || ''} ${hh}:${mm}`
    }
  }
  return invoice.invoice_date || '—'
}

function isTransportInvoice(invoice: TripInvoiceItem | TimelineInvoiceItem): boolean {
  return invoice.invoice_type === 'TRANSPORT' || invoice.mode === 'AIR' || invoice.mode === 'RAIL'
}

function transportModeIcon(mode: string): string {
  if (mode === 'AIR') return '✈️'
  if (mode === 'RAIL') return '🚄'
  return '🚕'
}

function transportModeText(mode: string): string {
  if (mode === 'AIR') return '飞机'
  if (mode === 'RAIL') return '火车'
  return '网约车'
}

function invoiceRouteText(invoice: TripInvoiceItem | TimelineInvoiceItem) {
  if (invoice.invoice_type === 'ACCOMMODATION') {
    return ''
  }
  if (invoice.trip_statement?.travel_details?.length) {
    return `${invoice.trip_statement.travel_details.length} 段网约车行程`
  }
  const statement = invoice.trip_statement
  const departure = statement?.travel_departure_place || invoice.departure_place || '—'
  const arrival = statement?.travel_arrival_place || invoice.arrival_place || '—'
  return `${departure} → ${arrival}`
}

function isSeparatorAfterInvoice(invoiceId: number): boolean {
  if (!timelineData.value) return false
  return timelineData.value.separators.some(
    (s) => s.after_invoice_id === invoiceId
  )
}

function getSeparatorForInvoice(
  invoiceId: number
): TimelineSeparator | undefined {
  if (!timelineData.value) return undefined
  return timelineData.value.separators.find(
    (s) => s.after_invoice_id === invoiceId
  )
}

// ── 将票据分配到行程段（下拉选择） ──
async function assignInvoiceToSegment(invoiceId: number, segmentNo: number) {
  if (!timelineData.value) return
  const seg = timelineData.value.segments.find((s) => s.segment_no === segmentNo)
  if (!seg) return

  assigningInvoiceId.value = invoiceId
  try {
    if (seg.trip_group_id) {
      await request.post(`trip-groups/${seg.trip_group_id}/attach-invoice/`, {
        invoice_id: invoiceId,
        reimbursement_category: 'OTHER',
      })
    } else {
      const segmentInvoiceIds = seg.invoices.map((inv) => inv.id)
      const allIds = [...segmentInvoiceIds, invoiceId]
      await request.post('trip-groups/', { invoice_ids: allIds })
    }
    selectedSegmentMap.value[invoiceId] = segmentNo
    ElMessage.success(`票据已归入第 ${segmentNo} 段行程`)
    await fetchTimeline()
  } catch (e: any) {
    const detail = e?.response?.data?.invoice_ids || e?.response?.data?.detail
    ElMessage.error(Array.isArray(detail) ? detail[0] : (detail || '归入行程段失败'))
  } finally {
    assigningInvoiceId.value = null
  }
}

function segmentLabel(seg: TimelineSegmentItem): string {
  const places: string[] = []
  for (const inv of seg.invoices) {
    if (inv.departure_place && !places.includes(inv.departure_place)) {
      places.push(inv.departure_place)
    }
    if (inv.arrival_place && !places.includes(inv.arrival_place)) {
      places.push(inv.arrival_place)
    }
  }
  const route = places.length >= 2 ? `${places[0]}→${places[places.length - 1]}` : (places[0] || '')
  const dateStr = seg.start_date ? ` ${seg.start_date}` : ''
  const suffix = seg.is_open ? ' (进行中)' : ''
  return `第 ${seg.segment_no} 段${route ? ' ' + route : ''}${dateStr}${suffix}`
}

function handleDragStart(invoice: TripInvoiceItem) {
  // 所有票据均可拖拽，包括火车票和飞机票
  if (!canDragInvoice(invoice)) {
    return
  }
  logDragDebug('drag start', {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    invoiceType: invoice.invoice_type,
  })
  draggedInvoice.value = invoice
  hoveredTripId.value = null
  edgeMaskDirection.value = null
}

function handleDragEnd() {
  logDragDebug('drag end')
  resetDragFeedbackState()
}

function allowDrop(event: DragEvent) {
  event.preventDefault()
}

function startEdgeAutoScroll(direction: 'up' | 'down') {
  if (!draggedInvoice.value) return
  if (edgeMaskDirection.value === direction && autoScrollFrame !== null) return

  logDragDebug('start edge auto scroll', {
    direction,
    invoiceId: draggedInvoice.value.id,
  })
  stopEdgeAutoScroll()
  edgeMaskDirection.value = direction

  const scrollTick = () => {
    if (!draggedInvoice.value || edgeMaskDirection.value !== direction) {
      stopEdgeAutoScroll()
      return
    }

    const scrollStep = direction === 'up' ? -36 : 36
    const scrollState = getScrollState()
    logDragDebug('edge auto scroll tick', {
      direction,
      scrollStep,
      target: scrollState.target,
      scrollOffset: scrollState.scrollOffset,
      maxScrollTop: scrollState.maxScrollTop,
    })
    if (direction === 'up' && scrollState.scrollOffset <= 0) {
      autoScrollFrame = window.requestAnimationFrame(scrollTick)
      return
    }
    if (direction === 'down' && scrollState.scrollOffset >= scrollState.maxScrollTop) {
      autoScrollFrame = window.requestAnimationFrame(scrollTick)
      return
    }
    performScroll(scrollStep)
    autoScrollFrame = window.requestAnimationFrame(scrollTick)
  }

  autoScrollFrame = window.requestAnimationFrame(scrollTick)
}

function resetDragFeedbackState() {
  logDragDebug('reset drag feedback state', {
    hoveredTripId: hoveredTripId.value,
    edgeMaskDirection: edgeMaskDirection.value,
  })
  draggedInvoice.value = null
  hoveredTripId.value = null
  edgeMaskDirection.value = null
  stopEdgeAutoScroll()
}

function stopEdgeAutoScroll() {
  if (autoScrollFrame !== null) {
    logDragDebug('stop edge auto scroll', { edgeMaskDirection: edgeMaskDirection.value })
    window.cancelAnimationFrame(autoScrollFrame)
    autoScrollFrame = null
  }
  edgeMaskDirection.value = null
}

function handleEdgeDragOver(direction: 'up' | 'down', event: DragEvent) {
  if (!draggedInvoice.value) return
  event.preventDefault()
  const scrollState = getScrollState()
  logDragDebug('edge drag over', {
    direction,
    clientY: event.clientY,
    target: scrollState.target,
    scrollOffset: scrollState.scrollOffset,
  })
  startEdgeAutoScroll(direction)
}

function handleEdgeDragLeave(direction: 'up' | 'down', event: DragEvent) {
  const currentTarget = event.currentTarget as HTMLElement | null
  const relatedTarget = event.relatedTarget as Node | null
  if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
    return
  }
  logDragDebug('edge drag leave', { direction })
  if (edgeMaskDirection.value === direction) {
    stopEdgeAutoScroll()
  }
}

function handleTripDragOver(trip: TripItem, event: DragEvent) {
  event.preventDefault()
  if (hoveredTripId.value !== trip.id) {
    logDragDebug('trip drag over', {
      tripId: trip.id,
      tripTitle: trip.title,
      clientY: event.clientY,
    })
  }
  hoveredTripId.value = trip.id
}

function handleTripDragLeave(trip: TripItem, event: DragEvent) {
  const target = event.currentTarget as HTMLElement | null
  const relatedTarget = event.relatedTarget as Node | null
  if (target && relatedTarget && target.contains(relatedTarget)) {
    return
  }
  if (hoveredTripId.value === trip.id) {
    logDragDebug('trip drag leave', { tripId: trip.id, tripTitle: trip.title })
    hoveredTripId.value = null
  }
}

function handleTripDrop(trip: TripItem, event: DragEvent) {
  event.preventDefault()
  if (!draggedInvoice.value) return
  logDragDebug('trip drop', {
    tripId: trip.id,
    tripTitle: trip.title,
    invoiceId: draggedInvoice.value.id,
    invoiceNumber: draggedInvoice.value.invoice_number,
  })
  pendingTripId.value = trip.id
  pendingInvoice.value = draggedInvoice.value
  attachCategory.value = draggedInvoice.value.invoice_type
  attachDialogVisible.value = true
  draggedInvoice.value = null
  hoveredTripId.value = null
  stopEdgeAutoScroll()
}

async function confirmAttachInvoice() {
  if (!pendingTripId.value || !pendingInvoice.value) return
  logDragDebug('confirm attach invoice', {
    pendingTripId: pendingTripId.value,
    pendingInvoiceId: pendingInvoice.value.id,
    reimbursementCategory: attachCategory.value,
  })
  try {
    const { data } = await request.post(`trip-groups/${pendingTripId.value}/attach-invoice/`, {
      invoice_id: pendingInvoice.value.id,
      reimbursement_category: attachCategory.value,
    })
    applySummary(data)
    attachDialogVisible.value = false
    pendingTripId.value = null
    pendingInvoice.value = null
    logDragDebug('attach invoice success')
    ElMessage.success('票据已加入行程')
  } catch {
    logDragDebug('attach invoice failed')
    ElMessage.error('加入行程失败')
  }
}

async function updateInvoiceCategory(trip: TripItem, invoice: TripInvoiceItem, value: InvoiceCategory) {
  try {
    const { data } = await request.post(`trip-groups/${trip.id}/update-invoice-category/`, {
      invoice_id: invoice.id,
      reimbursement_category: value,
    })
    applySummary(data)
    ElMessage.success('票据类型已更新')
  } catch {
    ElMessage.error('更新票据类型失败')
  }
}

async function removeInvoiceFromTrip(trip: TripItem, invoice: TripInvoiceItem) {
  try {
    await ElMessageBox.confirm(`确定将票据 ${invoice.invoice_number} 从该行程移出吗？`, '提示', { type: 'warning' })
    const { data } = await request.post(`trip-groups/${trip.id}/remove-invoice/`, {
      invoice_id: invoice.id,
    })
    applySummary(data)
    ElMessage.success('票据已移出行程')
  } catch {
    // ignore cancel
  }
}

function guessTransportType(invoice: TripInvoiceItem) {
  if (invoice.mode === 'AIR') return '飞机'
  if (invoice.mode === 'RAIL') return '高铁'
  return invoice.product_name || '其他交通'
}

function isLongDistanceTransportInvoice(invoice: TripInvoiceItem) {
  return invoice.mode === 'AIR' || invoice.mode === 'RAIL'
}

function guessExpenseType(invoice: TripInvoiceItem) {
  const productName = invoice.product_name || ''
  if (productName.includes('停车')) return '停车费'
  if (productName.includes('通讯')) return '通讯费'
  if (invoice.invoice_type === 'TRANSPORT' || productName.includes('车')) return '网约车'
  return '其他'
}

function invoiceReimbursementCategory(invoice: Pick<TripInvoiceItem, 'reimbursement_category' | 'invoice_type' | 'product_name'>): InvoiceCategory {
  // 明确分类（交通/住宿）优先；OTHER 视为未分类，继续往下判断
  if (invoice.reimbursement_category === 'TRANSPORT' || invoice.reimbursement_category === 'ACCOMMODATION') {
    return invoice.reimbursement_category
  }
  if (invoice.invoice_type === 'TRANSPORT' || invoice.invoice_type === 'ACCOMMODATION') {
    return invoice.invoice_type
  }

  const productName = invoice.product_name || ''
  if (productName.includes('住宿') || productName.includes('酒店') || productName.includes('宾馆')) {
    return 'ACCOMMODATION'
  }
  return 'OTHER'
}

function findCompanyId(companyName?: string) {
  return COMPANY_OPTIONS.find((item) => item.name === companyName)?.id ?? null
}

function defaultTripDestination(trip: TripItem, transportInvoices: TripInvoiceItem[]) {
  const outboundInvoice = transportInvoices.find(
    (item) => item.is_depart_from_home && !item.is_arrive_home && item.arrival_place
  )
  if (outboundInvoice?.arrival_place) {
    return outboundInvoice.arrival_place
  }

  const firstArrival = transportInvoices.find((item) => item.arrival_place)?.arrival_place
  if (firstArrival) {
    return firstArrival
  }

  return trip.destinations[0] || ''
}

// ── 从时间线段创建报销单 ──
function createReimbursementFromSegment(seg: TimelineSegmentItem) {
  const transportInvoices = seg.invoices.filter(
    (item) => invoiceReimbursementCategory(item as any) === 'TRANSPORT' && (item.mode === 'AIR' || item.mode === 'RAIL')
  )
  const localTransportExpenseInvoices = seg.invoices.filter(
    (item) => invoiceReimbursementCategory(item as any) === 'TRANSPORT' && item.mode !== 'AIR' && item.mode !== 'RAIL'
  )
  const accommodationInvoices = seg.invoices.filter((item) => invoiceReimbursementCategory(item as any) === 'ACCOMMODATION')
  const otherInvoices = seg.invoices.filter((item) => invoiceReimbursementCategory(item as any) === 'OTHER')
  const expenseInvoices = [...localTransportExpenseInvoices, ...otherInvoices]
  const draft = {
    company_id: findCompanyId(authStore.userInfo?.company),
    dept: authStore.userInfo?.department || '',
    traveler: authStore.userInfo?.real_name || authStore.userInfo?.username || '',
    project_code: '',
    project_name: '',
    departure_date: seg.start_date || '',
    return_date: seg.end_date || '',
    departure_place: transportInvoices[0]?.departure_place || '',
    purpose: '',
    approver: '',
    invoices: seg.invoices.map((item) => item.id),
    transport_items: transportInvoices.map((item) => ({
      id: `transport-draft-${item.id}`,
      departure_date: item.invoice_date || seg.start_date || '',
      departure_place: item.departure_place || effectiveHomeCity.value,
      arrival_date: item.invoice_date || seg.end_date || '',
      arrival_place: item.arrival_place || '',
      transport_type: guessTransportType(item as any),
      quantity: 1,
      amount: Number(item.amount || 0),
      remark: item.invoice_number,
    })),
    accommodation_items: accommodationInvoices.map((item) => ({
      id: `accommodation-draft-${item.id}`,
      city: '',
      num_nights: 1,
      standard_cost: 0,
      actual_cost: Number(item.amount || 0),
      amount: 0,
      remark: item.invoice_number,
    })),
    expense_items: expenseInvoices.map((item) => ({
      id: `expense-draft-${item.id}`,
      expense_type: guessExpenseType(item as any),
      expense_name: item.product_name || '',
      quantity: 1,
      amount: Number(item.amount || 0),
      remark: item.invoice_number,
    })),
  }
  sessionStorage.setItem(TRIP_DRAFT_STORAGE_KEY, JSON.stringify(draft))
  router.push({ path: '/reimbursements/create', query: { tripDraft: '1' } })
}

function createReimbursementFromTrip(trip: TripItem) {
  const transportInvoices = trip.invoices.filter(
    (item) => invoiceReimbursementCategory(item) === 'TRANSPORT' && isLongDistanceTransportInvoice(item)
  )
  const localTransportExpenseInvoices = trip.invoices.filter(
    (item) => invoiceReimbursementCategory(item) === 'TRANSPORT' && !isLongDistanceTransportInvoice(item)
  )
  const accommodationInvoices = trip.invoices.filter((item) => invoiceReimbursementCategory(item) === 'ACCOMMODATION')
  const otherInvoices = trip.invoices.filter((item) => invoiceReimbursementCategory(item) === 'OTHER')
  const expenseInvoices = [...localTransportExpenseInvoices, ...otherInvoices]

  const draft = {
    company_id: findCompanyId(authStore.userInfo?.company),
    dept: authStore.userInfo?.department || '',
    traveler: authStore.userInfo?.real_name || authStore.userInfo?.username || '',
    project_code: '',
    project_name: '',
    departure_date: trip.start_date || '',
    return_date: trip.end_date || '',
    departure_place: defaultTripDestination(trip, transportInvoices),
    purpose: '',
    approver: '',
    invoices: trip.invoices.map((item) => item.id),
    transport_items: transportInvoices.map((item) => ({
      id: `transport-draft-${item.id}`,
      departure_date: item.invoice_date || trip.start_date || '',
      departure_place: item.departure_place || effectiveHomeCity.value,
      arrival_date: item.invoice_date || trip.end_date || '',
      arrival_place: item.arrival_place || destinationText(trip).replace('—', ''),
      transport_type: guessTransportType(item),
      quantity: 1,
      amount: Number(item.amount || 0),
      remark: item.invoice_number,
    })),
    accommodation_items: accommodationInvoices.map((item) => ({
      id: `accommodation-draft-${item.id}`,
      city: '',
      num_nights: 1,
      standard_cost: 0,
      actual_cost: Number(item.amount || 0),
      amount: 0,
      remark: item.invoice_number,
    })),
    expense_items: expenseInvoices.map((item) => ({
      id: `expense-draft-${item.id}`,
      expense_type: guessExpenseType(item),
      expense_name: item.product_name || '',
      quantity: 1,
      amount: Number(item.amount || 0),
      remark: item.invoice_number,
    })),
  }

  sessionStorage.setItem(TRIP_DRAFT_STORAGE_KEY, JSON.stringify(draft))
  router.push({ path: '/reimbursements/create', query: { tripDraft: '1' } })
}

onMounted(() => {
  fetchTrips()
  resolveScrollContainer()
  window.addEventListener('dragend', resetDragFeedbackState)
})

onUnmounted(() => {
  window.removeEventListener('dragend', resetDragFeedbackState)
  stopEdgeAutoScroll()
})
</script>

<template>
  <div ref="pageRootRef" class="trip-page" v-loading="loading" @dragover="allowDrop">
    <div
      v-if="isDraggingInvoice"
      class="drag-edge-zone drag-edge-zone-top"
      :class="{ 'drag-edge-mask-active': edgeMaskDirection === 'up' }"
      @dragenter="startEdgeAutoScroll('up')"
      @dragover="handleEdgeDragOver('up', $event)"
      @dragleave="handleEdgeDragLeave('up', $event)"
      @drop="stopEdgeAutoScroll"
    />
    <div
      v-if="isDraggingInvoice"
      class="drag-edge-zone drag-edge-zone-bottom"
      :class="{ 'drag-edge-mask-active': edgeMaskDirection === 'down' }"
      @dragenter="startEdgeAutoScroll('down')"
      @dragover="handleEdgeDragOver('down', $event)"
      @dragleave="handleEdgeDragLeave('down', $event)"
      @drop="stopEdgeAutoScroll"
    />

    <div class="page-header">
      <div>
        <h2>我的行程</h2>
        <p>根据已上传的火车票和飞机票，自动归组出差起止周期。</p>
      </div>
      <div class="header-actions">
        <div class="view-toggle">
          <button
            class="toggle-btn"
            :class="{ active: viewMode === 'cards' }"
            @click="switchToCards"
          >行程卡片</button>
          <button
            class="toggle-btn"
            :class="{ active: viewMode === 'timeline' }"
            @click="switchToTimeline"
          >时间线</button>
        </div>
        <el-input v-model="homeCityOverride" placeholder="手动指定归属城市，如郑州" clearable />
        <el-button type="primary" @click="fetchTrips">重新识别</el-button>
      </div>
    </div>
    <div class="filter-row section-gap">
      <el-date-picker
        v-model="dateRangeFilter"
        type="daterange"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        range-separator="至"
        value-format="YYYY-MM-DD"
        unlink-panels
        clearable
      />
      <el-input
        v-model="stationFilter"
        placeholder="途径站点 / 目的地"
        clearable
      />
      <el-button type="default" plain @click="clearTripFilters">清除筛选</el-button>
    </div>

    <!-- ── 行程卡片模式 ── -->
    <template v-if="viewMode === 'cards'">
    <div class="summary-grid section-gap">
      <div class="summary-card">
        <div class="summary-label">归属城市</div>
        <div class="summary-value">{{ effectiveHomeCity || '未识别' }}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">识别行程</div>
        <div class="summary-value">{{ tripData.total_trips }}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">完整往返</div>
        <div class="summary-value">{{ completeTripCount }}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">待归入行程票据</div>
        <div class="summary-value">{{ availableInvoiceCount }}</div>
      </div>
    </div>

    <el-empty v-if="!tripData.trips.length && !tripData.available_invoices.length && !loading" description="暂无可识别或待归入的票据" />

    <div v-if="tripData.available_invoices.length" class="section-gap">
      <div class="section-title">全部待归入票据</div>
      <div class="invoice-pool">
        <div
          v-for="invoice in tripData.available_invoices"
          :key="invoice.id"
          class="invoice-card"
          :class="{ draggable: canDragInvoice(invoice) }"
          :draggable="canDragInvoice(invoice)"
          @dragstart="handleDragStart(invoice)"
          @dragend="handleDragEnd"
        >
          <div class="invoice-card-header">
            <span>{{ invoice.invoice_number }}</span>
            <el-tag :type="categoryTagType(invoice.invoice_type)" size="small">{{ categoryText(invoice.invoice_type) }}</el-tag>
          </div>
          <div class="invoice-card-line">日期：{{ formatInvoiceTime(invoice) }}</div>
          <div class="invoice-card-line">名称：{{ invoice.product_name || '—' }}</div>
          <div class="invoice-card-line">金额：¥{{ invoice.amount || '0.00' }}</div>
          <div class="invoice-card-line">路径：{{ invoiceRouteText(invoice) }}</div>
          <div class="invoice-card-actions">
            <el-tag :type="modeTagType(invoice.mode)" size="small">{{ modeText(invoice.mode) }}</el-tag>
            <el-button type="primary" text @click="openInvoicePreview(invoice)">查看原票</el-button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="tripData.trips.length" class="section-gap">
      <div class="section-title">
        行程信息
        <span v-if="filteredTrips.length !== tripData.trips.length" class="filter-hint">
          显示 {{ filteredTrips.length }} / {{ tripData.trips.length }} 条
        </span>
      </div>
      <el-empty v-if="!filteredTrips.length" description="没有匹配的行程" />
      <div v-else class="trip-list">
        <div
          v-for="trip in filteredTrips"
          :key="trip.id"
          class="trip-card"
          :class="{ 'trip-card-drop-active': isDraggingInvoice && hoveredTripId === trip.id }"
          @dragover="handleTripDragOver(trip, $event)"
          @dragleave="handleTripDragLeave(trip, $event)"
          @drop="handleTripDrop(trip, $event)"
        >
          <div class="trip-card-header">
            <div>
              <div class="trip-title">
                <template v-if="editingTripId === trip.id">
                  <el-input
                    v-model="editingTripTitle"
                    placeholder="请输入行程标题"
                    class="trip-title-input"
                    @keyup.enter="saveTripTitle(trip)"
                  />
                  <el-button type="primary" size="small" @click="saveTripTitle(trip)">保存</el-button>
                  <el-button size="small" @click="cancelEditTitle">取消</el-button>
                </template>
                <template v-else>
                  <span>{{ trip.title }}</span>
                  <el-button type="primary" text @click="startEditTitle(trip)">编辑标题</el-button>
                </template>
                <el-tag :type="trip.source === 'MANUAL' ? 'warning' : 'primary'" size="small">{{ trip.source === 'MANUAL' ? '手动' : '自动' }}</el-tag>
                <el-tag :type="trip.is_complete ? 'success' : 'warning'" size="small">{{ trip.is_complete ? '已闭环' : '未闭环' }}</el-tag>
              </div>
              <div class="trip-meta">{{ formatDateRange(trip) }} · {{ destinationText(trip) }} · {{ trip.duration_days ?? '—' }} 天</div>
            </div>
            <div class="trip-header-actions">
              <el-button type="primary" @click="createReimbursementFromTrip(trip)">根据行程创建报销单</el-button>
              <el-button type="success" plain @click="downloadTripInvoices(trip)">下载合并发票</el-button>
            </div>
          </div>

          <div class="trip-drop-hint">
            可将非火车/飞机票直接拖到此行程中，并指定报销类型。火车票和飞机票仍由系统自动识别。
          </div>

          <div class="trip-invoice-table-wrap">
            <div class="trip-invoice-grid trip-invoice-grid-head">
              <div>日期</div>
              <div>发票号</div>
              <div>原始类型</div>
              <div>报销类型</div>
              <div>票据内容</div>
              <div>路线</div>
              <div class="cell-align-right">金额</div>
              <div class="cell-align-center">原票</div>
              <div class="cell-align-center">操作</div>
            </div>
            <div
              v-for="invoice in trip.invoices"
              :key="invoice.id"
              class="trip-invoice-grid trip-invoice-grid-row"
            >
              <div class="cell-date">{{ formatInvoiceTime(invoice) }}</div>
              <div class="cell-invoice-number">{{ invoice.invoice_number }}</div>
              <div>
                <el-tag :type="categoryTagType(invoice.invoice_type)" size="small">
                  {{ categoryText(invoice.invoice_type) }}
                </el-tag>
              </div>
              <div>
                <el-select
                  v-model="invoice.reimbursement_category"
                  size="small"
                  class="reimbursement-select"
                  :disabled="!canEditGroupedInvoice(invoice)"
                  @change="(value: InvoiceCategory) => updateInvoiceCategory(trip, invoice, value)"
                >
                  <el-option label="交通" value="TRANSPORT" />
                  <el-option label="住宿" value="ACCOMMODATION" />
                  <el-option label="其他" value="OTHER" />
                </el-select>
              </div>
              <div class="cell-strong cell-ellipsis" :title="invoice.product_name || '—'">
                {{ invoice.product_name || '—' }}
              </div>
              <div class="cell-route cell-ellipsis" :title="invoiceRouteText(invoice)">
                {{ invoiceRouteText(invoice) }}
              </div>
              <div class="cell-amount">¥{{ invoice.amount || '0.00' }}</div>
              <div class="cell-align-center">
                <el-button type="primary" text @click="openInvoicePreview(invoice)">查看</el-button>
              </div>
              <div class="cell-align-center">
                <el-button v-if="canEditGroupedInvoice(invoice)" type="danger" text @click="removeInvoiceFromTrip(trip, invoice)">移出</el-button>
                <span v-else class="table-muted">主票</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </template>

    <!-- ── 行程时间线视图 ── -->
    <div v-if="viewMode === 'timeline'" v-loading="timelineLoading" class="timeline-container">
      <!-- 空状态 -->
      <div v-if="!timelineData || !timelineData.all_invoices.length" class="empty-state">
        <p>暂无交通发票，请先上传火车票或飞机票</p>
      </div>

      <!-- 时间线 -->
      <div v-else class="timeline-wrapper">
        <!-- 第一条发票前：行程开始插入点 -->
        <div
          class="separator-spot separator-spot-top"
          :class="{ hover: hoveredSeparatorSpot === -1 }"
          @mouseenter="hoveredSeparatorSpot = -1"
          @mouseleave="hoveredSeparatorSpot = null"
        >
          <button class="add-separator-btn" @click="openSeparatorDialog(null)" title="在第一条发票前插入行程开始标记">
            <span class="add-sep-icon">+</span>
            <span class="add-sep-text">行程开始</span>
          </button>
        </div>

        <template v-for="(invoice, idx) in timelineData.all_invoices" :key="invoice.id">
          <!-- 发票卡片 -->
          <div
            class="timeline-invoice-card"
            :class="{
              'segment-end': invoice.is_segment_end,
              ['end-' + invoice.segment_end_reason]: invoice.is_segment_end,
            }"
            @click="openInvoicePreview(invoice as any)"
          >
            <div class="timeline-dot" :class="'mode-' + invoice.mode.toLowerCase()">
              <span class="dot-emoji">{{ transportModeIcon(invoice.mode) }}</span>
            </div>
            <div class="timeline-card-body">
              <div class="timeline-card-header">
                <span class="timeline-invoice-num">{{ invoice.invoice_number }}</span>
                <span class="timeline-mode-tag" :class="'mode-' + invoice.mode.toLowerCase()">
                  {{ transportModeText(invoice.mode) }}
                </span>
                <span class="timeline-date">{{ formatInvoiceTime(invoice) }}</span>
              </div>
              <div class="timeline-route" v-if="invoice.departure_place || invoice.arrival_place || invoice.trip_statement">
                <template v-if="invoice.trip_statement?.travel_details?.length">
                  <span class="route-place">{{ invoice.trip_statement.travel_details.length }} 段网约车行程</span>
                </template>
                <template v-else>
                <span class="route-place" :class="{ home: invoice.is_depart_from_home }">
                  {{ invoice.trip_statement?.travel_departure_place || invoice.departure_place || '—' }}
                </span>
                <span class="route-arrow">→</span>
                <span class="route-place" :class="{ home: invoice.is_arrive_home }">
                  {{ invoice.trip_statement?.travel_arrival_place || invoice.arrival_place || '—' }}
                </span>
                </template>
              </div>
              <div class="timeline-card-footer">
                <span class="timeline-product">{{ invoice.product_name || '—' }}</span>
                <span class="timeline-amount" v-if="invoice.amount">¥{{ invoice.amount }}</span>
              </div>
            </div>
          </div>

          <!-- 段尾：自动闭环 -->
          <div v-if="invoice.is_segment_end && !isSeparatorAfterInvoice(invoice.id)" class="timeline-separator timeline-auto-close">
            <div class="separator-line"></div>
            <div class="separator-label auto-close-label">
              <span class="sep-icon">🏠</span>
              <span>回到{{ timelineData?.home_city || '归属地' }} · 行程闭环</span>
            </div>
            <div class="separator-line"></div>
          </div>

          <!-- 段尾：手动分隔符 -->
          <div v-if="isSeparatorAfterInvoice(invoice.id)" class="timeline-separator" :class="{ 'also-auto': invoice.is_segment_end }">
            <div class="separator-line"></div>
            <div class="separator-label" :class="{ 'both-label': invoice.is_segment_end }">
              <span class="sep-icon">⏸</span>
              <span>{{ getSeparatorForInvoice(invoice.id)?.label || '行程结束' }}</span>
              <span v-if="invoice.is_segment_end" class="auto-hint">（同时自动闭环）</span>
              <button
                class="sep-delete-btn"
                title="删除分隔符"
                @click.stop="deleteSeparator(getSeparatorForInvoice(invoice.id)!.id)"
              >
                <el-icon><Delete /></el-icon>
              </button>
            </div>
            <div class="separator-line"></div>
          </div>

          <!-- 插入点（非段尾 且 非最后一张） -->
          <div
            v-if="!invoice.is_segment_end && !isSeparatorAfterInvoice(invoice.id) && idx < timelineData.all_invoices.length - 1"
            class="separator-spot"
            :class="{ hover: hoveredSeparatorSpot === invoice.id }"
            @mouseenter="hoveredSeparatorSpot = invoice.id"
            @mouseleave="hoveredSeparatorSpot = null"
          >
            <button class="add-separator-btn" @click.stop="openSeparatorDialog(invoice.id)" title="在此插入行程分隔符">
              <span class="add-sep-icon">+</span>
            </button>
          </div>
        </template>
      </div>

      <!-- 行程段概览 -->
      <div v-if="timelineData && timelineData.segments.length" class="segments-overview">
        <h4 class="segments-title">行程段划分（{{ timelineData.total_segments }} 段）</h4>
        <div class="segment-list">
          <div
            v-for="seg in timelineData.segments"
            :key="seg.segment_no"
            class="segment-card"
            :class="{ 'open-segment': seg.is_open }"
          >
            <div class="segment-header">
              <span class="segment-no">第 {{ seg.segment_no }} 段</span>
              <div class="segment-badges">
                <span v-if="seg.close_reason === 'auto' || seg.close_reason === 'both'" class="seg-badge seg-badge-auto">自动闭环</span>
                <span v-if="seg.close_reason === 'manual' || seg.close_reason === 'both'" class="seg-badge seg-badge-manual">手动分隔</span>
                <span v-if="seg.is_open" class="seg-badge seg-badge-open">进行中</span>
              </div>
              <span class="segment-count">{{ seg.invoice_count }} 张票</span>
            </div>
            <div class="segment-dates" v-if="seg.start_date">
              {{ seg.start_date }}
              <template v-if="seg.end_date && seg.end_date !== seg.start_date"> → {{ seg.end_date }}</template>
            </div>
            <div class="segment-summary">
              <template v-for="(inv, i) in seg.invoices" :key="inv.id">
                <span v-if="i > 0" class="seg-arrow">→</span>
                <span class="seg-place" :class="{ home: inv.is_depart_from_home || inv.is_arrive_home }">
                  {{ inv.departure_place || inv.arrival_place || '—' }}
                </span>
              </template>
            </div>
            <div class="segment-actions">
              <el-button type="primary" size="small" @click="createReimbursementFromSegment(seg)">
                根据此行程段创建报销单
              </el-button>
              <el-button v-if="seg.trip_group_id" type="success" size="small" plain @click="downloadSegmentInvoices(seg)">
                下载合并发票
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 待归入行程段的其他票据 -->
      <div v-if="timelineData && timelineData.available_invoices.length" class="available-section">
        <div class="section-title">待归入行程段的其他票据（{{ timelineData.available_invoices.length }} 张）</div>
        <p class="section-hint">住宿费、市内交通等票据的开票时间不等于订单发生时间，请选择对应行程段归入。</p>
        <div class="invoice-pool">
          <div
            v-for="invoice in timelineData.available_invoices"
            :key="invoice.id"
            class="invoice-card"
          >
            <div class="invoice-card-header">
              <span>{{ invoice.invoice_number }}</span>
              <div class="invoice-card-header-right">
                <el-tag :type="categoryTagType(invoice.invoice_type as InvoiceCategory)" size="small">
                  {{ categoryText(invoice.invoice_type as InvoiceCategory) }}
                </el-tag>
                <el-select
                  :model-value="selectedSegmentMap[invoice.id] || undefined"
                  placeholder="选择行程段"
                  size="small"
                  class="segment-select"
                  :loading="assigningInvoiceId === invoice.id"
                  @change="(val: number) => assignInvoiceToSegment(invoice.id, val)"
                >
                  <el-option
                    v-for="seg in timelineData!.segments"
                    :key="seg.segment_no"
                    :label="segmentLabel(seg)"
                    :value="seg.segment_no"
                  />
                </el-select>
              </div>
            </div>
            <div class="invoice-card-line">日期：{{ formatInvoiceTime(invoice) }}</div>
            <div class="invoice-card-line">名称：{{ invoice.product_name || '—' }}</div>
            <div class="invoice-card-line">金额：¥{{ invoice.amount || '0.00' }}</div>
            <div class="invoice-card-actions">
              <el-button type="primary" text @click="openInvoicePreview(invoice as any)">查看原票</el-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 分隔符弹窗 -->
    <el-dialog v-model="separatorDialogVisible" title="添加行程分隔符" width="420px" destroy-on-close>
      <div class="separator-dialog-body">
        <p class="separator-dialog-hint">
          分隔符将在此发票之后插入一个行程周期结束标记，后续发票将属于下一个行程段。
        </p>
        <el-input
          v-model="separatorLabel"
          placeholder="分隔备注（如：北京出差结束）"
          maxlength="60"
          show-word-limit
          clearable
        />
      </div>
      <template #footer>
        <el-button @click="separatorDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="separatorSubmitting" @click="submitSeparator">
          添加分隔符
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="attachDialogVisible" title="设置拖入票据类型" width="420px">
      <el-form label-width="88px">
        <el-form-item label="票据编号">
          <span>{{ pendingInvoice?.invoice_number || '—' }}</span>
        </el-form-item>
        <el-form-item label="报销类型">
          <el-select v-model="attachCategory" style="width: 100%;">
            <el-option label="交通" value="TRANSPORT" />
            <el-option label="住宿" value="ACCOMMODATION" />
            <el-option label="其他" value="OTHER" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="attachDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmAttachInvoice">确认加入</el-button>
      </template>
    </el-dialog>

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
            <div class="preview-toolbar-actions">
              <el-button type="primary" @click="downloadInvoice">下载</el-button>
              <el-button type="primary" plain @click="openPreviewInNewWindow">新窗口打开</el-button>
            </div>
          </div>
          <div class="preview-info-list">
            <div class="preview-info-item">
              <span class="preview-info-label">票据号码</span>
              <span class="preview-info-value">{{ previewInvoice.invoice_number || '—' }}</span>
            </div>
            <div class="preview-info-item">
              <span class="preview-info-label">票据类型</span>
              <span class="preview-info-value">{{ categoryText(previewInvoice.invoice_type) }}</span>
            </div>
            <div class="preview-info-item">
              <span class="preview-info-label">报销类型</span>
              <span class="preview-info-value">{{ categoryText(previewInvoice.reimbursement_category) }}</span>
            </div>
            <div class="preview-info-item">
              <span class="preview-info-label">金额</span>
              <span class="preview-info-value">¥{{ previewInvoice.amount || '0.00' }}</span>
            </div>
            <div class="preview-info-item">
              <span class="preview-info-label">开票日期</span>
              <span class="preview-info-value">{{ formatInvoiceTime(previewInvoice) }}</span>
            </div>
            <div class="preview-info-item">
              <span class="preview-info-label">票据内容</span>
              <span class="preview-info-value">{{ previewInvoice.product_name || '—' }}</span>
            </div>
            <div class="preview-info-item">
              <span class="preview-info-label">交通方式</span>
              <span class="preview-info-value">{{ modeText(previewInvoice.mode) }}</span>
            </div>
            <div class="preview-info-item preview-info-item-block">
              <span class="preview-info-label">出发地</span>
              <span class="preview-info-value">{{ previewInvoice.trip_statement?.travel_departure_place || previewInvoice.departure_place || '—' }}</span>
            </div>
            <div class="preview-info-item preview-info-item-block">
              <span class="preview-info-label">到达地</span>
              <span class="preview-info-value">{{ previewInvoice.trip_statement?.travel_arrival_place || previewInvoice.arrival_place || '—' }}</span>
            </div>
            <div v-if="previewInvoice.trip_statement" class="preview-info-item preview-info-item-block statement-info-card">
              <div class="statement-card-header">
                <span class="preview-info-label">网约车行程单</span>
                <el-button type="primary" text size="small" @click="openTripStatementInNewWindow(previewInvoice.trip_statement)">查看原件</el-button>
              </div>
              <div class="statement-detail-grid">
                <div>
                  <span class="statement-detail-label">行程周期</span>
                  <strong>{{ previewInvoice.trip_statement.travel_start_date || '—' }} 至 {{ previewInvoice.trip_statement.travel_end_date || '—' }}</strong>
                </div>
                <div>
                  <span class="statement-detail-label">行程总金额</span>
                  <strong>¥{{ previewInvoice.trip_statement.travel_total_amount || '0.00' }}</strong>
                </div>
                <div>
                  <span class="statement-detail-label">申请日期</span>
                  <strong>{{ previewInvoice.trip_statement.application_date || '—' }}</strong>
                </div>
                <div>
                  <span class="statement-detail-label">申请人手机号</span>
                  <strong>{{ previewInvoice.trip_statement.applicant_phone || '—' }}</strong>
                </div>
                <div>
                  <span class="statement-detail-label">文件名称</span>
                  <strong>{{ previewInvoice.trip_statement.name || '—' }}</strong>
                </div>
              </div>
              <div v-if="previewInvoice.trip_statement.travel_details?.length" class="statement-trip-list">
                <div class="statement-trip-list-title">行程明细</div>
                <div
                  v-for="(detail, index) in previewInvoice.trip_statement.travel_details"
                  :key="`${detail.date || ''}-${detail.departure_place || ''}-${detail.arrival_place || ''}-${index}`"
                  class="statement-trip-item"
                >
                  <span class="statement-trip-index">{{ index + 1 }}</span>
                  <div class="statement-trip-main">
                    <div class="statement-trip-route">{{ detail.departure_place || '—' }} → {{ detail.arrival_place || '—' }}</div>
                    <div class="statement-trip-meta">
                      <span>{{ detail.date || '—' }}</span>
                      <span v-if="detail.amount">¥{{ detail.amount }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.trip-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: relative;
}

.drag-edge-zone {
  position: fixed;
  left: 0;
  right: 0;
  height: 220px;
  z-index: 20;
  pointer-events: auto;
  opacity: 0;
  transition: opacity 0.16s ease;
}

.drag-edge-zone-top {
  top: 0;
  background: linear-gradient(180deg, rgba(64, 158, 255, 0.24) 0%, rgba(64, 158, 255, 0.08) 52%, rgba(64, 158, 255, 0) 100%);
}

.drag-edge-zone-bottom {
  bottom: 0;
  background: linear-gradient(0deg, rgba(64, 158, 255, 0.24) 0%, rgba(64, 158, 255, 0.08) 52%, rgba(64, 158, 255, 0) 100%);
}

.drag-edge-mask-active {
  opacity: 1;
}

.page-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.page-header h2 {
  margin: 0;
  font-size: 24px;
}

.page-header p {
  margin: 8px 0 0;
  color: #606266;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.summary-card {
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  padding: 18px 20px;
}

.summary-label {
  color: #909399;
  font-size: 13px;
}

.summary-value {
  margin-top: 8px;
  font-size: 28px;
  font-weight: 600;
  color: #303133;
}

.section-gap {
  margin-top: 8px;
}

.section-title {
  margin-bottom: 12px;
  font-size: 16px;
  font-weight: 600;
}

.invoice-pool {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.invoice-card {
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.invoice-card.draggable {
  cursor: grab;
  border-style: dashed;
}

.invoice-card-header,
.invoice-card-actions,
.trip-card-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.trip-header-actions {
  display: flex;
  gap: 8px;
}

.invoice-card-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.segment-select {
  width: 200px;
}

.invoice-card-line,
.trip-meta,
.trip-drop-hint,
.table-muted {
  color: #606266;
  font-size: 13px;
}

.trip-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.trip-card {
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
}

.trip-card-drop-active {
  border-color: #409eff;
  background: linear-gradient(180deg, rgba(64, 158, 255, 0.08) 0%, rgba(64, 158, 255, 0.02) 100%);
  box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.16);
}

.trip-title {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 16px;
  font-weight: 600;
  flex-wrap: wrap;
}

.trip-title-input {
  width: 260px;
}

.trip-drop-hint {
  padding: 10px 12px;
  border-radius: 8px;
  background: #f8fafc;
}

.trip-invoice-table-wrap {
  width: 100%;
  overflow-x: auto;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  background: #fff;
}

.trip-invoice-grid {
  display: grid;
  grid-template-columns:
    minmax(132px, 0.9fr)
    minmax(150px, 0.95fr)
    92px
    116px
    minmax(220px, 1.5fr)
    minmax(240px, 1.65fr)
    108px
    72px
    80px;
  min-width: 1280px;
  align-items: center;
}

.trip-invoice-grid > div {
  min-width: 0;
  padding: 16px 14px;
  border-right: 1px solid #ebeef5;
}

.trip-invoice-grid > div:last-child {
  border-right: none;
}

.trip-invoice-grid-head {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f5f7fa;
  color: #303133;
  font-size: 13px;
  font-weight: 600;
}

.trip-invoice-grid-row {
  border-top: 1px solid #ebeef5;
  color: #303133;
  font-size: 14px;
}

.trip-invoice-grid-row:nth-child(odd) {
  background: #fafbfc;
}

.trip-invoice-grid-row:hover {
  background: #f5f9ff;
}

.cell-date,
.cell-invoice-number {
  line-height: 1.45;
  word-break: break-word;
}

.cell-strong {
  font-weight: 600;
}

.cell-route {
  color: #303133;
}

.cell-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-amount {
  text-align: right;
  font-weight: 600;
  white-space: nowrap;
}

.cell-align-right {
  text-align: right;
}

.cell-align-center {
  text-align: center;
}

.cell-align-center :deep(.el-button) {
  margin-left: 0;
  padding-left: 4px;
  padding-right: 4px;
  white-space: nowrap;
}

.reimbursement-select {
  width: 92px;
}

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
  background: #f7f9fc;
  overflow: hidden;
}

.preview-frame,
.preview-image {
  width: 100%;
  height: 100%;
  border: 0;
  object-fit: contain;
  background: #f7f9fc;
}

.preview-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.preview-toolbar-actions {
  display: flex;
  gap: 8px;
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
  color: #909399;
}

.preview-info-value {
  font-size: 15px;
  color: #303133;
  word-break: break-word;
}

.statement-info-card {
  padding: 12px;
  border: 1px solid rgba(64, 158, 255, 0.16);
  border-radius: 10px;
  background: rgba(64, 158, 255, 0.04);
}

.statement-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.filter-row :deep(.el-date-picker),
.filter-row :deep(.el-input) {
  min-width: 240px;
  max-width: 360px;
}

.filter-hint {
  margin-left: 12px;
  color: #409eff;
  font-size: 13px;
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
  color: #909399;
}

.statement-detail-grid strong {
  font-size: 14px;
  color: #303133;
  font-weight: 600;
  word-break: break-word;
}

.statement-trip-list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.statement-trip-list-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}

.statement-trip-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #ebeef5;
}

.statement-trip-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(64, 158, 255, 0.1);
  color: #409eff;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.statement-trip-main {
  flex: 1;
  min-width: 0;
}

.statement-trip-route {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  word-break: break-word;
}

.statement-trip-meta {
  margin-top: 4px;
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #909399;
}

/* ---- View Toggle ---- */
.header-actions {
  display: flex;
  gap: 12px;
  width: 480px;
  align-items: center;
}

.view-toggle {
  display: flex;
  background: #f0f2f5;
  border-radius: 20px;
  padding: 3px;
  gap: 0;
  flex-shrink: 0;
}

.toggle-btn {
  padding: 6px 18px;
  border: none;
  border-radius: 20px;
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  color: #909399;
  cursor: pointer;
  transition: all 0.18s ease;
}

.toggle-btn.active {
  background: #fff;
  color: #303133;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.toggle-btn:hover:not(.active) {
  color: #606266;
}

/* ---- Timeline Container ---- */
.timeline-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.timeline-wrapper {
  position: relative;
  padding-left: 40px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.timeline-wrapper::before {
  content: '';
  position: absolute;
  left: 18px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #e4e7ed;
  border-radius: 1px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 0;
  color: #909399;
}

/* ---- Separator Spot ---- */
.separator-spot {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  height: 36px;
  margin: 2px 0;
  opacity: 0;
  transition: opacity 0.18s ease;
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
  border: 1px dashed #dcdfe6;
  border-radius: 20px;
  background: #fff;
  color: #909399;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.18s ease;
  white-space: nowrap;
}

.add-separator-btn:hover {
  border-color: #409eff;
  color: #409eff;
  background: rgba(64, 158, 255, 0.04);
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
  gap: 12px;
  padding: 14px 16px;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.18s ease;
  position: relative;
  z-index: 1;
}

.timeline-invoice-card:hover {
  border-color: #409eff;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  transform: translateY(-1px);
}

.timeline-invoice-card.segment-end {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  border-bottom-color: transparent;
  margin-bottom: 0;
}

.timeline-invoice-card.end-auto {
  border-color: rgba(103, 194, 58, 0.3);
  background: rgba(103, 194, 58, 0.02);
}

.timeline-invoice-card.end-manual {
  border-color: rgba(230, 162, 60, 0.3);
  background: rgba(230, 162, 60, 0.02);
}

.timeline-invoice-card.end-both {
  border-color: rgba(64, 158, 255, 0.3);
  background: rgba(64, 158, 255, 0.02);
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
  background: #fff;
  border: 2px solid #dcdfe6;
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
  gap: 8px;
  flex-wrap: wrap;
}

.timeline-invoice-num {
  font-weight: 600;
  font-size: 14px;
  color: #303133;
}

.timeline-mode-tag {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 12px;
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

.timeline-date {
  font-size: 12px;
  color: #909399;
  margin-left: auto;
}

.timeline-route {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.route-place {
  color: #606266;
  font-weight: 500;
}

.route-place.home {
  color: #409eff;
  font-weight: 600;
}

.route-place.home::after {
  content: ' 🏠';
  font-size: 11px;
}

.route-arrow {
  color: #c0c4cc;
  font-size: 11px;
}

.timeline-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.timeline-product {
  font-size: 12px;
  color: #909399;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-amount {
  font-weight: 600;
  font-size: 14px;
  color: #303133;
  flex-shrink: 0;
}

/* ---- Timeline Separator ---- */
.timeline-separator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  margin: 2px 0;
  position: relative;
  z-index: 1;
}

.timeline-auto-close .separator-label {
  background: rgba(103, 194, 58, 0.08);
  border-color: rgba(103, 194, 58, 0.25);
  color: #529b2e;
}

.auto-close-label .sep-icon {
  font-size: 14px;
}

.timeline-separator.also-auto .separator-label {
  background: rgba(64, 158, 255, 0.06);
  border-color: rgba(64, 158, 255, 0.22);
}

.both-label {
  color: #409eff;
}

.auto-hint {
  font-size: 10px;
  color: #909399;
  font-weight: 400;
}

.separator-line {
  flex: 1;
  height: 1px;
  background: repeating-linear-gradient(
    to right,
    #dcdfe6 0,
    #dcdfe6 4px,
    transparent 4px,
    transparent 8px
  );
}

.separator-label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 14px;
  background: rgba(230, 162, 60, 0.08);
  border: 1px solid rgba(230, 162, 60, 0.2);
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  color: #b88230;
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
  color: #c0c4cc;
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  transition: all 0.18s ease;
}

.sep-delete-btn:hover {
  background: rgba(245, 108, 108, 0.12);
  color: #f56c6c;
}

/* ---- Segments Overview ---- */
.segments-overview {
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  padding: 20px;
}

.segments-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 16px;
}

.segment-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.segment-card {
  padding: 14px 18px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}

.segment-card.open-segment {
  border-color: rgba(64, 158, 255, 0.2);
  border-style: dashed;
}

.segment-actions {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #ebeef5;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* ---- Available invoices (timeline pool) ---- */
.available-section {
  margin-top: 8px;
}

.available-section .invoice-card-header {
  align-items: flex-start;
  flex-wrap: wrap;
}

.available-section .invoice-card-header > span {
  flex: 1 1 160px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.available-section .invoice-card-header-right {
  flex: 1 1 100%;
  min-width: 0;
  justify-content: flex-start;
  flex-wrap: wrap;
}

.available-section .segment-select {
  flex: 1 1 160px;
  width: auto;
  min-width: 0;
}

.section-hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: #909399;
  line-height: 1.5;
}

.segment-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  flex-wrap: wrap;
  gap: 6px;
}

.segment-no {
  font-weight: 600;
  font-size: 14px;
  color: #303133;
}

.segment-count {
  font-size: 12px;
  color: #909399;
  background: #f0f2f5;
  padding: 2px 10px;
  border-radius: 12px;
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
  border-radius: 12px;
}

.seg-badge-auto {
  background: rgba(103, 194, 58, 0.1);
  color: #67c23a;
}

.seg-badge-manual {
  background: rgba(230, 162, 60, 0.1);
  color: #b88230;
}

.seg-badge-open {
  background: rgba(64, 158, 255, 0.08);
  color: #409eff;
  animation: badgePulse 2s ease-in-out infinite;
}

@keyframes badgePulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.segment-dates {
  font-size: 13px;
  color: #606266;
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
  color: #c0c4cc;
  font-size: 10px;
}

.seg-place {
  color: #606266;
  font-weight: 500;
}

.seg-place.home {
  color: #409eff;
  font-weight: 600;
}

/* ---- Separator Dialog ---- */
.separator-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.separator-dialog-hint {
  font-size: 13px;
  color: #909399;
  margin: 0;
  line-height: 1.5;
}

@media (max-width: 960px) {
  .page-header {
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
  }

  .summary-grid,
  .invoice-pool {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .preview-layout {
    grid-template-columns: 1fr;
  }

  .trip-invoice-grid {
    grid-template-columns: 128px 142px 88px 108px 200px 220px 96px 68px 76px;
    min-width: 1134px;
  }

  .trip-invoice-grid > div {
    padding: 14px 12px;
  }
}

@media (max-width: 640px) {
  .header-actions,
  .trip-card-header,
  .invoice-card-header,
  .invoice-card-actions,
  .preview-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .summary-grid,
  .invoice-pool {
    grid-template-columns: 1fr;
  }

  .preview-info-list {
    grid-template-columns: 1fr;
  }

  .trip-invoice-grid {
    grid-template-columns: 122px 134px 84px 104px 180px 196px 88px 64px 72px;
    min-width: 1044px;
  }

  .trip-invoice-grid > div {
    padding: 12px 10px;
  }
}
</style>