<script setup lang="ts">
import type {
  CompleteTextConfig,
  FillBlankConfig,
  PinAnswerConfig,
  PuzzleConfig,
  Question,
  QuestionConfig,
  QuestionType,
  QuizConfig,
  SliderConfig,
  TrueFalseConfig,
  TypeAnswerConfig
} from '#shared/types'
import { QUIZ_ANSWER_COLORS } from '#shared/types'
import { BLANK_TOKEN, countBlanks } from '#shared/utils/fillBlank'
import { tokenizeAnswer } from '#shared/utils/tokenize'

const props = defineProps<{ gameId: string; question?: Question | null }>()
const emit = defineEmits<{ saved: []; cancel: [] }>()

const step = ref<1 | 2>(props.question ? 2 : 1)
const type = ref<QuestionType | null>(props.question?.type ?? null)
const saving = ref(false)
const error = ref('')

const text = ref(props.question?.text ?? '')
const timeLimit = ref(props.question?.timeLimit ?? 30)
const points = ref(props.question?.points ?? 1000)

const choices = ref<string[]>(
  type.value === 'quiz' ? [...(props.question!.config as QuizConfig).choices] : ['', '', '', '']
)
const correctIndex = ref(type.value === 'quiz' ? (props.question!.config as QuizConfig).correctIndex : 0)

const tfAnswer = ref(type.value === 'true_false' ? (props.question!.config as TrueFalseConfig).correctAnswer : true)

const correctAnswer = ref(type.value === 'type_answer' ? (props.question!.config as TypeAnswerConfig).correctAnswer : '')
const acceptableAnswers = ref(
  type.value === 'type_answer' ? ((props.question!.config as TypeAnswerConfig).acceptableAnswers ?? []).join(', ') : ''
)

const sliderMin = ref(type.value === 'slider' ? (props.question!.config as SliderConfig).min : 0)
const sliderMax = ref(type.value === 'slider' ? (props.question!.config as SliderConfig).max : 100)
const sliderCorrect = ref(type.value === 'slider' ? (props.question!.config as SliderConfig).correctValue : 50)
const sliderTolerance = ref(type.value === 'slider' ? (props.question!.config as SliderConfig).tolerance : 5)

const imageUrl = ref(type.value === 'pin_answer' ? (props.question!.config as PinAnswerConfig).imageUrl : '')
const correctX = ref(type.value === 'pin_answer' ? (props.question!.config as PinAnswerConfig).correctX : 0.5)
const correctY = ref(type.value === 'pin_answer' ? (props.question!.config as PinAnswerConfig).correctY : 0.5)
const radius = ref(type.value === 'pin_answer' ? (props.question!.config as PinAnswerConfig).radius : 0.12)
const pinContainer = ref<HTMLElement | null>(null)
const imageFileInput = ref<HTMLInputElement | null>(null)
const uploadingImage = ref(false)
const uploadError = ref('')

const puzzleItems = ref<string[]>(type.value === 'puzzle' ? [...(props.question!.config as PuzzleConfig).items] : ['', '', ''])

const fillBlankTemplate = ref(type.value === 'fill_blank' ? (props.question!.config as FillBlankConfig).template : '')
const fillBlankAnswers = ref<string[]>(type.value === 'fill_blank' ? [...(props.question!.config as FillBlankConfig).answers] : [])
const fillBlankWordBank = ref<string[]>(type.value === 'fill_blank' ? [...(props.question!.config as FillBlankConfig).wordBank] : [])

const completeTextAnswer = ref(type.value === 'complete_text' ? (props.question!.config as CompleteTextConfig).answer : '')
const completeTextWordBank = ref<string[]>(
  type.value === 'complete_text' ? [...(props.question!.config as CompleteTextConfig).wordBank] : []
)

const fillBlankCount = computed(() => countBlanks(fillBlankTemplate.value))
watch(fillBlankCount, (n) => {
  const answers = fillBlankAnswers.value
  if (answers.length < n) fillBlankAnswers.value = [...answers, ...Array(n - answers.length).fill('')]
  else if (answers.length > n) fillBlankAnswers.value = answers.slice(0, n)
})

function insertBlank() {
  fillBlankTemplate.value += (fillBlankTemplate.value && !fillBlankTemplate.value.endsWith(' ') ? ' ' : '') + BLANK_TOKEN
}

function addFillBlankWord() {
  fillBlankWordBank.value.push('')
}
function removeFillBlankWord(idx: number) {
  fillBlankWordBank.value.splice(idx, 1)
}
function syncFillBlankWordBank() {
  const available = new Map<string, number>()
  for (const w of fillBlankWordBank.value) {
    const key = w.trim().toLowerCase()
    if (!key) continue
    available.set(key, (available.get(key) ?? 0) + 1)
  }
  const missing: string[] = []
  for (const a of fillBlankAnswers.value) {
    const trimmed = a.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    const remaining = available.get(key) ?? 0
    if (remaining > 0) {
      available.set(key, remaining - 1)
    } else {
      missing.push(trimmed)
    }
  }
  fillBlankWordBank.value = [...fillBlankWordBank.value, ...missing]
}

function addCompleteTextWord() {
  completeTextWordBank.value.push('')
}
function removeCompleteTextWord(idx: number) {
  completeTextWordBank.value.splice(idx, 1)
}
function autoFillCompleteTextWordBank() {
  completeTextWordBank.value = tokenizeAnswer(completeTextAnswer.value)
}

function pickType(t: QuestionType) {
  type.value = t
}

function next() {
  if (!type.value) return
  step.value = 2
}

function addChoice() {
  if (choices.value.length < 4) choices.value.push('')
}
function removeChoice(idx: number) {
  if (choices.value.length <= 2) return
  choices.value.splice(idx, 1)
  if (correctIndex.value >= choices.value.length) correctIndex.value = 0
}

function addPuzzleItem() {
  puzzleItems.value.push('')
}
function removePuzzleItem(idx: number) {
  if (puzzleItems.value.length <= 2) return
  puzzleItems.value.splice(idx, 1)
}
function movePuzzleItem(idx: number, dir: -1 | 1) {
  const target = idx + dir
  if (target < 0 || target >= puzzleItems.value.length) return
  const copy = [...puzzleItems.value]
  ;[copy[idx], copy[target]] = [copy[target]!, copy[idx]!]
  puzzleItems.value = copy
}

function setPin(e: MouseEvent) {
  if (!pinContainer.value) return
  const rect = pinContainer.value.getBoundingClientRect()
  correctX.value = Math.round(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * 1000) / 1000
  correctY.value = Math.round(Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)) * 1000) / 1000
}

function pickImageFile() {
  imageFileInput.value?.click()
}

async function onImageFileChosen(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploadError.value = ''
  uploadingImage.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    const { url } = await $fetch<{ url: string }>('/api/uploads/image', { method: 'POST', body: formData })
    imageUrl.value = url
  } catch (e: unknown) {
    uploadError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage ?? 'Could not upload image'
  } finally {
    uploadingImage.value = false
    input.value = ''
  }
}

function buildConfig(): QuestionConfig | null {
  switch (type.value) {
    case 'quiz':
      return { choices: choices.value.map((c) => c.trim()), correctIndex: correctIndex.value } satisfies QuizConfig
    case 'true_false':
      return { correctAnswer: tfAnswer.value } satisfies TrueFalseConfig
    case 'type_answer':
      return {
        correctAnswer: correctAnswer.value.trim(),
        acceptableAnswers: acceptableAnswers.value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      } satisfies TypeAnswerConfig
    case 'slider':
      return {
        min: Number(sliderMin.value),
        max: Number(sliderMax.value),
        correctValue: Number(sliderCorrect.value),
        tolerance: Number(sliderTolerance.value),
        step: 1
      } satisfies SliderConfig
    case 'pin_answer':
      return {
        imageUrl: imageUrl.value.trim(),
        correctX: correctX.value,
        correctY: correctY.value,
        radius: radius.value
      } satisfies PinAnswerConfig
    case 'puzzle':
      return { items: puzzleItems.value.map((i) => i.trim()) } satisfies PuzzleConfig
    case 'fill_blank':
      return {
        template: fillBlankTemplate.value.trim(),
        answers: fillBlankAnswers.value.map((a) => a.trim()),
        wordBank: fillBlankWordBank.value.map((w) => w.trim()).filter(Boolean)
      } satisfies FillBlankConfig
    case 'complete_text':
      return {
        answer: completeTextAnswer.value.trim(),
        wordBank: completeTextWordBank.value.map((w) => w.trim()).filter(Boolean)
      } satisfies CompleteTextConfig
    default:
      return null
  }
}

async function save() {
  error.value = ''
  const config = buildConfig()
  if (!type.value || !config) {
    error.value = 'Please choose a question type'
    return
  }
  saving.value = true
  try {
    const body = { type: type.value, text: text.value.trim(), config, timeLimit: timeLimit.value, points: points.value }
    if (props.question) {
      await $fetch(`/api/games/${props.gameId}/questions/${props.question.id}`, { method: 'PUT', body })
    } else {
      await $fetch(`/api/games/${props.gameId}/questions`, { method: 'POST', body })
    }
    emit('saved')
  } catch (e: unknown) {
    error.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage ?? 'Could not save question'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="card p-6">
    <div v-if="step === 1">
      <QuestionTypeSelector v-model="type" />
      <div class="mt-6 flex justify-end gap-3">
        <button type="button" class="btn-touch rounded-xl px-4 py-2 font-semibold text-slate-500 dark:text-slate-400" @click="emit('cancel')">
          Cancel
        </button>
        <button
          type="button"
          class="btn-touch rounded-xl bg-indigo-600 px-6 py-2 font-bold text-white disabled:opacity-40"
          :disabled="!type"
          @click="next"
        >
          Next
        </button>
      </div>
    </div>

    <div v-else class="flex flex-col gap-5">
      <div class="flex items-center justify-between">
        <h3 class="font-display text-xl font-bold text-slate-800 dark:text-slate-100">Configure question</h3>
        <button
          v-if="!props.question"
          type="button"
          class="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
          @click="step = 1"
        >
          Change type
        </button>
      </div>

      <label class="flex flex-col gap-1">
        <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">Question text</span>
        <textarea
          v-model="text"
          rows="2"
          class="rounded-xl border border-slate-200 px-4 py-3 text-lg focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          placeholder="What is...?"
        />
      </label>

      <div class="grid grid-cols-2 gap-4">
        <label class="flex flex-col gap-1">
          <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">Time limit (sec)</span>
          <input v-model.number="timeLimit" type="number" min="5" max="300" class="rounded-xl border border-slate-200 px-4 py-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">Points</span>
          <input v-model.number="points" type="number" min="0" max="5000" step="50" class="rounded-xl border border-slate-200 px-4 py-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
        </label>
      </div>

      <!-- Quiz -->
      <div v-if="type === 'quiz'" class="flex flex-col gap-2">
        <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">Answer choices (select the correct one)</span>
        <div v-for="(c, idx) in choices" :key="idx" class="flex items-center gap-2">
          <input
            type="radio"
            :checked="correctIndex === idx"
            class="h-5 w-5"
            :style="{ accentColor: QUIZ_ANSWER_COLORS[idx] }"
            @change="correctIndex = idx"
          />
          <input
            v-model="choices[idx]"
            type="text"
            class="flex-1 rounded-xl border px-3 py-2"
            :style="{ borderColor: QUIZ_ANSWER_COLORS[idx] }"
            :placeholder="`Choice ${idx + 1}`"
          />
          <button v-if="choices.length > 2" type="button" class="text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400" @click="removeChoice(idx)"><Icon name="tabler:x" class="h-4 w-4" /></button>
        </div>
        <button v-if="choices.length < 4" type="button" class="self-start text-sm font-semibold text-indigo-600 dark:text-indigo-400" @click="addChoice">
          + Add choice
        </button>
      </div>

      <!-- True/False -->
      <div v-else-if="type === 'true_false'" class="flex gap-4">
        <label class="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
          <input v-model="tfAnswer" type="radio" :value="true" /> True
        </label>
        <label class="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
          <input v-model="tfAnswer" type="radio" :value="false" /> False
        </label>
      </div>

      <!-- Type answer -->
      <div v-else-if="type === 'type_answer'" class="flex flex-col gap-3">
        <label class="flex flex-col gap-1">
          <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">Correct answer</span>
          <input v-model="correctAnswer" type="text" class="rounded-xl border border-slate-200 px-4 py-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">Other acceptable answers (comma separated, optional)</span>
          <input v-model="acceptableAnswers" type="text" class="rounded-xl border border-slate-200 px-4 py-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white" placeholder="e.g. NYC, New York City" />
        </label>
      </div>

      <!-- Slider -->
      <div v-else-if="type === 'slider'" class="grid grid-cols-2 gap-4">
        <label class="flex flex-col gap-1">
          <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">Minimum</span>
          <input v-model.number="sliderMin" type="number" class="rounded-xl border border-slate-200 px-4 py-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">Maximum</span>
          <input v-model.number="sliderMax" type="number" class="rounded-xl border border-slate-200 px-4 py-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">Correct value</span>
          <input v-model.number="sliderCorrect" type="number" class="rounded-xl border border-slate-200 px-4 py-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">Tolerance (±)</span>
          <input v-model.number="sliderTolerance" type="number" min="0.01" class="rounded-xl border border-slate-200 px-4 py-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
        </label>
      </div>

      <!-- Pin answer -->
      <div v-else-if="type === 'pin_answer'" class="flex flex-col gap-3">
        <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">Background image</span>
        <div class="flex flex-wrap items-center gap-2">
          <input ref="imageFileInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" @change="onImageFileChosen" />
          <button
            type="button"
            class="btn-touch rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
            :disabled="uploadingImage"
            @click="pickImageFile"
          >
            {{ uploadingImage ? 'Uploading…' : 'Upload image' }}
          </button>
          <input
            v-model="imageUrl"
            type="text"
            class="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            placeholder="or paste an image URL"
          />
        </div>
        <p v-if="uploadError" class="text-xs font-semibold text-red-500">{{ uploadError }}</p>
        <div v-if="imageUrl" ref="pinContainer" class="relative w-full max-w-md cursor-crosshair overflow-hidden rounded-xl ring-1 ring-slate-200" @click="setPin">
          <img :src="imageUrl" class="pointer-events-none block w-full" draggable="false" />
          <div
            class="pointer-events-none absolute rounded-full border-2 border-pink-500/60 bg-pink-500/20"
            :style="{
              left: correctX * 100 + '%',
              top: correctY * 100 + '%',
              width: radius * 200 + '%',
              height: radius * 200 + '%',
              transform: 'translate(-50%, -50%)'
            }"
          />
          <div
            class="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pink-600"
            :style="{ left: correctX * 100 + '%', top: correctY * 100 + '%' }"
          />
        </div>
        <p class="text-xs text-slate-400 dark:text-slate-500">Click the image to set the correct location.</p>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">Tolerance radius: {{ Math.round(radius * 100) }}%</span>
          <input v-model.number="radius" type="range" min="0.02" max="0.5" step="0.01" />
        </label>
      </div>

      <!-- Puzzle -->
      <div v-else-if="type === 'puzzle'" class="flex flex-col gap-2">
        <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">Items in correct order</span>
        <div v-for="(item, idx) in puzzleItems" :key="idx" class="flex items-center gap-2">
          <span class="w-6 text-center font-bold text-slate-400 dark:text-slate-500">{{ idx + 1 }}</span>
          <input v-model="puzzleItems[idx]" type="text" class="flex-1 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
          <button type="button" class="text-slate-400 disabled:opacity-30 dark:text-slate-500" :disabled="idx === 0" @click="movePuzzleItem(idx, -1)">
            <Icon name="tabler:chevron-up" class="h-4 w-4" />
          </button>
          <button
            type="button"
            class="text-slate-400 disabled:opacity-30 dark:text-slate-500"
            :disabled="idx === puzzleItems.length - 1"
            @click="movePuzzleItem(idx, 1)"
          >
            <Icon name="tabler:chevron-down" class="h-4 w-4" />
          </button>
          <button v-if="puzzleItems.length > 2" type="button" class="text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400" @click="removePuzzleItem(idx)"><Icon name="tabler:x" class="h-4 w-4" /></button>
        </div>
        <button type="button" class="self-start text-sm font-semibold text-indigo-600 dark:text-indigo-400" @click="addPuzzleItem">+ Add item</button>
      </div>

      <!-- Fill in the blank -->
      <div v-else-if="type === 'fill_blank'" class="flex flex-col gap-4">
        <label class="flex flex-col gap-1">
          <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">Verse / sentence with blanks</span>
          <textarea
            v-model="fillBlankTemplate"
            rows="3"
            class="rounded-xl border border-slate-200 px-4 py-3 focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            placeholder="The Lord is my {blank}; I shall not {blank}."
          />
          <button type="button" class="self-start text-xs font-semibold text-indigo-600 dark:text-indigo-400" @click="insertBlank">+ Insert blank</button>
        </label>

        <div class="flex flex-col gap-2">
          <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">Answers ({{ fillBlankCount }} blank{{ fillBlankCount === 1 ? '' : 's' }} found)</span>
          <div v-for="(a, idx) in fillBlankAnswers" :key="idx" class="flex items-center gap-2">
            <span class="w-6 text-center font-bold text-slate-400 dark:text-slate-500">{{ idx + 1 }}</span>
            <input v-model="fillBlankAnswers[idx]" type="text" class="flex-1 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white" :placeholder="`Blank ${idx + 1} answer`" />
          </div>
          <p v-if="fillBlankCount === 0" class="text-xs text-slate-400 dark:text-slate-500">Add a {blank} to the text above to create an answer slot.</p>
        </div>

        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">Word bank (answers + distractors)</span>
            <button type="button" class="text-xs font-semibold text-indigo-600 dark:text-indigo-400" @click="syncFillBlankWordBank">+ Add answer words</button>
          </div>
          <div v-for="(w, idx) in fillBlankWordBank" :key="idx" class="flex items-center gap-2">
            <input v-model="fillBlankWordBank[idx]" type="text" class="flex-1 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white" placeholder="Word" />
            <button type="button" class="text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400" @click="removeFillBlankWord(idx)"><Icon name="tabler:x" class="h-4 w-4" /></button>
          </div>
          <button type="button" class="self-start text-sm font-semibold text-indigo-600 dark:text-indigo-400" @click="addFillBlankWord">+ Add word</button>
        </div>
      </div>

      <!-- Complete the text -->
      <div v-else-if="type === 'complete_text'" class="flex flex-col gap-4">
        <label class="flex flex-col gap-1">
          <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">Full verse / sentence</span>
          <textarea
            v-model="completeTextAnswer"
            rows="3"
            class="rounded-xl border border-slate-200 px-4 py-3 focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            placeholder="The Lord is my shepherd; I shall not want."
          />
        </label>

        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">Word bank (words + distractors)</span>
            <button type="button" class="text-xs font-semibold text-indigo-600 dark:text-indigo-400" @click="autoFillCompleteTextWordBank">Auto-fill from sentence</button>
          </div>
          <div v-for="(w, idx) in completeTextWordBank" :key="idx" class="flex items-center gap-2">
            <input v-model="completeTextWordBank[idx]" type="text" class="flex-1 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white" placeholder="Word" />
            <button type="button" class="text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400" @click="removeCompleteTextWord(idx)"><Icon name="tabler:x" class="h-4 w-4" /></button>
          </div>
          <button type="button" class="self-start text-sm font-semibold text-indigo-600 dark:text-indigo-400" @click="addCompleteTextWord">+ Add word</button>
        </div>
      </div>

      <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600 dark:bg-red-500/10 dark:text-red-400">{{ error }}</p>

      <div class="mt-2 flex justify-end gap-3">
        <button type="button" class="btn-touch rounded-xl px-4 py-2 font-semibold text-slate-500 dark:text-slate-400" @click="emit('cancel')">Cancel</button>
        <button type="button" class="btn-touch rounded-xl bg-indigo-600 px-6 py-2 font-bold text-white disabled:opacity-50" :disabled="saving || !text.trim()" @click="save">
          {{ saving ? 'Saving…' : 'Save question' }}
        </button>
      </div>
    </div>
  </div>
</template>
