<script setup lang="ts">
import type { ClientMessage } from '#shared/types'
import GameTutorial from '~/components/player/GameTutorial.vue'
import CompleteTextQuestion from '~/components/questions/CompleteTextQuestion.vue'
import FillBlankQuestion from '~/components/questions/FillBlankQuestion.vue'
import PinAnswerQuestion from '~/components/questions/PinAnswerQuestion.vue'
import PuzzleQuestion from '~/components/questions/PuzzleQuestion.vue'
import QuizQuestion from '~/components/questions/QuizQuestion.vue'
import SliderQuestion from '~/components/questions/SliderQuestion.vue'
import TrueFalseQuestion from '~/components/questions/TrueFalseQuestion.vue'
import TypeAnswerQuestion from '~/components/questions/TypeAnswerQuestion.vue'

const route = useRoute()
const router = useRouter()
const pin = String(route.params.pin)

const liveGame = useLiveGameStore()
liveGame.reset()

useHead({ title: () => liveGame.game?.title ?? 'Playing' })

const retryToken = ref(0)
const showTutorial = ref(false)
let ackTimer: ReturnType<typeof setTimeout> | null = null

function handleMessage(msg: Parameters<typeof liveGame.applyServerMessage>[0]) {
  liveGame.applyServerMessage(msg)
  if (msg.type === 'ANSWER_ACK' && !msg.locked) {
    retryToken.value++
    if (ackTimer) clearTimeout(ackTimer)
    ackTimer = setTimeout(() => (liveGame.answerAck = null), 2200)
  }
  if (msg.type === 'KICKED' || msg.type === 'GAME_CANCELLED') {
    setTimeout(() => router.push('/'), 3000)
  }
}

const { send, status } = useGameSocket(() => `${wsBaseUrl()}?role=player&pin=${pin}`, handleMessage)

function submitAnswer(answer: unknown) {
  if (!liveGame.currentQuestion) return
  const message: ClientMessage = { type: 'ANSWER_SUBMIT', questionId: liveGame.currentQuestion.question.id, answer }
  send(message)
}

function submitBingoClaim() {
  const message: ClientMessage = { type: 'BINGO_CLAIM' }
  send(message)
}

const teammates = computed(() => liveGame.players.filter((p) => p.teamId === liveGame.self?.team?.id))
const isIndividual = computed(() => liveGame.game?.mode === 'INDIVIDUAL')

const questionComponents = {
  quiz: QuizQuestion,
  true_false: TrueFalseQuestion,
  type_answer: TypeAnswerQuestion,
  slider: SliderQuestion,
  pin_answer: PinAnswerQuestion,
  puzzle: PuzzleQuestion,
  fill_blank: FillBlankQuestion,
  complete_text: CompleteTextQuestion
}

const myTeamResult = computed(() => liveGame.lastResults?.teamResults.find((r) => r.teamId === liveGame.self?.team?.id))

const iWon = computed(() => liveGame.finalLeaderboard?.[0]?.teamId === liveGame.self?.team?.id)
</script>

<template>
  <div class="app-bg min-h-screen text-white">
    <div v-if="liveGame.kicked" class="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <div class="text-4xl">👋</div>
      <p class="font-display text-xl font-bold">{{ liveGame.kicked }}</p>
    </div>
    <div v-else-if="liveGame.cancelled" class="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <div class="text-4xl">⚠️</div>
      <p class="font-display text-xl font-bold">{{ liveGame.cancelled }}</p>
    </div>
    <div v-else-if="liveGame.lastError && !liveGame.game" class="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <div class="text-4xl">🚫</div>
      <p class="font-display text-xl font-bold">{{ liveGame.lastError }}</p>
      <NuxtLink to="/join" class="font-semibold text-white/70 underline">Back to join</NuxtLink>
    </div>

    <template v-else-if="liveGame.game">
      <!-- Persistent header -->
      <header v-if="liveGame.self" class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-4 py-3">
        <div class="flex min-w-0 items-center gap-2">
          <span class="h-3 w-3 shrink-0 rounded-full" :style="{ backgroundColor: liveGame.self.team?.color ?? '#94a3b8' }" />
          <span class="truncate font-semibold">{{ liveGame.self.team?.name ?? 'No team yet' }}</span>
        </div>
        <span v-if="liveGame.currentQuestion" class="shrink-0 text-sm text-white/60">
          Q{{ liveGame.currentQuestion.index + 1 }}/{{ liveGame.currentQuestion.total }}
        </span>
        <span v-if="status !== 'open'" class="shrink-0 rounded-full bg-red-500/80 px-2 py-0.5 text-xs font-bold">Reconnecting…</span>
      </header>

      <!-- LOBBY -->
      <main v-if="liveGame.game.status === 'LOBBY'" class="flex flex-col items-center gap-6 px-6 py-10 text-center">
        <div class="text-4xl">🎉</div>
        <h1 class="font-display text-2xl font-extrabold">{{ liveGame.game.title }}</h1>
        <p class="text-white/70">Hi {{ liveGame.self?.player.name }}!</p>

        <div v-if="!isIndividual && liveGame.self?.team" class="card w-full max-w-sm p-5 text-slate-800">
          <p class="mb-2 flex items-center justify-center gap-2 font-display text-lg font-bold" :style="{ color: liveGame.self.team.color }">
            <span class="h-3 w-3 rounded-full" :style="{ backgroundColor: liveGame.self.team.color }" />
            {{ liveGame.self.team.name }}
          </p>
          <ul class="flex flex-col gap-1 text-sm text-slate-500">
            <li v-for="tm in teammates" :key="tm.id">{{ tm.name }}{{ tm.id === liveGame.self?.player.id ? ' (you)' : '' }}</li>
          </ul>
        </div>
        <p v-else-if="!isIndividual" class="text-white/60">Waiting to be assigned a team…</p>

        <button
          type="button"
          class="btn-touch rounded-full bg-white/10 px-5 py-2 text-sm font-bold text-white ring-1 ring-white/30"
          @click="showTutorial = true"
        >
          📖 How to Play
        </button>

        <PlayerWaiting message="Waiting for Game Master to start…" />
      </main>

      <!-- BINGO -->
      <main v-else-if="liveGame.game.status === 'ACTIVE' && liveGame.game.gameType === 'BINGO'" class="flex flex-col items-center gap-6 px-4 py-6">
        <BingoBoard
          :card="liveGame.bingoCard"
          :called-item-ids="liveGame.bingoCalledItemIds"
          :last-called="liveGame.bingoLastCalled"
          :claim-rejected="liveGame.bingoClaimRejected"
          :paused="liveGame.game.paused"
          @claim="submitBingoClaim"
        />
      </main>

      <!-- ACTIVE QUESTION -->
      <main v-else-if="liveGame.game.status === 'QUESTION_ACTIVE' && liveGame.currentQuestion" class="flex flex-col items-center gap-6 px-4 py-6">
        <GameTimer
          :started-at="liveGame.currentQuestion.startedAt"
          :ends-at="liveGame.currentQuestion.endsAt"
          :paused="liveGame.game.paused"
          size="lg"
        />
        <h1 class="max-w-2xl text-center font-display text-2xl font-extrabold sm:text-3xl">
          {{ liveGame.currentQuestion.question.text }}
        </h1>

        <div v-if="liveGame.myTeamLocked" class="flex flex-col items-center gap-3 py-6">
          <div class="text-5xl">✅</div>
          <p class="font-display text-2xl font-extrabold text-emerald-300">{{ isIndividual ? 'You got it!' : 'Your team got it!' }}</p>
          <PlayerWaiting message="Waiting for the question to end…" />
        </div>
        <template v-else>
          <div v-if="liveGame.answerAck" class="animate-pop-in rounded-2xl bg-white px-5 py-3 font-semibold text-slate-800 shadow-lg">
            {{ liveGame.answerAck.message }}
          </div>
          <component
            :is="questionComponents[liveGame.currentQuestion.question.type]"
            :key="liveGame.currentQuestion.startedAt"
            :retry-token="retryToken"
            v-bind="liveGame.currentQuestion.question.config"
            @submit="submitAnswer"
          />
        </template>
      </main>

      <!-- RESULTS -->
      <main v-else-if="liveGame.game.status === 'QUESTION_RESULTS' && liveGame.lastResults" class="flex flex-col items-center gap-6 px-4 py-8">
        <PlayerResult
          :result="myTeamResult"
          :score-awarded="myTeamResult?.scoreAwarded"
          :last-results="liveGame.lastResults"
          :individual="isIndividual"
        />
        <div class="w-full max-w-sm card p-5 text-slate-800">
          <h2 class="mb-3 text-center font-display text-lg font-bold">Leaderboard</h2>
          <GameLeaderboard :entries="liveGame.leaderboard" compact />
        </div>
      </main>

      <!-- FINISHED -->
      <main v-else-if="liveGame.game.status === 'FINISHED'" class="flex flex-col items-center gap-6 px-4 py-10 text-center">
        <ConfettiBurst v-if="iWon" />
        <div class="text-6xl">{{ iWon ? '🏆' : '🎮' }}</div>
        <h1 class="font-display text-3xl font-extrabold">
          {{ iWon ? (isIndividual ? 'You won!' : 'Your team won!') : 'Game Over' }}
        </h1>
        <div class="w-full max-w-sm card p-5 text-slate-800">
          <GameLeaderboard :entries="liveGame.finalLeaderboard ?? liveGame.leaderboard" />
        </div>
        <NuxtLink to="/" class="font-semibold text-white/70 underline">Back home</NuxtLink>
      </main>

      <main v-else class="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <PlayerWaiting message="Getting ready…" />
      </main>
    </template>

    <div v-else class="flex min-h-screen items-center justify-center">
      <PlayerWaiting message="Connecting…" />
    </div>

    <GameTutorial v-if="showTutorial" @close="showTutorial = false" />
  </div>
</template>
