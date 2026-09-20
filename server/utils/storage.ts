import { randomUUID } from 'node:crypto'
import { PutObjectCommand, S3Client, type ObjectCannedACL } from '@aws-sdk/client-s3'

/**
 * Object storage for uploaded question images, backed by any S3-compatible
 * service (RustFS, MinIO, AWS S3, ...). Configured entirely via env vars so
 * no code changes are needed to point at a different bucket/endpoint.
 */

const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // 8MB

const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
}

let client: S3Client | null = null

function getConfig() {
  const endpoint = process.env.RUSTFS_ENDPOINT
  const bucket = process.env.RUSTFS_BUCKET
  const accessKeyId = process.env.RUSTFS_ACCESS_KEY_ID
  const secretAccessKey = process.env.RUSTFS_SECRET_ACCESS_KEY
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null
  return {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    region: process.env.RUSTFS_REGION || 'us-east-1',
    forcePathStyle: process.env.RUSTFS_FORCE_PATH_STYLE !== 'false',
    // Some S3-compatible services (and AWS S3 with bucket-owner-enforced
    // ownership) reject the ACL param entirely; set RUSTFS_ACL='' to omit it.
    acl: process.env.RUSTFS_ACL ?? 'public-read',
    // Base URL images are served from once uploaded. Defaults to path-style
    // access on the endpoint itself; override if a CDN sits in front of it.
    publicUrl: (process.env.RUSTFS_PUBLIC_URL || `${endpoint.replace(/\/$/, '')}/${bucket}`).replace(/\/$/, '')
  }
}

export function isStorageConfigured(): boolean {
  return getConfig() !== null
}

function getClient(config: NonNullable<ReturnType<typeof getConfig>>): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    })
  }
  return client
}

export function extensionForContentType(contentType: string): string | null {
  return ALLOWED_CONTENT_TYPES[contentType] ?? null
}

export { MAX_IMAGE_BYTES }

/** Uploads an image buffer and returns its public URL. */
export async function uploadQuestionImage(buffer: Buffer, contentType: string): Promise<string> {
  const config = getConfig()
  if (!config) {
    throw createError({ statusCode: 501, statusMessage: 'Image storage is not configured' })
  }
  const ext = extensionForContentType(contentType)
  if (!ext) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported image type' })
  }
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'Image is too large (max 8MB)' })
  }

  const key = `question-images/${randomUUID()}.${ext}`
  const s3 = getClient(config)
  await s3.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ...(config.acl ? { ACL: config.acl as ObjectCannedACL } : {})
    })
  )
  return `${config.publicUrl}/${key}`
}
