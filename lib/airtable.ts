// ─── Airtable field IDs ───────────────────────────────────────────────────────
export const F = {
  PDL:              'fldEEokisVxAniL1y',
  NOM:              'fldfnBO2Xb6mNgAcq',
  MOIS_SIGNATURE:   'fldk94N7n4aQW482K',
  DATE_SIGNATURE:   'fldNyXyZv7xsbpVaV',
  DATE_MISE_EN_SERVICE: 'fldbgMe63XkRJT85A',
  SEGMENT:          'fld3SpiGzcJrADLgL',
  CAPEX_HT:         'fldtX7I9xNCHY4BTw',
  ABONNEMENT_KPI:   'fldBm8DaWTWaH7Ccs',
  PUISSANCE_KWC:    'fldTJkt211i53Ktmy',
  DUREE_CONTRAT_KPI:'fldNyoThqq9xETowk',
  DUREE_F2_J:       'fldzMJMqnDQ5eNRUo',
  CONTRAT_SIGNE:    'fldcThGrSIaaAVbew',
  ETAT_F1:          'fldDRNatPsM99rHnx',
  ETAT_F2:          'fldFbme1enY3VGb40',
  ETAT_F3:          'fldDZe4wp4DTRHIzC',
  STATUT_ABONNE:    'fldNBDnMAaxdSXEvR',
  STATUT_DOSSIER:   'fldXvGXjjI0yM1BtU',
  TYPE_INSTALLATION:'fldKXJ0epXcIMopFd',
  TYPE_CONTRAT:     'fldabyb6alzYUDyZJ',
  SCORING:          'fldsV6bpaHwxluSwQ',
  MANDAT_SIGNE:     'fldRCJqecLekhDE3s',
}

export const FIELD_IDS = Object.values(F)

export interface AirtableRecord {
  id: string
  fields: Record<string, unknown>
}

export async function fetchAllAbonnes(): Promise<AirtableRecord[]> {
  const base = process.env.AIRTABLE_BASE_ID!
  const table = process.env.AIRTABLE_ABONNES_TABLE!
  const key = process.env.AIRTABLE_API_KEY!
  const fields = FIELD_IDS.map(f => `fields[]=${f}`).join('&')
  const records: AirtableRecord[] = []
  let offset: string | undefined

  do {
    const url = `https://api.airtable.com/v0/${base}/${table}?pageSize=100&${fields}${offset ? `&offset=${offset}` : ''}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      next: { revalidate: 300 },
    })
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`)
    const data = await res.json()
    records.push(...data.records)
    offset = data.offset
  } while (offset)

  return records
}

export async function fetchSnapshots(limit = 90): Promise<AirtableRecord[]> {
  const base = process.env.AIRTABLE_BASE_ID!
  const table = process.env.AIRTABLE_SNAPSHOTS_TABLE
  if (!table) return []
  const key = process.env.AIRTABLE_API_KEY!
  const url = `https://api.airtable.com/v0/${base}/${table}?pageSize=${limit}&sort[0][field]=snapshot_date&sort[0][direction]=desc`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } })
  if (!res.ok) return []
  const data = await res.json()
  return data.records || []
}

export async function createSnapshot(payload: {
  snapshot_date: string; snapshot_data: string
  changes: string; triggered_by: string
}): Promise<void> {
  const base = process.env.AIRTABLE_BASE_ID!
  const table = process.env.AIRTABLE_SNAPSHOTS_TABLE
  if (!table) return
  const key = process.env.AIRTABLE_API_KEY!
  await fetch(`https://api.airtable.com/v0/${base}/${table}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: [{ fields: payload }] }),
  })
}
