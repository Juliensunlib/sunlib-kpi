import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

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

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
    .replace('.', '')
}

const F = {
  NOM:                'fldfnBO2Xb6mNgAcq',
  PRENOM:             'fldhxncaPKtHlqqgZ',
  NOM_ENTREPRISE:     'flduVtvZSWvLPSBEg',
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

// Index compact d'un abonné pour le diff
interface RecordIndex {
  n: string   // nom affiché
  s: string   // statut abonné
  f2: string  // état facture 2
  m: string   // mois signature
  seg: string // segment
}

function isSigne(f: Record<string, unknown>): boolean {
  const att = f[F.CONTRAT_ATTACHMENT]
  return Array.isArray(att) && att.length > 0 && str(f[F.STATUT_ABONNE]) !== 'Annulé'
}

function displayName(f: Record<string, unknown>): string {
  const seg = str(f[F.SEGMENT])
  if (seg === 'Pro') return str(f[F.NOM_ENTREPRISE]) || str(f[F.NOM])
  const prenom = str(f[F.PRENOM])
  const nom    = str(f[F.NOM])
  return [prenom, nom].filter(Boolean).join(' ') || 'Inconnu'
}

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

interface SnapshotData {
  global: {
    total_signes: number; total_kwc_signes: number
    total_capex_signes: number; total_poses: number
    total_capex_poses: number; moy_abonnement: number; moy_duree_f2: number
    mandats_signes: number
  }
  monthly: Array<{
    month: string; label: string
    nb_signes: number; capex_ht_signes: number; kwc_signes: number
    nb_poses: number; capex_ht_poses: number
  }>
  // Index compact : recordId → état de l'abonné
  index: Record<string, RecordIndex>
  last_updated: string
}

function buildSnapshot(records: Rec[]): SnapshotData {
  const allSignes = records.filter(r => isSigne(r.fields))
  const allPoses  = records.filter(r => str(r.fields[F.ETAT_F2]) === 'Validée')

  // Index compact pour le diff — tous les records ayant un contrat joint (incluant annulés)
  const index: Record<string, RecordIndex> = {}
  for (const r of records) {
    const att = r.fields[F.CONTRAT_ATTACHMENT]
    if (!Array.isArray(att) || att.length === 0) continue
    index[r.id] = {
      n:   displayName(r.fields),
      s:   str(r.fields[F.STATUT_ABONNE]),
      f2:  str(r.fields[F.ETAT_F2]),
      m:   str(r.fields[F.MOIS_SIGNATURE]),
      seg: str(r.fields[F.SEGMENT]),
    }
  }

  // Agrégation mensuelle
  const byMonth = new Map<string, { signes: Rec[]; poses: Rec[] }>()
  const ensure  = (m: string) => {
    if (!byMonth.has(m)) byMonth.set(m, { signes: [], poses: [] })
    return byMonth.get(m)!
  }
  for (const r of records) {
    const moisSig = str(r.fields[F.MOIS_SIGNATURE])
    const dureeF2 = num(r.fields[F.DUREE_F2_J])
    if (isSigne(r.fields) && moisSig) ensure(moisSig).signes.push(r)
    if (str(r.fields[F.ETAT_F2]) === 'Validée' && moisSig) {
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
      month, label: monthLabel(month),
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
    index,
    last_updated: new Date().toISOString(),
  }
}

interface ChangeEntry {
  metric:   string
  old_val:  number | null
  new_val:  number
  delta:    number
  delta_pct: number | null
  context?: string   // ← cause détaillée avec noms
}

function diffSnapshots(prev: SnapshotData, curr: SnapshotData): ChangeEntry[] {
  const changes: ChangeEntry[] = []
  const today = new Date().toISOString().substring(0, 10)

  const check = (metric: string, o: number, n: number, thr = 1, ctx?: string) => {
    const delta = n - o
    if (Math.abs(delta) >= thr) changes.push({
      metric, old_val: o, new_val: n, delta,
      delta_pct: o ? Math.round(delta / o * 1000) / 10 : null,
      context: ctx,
    })
  }

  // ─── Diff au niveau record ──────────────────────────────────────────────────
  const pi = prev.index, ci = curr.index

  const annules:    string[] = []
  const desannules: string[] = []
  const nouveaux:   string[] = []
  const f2valides:  string[] = []
  const disparus:   string[] = []

  // Records présents dans prev
  for (const [id, p] of Object.entries(pi)) {
    const c = ci[id]
    if (!c) {
      disparus.push(`${p.n} (${p.m || '?'}, ${p.seg})`)
      continue
    }
    // Passage en Annulé
    if (p.s !== 'Annulé' && c.s === 'Annulé') {
      annules.push(`${c.n} — ${c.m || '?'}, ${c.seg}`)
    }
    // Désannulation
    if (p.s === 'Annulé' && c.s !== 'Annulé') {
      desannules.push(`${c.n} — ${c.m || '?'}, ${c.seg}`)
    }
    // Passage F2 → Validée
    if (p.f2 !== 'Validée' && c.f2 === 'Validée') {
      f2valides.push(`${c.n} — ${c.m || '?'}, ${c.seg}`)
    }
  }

  // Nouveaux records (contrat joint apparu)
  for (const [id, c] of Object.entries(ci)) {
    if (!pi[id]) {
      nouveaux.push(`${c.n} — ${c.m || '?'}, ${c.seg}`)
    }
  }

  // ─── Changements détaillés ──────────────────────────────────────────────────
  if (annules.length > 0) {
    changes.push({
      metric: `🔴 Abonnés passés en Annulé (+${annules.length})`,
      old_val: null, new_val: annules.length, delta: annules.length, delta_pct: null,
      context: annules.join('\n'),
    })
  }
  if (desannules.length > 0) {
    changes.push({
      metric: `🟢 Abonnés désannulés (+${desannules.length})`,
      old_val: null, new_val: desannules.length, delta: desannules.length, delta_pct: null,
      context: desannules.join('\n'),
    })
  }
  if (nouveaux.length > 0) {
    changes.push({
      metric: `✅ Nouveaux contrats signés (+${nouveaux.length})`,
      old_val: null, new_val: nouveaux.length, delta: nouveaux.length, delta_pct: null,
      context: nouveaux.join('\n'),
    })
  }
  if (f2valides.length > 0) {
    changes.push({
      metric: `🔧 Nouvelles poses validées F2 (+${f2valides.length})`,
      old_val: null, new_val: f2valides.length, delta: f2valides.length, delta_pct: null,
      context: f2valides.join('\n'),
    })
  }
  if (disparus.length > 0) {
    changes.push({
      metric: `⚠️ Records supprimés d'Airtable (${disparus.length})`,
      old_val: null, new_val: disparus.length, delta: -disparus.length, delta_pct: null,
      context: disparus.join('\n'),
    })
  }

  // ─── KPIs globaux ──────────────────────────────────────────────────────────
  const g0 = prev.global, g1 = curr.global
  check('Contrats signés (total)',      g0.total_signes,       g1.total_signes)
  check('Poses réalisées (F2)',         g0.total_poses,        g1.total_poses)
  check('kWc signés',                   g0.total_kwc_signes,   g1.total_kwc_signes, 0.5)
  check('CAPEX signé (€)',              g0.total_capex_signes, g1.total_capex_signes, 1000)
  check('CAPEX posé (€)',               g0.total_capex_poses,  g1.total_capex_poses, 1000)
  check('Mandats SEPA',                 g0.mandats_signes,     g1.mandats_signes)
  check('Durée moy. F2 (j)',            g0.moy_duree_f2,       g1.moy_duree_f2, 2)

  // ─── Variations mensuelles ─────────────────────────────────────────────────
  const prevMap = Object.fromEntries(prev.monthly.map(m => [m.month, m]))
  for (const row of curr.monthly) {
    const old = prevMap[row.month]
    if (!old) {
      if (row.nb_signes > 0) changes.push({
        metric: `Nouveau mois — ${row.label}`,
        old_val: 0, new_val: row.nb_signes, delta: row.nb_signes, delta_pct: null,
        context: `${row.nb_signes} contrat(s) signé(s)`,
      })
      continue
    }
    if (row.nb_signes !== old.nb_signes)
      check(`Signés — ${row.label}`, old.nb_signes, row.nb_signes)
    if (row.nb_poses !== old.nb_poses)
      check(`Poses — ${row.label}`, old.nb_poses, row.nb_poses)
  }

  return changes
}

// ─── Fetch snapshots ──────────────────────────────────────────────────────────
async function fetchSnapshots(limit = 60): Promise<Array<{ id: string; fields: Record<string, unknown> }>> {
  const base  = process.env.AIRTABLE_BASE_ID
  const table = process.env.AIRTABLE_SNAPSHOTS_TABLE
  const key   = process.env.AIRTABLE_API_KEY
  if (!base || !table || !key) return []
  const url = `https://api.airtable.com/v0/${base}/${table}?pageSize=${limit}&sort[0][field]=snapshot_date&sort[0][direction]=desc`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' })
  if (!res.ok) return []
  const d = await res.json() as { records?: Array<{ id: string; fields: Record<string, unknown> }> }
  return d.records || []
}

// ─── Sauvegarder snapshot ─────────────────────────────────────────────────────
async function saveSnapshot(data: SnapshotData, changes: ChangeEntry[]): Promise<void> {
  const base  = process.env.AIRTABLE_BASE_ID
  const table = process.env.AIRTABLE_SNAPSHOTS_TABLE
  const key   = process.env.AIRTABLE_API_KEY
  if (!base || !table || !key) throw new Error('AIRTABLE_SNAPSHOTS_TABLE manquant dans Vercel env vars')

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
  if (!res.ok) throw new Error(`Snapshot save failed: ${await res.text()}`)
}

// ─── Routes ───────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const snaps = await fetchSnapshots(60)
    const changelog: Array<{ date: string; entries: ChangeEntry[] }> = []
    for (const s of snaps) {
      try {
        const entries: ChangeEntry[] = JSON.parse(s.fields.changes as string || '[]')
        if (Array.isArray(entries) && entries.length > 0) {
          changelog.push({ date: s.fields.snapshot_date as string, entries })
        }
      } catch { /* snapshot malformé */ }
    }
    return NextResponse.json({ changelog, count: snaps.length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST() {
  try {
    const [records, snaps] = await Promise.all([fetchAll(), fetchSnapshots(1)])
    const current = buildSnapshot(records)

    let changes: ChangeEntry[] = []
    if (snaps.length > 0 && snaps[0].fields.snapshot_data) {
      try {
        const prev = JSON.parse(snaps[0].fields.snapshot_data as string) as SnapshotData
        changes = diffSnapshots(prev, current)
      } catch { /* snapshot corrompu */ }
    }

    await saveSnapshot(current, changes)
    return NextResponse.json({ ok: true, changes_detected: changes.length })
  } catch (e) {
    console.error('[Snapshot POST]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
