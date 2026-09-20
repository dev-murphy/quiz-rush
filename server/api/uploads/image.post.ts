import { requireGameMaster } from '../../utils/auth'
import { extensionForContentType, uploadQuestionImage } from '../../utils/storage'

export default defineEventHandler(async (event) => {
  requireGameMaster(event)

  const parts = await readMultipartFormData(event)
  const file = parts?.find((part) => part.name === 'file')
  if (!file || !file.data?.length) {
    throw createError({ statusCode: 400, statusMessage: 'No image file provided' })
  }

  const contentType = file.type ?? ''
  if (!extensionForContentType(contentType)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported image type. Use PNG, JPEG, WEBP or GIF.' })
  }

  const url = await uploadQuestionImage(file.data, contentType)
  return { url }
})
