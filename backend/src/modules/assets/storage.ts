import { createWriteStream } from 'node:fs'
import { chmod, open, mkdir, readdir, rm, stat, rename } from 'node:fs/promises'
import { once } from 'node:events'
import { join, resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import sharp from 'sharp'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface StoredTempFile {
  key: string
  sizeBytes: number
  checksumSha256: string
}

export interface InspectedImage {
  mimeType: 'image/png' | 'image/jpeg'
  width: number
  height: number
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff])

// Asset validation only loads the two formats accepted by the domain. Sharp's
// documented libvips operation controls provide a process-wide decoder
// allowlist; keep it next to the storage boundary so future image consumers do
// not accidentally broaden this untrusted-upload surface.
sharp.block({ operation: ['VipsForeignLoad'] })
sharp.unblock({ operation: ['VipsForeignLoadJpegFile', 'VipsForeignLoadPngFile'] })

export class AssetTooLargeError extends Error {
  constructor() {
    super('The uploaded file is too large.')
    this.name = 'AssetTooLargeError'
  }
}

export class AssetStorageMissingError extends Error {
  constructor() {
    super('The asset bytes are unavailable.')
    this.name = 'AssetStorageMissingError'
  }
}

export class AssetImageUnsupportedError extends Error {
  constructor() {
    super('The uploaded image format is unsupported.')
    this.name = 'AssetImageUnsupportedError'
  }
}

export class AssetImageInvalidError extends Error {
  constructor() {
    super('The uploaded image is invalid.')
    this.name = 'AssetImageInvalidError'
  }
}

export interface AssetStorage {
  initialize(): Promise<void>
  writeTemp(input: AsyncIterable<Uint8Array>, maxBytes: number): Promise<StoredTempFile>
  inspectImage(tempKey: string): Promise<InspectedImage>
  promote(tempKey: string): Promise<string>
  discardTemp(tempKey: string): Promise<void>
  exists(storageKey: string): Promise<boolean>
  read(storageKey: string): Promise<Readable>
  delete(storageKey: string): Promise<void>
  cleanupExpiredTemps(cutoff: Date): Promise<number>
  cleanupExpiredOrphans(knownStorageKeys: readonly string[], cutoff: Date): Promise<number>
}

export class LocalAssetStorage implements AssetStorage {
  private readonly root: string
  private readonly tempRoot: string

  constructor(storageRoot: string) {
    this.root = resolve(storageRoot)
    this.tempRoot = join(this.root, '.tmp')
  }

  async initialize() {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    await mkdir(this.tempRoot, { recursive: true, mode: 0o700 })
    await chmod(this.root, 0o700)
    await chmod(this.tempRoot, 0o700)
  }

  async writeTemp(input: AsyncIterable<Uint8Array>, maxBytes: number): Promise<StoredTempFile> {
    const key = `${randomUUID()}.tmp`
    const path = join(this.tempRoot, key)
    const output = createWriteStream(path, { flags: 'wx', mode: 0o600 })
    const hash = createHash('sha256')
    let sizeBytes = 0
    try {
      for await (const chunk of input) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        sizeBytes += bytes.byteLength
        if (sizeBytes > maxBytes) throw new AssetTooLargeError()
        hash.update(bytes)
        if (!output.write(bytes)) await once(output, 'drain')
      }
      output.end()
      await once(output, 'close')
      return { key, sizeBytes, checksumSha256: hash.digest('hex') }
    } catch (error) {
      output.destroy()
      await rm(path, { force: true })
      throw error
    }
  }

  async inspectImage(tempKey: string): Promise<InspectedImage> {
    const path = this.tempPath(tempKey)
    try {
      const signature = await this.imageSignature(path)
      if (!signature) throw new AssetImageUnsupportedError()
      const metadata = await sharp(path, { failOn: 'error' }).metadata()
      const width = metadata.width
      const height = metadata.height
      if (!width || !height) throw new AssetImageInvalidError()
      if (signature === 'png' && metadata.format === 'png') return { mimeType: 'image/png', width, height }
      if (signature === 'jpeg' && metadata.format === 'jpeg') return { mimeType: 'image/jpeg', width, height }
      throw new AssetImageInvalidError()
    } catch (error) {
      if (error instanceof AssetStorageMissingError) throw error
      if (error instanceof AssetImageUnsupportedError || error instanceof AssetImageInvalidError) throw error
      throw new AssetImageInvalidError()
    }
  }

  private async imageSignature(path: string): Promise<'png' | 'jpeg' | null> {
    let file
    try {
      file = await open(path, 'r')
      const header = Buffer.alloc(PNG_SIGNATURE.length)
      const { bytesRead } = await file.read(header, 0, header.length, 0)
      if (bytesRead >= PNG_SIGNATURE.length && header.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return 'png'
      if (bytesRead >= JPEG_SIGNATURE.length && header.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)) return 'jpeg'
      return null
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new AssetStorageMissingError()
      throw error
    } finally {
      await file?.close().catch(() => undefined)
    }
  }

  async promote(tempKey: string): Promise<string> {
    const source = this.tempPath(tempKey)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const destinationKey = randomUUID()
      const destination = this.assetPath(destinationKey)
      try {
        await rename(source, destination)
        return destinationKey
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || attempt === 2) throw error
      }
    }
    throw new Error('Unable to create an asset storage key.')
  }

  async discardTemp(tempKey: string) {
    await rm(this.tempPath(tempKey), { force: true })
  }

  async exists(storageKey: string) {
    try {
      await stat(this.assetPath(storageKey))
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw error
    }
  }

  async read(storageKey: string): Promise<Readable> {
    const path = this.assetPath(storageKey)
    let file
    try {
      file = await open(path, 'r')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new AssetStorageMissingError()
      throw error
    }
    const stream = file.createReadStream()
    stream.once('close', () => void file.close().catch(() => undefined))
    stream.once('error', () => void file.close().catch(() => undefined))
    return stream
  }

  async delete(storageKey: string) {
    await rm(this.assetPath(storageKey), { force: true })
  }

  async cleanupExpiredTemps(cutoff: Date): Promise<number> {
    let removed = 0
    for (const entry of await readdir(this.tempRoot)) {
      if (!entry.endsWith('.tmp') || !UUID.test(entry.slice(0, -4))) continue
      const path = this.tempPath(entry)
      try {
        const details = await stat(path)
        if (details.mtime < cutoff) {
          await rm(path, { force: true })
          removed += 1
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    return removed
  }

  async cleanupExpiredOrphans(knownStorageKeys: readonly string[], cutoff: Date): Promise<number> {
    const known = new Set(knownStorageKeys)
    let removed = 0
    for (const entry of await readdir(this.root)) {
      if (!UUID.test(entry) || known.has(entry)) continue
      const path = this.assetPath(entry)
      try {
        const details = await stat(path)
        if (details.isFile() && details.mtime < cutoff) {
          await rm(path, { force: true })
          removed += 1
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    return removed
  }

  private tempPath(key: string) {
    if (!/^[0-9a-f-]{36}\.tmp$/i.test(key) || !UUID.test(key.slice(0, -4))) throw new Error('Invalid temporary storage key.')
    return join(this.tempRoot, key)
  }

  private assetPath(key: string) {
    if (!UUID.test(key)) throw new Error('Invalid asset storage key.')
    return join(this.root, key)
  }
}
