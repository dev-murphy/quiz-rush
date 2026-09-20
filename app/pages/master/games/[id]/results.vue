<script setup lang="ts">
definePageMeta({ middleware: 'master-auth' })

const route = useRoute()
const gameId = String(route.params.id)

const liveGame = useLiveGameStore()
if (!liveGame.game) liveGame.reset()

useHead({ title: () => (liveGame.game?.title ? `${liveGame.game.title} · Results` : 'Results') })

useGameSocket(() => `${wsBaseUrl()}?role=master&gameId=${gameId}`, liveGame.applyServerMessage)

const winner = computed(() => liveGame.finalLeaderboard?.[0] ?? liveGame.leaderboard[0] ?? null)
const entries = computed(() => liveGame.finalLeaderboard ?? liveGame.leaderboard)

const router = useRouter()
const confirmingRestart = ref(false)
const restarting = ref(false)
async function restart() {
  restarting.value = true
  try {
    await $fetch(`/api/games/${gameId}/restart`, { method: 'POST' })
    router.push(`/master/games/${gameId}/lobby`)
  } finally {
    restarting.value = false
    confirmingRestart.value = false
  }
}
</script>

<template>
  <div class="app-bg flex min-h-screen flex-col items-center px-6 py-12 text-white">
    <ConfettiBurst v-if="winner" />
    <NuxtLink to="/master" class="mb-6 flex items-center gap-1.5 self-start text-sm font-semibold text-white/60 hover:text-white">
      <Icon name="tabler:arrow-left" class="h-4 w-4" /> Dashboard
    </NuxtLink>

    <div class="animate-pop-in flex w-full max-w-xl flex-col items-center gap-6 text-center">
      <p class="font-display text-lg font-bold uppercase tracking-widest text-white/60">Game Over</p>
      <h1 class="font-display text-4xl font-extrabold">{{ liveGame.game?.title }}</h1>

      <div v-if="winner" class="flex flex-col items-center gap-2">
        <Icon name="tabler:trophy" class="h-16 w-16 text-amber-300" />
        <p class="font-display text-3xl font-extrabold" :style="{ color: winner.color }">{{ winner.name }} wins!</p>
        <p class="text-white/70">{{ winner.score.toLocaleString() }} points</p>
        <p v-if="liveGame.bingoWinner" class="text-sm font-semibold text-white/50">
          BINGO! · {{ liveGame.bingoWinner.playerName }} · {{ liveGame.bingoWinner.pattern === 'BLACKOUT' ? 'Full card' : 'Line' }}
        </p>
      </div>

      <div class="w-full card p-5 text-left">
        <GameLeaderboard :entries="entries" />
      </div>

      <CatchupPanel
        v-if="liveGame.game?.gameType !== 'BINGO'"
        :game-id="gameId"
        :mode="liveGame.game?.mode ?? 'TEAM'"
        class="w-full text-left"
      />

      <div v-if="!confirmingRestart">
        <button
          type="button"
          class="btn-touch rounded-2xl bg-white px-6 py-3 font-display font-bold text-slate-800 shadow-lg"
          @click="confirmingRestart = true"
        >
          Restart Game
        </button>
      </div>
      <div v-else class="flex items-center gap-3">
        <span class="font-semibold text-white/80">Reset scores and play again?</span>
        <button type="button" class="btn-touch rounded-xl px-4 py-2 font-bold text-white/70" @click="confirmingRestart = false">
          Cancel
        </button>
        <button
          type="button"
          class="btn-touch rounded-xl bg-white px-5 py-2 font-bold text-slate-800 disabled:opacity-50"
          :disabled="restarting"
          @click="restart"
        >
          {{ restarting ? 'Restarting…' : 'Yes, Restart' }}
        </button>
      </div>
    </div>
  </div>
</template>
