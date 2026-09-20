<script setup lang="ts">
import type { GameMode } from '#shared/types'

// Plain, untyped fetch for this file's calls: with several template-literal
// URLs in one file, Nitro's typed-route matching against `$fetch` can blow
// TS's recursion limit as the app's total route count grows (see
// useAuthedFetch.ts for the same issue/fix elsewhere).
const rawFetch = $fetch as (url: string, opts?: Record<string, unknown>) => Promise<unknown>

const props = defineProps<{ gameId: string; mode: GameMode }>()

const liveGame = useLiveGameStore()
const session = computed(() => liveGame.catchup?.session ?? null)
const busy = ref(false)
const error = ref('')

async function run(action: () => Promise<unknown>) {
  error.value = ''
  busy.value = true
  try {
    await action()
  } catch (e: unknown) {
    error.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage ?? 'Something went wrong'
  } finally {
    busy.value = false
  }
}

const start = () => run(() => rawFetch(`/api/games/${props.gameId}/catchup/start`, { method: 'POST' }))
const begin = () => run(() => rawFetch(`/api/games/${props.gameId}/catchup/begin`, { method: 'POST' }))
const cancel = () => run(() => rawFetch(`/api/games/${props.gameId}/catchup/cancel`, { method: 'POST' }))

const newTeamName = ref('')
function addTeam() {
  const name = newTeamName.value.trim()
  if (!name) return
  run(() => rawFetch(`/api/games/${props.gameId}/catchup/teams`, { method: 'POST', body: { name } })).then(() => {
    newTeamName.value = ''
  })
}
function removeTeam(teamId: string) {
  run(() => rawFetch(`/api/games/${props.gameId}/teams/${teamId}`, { method: 'DELETE' }))
}

const teams = computed(() => liveGame.catchup?.teams ?? [])
const memberCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const p of liveGame.catchup?.players ?? []) {
    if (p.teamId) counts.set(p.teamId, (counts.get(p.teamId) ?? 0) + 1)
  }
  return counts
})
const totalScore = computed(() => teams.value.reduce((sum, t) => sum + t.score, 0))
</script>

<template>
  <div class="card p-5">
    <div class="mb-2 flex items-center gap-2">
      <Icon name="tabler:clock-play" class="h-5 w-5 text-indigo-500" />
      <h3 class="font-display text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Catch-up Session</h3>
    </div>

    <p v-if="error" class="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600 dark:bg-red-500/10 dark:text-red-400">
      {{ error }}
    </p>

    <!-- No session running -->
    <div v-if="!session || session.status === 'FINISHED'" class="flex flex-col gap-2">
      <p v-if="session?.status === 'FINISHED'" class="text-sm text-slate-500 dark:text-slate-400">
        Last catch-up session finished — {{ liveGame.catchup?.players.length ?? 0 }} player{{ (liveGame.catchup?.players.length ?? 0) === 1 ? '' : 's' }},
        scores are on the leaderboard.
      </p>
      <p v-else class="text-sm text-slate-500 dark:text-slate-400">
        For players who missed the start — they join with the same PIN and play the full quiz on their own pace.
      </p>
      <button
        type="button"
        class="btn-touch self-start rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        :disabled="busy"
        @click="start"
      >
        Start Catch-up Session
      </button>
    </div>

    <!-- LOBBY: waiting for latecomers, teams editable -->
    <div v-else-if="session.status === 'LOBBY'" class="flex flex-col gap-3">
      <p class="text-sm text-slate-500 dark:text-slate-400">
        Waiting for latecomers to join with the same PIN — {{ liveGame.catchup?.players.length ?? 0 }} joined so far.
      </p>

      <div v-if="mode === 'TEAM'" class="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-900/40">
        <div v-for="t in teams" :key="t.id" class="flex items-center gap-2">
          <span class="h-3 w-3 shrink-0 rounded-full" :style="{ backgroundColor: t.color }" />
          <span class="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{{ t.name }}</span>
          <span class="shrink-0 text-xs text-slate-400 dark:text-slate-500">{{ memberCounts.get(t.id) ?? 0 }} joined</span>
          <button
            type="button"
            class="shrink-0 text-slate-400 hover:text-red-500 disabled:opacity-30 dark:text-slate-500 dark:hover:text-red-400"
            :disabled="busy || teams.length <= 1"
            @click="removeTeam(t.id)"
          >
            <Icon name="tabler:x" class="h-4 w-4" />
          </button>
        </div>
        <form class="flex gap-2" @submit.prevent="addTeam">
          <input
            v-model="newTeamName"
            type="text"
            placeholder="Add another team…"
            class="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          />
          <button
            type="submit"
            class="btn-touch shrink-0 rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-200"
            :disabled="busy || !newTeamName.trim()"
          >
            + Add
          </button>
        </form>
      </div>

      <div class="flex gap-2">
        <button
          type="button"
          class="btn-touch rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          :disabled="busy"
          @click="begin"
        >
          Begin Questions
        </button>
        <button
          type="button"
          class="btn-touch rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-200"
          :disabled="busy"
          @click="cancel"
        >
          Cancel
        </button>
      </div>
    </div>

    <!-- Running -->
    <div v-else class="flex flex-col gap-2">
      <p class="text-sm text-slate-500 dark:text-slate-400">
        Question {{ (session.currentQuestionIndex ?? 0) + 1 }} / {{ liveGame.catchup?.totalQuestions ?? '?' }} ·
        {{ liveGame.catchup?.players.length ?? 0 }} player{{ (liveGame.catchup?.players.length ?? 0) === 1 ? '' : 's' }} ·
        {{ totalScore }} pts so far
      </p>
      <p class="text-xs text-slate-400 dark:text-slate-500">Running automatically — no action needed.</p>
      <button
        type="button"
        class="btn-touch self-start rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-200"
        :disabled="busy"
        @click="cancel"
      >
        Cancel
      </button>
    </div>
  </div>
</template>
