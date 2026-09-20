<script setup lang="ts">
import type { BingoCalledItem, BingoCardCell } from '#shared/types'

const props = defineProps<{
  card: BingoCardCell[] | null
  calledItemIds: Set<string>
  lastCalled: BingoCalledItem | null
  claimRejected: string | null
  paused?: boolean
}>()
const emit = defineEmits<{ claim: [] }>()

const gridSize = computed(() => Math.round(Math.sqrt(props.card?.length ?? 0)))

function isMarked(cell: BingoCardCell): boolean {
  return cell.isFree || props.calledItemIds.has(cell.itemId)
}

const claiming = ref(false)
function claim() {
  if (claiming.value) return
  claiming.value = true
  emit('claim')
  setTimeout(() => (claiming.value = false), 1200)
}
</script>

<template>
  <div class="flex w-full max-w-md flex-col items-center gap-4">
    <div class="flex flex-col items-center gap-1">
      <p class="text-xs font-bold uppercase tracking-widest text-white/50">{{ paused ? 'Paused' : 'Last called' }}</p>
      <p class="min-h-[2.5rem] text-center font-display text-2xl font-extrabold">{{ lastCalled?.text ?? 'Waiting for the first call…' }}</p>
    </div>

    <div v-if="card" class="grid w-full gap-1.5" :style="{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }">
      <div
        v-for="(cell, idx) in card"
        :key="idx"
        class="flex aspect-square items-center justify-center rounded-lg p-1 text-center text-[11px] font-semibold leading-tight transition sm:text-xs"
        :class="isMarked(cell) ? 'bg-emerald-500 text-white shadow-lg' : 'bg-white/10 text-white/80'"
      >
        {{ cell.isFree ? 'FREE' : cell.text }}
      </div>
    </div>
    <PlayerWaiting v-else message="Waiting for your card…" />

    <div v-if="claimRejected" class="animate-pop-in rounded-2xl bg-white px-5 py-3 font-semibold text-slate-800 shadow-lg">
      {{ claimRejected }}
    </div>

    <button
      type="button"
      class="btn-touch min-h-[64px] w-full rounded-2xl bg-pink-600 text-2xl font-display font-bold text-white shadow-lg disabled:opacity-50"
      :disabled="!card || paused || claiming"
      @click="claim"
    >
      BINGO!
    </button>
  </div>
</template>
