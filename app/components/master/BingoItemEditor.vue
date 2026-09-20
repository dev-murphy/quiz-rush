<script setup lang="ts">
import type { BingoConfig, BingoItem, Game } from '#shared/types'

// Plain, untyped fetch for this file's calls: with many template-literal URLs in
// one file, Nitro's typed-route matching against `$fetch` can blow TS's
// recursion limit (see useAuthedFetch.ts for the same issue/fix elsewhere).
const rawFetch = $fetch as (url: string, opts?: Record<string, unknown>) => Promise<unknown>

const props = defineProps<{ gameId: string; game: Game; items: BingoItem[] }>()
const emit = defineEmits<{ changed: [] }>()

const config = ref<BingoConfig>(
  props.game.bingoConfig ?? { gridSize: 5, freeSpace: true, winPattern: 'LINE', winPoints: 1000 }
)
watch(
  () => props.game.bingoConfig,
  (c) => {
    if (c) config.value = { ...c }
  }
)

const cellsNeeded = computed(() => config.value.gridSize * config.value.gridSize - (config.value.freeSpace ? 1 : 0))

const savingConfig = ref(false)
let configTimer: ReturnType<typeof setTimeout> | null = null
function scheduleConfigSave() {
  if (configTimer) clearTimeout(configTimer)
  configTimer = setTimeout(saveConfig, 500)
}
async function saveConfig() {
  savingConfig.value = true
  try {
    await rawFetch(`/api/games/${props.gameId}/bingo/config`, { method: 'PUT', body: config.value })
  } finally {
    savingConfig.value = false
  }
}
watch(config, scheduleConfigSave, { deep: true })

const newItemText = ref('')
const bulkText = ref('')
const showBulk = ref(false)
const adding = ref(false)
const addError = ref('')

async function addSingle() {
  const text = newItemText.value.trim()
  if (!text) return
  adding.value = true
  addError.value = ''
  try {
    await rawFetch(`/api/games/${props.gameId}/bingo/items`, { method: 'POST', body: { texts: [text] } })
    newItemText.value = ''
    emit('changed')
  } catch (e: unknown) {
    addError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage ?? 'Could not add item'
  } finally {
    adding.value = false
  }
}

async function addBulk() {
  const texts = bulkText.value
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean)
  if (texts.length === 0) return
  adding.value = true
  addError.value = ''
  try {
    await rawFetch(`/api/games/${props.gameId}/bingo/items`, { method: 'POST', body: { texts } })
    bulkText.value = ''
    showBulk.value = false
    emit('changed')
  } catch (e: unknown) {
    addError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage ?? 'Could not add items'
  } finally {
    adding.value = false
  }
}

async function removeItem(id: string) {
  await rawFetch(`/api/games/${props.gameId}/bingo/items/${id}`, { method: 'DELETE' })
  emit('changed')
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="card flex flex-col gap-4 p-5">
      <h2 class="font-display text-lg font-bold text-slate-800 dark:text-slate-100">Card settings</h2>
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="flex flex-col gap-1">
          <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">Grid size</span>
          <select
            v-model.number="config.gridSize"
            class="rounded-xl border border-slate-200 px-4 py-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          >
            <option :value="3">3 x 3</option>
            <option :value="4">4 x 4</option>
            <option :value="5">5 x 5</option>
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">Win pattern</span>
          <select
            v-model="config.winPattern"
            class="rounded-xl border border-slate-200 px-4 py-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          >
            <option value="LINE">Any line (row, column, diagonal)</option>
            <option value="BLACKOUT">Full card (blackout)</option>
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">Points for winning</span>
          <input
            v-model.number="config.winPoints"
            type="number"
            min="0"
            class="rounded-xl border border-slate-200 px-4 py-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          />
        </label>
        <label class="flex items-center gap-2 pt-6">
          <input v-model="config.freeSpace" type="checkbox" class="h-5 w-5" />
          <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">Free space in the center</span>
        </label>
      </div>
      <p class="text-xs text-slate-400 dark:text-slate-500">
        {{ savingConfig ? 'Saving…' : `Needs at least ${cellsNeeded} items for a ${config.gridSize}x${config.gridSize} card.` }}
      </p>
    </div>

    <div>
      <div class="mb-3 flex items-center justify-between">
        <h2 class="font-display text-lg font-bold text-slate-800 dark:text-slate-100">
          Items ({{ items.length }} / {{ cellsNeeded }} needed)
        </h2>
        <button type="button" class="text-xs font-bold text-indigo-500 hover:underline dark:text-indigo-400" @click="showBulk = !showBulk">
          {{ showBulk ? 'Cancel bulk add' : 'Paste a list' }}
        </button>
      </div>

      <div v-if="showBulk" class="card mb-3 flex flex-col gap-2 p-4">
        <textarea
          v-model="bulkText"
          rows="6"
          placeholder="One item per line…"
          class="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
        />
        <button
          type="button"
          class="btn-touch self-start rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          :disabled="adding || !bulkText.trim()"
          @click="addBulk"
        >
          {{ adding ? 'Adding…' : 'Add all' }}
        </button>
      </div>

      <form class="mb-3 flex gap-2" @submit.prevent="addSingle">
        <input
          v-model="newItemText"
          type="text"
          placeholder="Add an item…"
          class="flex-1 rounded-xl border border-slate-200 px-4 py-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
        />
        <button
          type="submit"
          class="btn-touch shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          :disabled="adding || !newItemText.trim()"
        >
          Add
        </button>
      </form>
      <p v-if="addError" class="mb-3 text-sm font-semibold text-red-500">{{ addError }}</p>

      <ul class="flex flex-col gap-2">
        <li
          v-for="item in items"
          :key="item.id"
          class="card flex items-center justify-between gap-3 px-4 py-2.5"
        >
          <span class="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">{{ item.text }}</span>
          <button
            type="button"
            class="shrink-0 rounded-lg bg-red-50 px-2.5 py-1 text-xs font-bold text-red-500 dark:bg-red-500/10"
            @click="removeItem(item.id)"
          >
            Delete
          </button>
        </li>
        <li v-if="items.length === 0" class="card p-8 text-center text-slate-400 dark:text-slate-500">No items yet.</li>
      </ul>
    </div>
  </div>
</template>
