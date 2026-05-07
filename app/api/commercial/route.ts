import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function str(v: unknown): string {
  if (v === null || v === undefined || v === false) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (Array.isArray(v)) return str(v[0])
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

const F = {
  MOIS_SIGNATURE:     'fldk94N7n4aQW482K',
  CONTRAT_ATTACHMENT: 'fldh1l1uImywSLf8a',
  STATUT_ABONNE:      'fldNBDnMAaxdSXEvR',
  ETAT_F2:            'fldFbme1enY3VGb40',
  DUREE_F2_J:         'fldzMJMqnDQ5eNRUo',
  KWC:                'fldTJkt211i53Ktmy',
  CAPEX_HT:           'fldtX7I9xNCHY4BTw',
  ABONNEMENT_KPI:     'fldBm8DaWTWaH7Ccs',
  COMMERCIAL:         'fldU5fZaVA2bLy35p',
  INSTALLATEUR_NOM:   'fldjUg9dVe5LrbX9i',
  MASTEUR:            'fldWBnPJD6A1tiVA2',
  SEGMENTATION_INST:  'fldRVUOfmjSxYOJF5',
  APPORTEUR:          'fldJyaa6ss3mHJ2zZ',
}

type Rec = { id: string; fields: Record<string, unknown> }

function sel(v: unknown): string {
  if (typeof v === 'object' && v !== null && 'name' in (v as object))
    return String((v as Record<string, unknown>).name)
  if (typeof v === 'string') return v
  if (Array.isArray(v) && v.length > 0) return sel(v[0])
  return ''
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

function hasContrat(f: Record<string, unknown>): boolean {
  const att = f[F.CONTRAT_ATTACHMENT]
  return Array.isArray(att) && att.length > 0
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const annee = searchParams.get('annee') || ''

  try {
    const records = await fetchAll()
    const avecContrat = records.filter(r => hasContrat(r.fields))
    const filteredAll = annee
      ? avecContrat.filter(r => str(r.fields[F.MOIS_SIGNATURE]).startsWith(annee))
      : avecContrat

    // ─── Par commercial (Propio SOFTR) ────────────────────────────────────
    const comMap = new Map<string, { signes: Rec[]; annules: Rec[]; poses: Rec[] }>()
    for (const r of filteredAll) {
      const com = sel(r.fields[F.COMMERCIAL]) || 'Non assigné'
      if (!comMap.has(com)) comMap.set(com, { signes: [], annules: [], poses: [] })
      const e = comMap.get(com)!
      if (str(r.fields[F.STATUT_ABONNE]) === 'Annulé') {
        e.annules.push(r)
      } else {
        e.signes.push(r)
        if (str(r.fields[F.ETAT_F2]) === 'Validée') e.poses.push(r)
      }
    }

    const par_commercial = Array.from(comMap.entries())
      .map(([nom, { signes, annules, poses }]) => ({
        nom,
        signes:         signes.length,
        annules:        annules.length,
        taux_annulation: signes.length + annules.length
          ? Math.round(annules.length / (signes.length + annules.length) * 100) : 0,
        capex:          signes.reduce((s, r) => s + num(r.fields[F.CAPEX_HT]), 0),
        kwc:            signes.reduce((s, r) => s + num(r.fields[F.KWC]), 0),
        poses:          poses.length,
        taux_pose:      signes.length ? Math.round(poses.length / signes.length * 100) : 0,
        abo_moyen:      avg(signes.map(r => num(r.fields[F.ABONNEMENT_KPI])).filter(v => v > 0)),
        duree_f2_moy:   avg(poses.map(r => num(r.fields[F.DUREE_F2_J])).filter(v => v > 0)),
      }))
      .sort((a, b) => b.signes - a.signes)

    // ─── Par installateur ──────────────────────────────────────────────────
    const instMap = new Map<string, { signes: Rec[]; annules: Rec[]; poses: Rec[] }>()
    for (const r of filteredAll) {
      const inst = str(r.fields[F.INSTALLATEUR_NOM]) || 'Non renseigné'
      if (!instMap.has(inst)) instMap.set(inst, { signes: [], annules: [], poses: [] })
      const e = instMap.get(inst)!
      if (str(r.fields[F.STATUT_ABONNE]) === 'Annulé') {
        e.annules.push(r)
      } else {
        e.signes.push(r)
        if (str(r.fields[F.ETAT_F2]) === 'Validée') e.poses.push(r)
      }
    }

    const par_installateur = Array.from(instMap.entries())
      .map(([nom, { signes, annules, poses }]) => ({
        nom,
        signes:       signes.length,
        annules:      annules.length,
        taux_annulation: signes.length + annules.length
          ? Math.round(annules.length / (signes.length + annules.length) * 100) : 0,
        capex:        signes.reduce((s, r) => s + num(r.fields[F.CAPEX_HT]), 0),
        kwc:          signes.reduce((s, r) => s + num(r.fields[F.KWC]), 0),
        poses:        poses.length,
        taux_pose:    signes.length ? Math.round(poses.length / signes.length * 100) : 0,
        duree_f2_moy: avg(poses.map(r => num(r.fields[F.DUREE_F2_J])).filter(v => v > 0)),
      }))
      .sort((a, b) => b.signes - a.signes)

    // ─── Par masteur ───────────────────────────────────────────────────────
    const mastMap = new Map<string, { signes: Rec[]; poses: Rec[] }>()
    const signesOnly = filteredAll.filter(r => str(r.fields[F.STATUT_ABONNE]) !== 'Annulé')
    for (const r of signesOnly) {
      const mast = str(r.fields[F.MASTEUR]) || 'Non renseigné'
      if (!mastMap.has(mast)) mastMap.set(mast, { signes: [], poses: [] })
      mastMap.get(mast)!.signes.push(r)
      if (str(r.fields[F.ETAT_F2]) === 'Validée') mastMap.get(mast)!.poses.push(r)
    }

    const par_masteur = Array.from(mastMap.entries())
      .map(([nom, { signes, poses }]) => ({
        nom,
        signes:    signes.length,
        capex:     signes.reduce((s, r) => s + num(r.fields[F.CAPEX_HT]), 0),
        kwc:       signes.reduce((s, r) => s + num(r.fields[F.KWC]), 0),
        poses:     poses.length,
        taux_pose: signes.length ? Math.round(poses.length / signes.length * 100) : 0,
      }))
      .sort((a, b) => b.signes - a.signes)

    // ─── Par segmentation installateur ─────────────────────────────────────
    const par_segmentation: Record<string, number> = {}
    for (const r of signesOnly) {
      const seg = str(r.fields[F.SEGMENTATION_INST]) || 'Non renseigné'
      par_segmentation[seg] = (par_segmentation[seg] || 0) + 1
    }

    // ─── Apporteurs d'affaire ──────────────────────────────────────────────
    const avecApporteur = signesOnly.filter(r => r.fields[F.APPORTEUR] === true).length
    const sansApporteur = signesOnly.length - avecApporteur

    // ─── Métriques globales ────────────────────────────────────────────────
    const total_annules = filteredAll.filter(r => str(r.fields[F.STATUT_ABONNE]) === 'Annulé').length
    const total_signes  = filteredAll.length - total_annules

    return NextResponse.json({
      par_commercial,
      par_installateur,
      par_masteur,
      par_segmentation,
      apporteurs: { avec: avecApporteur, sans: sansApporteur },
      meta: {
        total_signes,
        total_annules,
        taux_annulation_global: filteredAll.length
          ? Math.round(total_annules / filteredAll.length * 100) : 0,
        total_commerciaux:    par_commercial.filter(c => c.nom !== 'Non assigné').length,
        total_installateurs:  par_installateur.filter(i => i.nom !== 'Non renseigné').length,
        last_updated: new Date().toISOString(),
      }
    })
  } catch (e) {
    console.error('[Commercial API]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
