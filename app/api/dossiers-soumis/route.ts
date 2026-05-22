import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const BASE  = process.env.AIRTABLE_BASE_ID!
const TABLE = process.env.AIRTABLE_ABONNES_TABLE!
const KEY   = process.env.AIRTABLE_API_KEY!

const F = {
  NOM:            'fldfnBO2Xb6mNgAcq',
  PRENOM:         'fldhxncaPKtHlqqgZ',
  ENTREPRISE:     'flduVtvZSWvLPSBEg',
  SEGMENT:        'fld3SpiGzcJrADLgL',
  COMMERCIAL:     'fld6NSEZ0UeZMdomL',
  DATE_CREATION:  'fldxygbu165RonF4P',
  DATE_EDITION:   'fldsjH7EmfCDgvF1t',
  CAPEX:          'fldplSMBmal4BFo3O',
  KWC:            'fldTJkt211i53Ktmy',
  INSTALLATEUR:   'fldjUg9dVe5LrbX9i',
  CONTRAT_NS:     'fldLgnDhQLhSeVjU5',
  STATUT_ABONNE:  'fldNBDnMAaxdSXEvR',
  PCT_REUSSITE:   'fldbIyoDdMo5RaHdp',
  MOIS_SIGNATURE: 'fldKe5WC67JAygPWV',
}

function str(v: unknown): string {
  if (!v) return ''
  if (typeof v === 'string') return v
  if (Array.isArray(v) && v.length > 0) {
    const first = v[0]
    if (typeof first === 'string') return first
    if (typeof first === 'object' && first !== null && 'name' in first) return String((first as {name: unknown}).name)
  }
  if (typeof v === 'object' && v !== null && 'name' in v) return String((v as {name: unknown}).name)
  return ''
}

function num(v: unknown): number {
  const n = Number(v)
  return isFinite(n) ? n : 0
}

type Rec = { id: string; fields: Record<string, unknown> }

async function fetchAll(): Promise<Rec[]> {
  const fqs  = Object.values(F).map(f => `fields[]=${f}`).join('&')
  const all: Rec[] = []
  let offset: string | undefined
  do {
    const url = `https://api.airtable.com/v0/${BASE}/${TABLE}?pageSize=100&returnFieldsByFieldId=true&${fqs}${offset ? `&offset=${offset}` : ''}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` }, cache: 'no-store' })
    if (!res.ok) throw new Error(`Airtable ${res.status}`)
    const d = await res.json() as { records: Rec[]; offset?: string }
    all.push(...d.records)
    offset = d.offset
  } while (offset)
  return all
}

export async function GET() {
  try {
    const records = await fetchAll()

    // Filtre : contrat non signé VIDE + statut abonné VIDE
    const dossiers = records.filter(r => {
      const contratNS = r.fields[F.CONTRAT_NS]
      const statut    = r.fields[F.STATUT_ABONNE]
      const hasContratNS = Array.isArray(contratNS) && contratNS.length > 0
      const hasStatut    = !!statut
      return !hasContratNS && !hasStatut
    }).map(r => {
      const f    = r.fields
      const inst = f[F.INSTALLATEUR]
      let instNom = ''
      if (Array.isArray(inst) && inst.length > 0) {
        const first = inst[0]
        instNom = typeof first === 'string' ? first : (typeof first === 'object' && first !== null && 'name' in first ? String((first as {name: unknown}).name) : '')
      }
      return {
        id:           r.id,
        nom:          `${str(f[F.PRENOM])} ${str(f[F.NOM])}`.trim() || str(f[F.ENTREPRISE]) || '—',
        entreprise:   str(f[F.ENTREPRISE]),
        segment:      str(f[F.SEGMENT]),
        commercial:   str(f[F.COMMERCIAL]) || 'Non assigné',
        date_creation: str(f[F.DATE_CREATION]),
        date_edition:  str(f[F.DATE_EDITION]),
        capex:        num(f[F.CAPEX]),
        kwc:          num(f[F.KWC]),
        installateur: instNom,
        pct_reussite: str(f[F.PCT_REUSSITE]),
        mois_signature: str(f[F.MOIS_SIGNATURE]),
      }
    }).sort((a, b) => a.commercial.localeCompare(b.commercial))

    return NextResponse.json({ dossiers, total: dossiers.length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { recordId, pct_reussite, mois_signature } = await req.json() as {
      recordId: string; pct_reussite?: string; mois_signature?: string
    }
    if (!recordId) return NextResponse.json({ error: 'recordId requis' }, { status: 400 })

    const fields: Record<string, unknown> = {}
    if (pct_reussite  !== undefined) fields[F.PCT_REUSSITE]   = pct_reussite  || null
    if (mois_signature !== undefined) fields[F.MOIS_SIGNATURE] = mois_signature || null

    const url = `https://api.airtable.com/v0/${BASE}/${TABLE}/${recordId}`
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    })
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
