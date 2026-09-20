<script setup lang="ts">
definePageMeta({ middleware: 'master-auth' })

const route = useRoute()
const router = useRouter()
const gameId = String(route.params.id)

const liveGame = useLiveGameStore()
if (!liveGame.game) liveGame.reset()

useHead({ title: () => (liveGame.game?.title ? `${liveGame.game.title} · Play` : 'Play') })

useGameSocket(() => `${wsBaseUrl()}?role=master&gameId=${gameId}`, liveGame.applyServerMessage)

watch(
  () => liveGame.game?.status,
  (status) => {
    if (status === 'FINISHED') router.replace(`/master/games/${gameId}/results`)
    if (status === 'LOBBY') router.replace(`/master/games/${gameId}/lobby`)
  }
)

const questionIndex = computed(() => liveGame.currentQuestion?.index ?? liveGame.game?.currentQuestionIndex ?? 0)
const acting = ref(false)
const confirmEnd = ref(false)

async function control(action: 'pause' | 'resume' | 'skip' | 'end' | 'restart' | 'next') {
  acting.value = true
  try {
    await $fetch(`/api/games/${gameId}/control`, { method: 'POST', body: { action } })
  } finally {
    acting.value = false
    confirmEnd.value = false
  }
}

function teamAnswered(teamId: string) {
  return liveGame.answeredTeamIds.has(teamId)
}
</script>

<template>
  <BingoHostPanel v-if="liveGame.game?.gameType === 'BINGO'" :game-id="gameId" />
  <div v-else class="min-h-screen bg-slate-900 pb-16 text-white">
    <header class="border-b border-white/10">
      <div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div>
          <p class="text-xs font-bold uppercase tracking-widest text-white/40">{{ liveGame.game?.title }}</p>
          <p class="font-display text-lg font-bold">Question {{ questionIndex + 1 }} / {{ liveGame.totalQuestions }}</p>
        </div>
        <GameTimer
          v-if="liveGame.currentQuestion"
          :started-at="liveGame.currentQuestion.startedAt"
          :ends-at="liveGame.currentQuestion.endsAt"
          :paused="liveGame.game?.paused"
        />
      </div>
    </header>

    <main class="mx-auto max-w-5xl px-6 py-8">
      <CatchupPanel :game-id="gameId" :mode="liveGame.game?.mode ?? 'TEAM'" class="mb-8" />

      <!-- Active question -->
      <section v-if="liveGame.game?.status === 'QUESTION_ACTIVE' && liveGame.currentQuestion" class="mb-8">
        <h1 class="mb-6 text-center font-display text-2xl font-extrabold sm:text-3xl">{{ liveGame.currentQuestion.question.text }}</h1>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="team in liveGame.teams"
            :key="team.id"
            class="flex items-center gap-3 rounded-2xl px-4 py-3 ring-2 transition"
            :class="teamAnswered(team.id) ? 'ring-emerald-400 bg-emerald-500/10' : 'ring-white/10 bg-white/5'"
          >
            <span class="h-4 w-4 shrink-0 rounded-full" :style="{ backgroundColor: team.color }" />
            <span class="min-w-0 flex-1 truncate font-semibold">{{ team.name }}</span>
            <span v-if="teamAnswered(team.id)" class="flex shrink-0 items-center gap-1 text-emerald-400">
              <Icon name="tabler:check" class="h-4 w-4" /> answered
            </span>
            <span v-else class="shrink-0 text-white/30">…</span>
          </div>
        </div>
      </section>

      <!-- Results -->
      <section v-else-if="liveGame.game?.status === 'QUESTION_RESULTS' && liveGame.lastResults" class="mb-8">
        <h1 class="mb-2 text-center font-display text-2xl font-bold">{{ liveGame.lastResults.question.text }}</h1>
        <p class="mb-6 text-center text-white/50">Question ended — next one starting soon…</p>
        <div class="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="tr in liveGame.lastResults.teamResults"
            :key="tr.teamId"
            class="rounded-2xl px-4 py-3 ring-2"
            :class="tr.correct ? 'ring-emerald-400 bg-emerald-500/10' : 'ring-red-400/50 bg-red-500/5'"
          >
            <div class="flex items-center gap-2">
              <span class="h-3 w-3 rounded-full" :style="{ backgroundColor: tr.color }" />
              <span class="font-semibold">{{ tr.teamName }}</span>
            </div>
            <p class="mt-1 flex items-center gap-1 text-sm" :class="tr.correct ? 'text-emerald-300' : 'text-red-300'">
              <Icon :name="tr.correct ? 'tabler:check' : tr.answered ? 'tabler:x' : 'tabler:minus'" class="h-4 w-4 shrink-0" />
              {{ tr.correct ? `Correct · +${tr.scoreAwarded}` : tr.answered ? 'Incorrect' : 'No answer' }}
            </p>
          </div>
        </div>
        <div class="mx-auto max-w-md">
          <h2 class="mb-3 text-center font-display text-lg font-bold">Leaderboard</h2>
          <GameLeaderboard :entries="liveGame.leaderboard" />
        </div>
      </section>

      <section v-else class="py-20 text-center text-white/40">Waiting for the next question…</section>
    </main>

    <div class="fixed inset-x-0 bottom-0 border-t border-white/10 bg-slate-900/95 backdrop-blur">
      <div class="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-3 px-6 py-4">
        <button
          v-if="!liveGame.game?.paused"
          type="button"
          class="btn-touch flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20 disabled:opacity-40"
          :disabled="acting || liveGame.game?.status !== 'QUESTION_ACTIVE'"
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
          type="button"
          class="btn-touch flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20 disabled:opacity-40"
          :disabled="acting || liveGame.game?.status !== 'QUESTION_ACTIVE'"
          @click="control('skip')"
        >
          <Icon name="tabler:player-skip-forward" class="h-4 w-4" /> Skip Question
        </button>
        <button
          type="button"
          class="btn-touch flex items-center gap-1.5 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold hover:bg-indigo-400 disabled:opacity-40"
          :disabled="acting || liveGame.game?.status !== 'QUESTION_RESULTS'"
          @click="control('next')"
        >
          <Icon name="tabler:arrow-right" class="h-4 w-4" /> Next Question
        </button>
        <button
          type="button"
          class="btn-touch flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20 disabled:opacity-40"
          :disabled="acting || !liveGame.currentQuestion"
          @click="control('restart')"
        >
          <Icon name="tabler:refresh" class="h-4 w-4" /> Restart Question
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
