import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const SELLSY_TOKEN_URL = 'https://login.sellsy.com/oauth2/access-tokens'
const SELLSY_API       = 'https://api.sellsy.com/v2'
const BASE             = process.env.AIRTABLE_BASE_ID!
const TABLE            = process.env.AIRTABLE_SELLSY_CACHE_TABLE!
const AT_KEY           = process.env.AIRTABLE_API_KEY!

// ─── OAuth token ──────────────────────────────────────────────────────────────
async function getSellsyToken(): Promise<string> {
  const params = new URLSearchParams()
  params.set('grant_type',    'client_credentials')
  params.set('client_id',     process.env.SELLSY_CLIENT_ID!)
  params.set('client_secret', process.env.SELLSY_CLIENT_SECRET!)

  const res = await fetch(SELLSY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  if (!res.ok) throw new Error(`Sellsy token error: ${await res.text()}`)
  const d = await res.json() as { access_token: string }
  return d.access_token
}

// ─── Fetch toutes les factures payées (paginé) ────────────────────────────────
interface SellsyInvoice {
  id: number
  number: string
  subject: string
  date: string
  amounts: { total_excl_tax: string }
}

async function fetchAllPaidInvoices(token: string): Promise<SellsyInvoice[]> {
  const all: SellsyInvoice[] = []
  let offset = 0
  const limit = 100

  while (true) {
    const res = await fetch(
      `${SELLSY_API}/invoices/search?limit=${limit}&offset=${offset}&order=date&direction=desc`,
      {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filters: { status: ['paid'] },
        }),
      }
    )
    if (!res.ok) throw new Error(`Sellsy invoices error: ${await res.text()}`)
    const d = await res.json() as {
      data: SellsyInvoice[]
      pagination: { total: number }
    }
    all.push(...d.data)
    if (all.length >= d.pagination.total) break
    offset += limit
  }

  return all
}

// ─── Fetch détail d'une facture pour lire les lignes ─────────────────────────
interface InvoiceRow {
  type: string
  reference?: string
}

async function fetchInvoiceRows(token: string, id: number): Promise<InvoiceRow[]> {
  try {
    const res = await fetch(`${SELLSY_API}/invoices/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return []
    const d = await res.json() as { rows?: InvoiceRow[] }
    return d.rows || []
  } catch {
    return []
  }
}

// Détecte si une facture est une caution via ses lignes (référence commence par CAU)
async function isCaution(token: string, id: number): Promise<boolean> {
  const rows = await fetchInvoiceRows(token, id)
  return rows.some(r => (r.reference || '').toUpperCase().startsWith('CAU'))
}

// ─── Agrégation par mois ──────────────────────────────────────────────────────
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
    .replace('.', '')
}

interface MonthData {
  month: string
  label: string
  nb: number
  total_ht: number
}

interface CacheData {
  ca:      { monthly: MonthData[]; total_ht: number; nb: number }
  caution: { monthly: MonthData[]; total_ht: number; nb: number }
  last_updated: string
}

async function aggregate(token: string, invoices: SellsyInvoice[]): Promise<CacheData> {
  const caMap  = new Map<string, MonthData>()
  const cauMap = new Map<string, MonthData>()

  // Appels séquentiels avec 800ms entre chaque pour respecter le rate limit Sellsy
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

  for (let i = 0; i < invoices.length; i++) {
    const inv = invoices[i]
    const cau = await isCaution(token, inv.id)
    if (i < invoices.length - 1) await sleep(800)

    const mois = inv.date.slice(0, 7)
    const ht   = parseFloat(inv.amounts?.total_excl_tax || '0') || 0
    const map  = cau ? cauMap : caMap

    if (!map.has(mois)) {
      map.set(mois, { month: mois, label: monthLabel(mois), nb: 0, total_ht: 0 })
    }
    const row = map.get(mois)!
    row.nb       += 1
    row.total_ht += ht
  }

  const sortDesc = (a: MonthData, b: MonthData) => b.month.localeCompare(a.month)
  const caMonthly  = Array.from(caMap.values()).sort(sortDesc)
  const cauMonthly = Array.from(cauMap.values()).sort(sortDesc)

  return {
    ca: {
      monthly:  caMonthly,
      total_ht: caMonthly.reduce((s, r) => s + r.total_ht, 0),
      nb:       caMonthly.reduce((s, r) => s + r.nb, 0),
    },
    caution: {
      monthly:  cauMonthly,
      total_ht: cauMonthly.reduce((s, r) => s + r.total_ht, 0),
      nb:       cauMonthly.reduce((s, r) => s + r.nb, 0),
    },
    last_updated: new Date().toISOString(),
  }
}

// ─── Sauvegarder dans Airtable ────────────────────────────────────────────────
async function saveToAirtable(data: CacheData): Promise<void> {
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const res = await fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${AT_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      records: [{
        fields: {
          cache_date: now,
          cache_data: JSON.stringify(data),
          cache_type: 'sellsy',
        }
      }]
    }),
  })
  if (!res.ok) throw new Error(`Airtable save error: ${await res.text()}`)
}

// ─── Nettoyage anciens caches (garde les 10 derniers) ─────────────────────────
async function cleanOldCache(): Promise<void> {
  const url = `https://api.airtable.com/v0/${BASE}/${TABLE}?sort[0][field]=cache_date&sort[0][direction]=desc&pageSize=100`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AT_KEY}` } })
  if (!res.ok) return
  const d = await res.json() as { records: { id: string }[] }
  const toDelete = d.records.slice(10).map(r => r.id)
  if (!toDelete.length) return

  // Supprimer par batch de 10
  for (let i = 0; i < toDelete.length; i += 10) {
    const ids = toDelete.slice(i, i + 10).map(id => `records[]=${id}`).join('&')
    await fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}?${ids}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${AT_KEY}` },
    })
  }
}

export async function POST() {
  try {
    const token    = await getSellsyToken()
    const invoices = await fetchAllPaidInvoices(token)
    const data     = await aggregate(token, invoices)
    await saveToAirtable(data)
    await cleanOldCache()

    return NextResponse.json({
      ok: true,
      ca_total:      Math.round(data.ca.total_ht),
      caution_total: Math.round(data.caution.total_ht),
      nb_invoices:   invoices.length,
      last_updated:  data.last_updated,
    })
  } catch (e) {
    console.error('[Sellsy refresh]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET() {
  return POST()
}
