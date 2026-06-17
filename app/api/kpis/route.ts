import { NextRequest, NextResponse } from 'next/server'

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

function bool(v: unknown): boolean {
  return v === true
}

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

function label(ym: string): string {
  const parts = ym.split('-')
  return new Date(Number(parts[0]), Number(parts[1]) - 1, 1)
    .toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
    .replace('.', '')
}

// ← Normalisation : Solo + Duo → Particulier
function normalizeSegment(seg: string): string {
  if (seg === 'Solo' || seg === 'Duo') return 'Particulier'
  if (seg === 'Pro') return 'Pro'
  return seg || 'Non défini'
}

// Extraire l'année depuis une date ISO ou dd/mm/yyyy
function yearFromDateStr(dateStr: string): string {
  if (!dateStr) return ''
  // Format ISO : 2026-06-12T...
  if (dateStr.includes('-') && dateStr.indexOf('-') === 4) return dateStr.slice(0, 4)
  // Format dd/mm/yyyy
  const parts = dateStr.split('/')
  if (parts.length === 3) return parts[2].slice(0, 4)
  return ''
}

function moisFromDateStr(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  } catch {
    return ''
  }
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
  DATE_MODIF_F2:      'fldqgM43dAtlXbz0y',
  KWC:                'fldTJkt211i53Ktmy',
  CAPEX_HT:           'fldplSMBmal4BFo3O',
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

function getMoisPose(f: Record<string, unknown>, moisSig: string): string {
  const dateF2 = str(f[F.DATE_MODIF_F2])
  if (dateF2) {
    const m = moisFromDateStr(dateF2)
    if (m) return m
  }
  return moisSig
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

export async function GET(req: NextRequest) {
  try {
    const p           = req.nextUrl.searchParams
    const segment     = p.get('segment')     || 'Tous'
    const typeInstall = p.get('typeInstall') || 'Tous'
    const annee       = p.get('annee') ? Number(p.get('annee')) : undefined

    const records = await fetchAll()

    // Filtre sur les records (segment, type install, annee sur mois signature)
    const filtered = records.filter(r => {
      if (segment !== 'Tous') {
        const seg = str(r.fields[F.SEGMENT])
        if (segment === 'Particulier') {
          if (seg !== 'Solo' && seg !== 'Duo') return false
        } else {
          if (seg !== segment) return false
        }
      }
      if (typeInstall !== 'Tous' && str(r.fields[F.TYPE_INSTALLATION]) !== typeInstall) return false
      // Pas de filtre annee ici sur moisSignature — on filtre les signés par annee
      // mais les poses seront filtrées par leur mois de pose réel
      return true
    })

    const isParticulier = (r: Rec) => {
      const seg = str(r.fields[F.SEGMENT])
      return seg === 'Solo' || seg === 'Duo'
    }
    const isPro = (r: Rec) => str(r.fields[F.SEGMENT]) === 'Pro'

    // ─── Construction mensuelle ───────────────────────────────────────────────
    const byMonth = new Map<string, { signes: Rec[]; poses: Rec[]; f3: Rec[] }>()
    const ensure  = (m: string) => {
      if (!byMonth.has(m)) byMonth.set(m, { signes: [], poses: [], f3: [] })
      return byMonth.get(m)!
    }

    for (const r of filtered) {
      const f       = r.fields
      const moisSig = str(f[F.MOIS_SIGNATURE])
      const etatF2  = str(f[F.ETAT_F2])
      const etatF3  = str(f[F.ETAT_F3])

      // Contrats signés — filtrés par année de signature
      if (isSigne(f) && moisSig) {
        if (!annee || moisSig.startsWith(String(annee))) {
          ensure(moisSig).signes.push(r)
        }
      }

      // Poses F2 — affectées au mois de pose réel (DATE_MODIF_F2), filtrées par année de pose
      if (etatF2 === 'Validée') {
        const moisPose = getMoisPose(f, moisSig)
        if (moisPose && (!annee || moisPose.startsWith(String(annee)))) {
          ensure(moisPose).poses.push(r)
        }
      }

      // F3 — filtrés par année de signature
      if (etatF3 === 'Validée' && moisSig) {
        if (!annee || moisSig.startsWith(String(annee))) {
          ensure(moisSig).f3.push(r)
        }
      }
    }

    const monthly = Array.from(byMonth.keys()).sort().map(month => {
      const { signes, poses, f3 } = byMonth.get(month)!
      return {
        month, label: label(month),
        nb_signes:         signes.length,
        nb_signes_pro:     signes.filter(isPro).length,
        nb_signes_part:    signes.filter(isParticulier).length,
        kwc_signes:        signes.reduce((s, r) => s + num(r.fields[F.KWC]), 0),
        capex_ht_signes:      signes.reduce((s, r) => s + num(r.fields[F.CAPEX_HT]), 0),
        capex_ht_signes_pro:  signes.filter(isPro).reduce((s, r) => s + num(r.fields[F.CAPEX_HT]), 0),
        capex_ht_signes_part: signes.filter(isParticulier).reduce((s, r) => s + num(r.fields[F.CAPEX_HT]), 0),
        kwc_signes_pro:       signes.filter(isPro).reduce((s, r) => s + num(r.fields[F.KWC]), 0),
        kwc_signes_part:      signes.filter(isParticulier).reduce((s, r) => s + num(r.fields[F.KWC]), 0),
        moy_abonnement:       avg(signes.map(r => num(r.fields[F.ABONNEMENT_KPI])).filter(v => v > 0)),
        moy_duree_contrat:    avg(signes.map(r => num(r.fields[F.DUREE_CONTRAT_KPI])).filter(v => v > 0)),
        mrr_signe:      signes.reduce((s, r) => s + num(r.fields[F.ABONNEMENT_KPI]), 0),
        mrr_signe_pro:  signes.filter(isPro).reduce((s, r) => s + num(r.fields[F.ABONNEMENT_KPI]), 0),
        mrr_signe_part: signes.filter(isParticulier).reduce((s, r) => s + num(r.fields[F.ABONNEMENT_KPI]), 0),
        nb_poses:          poses.length,
        nb_poses_pro:      poses.filter(isPro).length,
        nb_poses_part:     poses.filter(isParticulier).length,
        kwc_poses:         poses.reduce((s, r) => s + num(r.fields[F.KWC]), 0),
        kwc_poses_pro:     poses.filter(isPro).reduce((s, r) => s + num(r.fields[F.KWC]), 0),
        kwc_poses_part:    poses.filter(isParticulier).reduce((s, r) => s + num(r.fields[F.KWC]), 0),
        capex_ht_poses:      poses.reduce((s, r) => s + num(r.fields[F.CAPEX_HT]), 0),
        capex_ht_poses_pro:  poses.filter(isPro).reduce((s, r) => s + num(r.fields[F.CAPEX_HT]), 0),
        capex_ht_poses_part: poses.filter(isParticulier).reduce((s, r) => s + num(r.fields[F.CAPEX_HT]), 0),
        moy_duree_f2:      avg(poses.map(r => num(r.fields[F.DUREE_F2_J])).filter(v => v > 0)),
        moy_duree_f2_pro:  avg(poses.filter(isPro).map(r => num(r.fields[F.DUREE_F2_J])).filter(v => v > 0)),
        moy_duree_f2_part: avg(poses.filter(isParticulier).map(r => num(r.fields[F.DUREE_F2_J])).filter(v => v > 0)),
        // ─── MRR posé ────────────────────────────────────────────────────────
        mrr_pose:      poses.reduce((s, r) => s + num(r.fields[F.ABONNEMENT_KPI]), 0),
        mrr_pose_pro:  poses.filter(isPro).reduce((s, r) => s + num(r.fields[F.ABONNEMENT_KPI]), 0),
        mrr_pose_part: poses.filter(isParticulier).reduce((s, r) => s + num(r.fields[F.ABONNEMENT_KPI]), 0),
        nb_f3:             f3.length,
      }
    })

    // ─── Global : signés filtrés par année de signature ───────────────────────
    const allSignes = filtered.filter(r => {
      if (!isSigne(r.fields)) return false
      if (!annee) return true
      return str(r.fields[F.MOIS_SIGNATURE]).startsWith(String(annee))
    })

    // ─── Global : poses filtrées par année de pose réelle ────────────────────
    const allPoses = filtered.filter(r => {
      if (str(r.fields[F.ETAT_F2]) !== 'Validée') return false
      if (!annee) return true
      const moisPose = getMoisPose(r.fields, str(r.fields[F.MOIS_SIGNATURE]))
      return moisPose.startsWith(String(annee))
    })

    const par_segment:      Record<string, number> = {}
    const par_type_install: Record<string, number> = {}
    const par_statut:       Record<string, number> = {}

    for (const r of allSignes) {
      const seg = normalizeSegment(str(r.fields[F.SEGMENT]))
      const ti  = str(r.fields[F.TYPE_INSTALLATION]) || 'Non défini'
      const st  = str(r.fields[F.STATUT_DOSSIER])    || 'Non défini'
      par_segment[seg]     = (par_segment[seg]     || 0) + 1
      par_type_install[ti] = (par_type_install[ti] || 0) + 1
      par_statut[st]       = (par_statut[st]       || 0) + 1
    }

    return NextResponse.json({
      global: {
        total_signes:       allSignes.length,
        total_kwc_signes:   allSignes.reduce((s, r) => s + num(r.fields[F.KWC]), 0),
        total_capex_signes: allSignes.reduce((s, r) => s + num(r.fields[F.CAPEX_HT]), 0),
        total_poses:        allPoses.length,
        total_kwc_poses:    allPoses.reduce((s, r) => s + num(r.fields[F.KWC]), 0),
        total_capex_poses:  allPoses.reduce((s, r) => s + num(r.fields[F.CAPEX_HT]), 0),
        moy_abonnement:     avg(allSignes.map(r => num(r.fields[F.ABONNEMENT_KPI])).filter(v => v > 0)),
        moy_duree_contrat:  avg(allSignes.map(r => num(r.fields[F.DUREE_CONTRAT_KPI])).filter(v => v > 0)),
        moy_duree_f2:       avg(allPoses.map(r => num(r.fields[F.DUREE_F2_J])).filter(v => v > 0)),
        mandats_signes:     allSignes.filter(r => bool(r.fields[F.MANDAT_SIGNE])).length,
        mandats_total:      allSignes.length,
        // ─── MRR souscrit ─────────────────────────────────────────────────────
        total_mrr:  allSignes.reduce((s, r) => s + num(r.fields[F.ABONNEMENT_KPI]), 0),
        mrr_pro:    allSignes.filter(isPro).reduce((s, r) => s + num(r.fields[F.ABONNEMENT_KPI]), 0),
        mrr_part:   allSignes.filter(isParticulier).reduce((s, r) => s + num(r.fields[F.ABONNEMENT_KPI]), 0),
        // ─── MRR posé ─────────────────────────────────────────────────────────
        total_mrr_pose: allPoses.reduce((s, r) => s + num(r.fields[F.ABONNEMENT_KPI]), 0),
        mrr_pose_pro:   allPoses.filter(isPro).reduce((s, r) => s + num(r.fields[F.ABONNEMENT_KPI]), 0),
        mrr_pose_part:  allPoses.filter(isParticulier).reduce((s, r) => s + num(r.fields[F.ABONNEMENT_KPI]), 0),
        // ─── Segmentation ─────────────────────────────────────────────────────
        par_segment, par_type_install, par_statut,
        capex_pro:  allSignes.filter(isPro).reduce((s, r) => s + num(r.fields[F.CAPEX_HT]), 0),
        capex_part: allSignes.filter(isParticulier).reduce((s, r) => s + num(r.fields[F.CAPEX_HT]), 0),
        kwc_pro:    allSignes.filter(isPro).reduce((s, r) => s + num(r.fields[F.KWC]), 0),
        kwc_part:   allSignes.filter(isParticulier).reduce((s, r) => s + num(r.fields[F.KWC]), 0),
      },
      monthly,
      total_records: filtered.length,
      last_updated:  new Date().toISOString(),
    })
  } catch (e) {
    console.error('[KPI]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
