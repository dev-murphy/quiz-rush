<script setup lang="ts">
definePageMeta({ middleware: 'master-auth' })

const route = useRoute()
const router = useRouter()
const gameId = String(route.params.id)

const liveGame = useLiveGameStore()
liveGame.reset()

useHead({ title: () => (liveGame.game?.title ? `${liveGame.game.title} · Lobby` : 'Lobby') })

const joinUrl = computed(() => {
  if (typeof window === 'undefined' || !liveGame.game?.pin) return ''
  return `${window.location.origin}/join/${liveGame.game.pin}`
})

const { status } = useGameSocket(
  () => `${wsBaseUrl()}?role=master&gameId=${gameId}`,
  liveGame.applyServerMessage
)

const copied = ref(false)
async function copyLink() {
  if (!joinUrl.value) return
  await navigator.clipboard.writeText(joinUrl.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}

const confirmingStart = ref(false)
const starting = ref(false)
const startError = ref('')
async function start() {
  starting.value = true
  startError.value = ''
  try {
    await $fetch(`/api/games/${gameId}/start`, { method: 'POST' })
  } catch (e: unknown) {
    startError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage ?? 'Could not start game'
  } finally {
    starting.value = false
    confirmingStart.value = false
  }
}

watch(
  () => liveGame.game?.status,
  (status) => {
    if (status && status !== 'LOBBY' && status !== 'DRAFT') {
      router.replace(`/master/games/${gameId}/play`)
    }
  }
)

const teamPlayerCount = (teamId: string) => liveGame.players.filter((p) => p.teamId === teamId).length
</script>

<template>
  <div class="min-h-screen bg-slate-50 pb-16 dark:bg-slate-900">
    <header class="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <NuxtLink
          to="/master"
          class="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <Icon name="tabler:arrow-left" class="h-4 w-4" /> Dashboard
        </NuxtLink>
        <div class="flex items-center gap-3">
          <span
            class="rounded-full px-3 py-1 text-xs font-bold"
            :class="status === 'open' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'"
          >
            {{ status === 'open' ? 'Live' : 'Connecting…' }}
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-5xl px-6 py-8 pb-28">
      <h1 class="mb-1 font-display text-3xl font-extrabold text-slate-800 dark:text-slate-100">{{ liveGame.game?.title }}</h1>
      <p class="mb-8 text-slate-400 dark:text-slate-500">Waiting in lobby · {{ liveGame.players.length }} player(s) joined</p>
      <p v-if="startError" class="mb-8 -mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 dark:bg-red-500/10">
        {{ startError }}
      </p>

      <div class="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div class="card flex flex-col items-center gap-4 p-6 text-center">
          <p class="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Game PIN</p>
          <p class="break-all font-display text-2xl font-extrabold tracking-widest text-indigo-700 dark:text-indigo-400 sm:text-3xl">
            {{ liveGame.game?.pin }}
          </p>
          <QrCode v-if="joinUrl" :value="joinUrl" :size="200" />
          <button
            type="button"
            class="btn-touch flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200"
            @click="copyLink"
          >
            <Icon name="tabler:link" class="h-4 w-4" /> {{ copied ? 'Copied!' : 'Copy Join Link' }}
          </button>
        </div>

        <div class="flex flex-col gap-6">
          <section v-if="liveGame.game?.mode !== 'INDIVIDUAL'" class="card p-5">
            <h2 class="mb-3 font-display text-lg font-bold text-slate-800 dark:text-slate-100">Teams</h2>
            <TeamManager :game-id="gameId" :teams="liveGame.teams" :players="liveGame.players" :pin="liveGame.game?.pin" @changed="() => {}" />
          </section>

          <section class="card p-5">
            <h2 class="mb-3 font-display text-lg font-bold text-slate-800 dark:text-slate-100">Players ({{ liveGame.players.length }})</h2>
            <PlayerManager
              :game-id="gameId"
              :players="liveGame.players"
              :teams="liveGame.teams"
              :mode="liveGame.game?.mode ?? 'TEAM'"
              @changed="() => {}"
            />
          </section>
        </div>
      </div>
    </main>

    <div class="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <div class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4">
        <p v-if="liveGame.game?.mode === 'INDIVIDUAL'" class="min-w-0 truncate text-sm text-slate-400 dark:text-slate-500">
          {{ liveGame.players.length }} player(s) joined
        </p>
        <p v-else class="min-w-0 truncate text-sm text-slate-400 dark:text-slate-500">
          {{ liveGame.teams.length }} team(s) ·
          {{ liveGame.teams.map((t) => `${t.name} (${teamPlayerCount(t.id)})`).join(', ') || 'no teams yet' }}
        </p>
        <button
          v-if="!confirmingStart"
          type="button"
          class="btn-touch shrink-0 rounded-2xl bg-emerald-600 px-6 py-3 font-display font-bold text-white shadow-lg disabled:opacity-40"
          :disabled="liveGame.players.length === 0"
          @click="confirmingStart = true"
        >
          Start Game
        </button>
        <div v-else class="flex flex-wrap items-center gap-3">
          <span class="font-semibold text-slate-600 dark:text-slate-300">Ready to start?</span>
          <button
            type="button"
            class="btn-touch rounded-xl px-4 py-2 font-bold text-slate-500 dark:text-slate-400"
            @click="confirmingStart = false"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn-touch rounded-xl bg-emerald-600 px-5 py-2 font-bold text-white disabled:opacity-50"
            :disabled="starting"
            @click="start"
          >
            {{ starting ? 'Starting…' : 'Yes, Start!' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
