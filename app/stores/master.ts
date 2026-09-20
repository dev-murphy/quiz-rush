import { defineStore } from 'pinia'
import type { Game } from '#shared/types'

export interface GameListItem extends Game {
  questionCount: number
  itemCount: number
}

export const useMasterStore = defineStore('master', () => {
  const authenticated = ref<boolean | null>(null)
  const games = ref<GameListItem[]>([])

  async function checkAuth() {
    const res = await $fetch<{ authenticated: boolean }>('/api/auth/me')
    authenticated.value = res.authenticated
    return res.authenticated
  }

  async function login(username: string, password: string) {
    await $fetch('/api/auth/login', { method: 'POST', body: { username, password } })
    authenticated.value = true
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    authenticated.value = false
  }

  async function fetchGames() {
    const fetcher = useAuthedFetch()
    games.value = await fetcher<GameListItem[]>('/api/games')
  }

  return { authenticated, games, checkAuth, login, logout, fetchGames }
})
