export interface CanvaReadyExportInput {
  referenceId: string
  hero: Blob
  width: number
  height: number
  headline: string
  subtitle: string
  cta: string
  eyebrow: string
  heroX: number
  heroY: number
  heroScale: number
  textX: number
  textY: number
}

export async function createCanvaReadyZip(input: CanvaReadyExportInput): Promise<Blob> {
  const background = `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}"><defs><linearGradient id="bg" x1="0" y1="0" x2="0.32" y2="1"><stop stop-color="#fff"/><stop offset=".56" stop-color="#fff"/><stop offset="1" stop-color="#e8f0ff"/></linearGradient><radialGradient id="glow"><stop stop-color="#3279e7" stop-opacity=".14"/><stop offset="1" stop-color="#3279e7" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#bg)"/><circle cx="${Math.round(input.width * .76)}" cy="${Math.round(input.height * .68)}" r="${Math.round(input.width * .38)}" fill="url(#glow)"/></svg>`
  const decor = `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}"><circle cx="${input.width * .76}" cy="${input.height * .73}" r="${input.width * .21}" fill="#eaf1ff" fill-opacity=".44" stroke="#1363df" stroke-opacity=".16" stroke-width="${Math.max(1, input.width * .0055)}"/><g fill="none" stroke="#1363df" stroke-opacity=".2"><path d="M${input.width * .08} ${input.height * .91}h${input.width * .16}" stroke-width="3"/><path d="M${input.width * .08} ${input.height * .93}h${input.width * .1}" stroke-width="2"/><path d="M${input.width * .87} ${input.height * .11}h${input.width * .045}M${input.width * .8925} ${input.height * .095}v${input.height * .03}" stroke-width="2"/></g><circle cx="${input.width * .09}" cy="${input.height * .09}" r="${input.width * .011}" fill="#1363df" fill-opacity=".72"/><circle cx="${input.width * .13}" cy="${input.height * .09}" r="${input.width * .006}" fill="#3279e7" fill-opacity=".48"/></svg>`
  const typography = { eyebrow: input.eyebrow, headline: input.headline, subtitle: input.subtitle, cta: input.cta, fontFamily: 'Inter, sans-serif', headlineFontSize: Math.round(input.width * .067), bodyFontSize: Math.round(input.width * .032), color: '#151B2D', accentColor: '#1363DF', alignment: 'left', position: { xPercent: input.textX, yPercent: input.textY }, layout: { illustration: { xPercent: input.heroX, yPercent: input.heroY, heightPercent: input.heroScale * 100 }, hierarchy: ['eyebrow', 'headline', 'subtitle', 'cta'], style: 'clean editorial hierarchy with compact copy above a stylized lower-right illustration and generous negative space' }, note: 'Text remains separate and editable in Canva. For carousel slides, the headline is slide-specific and the CTA appears only on the final slide.' }
  const preview = await composePreview(input, background, decor, typography)
  const manifest = { sourceReferenceId: input.referenceId, width: input.width, height: input.height, assets: ['assets/hero-object.png', 'assets/background.svg', 'assets/decorative-shapes.svg', 'typography.json', 'preview.png'], generation: 'one existing GPT image request; transparent hero illustration', limitations: ['Programmatic SVG decoration is a separate editable design layer and does not reproduce GPT artwork.', 'Preview text uses browser canvas rendering; edit the supplied typography natively in Canva.'], createdAt: new Date().toISOString() }
  return createStoredZip([
    { name: 'assets/hero-object.png', data: new Uint8Array(await input.hero.arrayBuffer()) },
    { name: 'assets/background.svg', data: new TextEncoder().encode(background) },
    { name: 'assets/decorative-shapes.svg', data: new TextEncoder().encode(decor) },
    { name: 'typography.json', data: new TextEncoder().encode(JSON.stringify(typography, null, 2)) },
    { name: 'preview.png', data: new Uint8Array(await preview.arrayBuffer()) },
    { name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) },
  ])
}

async function composePreview(input: CanvaReadyExportInput, background: string, decor: string, typography: object) {
  const canvas = document.createElement('canvas')
  canvas.width = input.width
  canvas.height = input.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas preview is unavailable in this browser.')
  const bg = await loadImage(svgUrl(background))
  context.drawImage(bg, 0, 0, input.width, input.height)
  const deco = await loadImage(svgUrl(decor))
  context.drawImage(deco, 0, 0, input.width, input.height)
  const heroUrl = URL.createObjectURL(input.hero)
  try {
    const hero = await loadImage(heroUrl)
    const scale = Math.min(input.width / hero.width, input.height / hero.height) * input.heroScale
    context.drawImage(hero, input.width * input.heroX / 100, input.height * input.heroY / 100, hero.width * scale, hero.height * scale)
  } finally { URL.revokeObjectURL(heroUrl) }
  const spec = typography as { headline: string; subtitle: string; cta: string; fontFamily: string; headlineFontSize: number; bodyFontSize: number; color: string; accentColor: string }
  const extended = typography as typeof typography & { eyebrow: string }
  const x = input.width * input.textX / 100
  let y = input.height * input.textY / 100
  context.fillStyle = spec.accentColor
  context.textAlign = 'left'
  context.font = `700 ${Math.round(input.width * .022)}px ${spec.fontFamily}`
  context.fillText(extended.eyebrow.toUpperCase(), x, y)
  y += Math.round(input.width * .058)
  context.fillStyle = spec.color
  context.textAlign = 'left'
  context.font = `700 ${spec.headlineFontSize}px ${spec.fontFamily}`
  y = wrapText(context, spec.headline, x, y, input.width * .82, spec.headlineFontSize * 1.08) + spec.headlineFontSize * .3
  context.fillStyle = '#4b5568'
  context.font = `400 ${spec.bodyFontSize}px ${spec.fontFamily}`
  y = wrapText(context, spec.subtitle, x, y, input.width * .72, spec.bodyFontSize * 1.42) + spec.bodyFontSize * .65
  if (spec.cta) {
    context.fillStyle = spec.accentColor
    context.font = `600 ${spec.bodyFontSize}px ${spec.fontFamily}`
    wrapText(context, spec.cta, x, y, input.width * .66, spec.bodyFontSize * 1.35)
  }
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not render the PNG preview.')), 'image/png'))
}

function wrapText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(/\s+/).filter(Boolean)
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (line && context.measureText(next).width > maxWidth) { context.fillText(line, x, y); line = word; y += lineHeight }
    else line = next
  }
  if (line) { context.fillText(line, x, y); y += lineHeight }
  return y
}

function svgUrl(svg: string) { return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })) }
function loadImage(src: string) { return new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => { if (src.startsWith('blob:')) URL.revokeObjectURL(src); resolve(image) }; image.onerror = () => { if (src.startsWith('blob:')) URL.revokeObjectURL(src); reject(new Error('Could not render a Canva-ready preview layer.')) }; image.src = src }) }

interface ZipEntry { name: string; data: Uint8Array }
export function createStoredZip(entries: ZipEntry[]) {
  const encoder = new TextEncoder()
  const local: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const header = zipHeader(30 + name.length)
    const view = new DataView(header.buffer)
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x800, true); view.setUint16(8, 0, true)
    view.setUint32(14, crc, true); view.setUint32(18, entry.data.length, true); view.setUint32(22, entry.data.length, true); view.setUint16(26, name.length, true)
    header.set(name, 30); local.push(header, entry.data)
    const directory = zipHeader(46 + name.length); const dir = new DataView(directory.buffer)
    dir.setUint32(0, 0x02014b50, true); dir.setUint16(4, 20, true); dir.setUint16(6, 20, true); dir.setUint16(8, 0x800, true); dir.setUint16(10, 0, true)
    dir.setUint32(16, crc, true); dir.setUint32(20, entry.data.length, true); dir.setUint32(24, entry.data.length, true); dir.setUint16(28, name.length, true); dir.setUint32(42, offset, true)
    directory.set(name, 46); central.push(directory); offset += header.length + entry.data.length
  }
  const centralSize = central.reduce((total, entry) => total + entry.length, 0)
  const end = zipHeader(22); const endView = new DataView(end.buffer); endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, entries.length, true); endView.setUint16(10, entries.length, true); endView.setUint32(12, centralSize, true); endView.setUint32(16, offset, true)
  const parts = [...local, ...central, end]
  const totalSize = parts.reduce((total, part) => total + part.byteLength, 0)
  const archive = new Uint8Array(totalSize)
  let cursor = 0
  for (const part of parts) { archive.set(part, cursor); cursor += part.byteLength }
  return new Blob([archive.buffer], { type: 'application/zip' })
}
function zipHeader(length: number) { return new Uint8Array(length) }
function crc32(bytes: Uint8Array) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0) } return (crc ^ 0xffffffff) >>> 0 }
