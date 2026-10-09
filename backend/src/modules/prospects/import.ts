import ExcelJS from 'exceljs'
import { badRequest } from '../../shared/errors/AppError.js'

export interface ProspectFields {
  name: string
  industry?: string
  website?: string
  address?: string
  employeeCount?: number
  employeeSize?: string
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  notes?: string
}

export interface ProspectImportRow extends ProspectFields { rowNumber: number }
export type ImportField = keyof ProspectFields

export interface ParsedImportRow {
  rowNumber: number
  data: ProspectFields | null
  errors: string[]
}

export interface ParsedWorkbook {
  headers: { column: number; label: string }[]
  mapping: Partial<Record<ImportField, number>>
  rows: ParsedImportRow[]
}

export const prospectImportFields: ImportField[] = ['name', 'industry', 'website', 'address', 'employeeCount', 'employeeSize', 'contactName', 'contactEmail', 'contactPhone', 'notes']
export const prospectImportLabels: Record<ImportField, string> = {
  name: 'Company name', industry: 'Industry / sector', website: 'Website', address: 'Address', employeeCount: 'Employee count', employeeSize: 'Employee size',
  contactName: 'Contact name', contactEmail: 'Contact email', contactPhone: 'Contact phone', notes: 'Notes',
}
const aliases: Record<ImportField, string[]> = {
  name: ['company', 'company name', 'organization', 'organisation', 'business name', 'prospect', 'name', 'nama perusahaan', 'nama usaha', 'perusahaan'],
  industry: ['industry', 'sector', 'business sector', 'vertical', 'industri', 'sektor industri', 'bidang usaha', 'sektor'],
  website: ['website', 'web site', 'url', 'company website', 'domain', 'situs web', 'laman web', 'website perusahaan'],
  address: ['address', 'company address', 'location', 'street address', 'alamat', 'alamat perusahaan', 'lokasi'],
  employeeCount: ['employee count', 'employees', 'number of employees', 'staff count', 'headcount', 'jumlah karyawan', 'jumlah pegawai', 'karyawan'],
  employeeSize: ['employee size', 'company size', 'size range', 'staff size', 'ukuran perusahaan', 'skala perusahaan'],
  contactName: ['contact name', 'person', 'contact person', 'pic', 'person in charge', 'nama kontak', 'nama narahubung', 'narahubung'],
  contactEmail: ['contact email', 'email', 'e mail', 'email address', 'email kontak', 'surel'],
  contactPhone: ['contact phone', 'phone', 'telephone', 'mobile', 'phone number', 'telepon', 'nomor telepon', 'nomor hp', 'ponsel'],
  notes: ['notes', 'note', 'remarks', 'comment', 'description', 'catatan', 'keterangan', 'informasi tambahan'],
}

function normalizedHeader(value: string) {
  return value.toLowerCase().trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    const cell = value as unknown as Record<string, unknown>
    if ('formula' in cell || 'sharedFormula' in cell) throw new Error('Formula cells are not accepted.')
    if ('text' in cell) return String(cell.text ?? '').trim()
    if ('richText' in cell && Array.isArray(cell.richText)) return cell.richText.map((part: { text?: string }) => part.text ?? '').join('').trim()
    if ('hyperlink' in cell) return String(cell.text ?? cell.hyperlink).trim()
    if ('result' in cell) return String(cell.result ?? '').trim()
  }
  return String(value).trim()
}

function validateZipEnvelope(buffer: Buffer) {
  if (buffer.length < 22) throw badRequest('The uploaded file is not a valid .xlsx workbook.')
  const searchStart = Math.max(0, buffer.length - 65_557)
  let eocd = -1
  for (let offset = buffer.length - 22; offset >= searchStart; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break }
  }
  if (eocd < 0) throw badRequest('The uploaded file is not a valid .xlsx workbook.')
  const disk = buffer.readUInt16LE(eocd + 4)
  const centralDisk = buffer.readUInt16LE(eocd + 6)
  const diskEntries = buffer.readUInt16LE(eocd + 8)
  const entries = buffer.readUInt16LE(eocd + 10)
  const centralSize = buffer.readUInt32LE(eocd + 12)
  const centralOffset = buffer.readUInt32LE(eocd + 16)
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entries || entries > 1000 || centralOffset + centralSize > eocd) throw badRequest('The workbook archive structure is not supported.')
  let offset = centralOffset
  let expandedBytes = 0
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > eocd || buffer.readUInt32LE(offset) !== 0x02014b50) throw badRequest('The workbook archive structure is not supported.')
    const flags = buffer.readUInt16LE(offset + 8)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const expandedSize = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    if ((flags & 1) !== 0 || compressedSize === 0xffffffff || expandedSize === 0xffffffff) throw badRequest('Encrypted or ZIP64 workbooks are not supported.')
    expandedBytes += expandedSize
    if (expandedBytes > 50 * 1024 * 1024) throw badRequest('The workbook expands beyond the 50 MiB safety limit.')
    offset += 46 + nameLength + extraLength + commentLength
    if (offset > eocd) throw badRequest('The workbook archive structure is not supported.')
  }
  if (offset !== centralOffset + centralSize) throw badRequest('The workbook archive structure is not supported.')
}

export async function parseProspectWorkbook(buffer: Buffer, customMapping?: Record<string, unknown>): Promise<ParsedWorkbook> {
  if (buffer.length < 4 || buffer.subarray(0, 2).toString() !== 'PK') throw badRequest('The uploaded file is not a valid .xlsx workbook.')
  validateZipEnvelope(buffer)
  const workbook = new ExcelJS.Workbook()
  try { await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]) } catch { throw badRequest('The uploaded workbook could not be read. Ensure it is a valid, unencrypted .xlsx file.') }
  const sheet = workbook.worksheets[0]
  if (!sheet) throw badRequest('The workbook does not contain a worksheet.')
  if (sheet.rowCount > 5001 || sheet.columnCount > 100) throw badRequest('The workbook exceeds the limit of 5,000 data rows or 100 columns.')
  const headerRow = sheet.getRow(1)
  const suggested: Partial<Record<ImportField, number>> = {}
  for (let column = 1; column <= sheet.columnCount; column += 1) {
    const header = normalizedHeader(cellText(headerRow.getCell(column).value))
    for (const field of prospectImportFields) {
      if (aliases[field].includes(header) && suggested[field] === undefined) suggested[field] = column
    }
  }
  const headers = Array.from({ length: sheet.columnCount }, (_, index) => ({ column: index + 1, label: cellText(headerRow.getCell(index + 1).value) })).filter((header) => header.label)
  const mapping = customMapping ? {} as Partial<Record<ImportField, number>> : { ...suggested }
  if (customMapping) {
    for (const [key, value] of Object.entries(customMapping)) {
      if (!prospectImportFields.includes(key as ImportField)) throw badRequest(`Unknown import mapping field: ${key}.`)
      if (value === '' || value === null || value === undefined) continue
      if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > sheet.columnCount) throw badRequest(`Import mapping for ${key} refers to an invalid column.`)
      mapping[key as ImportField] = Number(value)
    }
    const selectedColumns = Object.values(mapping)
    if (new Set(selectedColumns).size !== selectedColumns.length) throw badRequest('Each workbook column can map to only one prospect field.')
  }

  const rows: ParsedImportRow[] = []
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    if ((row.values as ExcelJS.CellValue[]).slice(1).every((value) => value === null || value === undefined || value === '')) continue
    const errors: string[] = []
    const values: Partial<ProspectFields> = {}
    for (const [field, column] of Object.entries(mapping) as [ImportField, number][]) {
      let value: string
      try { value = cellText(row.getCell(column).value) } catch (error) { errors.push(error instanceof Error ? error.message : 'Invalid formula cell.'); continue }
      if (!value) continue
      if (field === 'employeeCount') {
        const count = Number(value.replace(/[, ]/g, ''))
        if (!Number.isInteger(count) || count < 0) errors.push('Employee count must be a non-negative whole number.')
        else values.employeeCount = count
      } else Object.assign(values, { [field]: value })
    }
    if (!mapping.name) errors.push('Map a worksheet column to Company name to import this row.')
    if (!values.name?.trim()) errors.push('Company name is required.')
    if (values.name && values.name.length > 240) errors.push('Company name must be 240 characters or fewer.')
    if (values.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contactEmail)) errors.push('Contact email is not valid.')
    if (values.website && !/^https?:\/\//i.test(values.website)) values.website = `https://${values.website}`
    if (values.website && !/^https?:\/\/[^\s./]+(?:\.[^\s./]+)+(?:[/:?#][^\s]*)?$/i.test(values.website)) errors.push('Website must be a valid web address or domain.')
    rows.push({ rowNumber, data: errors.length ? null : values as ProspectFields, errors })
  }
  return { headers, mapping, rows }
}

export function normalizeProspectName(name: string) {
  return name.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export function prospectDomain(website?: string) {
  if (!website) return null
  try { return new URL(website).hostname.toLowerCase().replace(/^www\./, '') } catch { return null }
}
