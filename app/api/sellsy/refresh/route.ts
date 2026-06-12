import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const SELLSY_TOKEN_URL = 'https://login.sellsy.com/oauth2/access-tokens'
const SELLSY_API       = 'https://api.sellsy.com/v2'
const BASE             = process.env.AIRTABLE_BASE_ID!
const TABLE            = process.env.AIRTABLE_SELLSY_CACHE_TABLE!
const AT_KEY           = process.env.AIRTABLE_API_KEY!

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
  subject: string
  date: string
  amounts: { total_excl_tax: string }
}

async function fetchAllPaidInvoices(token: string): Promise<SellsyInvoice[]> {
  const all: SellsyInvoice[] = []
  let offset = 0
  const limit = 100

  while (true) {
    let res: Response | null = null
    for (let attempt = 0; attempt < 5; attempt++) {
      res = await fetch(
        `${SELLSY_API}/invoices/search?limit=${limit}&offset=${offset}&order=date&direction=asc`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ filters: { status: ['paid'] } }),
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

function isCaution(inv: SellsyInvoice): boolean {
  return inv.subject?.toLowerCase().includes('caution') ?? false
}

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

function buildMonthly(invoices: SellsyInvoice[]): MonthData[] {
  const map = new Map<string, MonthData>()
  for (const inv of invoices) {
    const mois = inv.date.slice(0, 7)
    const ht   = parseFloat(inv.amounts?.total_excl_tax || '0') || 0
    if (!map.has(mois)) map.set(mois, { month: mois, label: monthLabel(mois), nb: 0, total_ht: 0 })
    const row = map.get(mois)!
    row.nb       += 1
    row.total_ht += ht
  }
  return Array.from(map.values()).sort((a, b) => b.month.localeCompare(a.month))
}

function summarize(monthly: MonthData[]) {
  return {
    monthly,
    total_ht: monthly.reduce((s, r) => s + r.total_ht, 0),
    nb:       monthly.reduce((s, r) => s + r.nb, 0),
  }
}

// Supprime tout + sauvegarde 1 seul record
async function replaceCache(data: CacheData): Promise<void> {
  const listRes = await fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}?pageSize=100`, {
    headers: { Authorization: `Bearer ${AT_KEY}` }
  })
  if (listRes.ok) {
    const d = await listRes.json() as { records: { id: string }[] }
    for (let i = 0; i < d.records.length; i += 10) {
      const qs = d.records.slice(i, i + 10).map(r => `records[]=${r.id}`).join('&')
      await fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}?${qs}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${AT_KEY}` },
      })
    }
  }
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const saveRes = await fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${AT_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      records: [{ fields: { cache_date: now, cache_data: JSON.stringify(data), cache_type: 'sellsy' } }]
    }),
  })
  if (!saveRes.ok) throw new Error(`Airtable save error: ${await saveRes.text()}`)
}

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const dryRun = searchParams.get('dry_run') === 'true'

    const token    = await getSellsyToken()
    const invoices = await fetchAllPaidInvoices(token)

    const caInvoices  = invoices.filter(inv => !isCaution(inv))
    const cauInvoices = invoices.filter(inv =>  isCaution(inv))

    const finalData: CacheData = {
      ca:      summarize(buildMonthly(caInvoices)),
      caution: summarize(buildMonthly(cauInvoices)),
      last_updated: new Date().toISOString(),
    }

    if (!dryRun) {
      await replaceCache(finalData)
    }

    return NextResponse.json({
      ok:               true,
      dry_run:          dryRun,
      total_fetched:    invoices.length,
      ca_invoices:      caInvoices.length,
      cau_invoices:     cauInvoices.length,
      ca_total_ht:      Math.round(finalData.ca.total_ht),
      caution_total_ht: Math.round(finalData.caution.total_ht),
      total_months:     finalData.ca.monthly.length,
      last_updated:     finalData.last_updated,
    })
  } catch (e) {
    console.error('[Sellsy refresh]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET(req: Request) {
  return POST(req)
}
