import type { BingoConfig } from '#shared/types'

const VALID_WIN_PATTERNS: BingoConfig['winPattern'][] = ['LINE', 'BLACKOUT']

function bad(message: string): never {
  throw createError({ statusCode: 400, statusMessage: message })
}

export function validateBingoConfigInput(body: {
  gridSize?: number
  freeSpace?: boolean
  winPattern?: string
  winPoints?: number
}): BingoConfig {
  const gridSize = Number(body.gridSize)
  if (!Number.isInteger(gridSize) || gridSize < 3 || gridSize > 7) {
    bad('Grid size must be an integer between 3 and 7')
  }
  if (typeof body.freeSpace !== 'boolean') bad('Free space must be true or false')
  if (!body.winPattern || !VALID_WIN_PATTERNS.includes(body.winPattern as BingoConfig['winPattern'])) {
    bad('Win pattern must be LINE or BLACKOUT')
  }
  const winPoints = Number(body.winPoints)
  if (!Number.isFinite(winPoints) || winPoints < 0 || winPoints > 10000) {
    bad('Win points must be between 0 and 10000')
  }
  return { gridSize, freeSpace: body.freeSpace!, winPattern: body.winPattern as BingoConfig['winPattern'], winPoints }
}

export function validateBingoItemTexts(texts: unknown): string[] {
  if (!Array.isArray(texts) || texts.length === 0) bad('Provide at least one item')
  const cleaned = texts.map((t) => String(t ?? '').trim()).filter(Boolean)
  if (cleaned.length === 0) bad('Items cannot be empty')
  return cleaned
}
