import { describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import ExcelJS from 'exceljs'
import { normalizeProspectName, parseProspectWorkbook, prospectDomain } from '../src/modules/prospects/import.js'
import { lockCompany, prospectCompanyLockKeys } from '../src/modules/prospects/service.js'

async function workbookBuffer(rows: unknown[][]) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Prospects')
  rows.forEach((row) => sheet.addRow(row))
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

describe('prospect tenant advisory lock', () => {
  it('uses the supported integer/integer transaction lock signature with deterministic signed 32-bit keys', async () => {
    const companyId = 'f1234567-89ab-cdef-0123-456789abcdef'
    const keys = prospectCompanyLockKeys(companyId)
    expect(keys).toEqual(prospectCompanyLockKeys(companyId))
    expect(keys).not.toEqual(prospectCompanyLockKeys('01234567-89ab-cdef-0123-456789abcdef'))
    for (const key of keys) expect(Number.isInteger(key) && key >= -2147483648 && key <= 2147483647).toBe(true)

    const queryRaw = vi.fn().mockResolvedValue([])
    await lockCompany({ $queryRaw: queryRaw } as unknown as Prisma.TransactionClient, companyId)
    const [template, ...values] = queryRaw.mock.calls[0] ?? []
    expect(Array.isArray(template)).toBe(true)
    expect((template as string[]).join('?')).toMatch(/SELECT\s+1::integer AS acquired\s+FROM pg_advisory_xact_lock\(\?::integer,\s*\?::integer\)/i)
    expect(values).toEqual(keys)
  })
})

describe('prospect workbook parser', () => {
  it('maps common column names and keeps user supplied optional data', async () => {
    const parsed = await parseProspectWorkbook(await workbookBuffer([
      ['Organization', 'Sector', 'Company Website', 'Employees', 'PIC', 'Email', 'Remarks'],
      ['Synthetic Works', 'Manufacturing', 'synthetic.example', 42, 'A Person', 'person@example.test', 'Fixture only'],
    ]))
    expect(parsed.rows).toEqual([{ rowNumber: 2, errors: [], data: { name: 'Synthetic Works', industry: 'Manufacturing', website: 'https://synthetic.example', employeeCount: 42, contactName: 'A Person', contactEmail: 'person@example.test', notes: 'Fixture only' } }])
  })

  it('keeps malformed rows visible with explanations and requires a company name header', async () => {
    const parsed = await parseProspectWorkbook(await workbookBuffer([['Company Name', 'Employee Count', 'Email'], ['Broken Row', 'many', 'not-an-email']]))
    expect(parsed.rows[0]?.errors).toEqual(['Employee count must be a non-negative whole number.', 'Contact email is not valid.'])
    const unmapped = await parseProspectWorkbook(await workbookBuffer([['Sector'], ['Technology']]))
    expect(unmapped.mapping.name).toBeUndefined()
    expect(unmapped.rows[0]?.errors).toContain('Map a worksheet column to Company name to import this row.')
  })

  it('recognizes Indonesian headers and accepts explicit column mappings', async () => {
    const indonesian = await parseProspectWorkbook(await workbookBuffer([['Nama Perusahaan', 'Bidang Usaha', 'Jumlah Karyawan'], ['Contoh Nusantara', 'Logistik', 120]]))
    expect(indonesian.rows[0]?.data).toEqual({ name: 'Contoh Nusantara', industry: 'Logistik', employeeCount: 120 })
    const mapped = await parseProspectWorkbook(await workbookBuffer([['Target', 'Vertical'], ['Mapped Example', 'Energy']]), { name: 1, industry: 2 })
    expect(mapped.rows[0]?.data).toEqual({ name: 'Mapped Example', industry: 'Energy' })
  })

  it('rejects non-XLSX bytes, never evaluates formulas, and normalizes duplicate identifiers', async () => {
    await expect(parseProspectWorkbook(Buffer.from('not an xlsx'))).rejects.toThrow('not a valid .xlsx')
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Formula'); sheet.addRow(['Company']); sheet.addRow([{ formula: '1+1', result: 2 }])
    const parsed = await parseProspectWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()))
    expect(parsed.rows[0]?.errors).toContain('Formula cells are not accepted.')
    expect(normalizeProspectName('  ACME—Group, Ltd. ')).toBe('acme group ltd')
    expect(prospectDomain('https://www.example.test/path')).toBe('example.test')
  })
})
