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

function sel(v: unknown): string {
  if (typeof v === 'object' && v !== null && 'name' in (v as object))
    return String((v as Record<string, unknown>).name)
  if (typeof v === 'string') return v
  if (Array.isArray(v) && v.length > 0) return sel(v[0])
  return ''
}

function monthLabel(ym: string): string {
  if (!ym || !ym.includes('-')) return ym
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
    .replace('.', '')
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

interface MonthlyRow {
  month: string
  label: string
  signes: number
  annules: number
  capex: number
  kwc: number
  poses: number
}

interface InstRow {
  nom: string
  signes: number
  annules: number
  taux_annulation: number
  capex: number
  kwc: number
  poses: number
  taux_pose: number
  duree_f2_moy: number
  monthly: MonthlyRow[]
}

interface ComRow {
  nom: string
  signes: number
  annules: number
  taux_annulation: number
  capex: number
  kwc: number
  poses: number
  taux_pose: number
  abo_moyen: number
  duree_f2_moy: number
  tendance_signes: number
  tendance_capex: number
  monthly: MonthlyRow[]
  installateurs: InstRow[]
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const annee  = searchParams.get('annee') || ''
  const mois   = searchParams.get('mois') || ''   // ex: "2026-04"

  try {
    const records = await fetchAll()
    const avecContrat = records.filter(r => {
      const att = r.fields[F.CONTRAT_ATTACHMENT]
      return Array.isArray(att) && att.length > 0
    })

    // Filtre période
    let filtered = avecContrat
    if (mois) {
      filtered = avecContrat.filter(r => str(r.fields[F.MOIS_SIGNATURE]) === mois)
    } else if (annee) {
      filtered = avecContrat.filter(r => str(r.fields[F.MOIS_SIGNATURE]).startsWith(annee))
    }

    // Tous les mois disponibles (triés)
    const allMonths = Array.from(new Set(avecContrat.map(r => str(r.fields[F.MOIS_SIGNATURE])).filter(Boolean)))
      .sort()
    const recentMonths = allMonths.slice(-12)

    // Mois précédent et mois courant pour tendances
    const now     = new Date()
    const curMois = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const prevMois = allMonths[allMonths.indexOf(curMois) - 1] || allMonths[allMonths.length - 2] || ''

    const isAnnule = (r: Rec) => str(r.fields[F.STATUT_ABONNE]) === 'Annulé'
    const isPose   = (r: Rec) => str(r.fields[F.ETAT_F2]) === 'Validée'

    // ─── Builder helper ─────────────────────────────────────────────────────
    function buildMonthly(recs: Rec[], months: string[]): MonthlyRow[] {
      return months.map(month => {
        const mrs = recs.filter(r => str(r.fields[F.MOIS_SIGNATURE]) === month)
        const signes = mrs.filter(r => !isAnnule(r))
        const annules = mrs.filter(r => isAnnule(r))
        return {
          month,
          label:   monthLabel(month),
          signes:  signes.length,
          annules: annules.length,
          capex:   signes.reduce((s, r) => s + num(r.fields[F.CAPEX_HT]), 0),
          kwc:     signes.reduce((s, r) => s + num(r.fields[F.KWC]), 0),
          poses:   signes.filter(r => isPose(r)).length,
        }
      })
    }

    // ─── Par commercial ──────────────────────────────────────────────────────
    const comMap = new Map<string, Rec[]>()
    for (const r of avecContrat) {  // tous les contrats pour avoir les mensuels complets
      const com = sel(r.fields[F.COMMERCIAL]) || 'Non assigné'
      if (!comMap.has(com)) comMap.set(com, [])
      comMap.get(com)!.push(r)
    }

    const par_commercial: ComRow[] = Array.from(comMap.entries()).map(([nom, recs]) => {
      // Filtrer pour les métriques globales selon la période
      const filteredRecs = mois
        ? recs.filter(r => str(r.fields[F.MOIS_SIGNATURE]) === mois)
        : annee
          ? recs.filter(r => str(r.fields[F.MOIS_SIGNATURE]).startsWith(annee))
          : recs

      const signesRecs  = filteredRecs.filter(r => !isAnnule(r))
      const annulesRecs = filteredRecs.filter(r => isAnnule(r))
      const posesRecs   = signesRecs.filter(r => isPose(r))

      // Tendance : mois courant vs mois précédent
      const curRecs  = recs.filter(r => str(r.fields[F.MOIS_SIGNATURE]) === curMois && !isAnnule(r))
      const prevRecs = recs.filter(r => str(r.fields[F.MOIS_SIGNATURE]) === prevMois && !isAnnule(r))

      // Installateurs de ce commercial
      const instMap = new Map<string, Rec[]>()
      for (const r of recs) {
        const inst = str(r.fields[F.INSTALLATEUR_NOM]) || 'Non renseigné'
        if (!instMap.has(inst)) instMap.set(inst, [])
        instMap.get(inst)!.push(r)
      }

      const installateurs: InstRow[] = Array.from(instMap.entries()).map(([instNom, instRecs]) => {
        const filtInst  = mois
          ? instRecs.filter(r => str(r.fields[F.MOIS_SIGNATURE]) === mois)
          : annee
            ? instRecs.filter(r => str(r.fields[F.MOIS_SIGNATURE]).startsWith(annee))
            : instRecs
        const iSignes  = filtInst.filter(r => !isAnnule(r))
        const iAnnules = filtInst.filter(r => isAnnule(r))
        const iPoses   = iSignes.filter(r => isPose(r))
        return {
          nom:             instNom,
          signes:          iSignes.length,
          annules:         iAnnules.length,
          taux_annulation: filtInst.length ? Math.round(iAnnules.length / filtInst.length * 100) : 0,
          capex:           iSignes.reduce((s, r) => s + num(r.fields[F.CAPEX_HT]), 0),
          kwc:             iSignes.reduce((s, r) => s + num(r.fields[F.KWC]), 0),
          poses:           iPoses.length,
          taux_pose:       iSignes.length ? Math.round(iPoses.length / iSignes.length * 100) : 0,
          duree_f2_moy:    avg(iPoses.map(r => num(r.fields[F.DUREE_F2_J])).filter(v => v > 0)),
          monthly:         buildMonthly(instRecs, recentMonths),
        }
      }).sort((a, b) => b.signes - a.signes)

      return {
        nom,
        signes:          signesRecs.length,
        annules:         annulesRecs.length,
        taux_annulation: filteredRecs.length ? Math.round(annulesRecs.length / filteredRecs.length * 100) : 0,
        capex:           signesRecs.reduce((s, r) => s + num(r.fields[F.CAPEX_HT]), 0),
        kwc:             signesRecs.reduce((s, r) => s + num(r.fields[F.KWC]), 0),
        poses:           posesRecs.length,
        taux_pose:       signesRecs.length ? Math.round(posesRecs.length / signesRecs.length * 100) : 0,
        abo_moyen:       avg(signesRecs.map(r => num(r.fields[F.ABONNEMENT_KPI])).filter(v => v > 0)),
        duree_f2_moy:    avg(posesRecs.map(r => num(r.fields[F.DUREE_F2_J])).filter(v => v > 0)),
        tendance_signes: curRecs.length - prevRecs.length,
        tendance_capex:  curRecs.reduce((s, r) => s + num(r.fields[F.CAPEX_HT]), 0)
                       - prevRecs.reduce((s, r) => s + num(r.fields[F.CAPEX_HT]), 0),
        monthly:         buildMonthly(recs, recentMonths),
        installateurs,
      }
    }).sort((a, b) => b.signes - a.signes)

    // ─── Par installateur (vue globale) ──────────────────────────────────────
    const instMapGlobal = new Map<string, Rec[]>()
    for (const r of avecContrat) {
      const inst = str(r.fields[F.INSTALLATEUR_NOM]) || 'Non renseigné'
      if (!instMapGlobal.has(inst)) instMapGlobal.set(inst, [])
      instMapGlobal.get(inst)!.push(r)
    }

    const par_installateur: InstRow[] = Array.from(instMapGlobal.entries()).map(([nom, recs]) => {
      const filtRecs  = mois
        ? recs.filter(r => str(r.fields[F.MOIS_SIGNATURE]) === mois)
        : annee
          ? recs.filter(r => str(r.fields[F.MOIS_SIGNATURE]).startsWith(annee))
          : recs
      const signes  = filtRecs.filter(r => !isAnnule(r))
      const annules = filtRecs.filter(r => isAnnule(r))
      const poses   = signes.filter(r => isPose(r))
      return {
        nom,
        signes:          signes.length,
        annules:         annules.length,
        taux_annulation: filtRecs.length ? Math.round(annules.length / filtRecs.length * 100) : 0,
        capex:           signes.reduce((s, r) => s + num(r.fields[F.CAPEX_HT]), 0),
        kwc:             signes.reduce((s, r) => s + num(r.fields[F.KWC]), 0),
        poses:           poses.length,
        taux_pose:       signes.length ? Math.round(poses.length / signes.length * 100) : 0,
        duree_f2_moy:    avg(poses.map(r => num(r.fields[F.DUREE_F2_J])).filter(v => v > 0)),
        monthly:         buildMonthly(recs, recentMonths),
      }
    }).sort((a, b) => b.signes - a.signes)

    // ─── Par segmentation installateur ───────────────────────────────────────
    const par_segmentation: Record<string, number> = {}
    const signesGlobal = filtered.filter(r => !isAnnule(r))
    for (const r of signesGlobal) {
      const seg = str(r.fields[F.SEGMENTATION_INST]) || 'Non renseigné'
      par_segmentation[seg] = (par_segmentation[seg] || 0) + 1
    }

    const apporteurs = {
      avec: signesGlobal.filter(r => r.fields[F.APPORTEUR] === true).length,
      sans: signesGlobal.filter(r => r.fields[F.APPORTEUR] !== true).length,
    }

    const total_annules_global = filtered.filter(r => isAnnule(r)).length
    const total_signes_global  = filtered.filter(r => !isAnnule(r)).length

    return NextResponse.json({
      months:          recentMonths,
      month_labels:    recentMonths.map(monthLabel),
      par_commercial,
      par_installateur,
      par_segmentation,
      apporteurs,
      meta: {
        total_signes:          total_signes_global,
        total_annules:         total_annules_global,
        taux_annulation_global: filtered.length ? Math.round(total_annules_global / filtered.length * 100) : 0,
        total_commerciaux:     par_commercial.filter(c => c.nom !== 'Non assigné').length,
        total_installateurs:   par_installateur.filter(i => i.nom !== 'Non renseigné').length,
        cur_mois:              curMois,
        prev_mois:             prevMois,
        last_updated:          new Date().toISOString(),
      }
    })
  } catch (e) {
    console.error('[Commercial API]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
