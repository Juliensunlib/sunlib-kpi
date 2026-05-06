import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function str(v: unknown): string {
  if (v === null || v === undefined || v === false) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('error' in o) return ''
    if ('name' in o && o.name != null) return String(o.name)
  }
  return ''
}

function num(v: unknown): number {
  if (typeof v === 'object' && v !== null && 'error' in (v as object)) return 0
  const n = Number(v)
  return isFinite(n) ? n : 0
}

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

function label(ym: string): string {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
    .replace('.', '')
}

const F = {
  SEGMENT:            'fld3SpiGzcJrADLgL',
  MOIS_SIGNATURE:     'fldk94N7n4aQW482K',
  DATE_SIGNATURE:     'fldNyXyZv7xsbpVaV',
  CONTRAT_ATTACHMENT: 'fldh1l1uImywSLf8a',
  STATUT_ABONNE:      'fldNBDnMAaxdSXEvR',
  ETAT_F2:            'fldFbme1enY3VGb40',
  ETAT_F3:            'fldDZe4wp4DTRHIzC',
  DUREE_F2_J:         'fldzMJMqnDQ5eNRUo',
  KWC:                'fldTJkt211i53Ktmy',
  CAPEX_HT:           'fldtX7I9xNCHY4BTw',
  ABONNEMENT_KPI:     'fldBm8DaWTWaH7Ccs',
  DUREE_CONTRAT_KPI:  'fldNyoThqq9xETowk',
  TYPE_INSTALLATION:  'fldKXJ0epXcIMopFd',
  STATUT_DOSSIER:     'fldXvGXjjI0yM1BtU',
  MANDAT_SIGNE:       'fldRCJqecLekhDE3s',
}

type Rec = { id: string; fields: Record<string, unknown> }

function isSigne(f: Record<string, unknown>): boolean {
  const att = f[F.CONTRAT_ATTACHMENT]
  return Array.isArray(att) && att.length > 0 && str(f[F.STATUT_ABONNE]) !== 'Annulé'
}

// ─── Fetch abonnés ────────────────────────────────────────────────────────────
async function fetchAll(): Promise<Rec[]> {
  const base  = process.env.AIRTABLE_BASE_ID!
  const table = process.env.AIRTABLE_ABONNES_TABLE!
  const key   = process.env.AIRTABLE_API_KEY!
  const fqs   = Object.values(F).map(f => `fields[]=${f}`).join('&')
  const all: Rec[] = []
  let offset: string | undefined
  do {
    const url = `https://api.airtable.com/v0/${base}/${table}?pageSize=100&returnFieldsByFieldId=true&${fqs}${offset ? `&offset=${offset}` : ''}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' })
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`)
    const d = await res.json() as { records: Rec[]; offset?: string }
    all.push(...d.records)
    offset = d.offset
  } while (offset)
  return all
}

// ─── Calcul KPIs globaux (pour snapshot) ─────────────────────────────────────
function computeGlobal(records: Rec[]) {
  const allSignes = records.filter(r => isSigne(r.fields))
  const allPoses  = records.filter(r => str(r.fields[F.ETAT_F2]) === 'Validée')

  // Mensuel
  const byMonth = new Map<string, { signes: Rec[]; poses: Rec[] }>()
  const ensure  = (m: string) => {
    if (!byMonth.has(m)) byMonth.set(m, { signes: [], poses: [] })
    return byMonth.get(m)!
  }
  for (const r of records) {
    const moisSig = str(r.fields[F.MOIS_SIGNATURE])
    const etatF2  = str(r.fields[F.ETAT_F2])
    const dureeF2 = num(r.fields[F.DUREE_F2_J])
    if (isSigne(r.fields) && moisSig) ensure(moisSig).signes.push(r)
    if (etatF2 === 'Validée' && moisSig) {
      let moisPose = moisSig
      const ds = str(r.fields[F.DATE_SIGNATURE])
      if (ds && dureeF2 > 0) {
        const d = new Date(ds)
        if (!isNaN(d.getTime())) {
          d.setDate(d.getDate() + dureeF2)
          moisPose = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        }
      }
      ensure(moisPose).poses.push(r)
    }
  }

  const monthly = Array.from(byMonth.keys()).sort().map(month => {
    const { signes, poses } = byMonth.get(month)!
    return {
      month, label: label(month),
      nb_signes:       signes.length,
      capex_ht_signes: signes.reduce((s, r) => s + num(r.fields[F.CAPEX_HT]), 0),
      kwc_signes:      signes.reduce((s, r) => s + num(r.fields[F.KWC]), 0),
      nb_poses:        poses.length,
      capex_ht_poses:  poses.reduce((s, r) => s + num(r.fields[F.CAPEX_HT]), 0),
    }
  })

  return {
    global: {
      total_signes:       allSignes.length,
      total_kwc_signes:   allSignes.reduce((s, r) => s + num(r.fields[F.KWC]), 0),
      total_capex_signes: allSignes.reduce((s, r) => s + num(r.fields[F.CAPEX_HT]), 0),
      total_poses:        allPoses.length,
      total_capex_poses:  allPoses.reduce((s, r) => s + num(r.fields[F.CAPEX_HT]), 0),
      moy_abonnement:     avg(allSignes.map(r => num(r.fields[F.ABONNEMENT_KPI])).filter(v => v > 0)),
      moy_duree_f2:       avg(allPoses.map(r => num(r.fields[F.DUREE_F2_J])).filter(v => v > 0)),
      mandats_signes:     allSignes.filter(r => r.fields[F.MANDAT_SIGNE] === true).length,
    },
    monthly,
    last_updated: new Date().toISOString(),
  }
}

// ─── Fetch snapshots depuis Airtable ─────────────────────────────────────────
async function fetchSnapshots(limit = 60): Promise<Rec[]> {
  const base  = process.env.AIRTABLE_BASE_ID
  const table = process.env.AIRTABLE_SNAPSHOTS_TABLE
  const key   = process.env.AIRTABLE_API_KEY
  if (!base || !table || !key) return []
  const url = `https://api.airtable.com/v0/${base}/${table}?pageSize=${limit}&sort[0][field]=snapshot_date&sort[0][direction]=desc`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' })
  if (!res.ok) return []
  const d = await res.json() as { records?: Rec[] }
  return d.records || []
}

// ─── Sauvegarder un snapshot ──────────────────────────────────────────────────
async function saveSnapshot(data: unknown, changes: unknown): Promise<void> {
  const base  = process.env.AIRTABLE_BASE_ID
  const table = process.env.AIRTABLE_SNAPSHOTS_TABLE
  const key   = process.env.AIRTABLE_API_KEY
  if (!base || !table || !key) {
    console.error('AIRTABLE_SNAPSHOTS_TABLE manquant dans les env vars Vercel')
    return
  }
  const body = {
    records: [{
      fields: {
        snapshot_date: new Date().toISOString().substring(0, 10),
        snapshot_data: JSON.stringify(data),
        changes:       JSON.stringify(changes),
        triggered_by:  'dashboard',
      }
    }]
  }
  const res = await fetch(`https://api.airtable.com/v0/${base}/${table}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error('Erreur sauvegarde snapshot:', err)
    throw new Error(`Snapshot save failed: ${err}`)
  }
}

// ─── Diff entre deux snapshots ────────────────────────────────────────────────
function diff(prev: ReturnType<typeof computeGlobal>, curr: ReturnType<typeof computeGlobal>) {
  const changes: Array<{ metric: string; old_val: number; new_val: number; delta: number }> = []
  const check = (metric: string, o: number, n: number, thr = 1) => {
    if (Math.abs(n - o) >= thr) changes.push({ metric, old_val: o, new_val: n, delta: n - o })
  }
  check('Contrats signés',      prev.global.total_signes,       curr.global.total_signes)
  check('Poses réalisées (F2)', prev.global.total_poses,        curr.global.total_poses)
  check('kWc signés',           prev.global.total_kwc_signes,   curr.global.total_kwc_signes, 0.5)
  check('CAPEX signé (€)',      prev.global.total_capex_signes, curr.global.total_capex_signes, 1000)
  check('CAPEX posé (€)',       prev.global.total_capex_poses,  curr.global.total_capex_poses, 1000)
  check('Mandats SEPA',         prev.global.mandats_signes,     curr.global.mandats_signes)
  check('Durée moy. F2 (j)',    prev.global.moy_duree_f2,       curr.global.moy_duree_f2, 2)

  const prevMap = Object.fromEntries(prev.monthly.map(m => [m.month, m]))
  for (const row of curr.monthly) {
    const old = prevMap[row.month]
    if (!old) {
      if (row.nb_signes > 0) changes.push({ metric: `Nouveau mois — ${row.label}`, old_val: 0, new_val: row.nb_signes, delta: row.nb_signes })
      continue
    }
    if (row.nb_signes !== old.nb_signes) check(`Signés — ${row.label}`, old.nb_signes, row.nb_signes)
    if (row.nb_poses  !== old.nb_poses)  check(`Poses — ${row.label}`, old.nb_poses, row.nb_poses)
  }
  return changes
}

// ─── Routes ───────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const snaps = await fetchSnapshots(60)
    const changelog: Array<{ date: string; entries: unknown[] }> = []
    for (const s of snaps) {
      try {
        const entries = JSON.parse(s.fields.changes as string || '[]')
        if (Array.isArray(entries) && entries.length > 0) {
          changelog.push({ date: s.fields.snapshot_date as string, entries })
        }
      } catch { /* snapshot malformé */ }
    }
    return NextResponse.json({ changelog, count: snaps.length })
  } catch (e) {
    console.error('[Snapshot GET]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST() {
  try {
    const [records, snaps] = await Promise.all([fetchAll(), fetchSnapshots(1)])
    const current = computeGlobal(records)

    let changes: unknown[] = []
    if (snaps.length > 0 && snaps[0].fields.snapshot_data) {
      try {
        const prev = JSON.parse(snaps[0].fields.snapshot_data as string) as ReturnType<typeof computeGlobal>
        changes = diff(prev, current)
      } catch { /* snapshot corrompu */ }
    }

    await saveSnapshot(current, changes)
    return NextResponse.json({ ok: true, changes_detected: changes.length })
  } catch (e) {
    console.error('[Snapshot POST]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
