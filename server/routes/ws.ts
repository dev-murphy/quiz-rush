import type { ClientMessage, Game } from '#shared/types'
import { GM_COOKIE, parseCookieHeader, playerCookieName } from '../utils/auth'
import { buildBingoFullSyncState, claimBingo } from '../utils/bingoEngine'
import { buildCatchupSyncForMaster } from '../utils/catchupEngine'
import { buildFullSyncState, submitAnswer } from '../utils/gameEngine'
import {
  getGame,
  getGameByPin,
  getPlayer,
  getPlayerByToken,
  isValidSession,
  setPlayerConnected
} from '../utils/repo'
import { broadcast, getPeerMeta, registerPeer, sendMessage, unregisterPeer } from '../utils/wsRegistry'

function buildSyncState(game: Game, playerId: string | null) {
  return game.gameType === 'BINGO' ? buildBingoFullSyncState(game.id, playerId) : buildFullSyncState(game.id, playerId)
}

export default defineWebSocketHandler({
  open(peer) {
    try {
      const req = peer.request as Request
      const url = new URL(req.url)
      const role = url.searchParams.get('role')
      const cookies = parseCookieHeader(req.headers.get('cookie'))

      if (role === 'master') {
        const gameId = url.searchParams.get('gameId')
        const token = cookies[GM_COOKIE]
        if (!gameId || !isValidSession(token)) {
          sendMessage(peer, { type: 'ERROR', message: 'Unauthorized' })
          peer.close()
          return
        }
        const game = getGame(gameId)
        if (!game) {
          sendMessage(peer, { type: 'ERROR', message: 'Game not found' })
          peer.close()
          return
        }
        registerPeer(peer, { role: 'master', gameId })
        const state = buildSyncState(game, null)
        if (state) sendMessage(peer, { type: 'STATE_SYNC', state })
        if (game.gameType === 'QUIZ') {
          sendMessage(peer, { type: 'CATCHUP_SYNC', payload: buildCatchupSyncForMaster(gameId) })
        }
        return
      }

      if (role === 'player') {
        const pin = url.searchParams.get('pin')
        if (!pin) {
          sendMessage(peer, { type: 'ERROR', message: 'Missing game PIN' })
          peer.close()
          return
        }
        const game = getGameByPin(pin)
        if (!game) {
          sendMessage(peer, { type: 'ERROR', message: 'Game not found' })
          peer.close()
          return
        }
        const token = cookies[playerCookieName(pin)]
        const player = token ? getPlayerByToken(token) : null
        if (!player || player.gameId !== game.id) {
          sendMessage(peer, { type: 'ERROR', message: 'You have not joined this game' })
          peer.close()
          return
        }
        registerPeer(peer, { role: 'player', gameId: game.id, playerId: player.id })
        setPlayerConnected(player.id, true)
        const updated = getPlayer(player.id)
        if (updated) broadcast(game.id, { type: 'PLAYER_UPDATED', player: updated }, peer)
        const state = buildSyncState(game, player.id)
        if (state) sendMessage(peer, { type: 'STATE_SYNC', state })
        return
      }

      sendMessage(peer, { type: 'ERROR', message: 'Invalid connection role' })
      peer.close()
    } catch {
      peer.close()
    }
  },

  message(peer, message) {
    const meta = getPeerMeta(peer)
    if (!meta) return

    let parsed: ClientMessage
    try {
      parsed = JSON.parse(message.text())
    } catch {
      return
    }

    if (parsed.type === 'PING') {
      sendMessage(peer, { type: 'PONG' })
      return
    }

    if (meta.role !== 'player' || !meta.playerId) return

    if (parsed.type === 'ANSWER_SUBMIT') {
      const player = getPlayer(meta.playerId)
      if (!player) return
      submitAnswer(meta.gameId, player, parsed.questionId, parsed.answer)
    }

    if (parsed.type === 'BINGO_CLAIM') {
      const player = getPlayer(meta.playerId)
      if (!player) return
      claimBingo(meta.gameId, player)
    }
  },

  close(peer) {
    const meta = unregisterPeer(peer)
    if (meta?.role === 'player' && meta.playerId) {
      setPlayerConnected(meta.playerId, false)
      const player = getPlayer(meta.playerId)
      if (player) broadcast(meta.gameId, { type: 'PLAYER_UPDATED', player })
    }
  }
})
