<script setup lang="ts">
import type { GameMode, GameType } from '#shared/types'

definePageMeta({ middleware: 'master-auth' })
useHead({ title: 'New Game' })

const title = ref('')
const gameType = ref<GameType>('QUIZ')
const mode = ref<GameMode>('TEAM')
const creating = ref(false)
const error = ref('')
const router = useRouter()

async function create() {
  if (!title.value.trim()) {
    error.value = 'Please enter a game title'
    return
  }
  creating.value = true
  try {
    const game = await $fetch<{ id: string }>('/api/games', {
      method: 'POST',
      body: { title: title.value.trim(), mode: mode.value, gameType: gameType.value }
    })
    router.push(`/master/games/${game.id}`)
  } catch (e: unknown) {
    error.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage ?? 'Could not create game'
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 dark:bg-slate-900">
    <header class="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div class="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
        <NuxtLink
          to="/master"
          class="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <Icon name="tabler:arrow-left" class="h-4 w-4" /> Dashboard
        </NuxtLink>
        <ThemeToggle />
      </div>
    </header>
    <main class="mx-auto max-w-2xl px-6 py-12">
      <form class="card flex flex-col gap-4 p-8" @submit.prevent="create">
        <h1 class="font-display text-2xl font-extrabold text-slate-800 dark:text-slate-100">Create Game</h1>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">Game title</span>
          <input
            v-model="title"
            type="text"
            autofocus
            placeholder="Friday Night Quiz"
            class="rounded-xl border border-slate-200 px-4 py-3 text-lg dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          />
        </label>

        <div class="flex flex-col gap-2">
          <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">Game type</span>
          <div class="grid grid-cols-2 gap-3">
            <button
              type="button"
              class="btn-touch card rounded-2xl px-4 py-4 text-center"
              :class="gameType === 'QUIZ' ? 'ring-4 ring-blue-500 ring-offset-2' : 'hover:ring-2 hover:ring-indigo-200'"
              @click="gameType = 'QUIZ'"
            >
              <span class="flex items-center justify-center gap-1.5 font-display font-bold text-slate-800 dark:text-slate-100">
                <Icon name="tabler:help-hexagon" class="h-5 w-5" /> Quiz
              </span>
              <span class="block text-xs text-slate-400 dark:text-slate-500">Ask questions, score by speed</span>
            </button>
            <button
              type="button"
              class="btn-touch card rounded-2xl px-4 py-4 text-center"
              :class="gameType === 'BINGO' ? 'ring-4 ring-blue-500 ring-offset-2' : 'hover:ring-2 hover:ring-indigo-200'"
              @click="gameType = 'BINGO'"
            >
              <span class="flex items-center justify-center gap-1.5 font-display font-bold text-slate-800 dark:text-slate-100">
                <Icon name="tabler:grid-dots" class="h-5 w-5" /> Bingo
              </span>
              <span class="block text-xs text-slate-400 dark:text-slate-500">Call items, first card wins</span>
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">Game mode</span>
          <div class="grid grid-cols-2 gap-3">
            <button
              type="button"
              class="btn-touch card rounded-2xl px-4 py-4 text-center"
              :class="mode === 'TEAM' ? 'ring-4 ring-blue-500 ring-offset-2' : 'hover:ring-2 hover:ring-indigo-200'"
              @click="mode = 'TEAM'"
            >
              <span class="flex items-center justify-center gap-1.5 font-display font-bold text-slate-800 dark:text-slate-100">
                <Icon name="tabler:users" class="h-5 w-5" /> Team Mode
              </span>
              <span class="block text-xs text-slate-400 dark:text-slate-500">Players join teams and share a score</span>
            </button>
            <button
              type="button"
              class="btn-touch card rounded-2xl px-4 py-4 text-center"
              :class="mode === 'INDIVIDUAL' ? 'ring-4 ring-blue-500 ring-offset-2' : 'hover:ring-2 hover:ring-indigo-200'"
              @click="mode = 'INDIVIDUAL'"
            >
              <span class="flex items-center justify-center gap-1.5 font-display font-bold text-slate-800 dark:text-slate-100">
                <Icon name="tabler:user" class="h-5 w-5" /> Individual Mode
              </span>
              <span class="block text-xs text-slate-400 dark:text-slate-500">Every player competes on their own</span>
            </button>
          </div>
        </div>

        <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600 dark:bg-red-500/10">{{ error }}</p>
        <button
          type="submit"
          class="btn-touch flex min-h-[52px] items-center justify-center gap-1.5 rounded-2xl bg-indigo-600 text-lg font-display font-bold text-white shadow-lg disabled:opacity-50"
          :disabled="creating"
        >
          {{ creating ? 'Creating…' : gameType === 'BINGO' ? 'Continue to Bingo Items' : 'Continue to Questions' }}
          <Icon v-if="!creating" name="tabler:arrow-right" class="h-5 w-5" />
        </button>
      </form>
    </main>
  </div>
</template>
