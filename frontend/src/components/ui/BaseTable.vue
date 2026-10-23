<script setup lang="ts" generic="T extends { id: string | number }">
import { computed, ref, watch } from 'vue'
import type { TableColumn } from '../../types/ui'
import TablePagination from './TablePagination.vue'

const props = withDefaults(defineProps<{
    caption: string
    columns: TableColumn[]
    rows: T[]
    loading?: boolean
    emptyMessage?: string
    initialPageSize?: number
  }>(), { loading: false, emptyMessage: 'No results to display.', initialPageSize: 10 })
const page = ref(1)
const pageSize = ref(props.initialPageSize)
const visibleRows = computed(() => props.rows.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
watch(() => props.rows, () => { page.value = 1 })

function cellValue(row: T, key: string) {
  return (row as Record<string, unknown>)[key] ?? '—'
}
</script>

<template>
  <div
    class="ui-table-scroll"
    tabindex="0"
    role="region"
    :aria-label="caption"
    :aria-busy="loading || undefined"
  >
    <table class="ui-table">
      <caption class="sr-only">
        {{
          caption
        }}
      </caption>
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            scope="col"
            :class="{ 'ui-table__numeric': column.align === 'right' }"
          >
            {{ column.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading || rows.length === 0">
          <td :colspan="columns.length" class="ui-table__empty">
            <span role="status">{{ loading ? 'Loading…' : emptyMessage }}</span>
          </td>
        </tr>
        <template v-else>
          <tr v-for="row in visibleRows" :key="row.id">
            <td
              v-for="column in columns"
              :key="column.key"
              :class="{ 'ui-table__numeric': column.align === 'right' }"
            >
              <slot
                :name="`cell-${column.key}`"
                :row="row"
                :value="cellValue(row, column.key)"
                >{{ cellValue(row, column.key) }}</slot
              >
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
  <TablePagination v-model:page="page" v-model:page-size="pageSize" :total="rows.length" />
</template>
