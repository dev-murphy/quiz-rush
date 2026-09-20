<script setup lang="ts">
import type { BingoItem, Game, Player, PublicQuestion, Question, Team } from '#shared/types'
import { sanitizeQuestionClient } from '~/utils/previewSanitize'
import { downloadJson } from '~/utils/downloadJson'
import { QUESTION_TYPE_MAP } from '~/utils/questionTypeMeta'
import QuizQuestion from '~/components/questions/QuizQuestion.vue'
import TrueFalseQuestion from '~/components/questions/TrueFalseQuestion.vue'
import TypeAnswerQuestion from '~/components/questions/TypeAnswerQuestion.vue'
import SliderQuestion from '~/components/questions/SliderQuestion.vue'
import PinAnswerQuestion from '~/components/questions/PinAnswerQuestion.vue'
import PuzzleQuestion from '~/components/questions/PuzzleQuestion.vue'
import FillBlankQuestion from '~/components/questions/FillBlankQuestion.vue'
import CompleteTextQuestion from '~/components/questions/CompleteTextQuestion.vue'

definePageMeta({ middleware: 'master-auth' })

const previewComponents: Record<string, unknown> = {
  quiz: QuizQuestion,
  true_false: TrueFalseQuestion,
  type_answer: TypeAnswerQuestion,
  slider: SliderQuestion,
  pin_answer: PinAnswerQuestion,
  puzzle: PuzzleQuestion,
  fill_blank: FillBlankQuestion,
  complete_text: CompleteTextQuestion
}

const route = useRoute()
const router = useRouter()
const gameId = String(route.params.id)

const game = ref<Game | null>(null)
const questions = ref<Question[]>([])
const bingoItems = ref<BingoItem[]>([])
const teams = ref<Team[]>([])
const players = ref<Player[]>([])
const loadError = ref('')
const titleDraft = ref('')

useHead({ title: () => (game.value?.title ? `${game.value.title} · Edit` : 'Edit Game') })

const authedFetch = useAuthedFetch()

async function refresh() {
  const data = await authedFetch<{ game: Game; questions: Question[]; bingoItems: BingoItem[]; teams: Team[]; players: Player[] }>(
    `/api/games/${gameId}`
  )
  game.value = data.game
  questions.value = data.questions
  bingoItems.value = data.bingoItems
  teams.value = data.teams
  players.value = data.players
  titleDraft.value = data.game.title
}

try {
  await refresh()
} catch (e: unknown) {
  loadError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage ?? 'Game not found'
}
let titleTimer: ReturnType<typeof setTimeout> | null = null
watch(titleDraft, (v) => {
  if (!game.value) return
  if (titleTimer) clearTimeout(titleTimer)
  titleTimer = setTimeout(async () => {
    if (v.trim() && v.trim() !== game.value!.title) {
      await $fetch(`/api/games/${gameId}`, { method: 'PUT', body: { title: v.trim() } })
      if (game.value) game.value.title = v.trim()
    }
  }, 600)
})

const showEditor = ref(false)
const editingQuestion = ref<Question | null>(null)
const previewQuestion = ref<Question | null>(null)
const importInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)
const importError = ref('')

const selectMode = ref(false)
const selectedIds = ref<Set<string>>(new Set())
const bulkDeleting = ref(false)
const exporting = ref(false)

async function exportGameData() {
  exporting.value = true
  try {
    const data = await authedFetch(`/api/games/${gameId}/export`)
    downloadJson(data, `${game.value?.title ?? 'game'}-export.json`)
  } finally {
    exporting.value = false
  }
}

function openAdd() {
  editingQuestion.value = null
  showEditor.value = true
}
function openEdit(q: Question) {
  editingQuestion.value = q
  showEditor.value = true
}
async function onSaved() {
  showEditor.value = false
  editingQuestion.value = null
  await refresh()
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
    const parsed = JSON.parse(text)
    const questions = Array.isArray(parsed) ? parsed : parsed?.questions
    if (!Array.isArray(questions)) throw new Error('JSON must be an array of questions or an object with a "questions" array')

    await $fetch(`/api/games/${gameId}/questions/import`, { method: 'POST', body: { questions } })
    await refresh()
  } catch (err: unknown) {
    importError.value =
      (err as { data?: { statusMessage?: string } })?.data?.statusMessage ??
      (err as { message?: string })?.message ??
      'Failed to import questions'
  } finally {
    importing.value = false
  }
}

async function deleteQuestion(q: Question) {
  if (!confirm('Delete this question?')) return
  await $fetch(`/api/games/${gameId}/questions/${q.id}`, { method: 'DELETE' })
  await refresh()
}

function toggleSelectMode() {
  selectMode.value = !selectMode.value
  selectedIds.value = new Set()
}

function toggleSelected(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function toggleSelectAll() {
  selectedIds.value =
    selectedIds.value.size === questions.value.length ? new Set() : new Set(questions.value.map((q) => q.id))
}

async function bulkDelete() {
  const count = selectedIds.value.size
  if (count === 0) return
  if (!confirm(`Delete ${count} selected question${count === 1 ? '' : 's'}?`)) return
  bulkDeleting.value = true
  try {
    await $fetch(`/api/games/${gameId}/questions/bulk-delete`, {
      method: 'POST',
      body: { ids: [...selectedIds.value] }
    })
    selectMode.value = false
    selectedIds.value = new Set()
    await refresh()
  } finally {
    bulkDeleting.value = false
  }
}

const rowEls = ref<(HTMLElement | null)[]>([])
const dragIndex = ref<number | null>(null)
const dragOffsetY = ref(0)
let dragStartY = 0
let dragItemHeight = 0
let activePointerId: number | null = null

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function startDrag(e: PointerEvent, idx: number) {
  if (selectMode.value) return
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const el = rowEls.value[idx]
  if (!el) return

  e.preventDefault()
  dragIndex.value = idx
  dragOffsetY.value = 0
  dragStartY = e.clientY
  dragItemHeight = el.getBoundingClientRect().height
  activePointerId = e.pointerId

  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
}

function onDragMove(e: PointerEvent) {
  if (dragIndex.value === null || e.pointerId !== activePointerId) return

  const delta = e.clientY - dragStartY
  const steps = dragItemHeight > 0 ? Math.round(delta / dragItemHeight) : 0

  if (steps !== 0) {
    const from = dragIndex.value
    const to = clamp(from + steps, 0, questions.value.length - 1)
    if (to !== from) {
      const copy = [...questions.value]
      const [moved] = copy.splice(from, 1)
      copy.splice(to, 0, moved!)
      questions.value = copy
      dragIndex.value = to
      dragStartY += (to - from) * dragItemHeight
    }
  }

  dragOffsetY.value = e.clientY - dragStartY
}

async function endDrag(e: PointerEvent) {
  if (e.pointerId !== activePointerId) return
  const moved = dragIndex.value !== null
  dragIndex.value = null
  dragOffsetY.value = 0
  activePointerId = null
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)

  if (moved) {
    await $fetch(`/api/games/${gameId}/questions/reorder`, {
      method: 'POST',
      body: { orderedIds: questions.value.map((q) => q.id) }
    })
  }
}

const launching = ref(false)
async function launch() {
  launching.value = true
  try {
    await $fetch(`/api/games/${gameId}/launch`, { method: 'POST' })
    router.push(`/master/games/${gameId}/lobby`)
  } finally {
    launching.value = false
  }
}

const restarting = ref(false)
async function restart() {
  if (!confirm('Restart this game? Scores and answers will be reset.')) return
  restarting.value = true
  try {
    await $fetch(`/api/games/${gameId}/restart`, { method: 'POST' })
    router.push(`/master/games/${gameId}/lobby`)
  } finally {
    restarting.value = false
  }
}

const previewPublic = computed<PublicQuestion | null>(() =>
  previewQuestion.value ? sanitizeQuestionClient(previewQuestion.value) : null
)
</script>

<template>
  <div v-if="loadError" class="flex min-h-screen items-center justify-center">
    <p class="text-slate-500 dark:text-slate-400">{{ loadError }}</p>
  </div>
  <div v-else-if="game" class="min-h-screen bg-slate-50 pb-24 dark:bg-slate-900">
    <header class="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div class="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
        <NuxtLink
          to="/master"
          class="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <Icon name="tabler:arrow-left" class="h-4 w-4" /> Dashboard
        </NuxtLink>
        <div class="flex items-center gap-3">
          <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{{ game.status }}</span>
          <ThemeToggle />
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-3xl px-6 py-8">
      <label class="mb-8 block">
        <span class="text-sm font-semibold text-slate-500 dark:text-slate-400">Game title</span>
        <input
          v-model="titleDraft"
          type="text"
          class="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-display text-2xl font-bold text-slate-800 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </label>

      <section v-if="game.mode !== 'INDIVIDUAL'" class="mb-10">
        <h2 class="mb-3 font-display text-lg font-bold text-slate-800 dark:text-slate-100">Teams</h2>
        <TeamManager :game-id="gameId" :teams="teams" :players="players" :pin="game.pin" @changed="refresh" />
      </section>
      <section v-else class="mb-10">
        <h2 class="mb-3 font-display text-lg font-bold text-slate-800 dark:text-slate-100">Mode</h2>
        <p class="flex items-center gap-2 rounded-xl bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
          <Icon name="tabler:user" class="h-5 w-5 shrink-0" /> Individual Mode — players compete on their own, no teams to manage.
        </p>
      </section>

      <section v-if="game.gameType === 'BINGO'">
        <BingoItemEditor :game-id="gameId" :game="game" :items="bingoItems" @changed="refresh" />
      </section>

      <section v-else>
        <div class="mb-3 flex items-center justify-between">
          <h2 class="font-display text-lg font-bold text-slate-800 dark:text-slate-100">Questions ({{ questions.length }})</h2>
          <div class="flex items-center gap-3">
            <button
              type="button"
              class="flex items-center gap-1 text-xs font-bold text-slate-500 hover:underline disabled:opacity-40 dark:text-slate-400"
              :disabled="exporting || questions.length === 0"
              @click="exportGameData"
            >
              <Icon name="tabler:download" class="h-3.5 w-3.5" /> {{ exporting ? 'Exporting…' : 'Export' }}
            </button>
            <button
              v-if="questions.length > 0"
              type="button"
              class="text-xs font-bold text-indigo-500 hover:underline dark:text-indigo-400"
              @click="toggleSelectMode"
            >
              {{ selectMode ? 'Cancel' : 'Select' }}
            </button>
          </div>
        </div>

        <div v-if="selectMode" class="mb-3 flex items-center justify-between rounded-2xl bg-indigo-50 px-4 py-2 dark:bg-indigo-500/10">
          <label class="flex items-center gap-2 text-sm font-semibold text-indigo-700 dark:text-indigo-300">
            <input
              type="checkbox"
              :checked="selectedIds.size === questions.length && questions.length > 0"
              @change="toggleSelectAll"
            />
            {{ selectedIds.size }} selected
          </label>
          <button
            type="button"
            class="btn-touch rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
            :disabled="selectedIds.size === 0 || bulkDeleting"
            @click="bulkDelete"
          >
            {{ bulkDeleting ? 'Deleting…' : `Delete Selected (${selectedIds.size})` }}
          </button>
        </div>

        <div class="flex flex-col gap-3">
          <div
            v-for="(q, idx) in questions"
            :key="q.id"
            :ref="(el) => (rowEls[idx] = el as HTMLElement)"
            class="card flex items-center gap-3 p-4"
            :class="dragIndex === idx ? 'relative z-10 shadow-xl ring-2 ring-indigo-400' : ''"
            :style="dragIndex === idx ? { transform: `translateY(${dragOffsetY}px)`, transition: 'none' } : {}"
          >
            <input
              v-if="selectMode"
              type="checkbox"
              class="h-5 w-5 shrink-0"
              :checked="selectedIds.has(q.id)"
              @change="toggleSelected(q.id)"
            />
            <button
              v-else
              type="button"
              class="btn-touch shrink-0 touch-none select-none text-slate-300 dark:text-slate-600"
              :class="dragIndex === idx ? 'cursor-grabbing text-indigo-500 dark:text-indigo-400' : 'cursor-grab'"
              @pointerdown="startDrag($event, idx)"
            >
              <Icon name="tabler:grip-vertical" class="h-5 w-5" />
            </button>
            <img :src="QUESTION_TYPE_MAP[q.type]?.icon" :alt="QUESTION_TYPE_MAP[q.type]?.label" class="h-7 w-7 shrink-0 rounded-md" />
            <div class="min-w-0 flex-1">
              <p class="truncate font-semibold text-slate-800 dark:text-slate-100">{{ idx + 1 }}. {{ q.text }}</p>
              <p class="text-xs text-slate-400 dark:text-slate-500">{{ QUESTION_TYPE_MAP[q.type]?.label }} · {{ q.timeLimit }}s · {{ q.points }} pts</p>
            </div>
            <div class="flex shrink-0 gap-2">
              <button
                type="button"
                class="btn-touch rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200"
                @click="previewQuestion = q"
              >
                Preview
              </button>
              <button
                type="button"
                class="btn-touch rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200"
                @click="openEdit(q)"
              >
                Edit
              </button>
              <button
                type="button"
                class="btn-touch rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-500 dark:bg-red-500/10"
                @click="deleteQuestion(q)"
              >
                Delete
              </button>
            </div>
          </div>

          <div v-if="questions.length === 0" class="card p-8 text-center text-slate-400 dark:text-slate-500">No questions yet.</div>

          <div class="flex gap-3">
            <button
              type="button"
              class="btn-touch flex flex-1 items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-indigo-200 py-5 font-display font-bold text-indigo-500 hover:bg-indigo-50 dark:border-indigo-500/30 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
              @click="openAdd"
            >
              <Icon name="tabler:plus" class="h-5 w-5" /> Add Question
            </button>
            <button
              type="button"
              class="btn-touch flex flex-1 items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-slate-200 py-5 font-display font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
              :disabled="importing"
              @click="openImport"
            >
              <Icon name="tabler:upload" class="h-5 w-5" /> {{ importing ? 'Uploading…' : 'Upload JSON' }}
            </button>
            <input ref="importInput" type="file" accept=".json,application/json" class="hidden" @change="onImportFile" />
          </div>
          <p v-if="importError" class="text-sm font-semibold text-red-500">{{ importError }}</p>
        </div>
      </section>
    </main>

    <div class="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <div class="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
        <p v-if="game.gameType === 'BINGO'" class="text-sm text-slate-400 dark:text-slate-500">
          {{ bingoItems.length }} item{{ bingoItems.length === 1 ? '' : 's' }} saved
        </p>
        <p v-else class="text-sm text-slate-400 dark:text-slate-500">{{ questions.length }} question{{ questions.length === 1 ? '' : 's' }} saved</p>
        <button
          v-if="game.status === 'FINISHED'"
          type="button"
          class="btn-touch flex items-center gap-1.5 rounded-2xl bg-indigo-600 px-6 py-3 font-display font-bold text-white shadow-lg disabled:opacity-40"
          :disabled="restarting"
          @click="restart"
        >
          {{ restarting ? 'Restarting…' : 'Restart Game' }}
          <Icon v-if="!restarting" name="tabler:arrow-right" class="h-5 w-5" />
        </button>
        <button
          v-else
          type="button"
          class="btn-touch flex items-center gap-1.5 rounded-2xl bg-emerald-600 px-6 py-3 font-display font-bold text-white shadow-lg disabled:opacity-40"
          :disabled="(game.gameType === 'BINGO' ? bingoItems.length === 0 : questions.length === 0) || launching"
          @click="launch"
        >
          {{ launching ? 'Launching…' : 'Launch Game' }}
          <Icon v-if="!launching" name="tabler:arrow-right" class="h-5 w-5" />
        </button>
      </div>
    </div>

    <!-- Question editor modal -->
    <div v-if="showEditor" class="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4" @click.self="showEditor = false">
      <div class="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
        <QuestionEditor :game-id="gameId" :question="editingQuestion" @saved="onSaved" @cancel="showEditor = false" />
      </div>
    </div>

    <!-- Preview modal -->
    <div v-if="previewQuestion && previewPublic" class="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4" @click.self="previewQuestion = null">
      <div class="flex max-h-[90vh] w-full max-w-xl flex-col items-center gap-4 overflow-y-auto rounded-3xl bg-white p-8 dark:bg-slate-800">
        <p class="font-display text-2xl font-bold text-slate-800 dark:text-slate-100">{{ previewQuestion.text }}</p>
        <component :is="previewComponents[previewQuestion.type]" v-bind="previewPublic.config" disabled />
        <button
          type="button"
          class="btn-touch rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200"
          @click="previewQuestion = null"
        >
          Close preview
        </button>
      </div>
    </div>
  </div>
</template>
