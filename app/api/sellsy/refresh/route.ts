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

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

interface SellsyInvoice {
  id: number
  number: string
  subject: string
  date: string
  amounts: { total_excl_tax: string }
}

// ─── Fetch toutes les factures payées (paginé) ────────────────────────────────
async function fetchAllPaidInvoices(
  token: string,
  dateStart?: string,
  dateEnd?: string
): Promise<SellsyInvoice[]> {
  const all: SellsyInvoice[] = []
  let offset = 0
  const limit = 100

  const filters: Record<string, unknown> = { status: ['paid'] }
  if (dateStart || dateEnd) {
    filters.date = {
      ...(dateStart ? { start: dateStart } : {}),
      ...(dateEnd   ? { end:   dateEnd   } : {}),
    }
  }

  while (true) {
    let res: Response | null = null
    for (let attempt = 0; attempt < 5; attempt++) {
      res = await fetch(
        `${SELLSY_API}/invoices/search?limit=${limit}&offset=${offset}&order=date&direction=asc`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ filters }),
        }
      )
      if (res.status === 429) { await sleep((attempt + 1) * 2000); continue }
      break
    }
    if (!res || !res.ok) throw new Error(`Sellsy search error (offset=${offset}): ${await res?.text()}`)

    const d = await res.json() as { data: SellsyInvoice[]; pagination: { total: number } }
    all.push(...d.data)

    console.log(`[Sellsy] fetched ${all.length}/${d.pagination.total}`)

    offset += limit
    if (offset >= d.pagination.total) break
    await sleep(300)
  }

  return all
}

// ─── Classification par subject ───────────────────────────────────────────────
function isCaution(inv: SellsyInvoice): boolean {
  return inv.subject?.toLowerCase().includes('caution') ?? false
}

// ─── Agrégation par mois ──────────────────────────────────────────────────────
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
    .replace('.', '')
}

interface MonthData { month: string; label: string; nb: number; total_ht: number }
interface CacheData {
  ca:      { monthly: MonthData[]; total_ht: number; nb: number }
  caution: { monthly: MonthData[]; total_ht: number; nb: number }
  last_updated: string
}

function buildMonthMap(invoices: SellsyInvoice[]): Map<string, MonthData> {
  const map = new Map<string, MonthData>()
  for (const inv of invoices) {
    const mois = inv.date.slice(0, 7)
    const ht   = parseFloat(inv.amounts?.total_excl_tax || '0') || 0
    if (!map.has(mois)) map.set(mois, { month: mois, label: monthLabel(mois), nb: 0, total_ht: 0 })
    const row = map.get(mois)!
    row.nb       += 1
    row.total_ht += ht
  }
  return map
}

function mapToSorted(m: Map<string, MonthData>): MonthData[] {
  return Array.from(m.values()).sort((a, b) => a.month.localeCompare(b.month))
}

function summarize(monthly: MonthData[]) {
  return {
    monthly,
    total_ht: monthly.reduce((s, r) => s + r.total_ht, 0),
    nb:       monthly.reduce((s, r) => s + r.nb, 0),
  }
}

// ─── Cache Airtable ───────────────────────────────────────────────────────────
async function saveToAirtable(data: CacheData): Promise<void> {
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const res = await fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${AT_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      records: [{ fields: { cache_date: now, cache_data: JSON.stringify(data), cache_type: 'sellsy' } }]
    }),
  })
  if (!res.ok) throw new Error(`Airtable save error: ${await res.text()}`)
}

async function cleanOldCache(): Promise<void> {
  const url = `https://api.airtable.com/v0/${BASE}/${TABLE}?sort[0][field]=cache_date&sort[0][direction]=desc&pageSize=100`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AT_KEY}` } })
  if (!res.ok) return
  const d = await res.json() as { records: { id: string }[] }
  const toDelete = d.records.slice(10).map(r => r.id)
  if (!toDelete.length) return
  for (let i = 0; i < toDelete.length; i += 10) {
    const ids = toDelete.slice(i, i + 10).map(id => `records[]=${id}`).join('&')
    await fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}?${ids}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${AT_KEY}` },
    })
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const month   = searchParams.get('month')         // ex: 2025-01 → un mois précis
    const full    = searchParams.get('full') === 'true' // tout l'historique
    const dryRun  = searchParams.get('dry_run') === 'true' // ne pas écrire en Airtable

    const token = await getSellsyToken()

    let dateStart: string | undefined
    let dateEnd:   string | undefined
    let mode: string

    if (full) {
      // Pas de filtre de date → tout l'historique
      mode = 'full historique'
    } else if (month) {
      const [y, m] = month.split('-').map(Number)
      dateStart = `${y}-${String(m).padStart(2, '0')}-01`
      const lastDay = new Date(y, m, 0).getDate()
      dateEnd   = `${y}-${String(m).padStart(2, '0')}-${lastDay}`
      mode = `mois ${month}`
    } else {
      // Cron quotidien : 3 derniers mois
      const d = new Date()
      d.setMonth(d.getMonth() - 3)
      dateStart = d.toISOString().slice(0, 10)
      mode = 'incrémental (3 mois)'
    }

    const invoices = await fetchAllPaidInvoices(token, dateStart, dateEnd)

    const caInvoices  = invoices.filter(inv => !isCaution(inv))
    const cauInvoices = invoices.filter(inv =>  isCaution(inv))

    const caMonthly  = mapToSorted(buildMonthMap(caInvoices))
    const cauMonthly = mapToSorted(buildMonthMap(cauInvoices))

    const finalData: CacheData = {
      ca:      summarize(caMonthly),
      caution: summarize(cauMonthly),
      last_updated: new Date().toISOString(),
    }

    if (!dryRun) {
      await saveToAirtable(finalData)
      await cleanOldCache()
    }

    // Aperçu des 5 premiers subjects pour valider la classification
    const sampleCa  = caInvoices.slice(0, 3).map(i => i.subject)
    const sampleCau = cauInvoices.slice(0, 3).map(i => i.subject)

    return NextResponse.json({
      ok:            true,
      mode,
      dry_run:       dryRun,
      total_fetched: invoices.length,
      ca_invoices:   caInvoices.length,
      cau_invoices:  cauInvoices.length,
      ca_total_ht:   Math.round(finalData.ca.total_ht),
      caution_total_ht: Math.round(finalData.caution.total_ht),
      // pour vérifier que la classification est correcte
      sample_ca_subjects:      sampleCa,
      sample_caution_subjects: sampleCau,
      last_updated: finalData.last_updated,
    })
  } catch (e) {
    console.error('[Sellsy refresh]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET(req: Request) {
  return POST(req)
}
