<script setup lang="ts">
import { downloadJson } from '~/utils/downloadJson'

definePageMeta({ middleware: 'master-auth' })
useHead({ title: 'Dashboard' })

const store = useMasterStore()
const router = useRouter()
const deleting = ref<string | null>(null)
const exporting = ref(false)
const importing = ref(false)
const importInput = ref<HTMLInputElement | null>(null)
const importError = ref('')

await store.fetchGames()

async function logout() {
  await store.logout()
  router.push('/master/login')
}

async function exportAllData() {
  exporting.value = true
  try {
    const data = await $fetch('/api/export')
    downloadJson(data, `quizrush-export-${new Date().toISOString().slice(0, 10)}.json`)
  } finally {
    exporting.value = false
  }
}

function openImport() {
  importError.value = ''
  importInput.value?.click()
}

async function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  importError.value = ''
  importing.value = true
  try {
    const text = await file.text()
    const body = JSON.parse(text)
    const result = await $fetch('/api/import', { method: 'POST', body })
    await store.fetchGames()
    const parts = [`${result.imported.length} game${result.imported.length === 1 ? '' : 's'} imported`]
    if (result.skipped.length) parts.push(`${result.skipped.length} already present, skipped`)
    alert(parts.join(' · '))
  } catch (err: unknown) {
    importError.value =
      (err as { data?: { statusMessage?: string } })?.data?.statusMessage ??
      (err as { message?: string })?.message ??
      'Failed to import data'
  } finally {
    importing.value = false
  }
}

async function launchAndGo(id: string) {
  await $fetch(`/api/games/${id}/launch`, { method: 'POST' })
  router.push(`/master/games/${id}/lobby`)
}

async function removeGame(id: string) {
  if (!confirm('Delete this game permanently?')) return
  deleting.value = id
  try {
    await $fetch(`/api/games/${id}`, { method: 'DELETE' })
    await store.fetchGames()
  } finally {
    deleting.value = null
  }
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    DRAFT: 'bg-slate-100 text-slate-600',
    LOBBY: 'bg-amber-100 text-amber-700',
    ACTIVE: 'bg-emerald-100 text-emerald-700',
    QUESTION_ACTIVE: 'bg-emerald-100 text-emerald-700',
    QUESTION_RESULTS: 'bg-emerald-100 text-emerald-700',
    FINISHED: 'bg-indigo-100 text-indigo-700',
    CANCELLED: 'bg-red-100 text-red-700'
  }
  return map[status] ?? 'bg-slate-100 text-slate-600'
}

function continueLink(game: { id: string; status: string }) {
  if (game.status === 'DRAFT') return `/master/games/${game.id}`
  if (game.status === 'LOBBY') return `/master/games/${game.id}/lobby`
  if (game.status === 'FINISHED') return `/master/games/${game.id}/results`
  return `/master/games/${game.id}/play`
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 pb-16 dark:bg-slate-900">
    <header class="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div class="flex items-center gap-2">
          <img src="/logo.png" alt="QuizRush" class="h-8 w-8" />
          <h1 class="font-display text-xl font-extrabold text-slate-800 dark:text-slate-100">Game Master</h1>
        </div>
        <div class="flex items-center gap-3">
          <ThemeToggle />
          <button
            type="button"
            class="text-sm font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
            @click="logout"
          >
            Logout
          </button>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-5xl px-6 py-8">
      <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 class="font-display text-2xl font-bold text-slate-800 dark:text-slate-100">Your Games</h2>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="btn-touch flex items-center gap-1.5 rounded-2xl bg-slate-100 px-4 py-3 font-display font-bold text-slate-700 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200"
            :disabled="importing"
            @click="openImport"
          >
            <Icon name="tabler:upload" class="h-5 w-5" />
            {{ importing ? 'Importing…' : 'Import Data' }}
          </button>
          <input ref="importInput" type="file" accept=".json,application/json" class="hidden" @change="onImportFile" />
          <button
            type="button"
            class="btn-touch flex items-center gap-1.5 rounded-2xl bg-slate-100 px-4 py-3 font-display font-bold text-slate-700 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200"
            :disabled="exporting"
            @click="exportAllData"
          >
            <Icon name="tabler:download" class="h-5 w-5" />
            {{ exporting ? 'Exporting…' : 'Export All Data' }}
          </button>
          <NuxtLink
            to="/master/games/new"
            class="btn-touch flex items-center gap-1.5 rounded-2xl bg-indigo-600 px-5 py-3 font-display font-bold text-white shadow-lg"
          >
            <Icon name="tabler:plus" class="h-5 w-5" />
            Create Game
          </NuxtLink>
        </div>
      </div>

      <p v-if="importError" class="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600 dark:bg-red-500/10 dark:text-red-400">
        {{ importError }}
      </p>

      <div v-if="store.games.length === 0" class="card p-10 text-center text-slate-400 dark:text-slate-500">
        No games yet. Create one to get started.
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div v-for="game in store.games" :key="game.id" class="card flex flex-col gap-3 p-5">
          <div class="flex items-start justify-between gap-2">
            <h3 class="font-display text-lg font-bold text-slate-800 dark:text-slate-100">{{ game.title }}</h3>
            <span class="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold" :class="statusBadge(game.status)">
              {{ game.status.replace('_', ' ') }}
            </span>
          </div>
          <p v-if="game.gameType === 'BINGO'" class="text-sm text-slate-400 dark:text-slate-500">
            {{ game.itemCount }} item{{ game.itemCount === 1 ? '' : 's' }} · created
            {{ new Date(game.createdAt).toLocaleDateString() }}
          </p>
          <p v-else class="text-sm text-slate-400 dark:text-slate-500">
            {{ game.questionCount }} question{{ game.questionCount === 1 ? '' : 's' }} · created
            {{ new Date(game.createdAt).toLocaleDateString() }}
          </p>
          <div class="mt-auto flex flex-wrap gap-2 pt-2">
            <NuxtLink
              :to="`/master/games/${game.id}`"
              class="btn-touch rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-100"
            >
              Edit
            </NuxtLink>
            <NuxtLink
              :to="continueLink(game)"
              class="btn-touch rounded-xl bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
            >
              {{ game.status === 'DRAFT' ? 'Continue' : 'Open' }}
            </NuxtLink>
            <button
              v-if="game.status === 'DRAFT'"
              type="button"
              class="btn-touch rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
              :disabled="game.gameType === 'BINGO' ? game.itemCount === 0 : game.questionCount === 0"
              @click="launchAndGo(game.id)"
            >
              Launch
            </button>
            <button
              type="button"
              class="btn-touch ml-auto rounded-xl px-3 py-2 text-sm font-bold text-red-500 hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-500/10"
              :disabled="deleting === game.id"
              @click="removeGame(game.id)"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
