import { requireGameMaster } from '../../../../../utils/auth'
import { deleteBingoItem } from '../../../../../utils/repo'

export default defineEventHandler((event) => {
  requireGameMaster(event)
  const itemId = getRouterParam(event, 'itemId')!
  deleteBingoItem(itemId)
  return { ok: true }
})
