<script setup lang="ts">
const props = defineProps<{ gameId: string }>()

const liveGame = useLiveGameStore()

const acting = ref(false)
const confirmEnd = ref(false)
const actionError = ref('')

async function callNext() {
  acting.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/games/${props.gameId}/bingo/call-next`, { method: 'POST' })
  } catch (e: unknown) {
    actionError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage ?? 'Could not call next item'
  } finally {
    acting.value = false
  }
}

async function control(action: 'pause' | 'resume' | 'end' | 'restart') {
  acting.value = true
  try {
    await $fetch(`/api/games/${props.gameId}/bingo/control`, { method: 'POST', body: { action } })
  } finally {
    acting.value = false
    confirmEnd.value = false
  }
}

const recentCalls = computed(() => [...liveGame.bingoCalledItems].slice(-8).reverse())
const calledCount = computed(() => liveGame.bingoCalledItems.length)
const totalItems = computed(() => calledCount.value + liveGame.bingoItemsRemaining)
</script>

<template>
  <div class="min-h-screen bg-slate-900 pb-16 text-white">
    <header class="border-b border-white/10">
      <div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div>
          <p class="text-xs font-bold uppercase tracking-widest text-white/40">{{ liveGame.game?.title }}</p>
          <p class="font-display text-lg font-bold">Bingo · {{ calledCount }} / {{ totalItems }} called</p>
        </div>
        <span v-if="liveGame.game?.paused" class="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300">Paused</span>
      </div>
    </header>

    <main class="mx-auto max-w-5xl px-6 py-10">
      <div class="mb-8 flex flex-col items-center gap-3 text-center">
        <p class="text-sm font-bold uppercase tracking-widest text-white/40">Last called</p>
        <p class="min-h-[3.5rem] font-display text-4xl font-extrabold">
          {{ liveGame.bingoLastCalled?.text ?? '—' }}
        </p>
      </div>

      <div v-if="recentCalls.length" class="mb-8 flex flex-wrap justify-center gap-2">
        <span
          v-for="call in recentCalls"
          :key="call.itemId"
          class="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/70"
        >
          {{ call.text }}
        </span>
      </div>

      <div class="mb-8 flex justify-center">
        <button
          type="button"
          class="btn-touch flex min-h-[64px] items-center gap-2 rounded-2xl bg-indigo-600 px-8 text-xl font-display font-bold text-white shadow-lg disabled:opacity-40"
          :disabled="acting || liveGame.game?.paused || liveGame.bingoItemsRemaining === 0"
          @click="callNext"
        >
          <Icon name="tabler:dice" class="h-6 w-6" />
          {{ liveGame.bingoItemsRemaining === 0 ? 'All items called' : 'Call Next' }}
        </button>
      </div>
      <p v-if="actionError" class="mb-8 text-center text-sm font-semibold text-red-400">{{ actionError }}</p>

      <div>
        <h2 class="mb-3 text-center font-display text-lg font-bold">Players ({{ liveGame.players.length }})</h2>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="player in liveGame.players"
            :key="player.id"
            class="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3 ring-2 ring-white/10"
          >
            <span
              class="h-4 w-4 shrink-0 rounded-full"
              :style="{ backgroundColor: liveGame.teams.find((t) => t.id === player.teamId)?.color ?? '#94a3b8' }"
            />
            <span class="min-w-0 flex-1 truncate font-semibold">{{ player.name }}</span>
            <span v-if="!player.connected" class="shrink-0 text-xs text-white/30">offline</span>
          </div>
        </div>
      </div>
    </main>

    <div class="fixed inset-x-0 bottom-0 border-t border-white/10 bg-slate-900/95 backdrop-blur">
      <div class="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-3 px-6 py-4">
        <button
          v-if="!liveGame.game?.paused"
          type="button"
          class="btn-touch flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20 disabled:opacity-40"
          :disabled="acting"
          @click="control('pause')"
        >
          <Icon name="tabler:player-pause" class="h-4 w-4" /> Pause
        </button>
        <button
          v-else
          type="button"
          class="btn-touch flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-900"
          :disabled="acting"
          @click="control('resume')"
        >
          <Icon name="tabler:player-play" class="h-4 w-4" /> Resume
        </button>
        <button
          v-if="!confirmEnd"
          type="button"
          class="btn-touch flex items-center gap-1.5 rounded-xl bg-red-600/80 px-4 py-2 text-sm font-bold hover:bg-red-600"
          @click="confirmEnd = true"
        >
          <Icon name="tabler:player-stop" class="h-4 w-4" /> End Game
        </button>
        <template v-else>
          <span class="text-sm font-semibold text-white/70">End game now?</span>
          <button type="button" class="btn-touch rounded-xl bg-white/10 px-3 py-2 text-sm font-bold" @click="confirmEnd = false">Cancel</button>
          <button type="button" class="btn-touch rounded-xl bg-red-600 px-4 py-2 text-sm font-bold" @click="control('end')">Confirm</button>
        </template>
      </div>
    </div>
  </div>
</template>
