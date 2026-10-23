<script setup lang="ts">
import type { SelectOption } from '../../types/ui'

const props = withDefaults(defineProps<{
  page: number
  pageSize: number
  total: number
  pageSizeOptions?: number[]
}>(), { pageSizeOptions: () => [5, 10, 25, 50] })

const emit = defineEmits<{
  'update:page': [value: number]
  'update:pageSize': [value: number]
}>()

const pageSizeOptions = [5, 10, 25, 50, 100]
  .filter((size) => props.pageSizeOptions.includes(size) || size === props.pageSize)
  .map((size): SelectOption => ({ value: String(size), label: String(size) }))
const totalPages = () => Math.max(1, Math.ceil(props.total / props.pageSize))
function setPageSize(value: string | number) {
  emit('update:pageSize', Number(value))
  emit('update:page', 1)
}
</script>

<template>
  <nav v-if="total > 0" class="table-pagination" :aria-label="`Pagination for ${total} rows`">
    <p class="table-pagination__summary">Showing {{ (page - 1) * pageSize + 1 }}–{{ Math.min(page * pageSize, total) }} of {{ total }}</p>
    <div class="table-pagination__controls">
      <label class="table-pagination__size">Rows per page
        <select :value="pageSize" @change="setPageSize(($event.target as HTMLSelectElement).value)">
          <option v-for="option in pageSizeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
      <button type="button" :disabled="page <= 1" aria-label="Previous page" @click="emit('update:page', page - 1)">Previous</button>
      <span>Page {{ page }} of {{ totalPages() }}</span>
      <button type="button" :disabled="page >= totalPages()" aria-label="Next page" @click="emit('update:page', page + 1)">Next</button>
    </div>
  </nav>
</template>

<style scoped>
.table-pagination{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 4px;color:var(--color-subtle);font-size:12px}.table-pagination__summary{margin:0}.table-pagination__controls{display:flex;align-items:center;gap:10px}.table-pagination__controls button,.table-pagination__size select{min-height:34px;padding:6px 10px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-surface);color:var(--color-ink);font:inherit}.table-pagination__controls button{cursor:pointer}.table-pagination__controls button:disabled{opacity:.45;cursor:not-allowed}.table-pagination__size{display:flex;align-items:center;gap:6px}.table-pagination__controls span{white-space:nowrap}@media(max-width:600px){.table-pagination{align-items:flex-start;flex-direction:column}.table-pagination__controls{width:100%;flex-wrap:wrap}}
</style>
