export const F = {
  PDL:               'fldEEokisVxAniL1y',
  NOM:               'fldfnBO2Xb6mNgAcq',
  DATE_SIGNATURE:    'fldNyXyZv7xsbpVaV',
  MOIS_SIGNATURE:    'fldk94N7n4aQW482K',
  DATE_MISE_EN_SERVICE: 'fldbgMe63XkRJT85A',
  SEGMENT:           'fld3SpiGzcJrADLgL',
  CAPEX_HT:          'fldtX7I9xNCHY4BTw',
  ABONNEMENT_KPI:    'fldBm8DaWTWaH7Ccs',
  KWC:               'fldTJkt211i53Ktmy',
  DUREE_CONTRAT_KPI: 'fldNyoThqq9xETowk',
  DUREE_F1_J:        'fld3QWvFDEOLwg0k7',
  DUREE_F2_J:        'fldzMJMqnDQ5eNRUo',
  DUREE_F3_J:        'fldLKRMk8Rn3PHQ1A',
  CONTRAT_SIGNE:     'fldcThGrSIaaAVbew',
  ETAT_F1:           'fldDRNatPsM99rHnx',
  ETAT_F2:           'fldFbme1enY3VGb40',
  ETAT_F3:           'fldDZe4wp4DTRHIzC',
  STATUT_DOSSIER:    'fldXvGXjjI0yM1BtU',
  TYPE_INSTALLATION: 'fldKXJ0epXcIMopFd',
  TYPE_CONTRAT:      'fldabyb6alzYUDyZJ',
  MANDAT_SIGNE:      'fldRCJqecLekhDE3s',
}

export const ALL_FIELD_IDS = Object.values(F)

export interface RawRecord {
  id: string
  fields: Record<string, unknown>
}

// Gère tous les formats : string, objet {name}, erreur Airtable {error:"#ERROR!"}
export function fieldStr(v: unknown): string {
  if (v === null || v === undefined || v === false) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'true' : ''
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    // Erreur Airtable ex: {"error":"#ERROR!"} → on ignore
    if ('error' in o) return ''
    if ('name' in o && o.name != null) return String(o.name)
    if ('text' in o && o.text != null) return String(o.text)
  }
  return ''
}

export function fieldNum(v: unknown): number {
  if (typeof v === 'object' && v !== null && 'error' in (v as object)) return 0
  const n = Number(v)
  return isFinite(n) ? n : 0
}

export function fieldBool(v: unknown): boolean {
  return v === true
}

export async function fetchAllAbonnes(): Promise<RawRecord[]> {
  const base  = process.env.AIRTABLE_BASE_ID
  const table = process.env.AIRTABLE_ABONNES_TABLE
  const key   = process.env.AIRTABLE_API_KEY
  if (!base || !table || !key) {
    throw new Error(`Variables manquantes: BASE=${!!base} TABLE=${!!table} KEY=${!!key}`)
  }

  const fieldsQS = ALL_FIELD_IDS.map(f => `fields[]=${encodeURIComponent(f)}`).join('&')
  const records: RawRecord[] = []
  let offset: string | undefined

  do {
    const url = `https://api.airtable.com/v0/${base}/${table}?pageSize=100&${fieldsQS}${offset ? `&offset=${offset}` : ''}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Airtable ${res.status}: ${body}`)
    }
    const data = await res.json() as { records: RawRecord[]; offset?: string }
    records.push(...data.records)
    offset = data.offset
  } while (offset)

  return records
}

export async function fetchSnapshots(limit = 60): Promise<RawRecord[]> {
  const base  = process.env.AIRTABLE_BASE_ID
  const table = process.env.AIRTABLE_SNAPSHOTS_TABLE
  const key   = process.env.AIRTABLE_API_KEY
  if (!base || !table || !key) return []
  const url = `https://api.airtable.com/v0/${base}/${table}?pageSize=${limit}&sort[0][field]=snapshot_date&sort[0][direction]=desc`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' })
  if (!res.ok) return []
  const data = await res.json() as { records?: RawRecord[] }
  return data.records || []
}

export async function createSnapshot(p: {
  snapshot_date: string; snapshot_data: string
  changes: string; triggered_by: string
}): Promise<void> {
  const base  = process.env.AIRTABLE_BASE_ID
  const table = process.env.AIRTABLE_SNAPSHOTS_TABLE
  const key   = process.env.AIRTABLE_API_KEY
  if (!base || !table || !key) return
  await fetch(`https://api.airtable.com/v0/${base}/${table}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: [{ fields: p }] }),
  })
}
