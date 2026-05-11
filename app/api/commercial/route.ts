import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function strVal(v: unknown): string {
  if (v === null || v === undefined || v === false) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (Array.isArray(v)) return strVal(v[0])
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('error' in o) return ''
    if ('name' in o && o.name != null) return String(o.name)
  }
  return ''
}

function numVal(v: unknown): number {
  if (typeof v === 'object' && v !== null && 'error' in (v as object)) return 0
  const n = Number(v)
  return isFinite(n) ? n : 0
}

function avgArr(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

function selVal(v: unknown): string {
  if (typeof v === 'object' && v !== null && 'name' in (v as object))
    return String((v as Record<string, unknown>).name)
  if (typeof v === 'string') return v
  if (Array.isArray(v) && v.length > 0) return selVal(v[0])
  return ''
}

function monthLabel(ym: string): string {
  if (!ym || !ym.includes('-')) return ym
  const parts = ym.split('-')
  return new Date(Number(parts[0]), Number(parts[1]) - 1, 1)
    .toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
    .replace('.', '')
}

function daysBetween(d1: string, d2: string): number {
  if (!d1 || !d2) return -1
  const t1 = new Date(d1).getTime()
  const t2 = new Date(d2).getTime()
  if (isNaN(t1) || isNaN(t2)) return -1
  return Math.round(Math.abs(t2 - t1) / (1000 * 60 * 60 * 24))
}

function isWithin30Days(dateStr: string): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr).getTime()
  if (isNaN(d)) return false
  return (Date.now() - d) <= 30 * 24 * 60 * 60 * 1000
}

const F = {
  MOIS_SIGNATURE:    'fldk94N7n4aQW482K',
  DATE_SIGNATURE:    'fldNyXyZv7xsbpVaV',
  DATE_CREATION:     'fldxygbu165RonF4P',
  DATE_EDITION:      'fldsjH7EmfCDgvF1t',
  CONTRAT_ATT:       'fldh1l1uImywSLf8a',
  STATUT_ABONNE:     'fldNBDnMAaxdSXEvR',
  STATUT_DOSSIER:    'fldXvGXjjI0yM1BtU',
  ETAT_F2:           'fldFbme1enY3VGb40',
  DUREE_F2_J:        'fldzMJMqnDQ5eNRUo',
  KWC:               'fldTJkt211i53Ktmy',
  CAPEX_HT:          'fldtX7I9xNCHY4BTw',
  ABONNEMENT_KPI:    'fldBm8DaWTWaH7Ccs',
  COMMERCIAL:        'fldU5fZaVA2bLy35p',
  INSTALLATEUR_NOM:  'fldjUg9dVe5LrbX9i',
  MASTEUR:           'fldWBnPJD6A1tiVA2',
  SEGMENTATION_INST: 'fldRVUOfmjSxYOJF5',
  APPORTEUR:         'fldJyaa6ss3mHJ2zZ',
  NOM:               'fldfnBO2Xb6mNgAcq',
  PRENOM:            'fldhxncaPKtHlqqgZ',
  NOM_ENTREPRISE:    'flduVtvZSWvLPSBEg',
  SEGMENT:           'fld3SpiGzcJrADLgL',
}

type Rec = { id: string; fields: Record<string, unknown> }

interface MonthlyRow {
  month: string; label: string; signes: number; annules: number
  capex: number; kwc: number; poses: number
}

interface PipelineItem {
  id: string; nom_abonne: string; installateur: string; segment: string
  capex: number; kwc: number; date_creation: string; date_edition: string
  date_signature: string; signe: boolean; statut: string; statut_dossier: string
  delai_creation_signature: number
}

interface PipelineRow {
  nom: string; total_pipe: number; signes_pipe: number; taux_conversion: number
  capex_pipe: number; kwc_pipe: number; capex_signe: number; kwc_signe: number
  delai_moy: number; items: PipelineItem[]
}

interface InstRow {
  nom: string; signes: number; annules: number; taux_annulation: number
  capex: number; kwc: number; poses: number; taux_pose: number
  duree_f2_moy: number; delai_moy_creation_signature: number; monthly: MonthlyRow[]
}

interface ComRow {
  nom: string; signes: number; annules: number; taux_annulation: number
  capex: number; kwc: number; poses: number; taux_pose: number
  abo_moyen: number; duree_f2_moy: number; tendance_signes: number; tendance_capex: number
  delai_moy_creation_signature: number; monthly: MonthlyRow[]; installateurs: InstRow[]
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

function hasContrat(r: Rec): boolean {
  const att = r.fields[F.CONTRAT_ATT]
  return Array.isArray(att) && att.length > 0
}

function isAnnule(r: Rec): boolean {
  return strVal(r.fields[F.STATUT_ABONNE]) === 'Annulé'
}

function isPose(r: Rec): boolean {
  return strVal(r.fields[F.ETAT_F2]) === 'Validée'
}

function nomAbonne(r: Rec): string {
  const seg = selVal(r.fields[F.SEGMENT])
  if (seg === 'Pro') return strVal(r.fields[F.NOM_ENTREPRISE]) || strVal(r.fields[F.NOM])
  const p = strVal(r.fields[F.PRENOM]), n = strVal(r.fields[F.NOM])
  return [p, n].filter(Boolean).join(' ') || 'Inconnu'
}

function calcDelaiMoy(recs: Rec[]): number {
  const delais: number[] = []
  for (const r of recs) {
    const dateSig  = strVal(r.fields[F.DATE_SIGNATURE])
    const dateCrea = strVal(r.fields[F.DATE_CREATION])
    if (!dateSig || !dateCrea) continue
    const d = daysBetween(dateCrea, dateSig)
    if (d >= 0 && d < 365) delais.push(d)
  }
  return delais.length ? Math.round(avgArr(delais)) : 0
}

function buildMonthly(recs: Rec[], months: string[]): MonthlyRow[] {
  return months.map(month => {
    const mrs    = recs.filter(r => strVal(r.fields[F.MOIS_SIGNATURE]) === month)
    const signes = mrs.filter(r => !isAnnule(r))
    const ann    = mrs.filter(r => isAnnule(r))
    return {
      month,
      label:   monthLabel(month),
      signes:  signes.length,
      annules: ann.length,
      capex:   signes.reduce((s, r) => s + numVal(r.fields[F.CAPEX_HT]), 0),
      kwc:     signes.reduce((s, r) => s + numVal(r.fields[F.KWC]), 0),
      poses:   signes.filter(r => isPose(r)).length,
    }
  })
}

function buildPipelineItems(recs: Rec[]): PipelineItem[] {
  return recs
    .filter(r => {
      const de = strVal(r.fields[F.DATE_EDITION])
      const dc = strVal(r.fields[F.DATE_CREATION])
      return isWithin30Days(de)  // uniquement Date édition contrat
    })
    .map(r => {
      const dateSig  = strVal(r.fields[F.DATE_SIGNATURE])
      const dateCrea = strVal(r.fields[F.DATE_CREATION])
      return {
        id:           r.id,
        nom_abonne:   nomAbonne(r),
        installateur: strVal(r.fields[F.INSTALLATEUR_NOM]) || '—',
        segment:      selVal(r.fields[F.SEGMENT]),
        capex:        numVal(r.fields[F.CAPEX_HT]),
        kwc:          numVal(r.fields[F.KWC]),
        date_creation:  dateCrea,
        date_edition:   strVal(r.fields[F.DATE_EDITION]),
        date_signature: dateSig,
        signe:          hasContrat(r) && !isAnnule(r),
        statut:         selVal(r.fields[F.STATUT_ABONNE]),
        statut_dossier: selVal(r.fields[F.STATUT_DOSSIER]),
        delai_creation_signature: dateSig && dateCrea ? daysBetween(dateCrea, dateSig) : -1,
      }
    })
    .sort((a, b) => (b.date_edition || b.date_creation).localeCompare(a.date_edition || a.date_creation))
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const annee = searchParams.get('annee') || ''
  const mois  = searchParams.get('mois')  || ''

  try {
    const records     = await fetchAll()
    const avecContrat = records.filter(r => hasContrat(r))

    const filteredAll = mois
      ? avecContrat.filter(r => strVal(r.fields[F.MOIS_SIGNATURE]) === mois)
      : annee
        ? avecContrat.filter(r => strVal(r.fields[F.MOIS_SIGNATURE]).startsWith(annee))
        : avecContrat

    // Tous les mois disponibles
    const allMonths = Array.from(
      new Set(avecContrat.map(r => strVal(r.fields[F.MOIS_SIGNATURE])).filter(Boolean))
    ).sort()
    const recentMonths = allMonths.slice(-12)

    // ← CLEF : mois à afficher selon la période sélectionnée
    const filteredMonths = mois
      ? [mois]
      : annee
        ? allMonths.filter(m => m.startsWith(annee))
        : recentMonths

    // Mois courant/précédent pour tendances (toujours sur données réelles)
    const now      = new Date()
    const curMois  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const prevMois = allMonths[allMonths.indexOf(curMois) - 1] || allMonths[allMonths.length - 2] || ''

    // ─── Par commercial ────────────────────────────────────────────────────────
    const comMap = new Map<string, Rec[]>()
    for (const r of records) {
      const com = selVal(r.fields[F.COMMERCIAL]) || 'Non assigné'
      if (!comMap.has(com)) comMap.set(com, [])
      comMap.get(com)!.push(r)
    }

    const par_commercial: ComRow[] = Array.from(comMap.entries()).map(([nom, recs]) => {
      const filtRecs    = mois
        ? recs.filter(r => hasContrat(r) && strVal(r.fields[F.MOIS_SIGNATURE]) === mois)
        : annee
          ? recs.filter(r => hasContrat(r) && strVal(r.fields[F.MOIS_SIGNATURE]).startsWith(annee))
          : recs.filter(r => hasContrat(r))

      const signesRecs  = filtRecs.filter(r => !isAnnule(r))
      const annulesRecs = filtRecs.filter(r => isAnnule(r))
      const posesRecs   = signesRecs.filter(r => isPose(r))

      const curRecs  = recs.filter(r => hasContrat(r) && strVal(r.fields[F.MOIS_SIGNATURE]) === curMois  && !isAnnule(r))
      const prevRecs = recs.filter(r => hasContrat(r) && strVal(r.fields[F.MOIS_SIGNATURE]) === prevMois && !isAnnule(r))

      const instMap = new Map<string, Rec[]>()
      for (const r of recs) {
        if (!hasContrat(r)) continue
        const inst = strVal(r.fields[F.INSTALLATEUR_NOM]) || 'Non renseigné'
        if (!instMap.has(inst)) instMap.set(inst, [])
        instMap.get(inst)!.push(r)
      }

      const installateurs: InstRow[] = Array.from(instMap.entries()).map(([instNom, instRecs]) => {
        const filtInst  = mois
          ? instRecs.filter(r => strVal(r.fields[F.MOIS_SIGNATURE]) === mois)
          : annee
            ? instRecs.filter(r => strVal(r.fields[F.MOIS_SIGNATURE]).startsWith(annee))
            : instRecs
        const iSignes  = filtInst.filter(r => !isAnnule(r))
        const iAnnules = filtInst.filter(r => isAnnule(r))
        const iPoses   = iSignes.filter(r => isPose(r))
        return {
          nom:             instNom,
          signes:          iSignes.length,
          annules:         iAnnules.length,
          taux_annulation: filtInst.length ? Math.round(iAnnules.length / filtInst.length * 100) : 0,
          capex:           iSignes.reduce((s, r) => s + numVal(r.fields[F.CAPEX_HT]), 0),
          kwc:             iSignes.reduce((s, r) => s + numVal(r.fields[F.KWC]), 0),
          poses:           iPoses.length,
          taux_pose:       iSignes.length ? Math.round(iPoses.length / iSignes.length * 100) : 0,
          duree_f2_moy:    avgArr(iPoses.map(r => numVal(r.fields[F.DUREE_F2_J])).filter(v => v > 0)),
          delai_moy_creation_signature: calcDelaiMoy(iSignes),
          monthly:         buildMonthly(instRecs, filteredMonths),
        }
      }).sort((a, b) => b.signes - a.signes)

      return {
        nom,
        signes:          signesRecs.length,
        annules:         annulesRecs.length,
        taux_annulation: filtRecs.length ? Math.round(annulesRecs.length / filtRecs.length * 100) : 0,
        capex:           signesRecs.reduce((s, r) => s + numVal(r.fields[F.CAPEX_HT]), 0),
        kwc:             signesRecs.reduce((s, r) => s + numVal(r.fields[F.KWC]), 0),
        poses:           posesRecs.length,
        taux_pose:       signesRecs.length ? Math.round(posesRecs.length / signesRecs.length * 100) : 0,
        abo_moyen:       avgArr(signesRecs.map(r => numVal(r.fields[F.ABONNEMENT_KPI])).filter(v => v > 0)),
        duree_f2_moy:    avgArr(posesRecs.map(r => numVal(r.fields[F.DUREE_F2_J])).filter(v => v > 0)),
        tendance_signes: curRecs.length - prevRecs.length,
        tendance_capex:
          curRecs.reduce((s, r) => s + numVal(r.fields[F.CAPEX_HT]), 0) -
          prevRecs.reduce((s, r) => s + numVal(r.fields[F.CAPEX_HT]), 0),
        delai_moy_creation_signature: calcDelaiMoy(signesRecs),
        monthly:      buildMonthly(recs.filter(r => hasContrat(r)), filteredMonths),
        installateurs,
      }
    }).sort((a, b) => b.signes - a.signes)

    // ─── Pipeline 30j par commercial ──────────────────────────────────────────
    const pipeline_par_commercial: PipelineRow[] = Array.from(comMap.entries()).map(([nom, recs]) => {
      const items   = buildPipelineItems(recs)
      const signesP = items.filter(i => i.signe)
      const delais  = items.filter(i => i.signe && i.delai_creation_signature >= 0).map(i => i.delai_creation_signature)
      return {
        nom,
        total_pipe:      items.length,
        signes_pipe:     signesP.length,
        taux_conversion: items.length ? Math.round(signesP.length / items.length * 100) : 0,
        capex_pipe:      items.reduce((s, i) => s + i.capex, 0),
        kwc_pipe:        items.reduce((s, i) => s + i.kwc, 0),
        capex_signe:     signesP.reduce((s, i) => s + i.capex, 0),
        kwc_signe:       signesP.reduce((s, i) => s + i.kwc, 0),
        delai_moy:       delais.length ? Math.round(avgArr(delais)) : 0,
        items,
      }
    }).filter(p => p.total_pipe > 0).sort((a, b) => b.total_pipe - a.total_pipe)

    const allPipeItems  = buildPipelineItems(records)
    const allPipeSigned = allPipeItems.filter(i => i.signe)

    // ─── Par installateur global ───────────────────────────────────────────────
    const instMapGlobal = new Map<string, Rec[]>()
    for (const r of avecContrat) {
      const inst = strVal(r.fields[F.INSTALLATEUR_NOM]) || 'Non renseigné'
      if (!instMapGlobal.has(inst)) instMapGlobal.set(inst, [])
      instMapGlobal.get(inst)!.push(r)
    }

    const par_installateur: InstRow[] = Array.from(instMapGlobal.entries()).map(([nom, recs]) => {
      const filtRecs = mois
        ? recs.filter(r => strVal(r.fields[F.MOIS_SIGNATURE]) === mois)
        : annee
          ? recs.filter(r => strVal(r.fields[F.MOIS_SIGNATURE]).startsWith(annee))
          : recs
      const signes  = filtRecs.filter(r => !isAnnule(r))
      const annules = filtRecs.filter(r => isAnnule(r))
      const poses   = signes.filter(r => isPose(r))
      return {
        nom,
        signes:          signes.length,
        annules:         annules.length,
        taux_annulation: filtRecs.length ? Math.round(annules.length / filtRecs.length * 100) : 0,
        capex:           signes.reduce((s, r) => s + numVal(r.fields[F.CAPEX_HT]), 0),
        kwc:             signes.reduce((s, r) => s + numVal(r.fields[F.KWC]), 0),
        poses:           poses.length,
        taux_pose:       signes.length ? Math.round(poses.length / signes.length * 100) : 0,
        duree_f2_moy:    avgArr(poses.map(r => numVal(r.fields[F.DUREE_F2_J])).filter(v => v > 0)),
        delai_moy_creation_signature: calcDelaiMoy(signes),
        monthly:         buildMonthly(recs, filteredMonths),
      }
    }).sort((a, b) => b.signes - a.signes)

    const par_segmentation: Record<string, number> = {}
    const signesGlobal = filteredAll.filter(r => !isAnnule(r))
    for (const r of signesGlobal) {
      const seg = strVal(r.fields[F.SEGMENTATION_INST]) || 'Non renseigné'
      par_segmentation[seg] = (par_segmentation[seg] || 0) + 1
    }

    const total_annules = filteredAll.filter(r => isAnnule(r)).length
    const total_signes  = filteredAll.length - total_annules

    return NextResponse.json({
      months:       filteredMonths,
      month_labels: filteredMonths.map(monthLabel),
      par_commercial,
      par_installateur,
      par_segmentation,
      pipeline_par_commercial,
      pipeline_global: {
        total:           allPipeItems.length,
        signes:          allPipeSigned.length,
        taux_conversion: allPipeItems.length ? Math.round(allPipeSigned.length / allPipeItems.length * 100) : 0,
        capex_pipe:      allPipeItems.reduce((s, i) => s + i.capex, 0),
        capex_signe:     allPipeSigned.reduce((s, i) => s + i.capex, 0),
        kwc_pipe:        allPipeItems.reduce((s, i) => s + i.kwc, 0),
        kwc_signe:       allPipeSigned.reduce((s, i) => s + i.kwc, 0),
      },
      apporteurs: {
        avec: signesGlobal.filter(r => r.fields[F.APPORTEUR] === true).length,
        sans: signesGlobal.filter(r => r.fields[F.APPORTEUR] !== true).length,
      },
      meta: {
        total_signes,
        total_annules,
        taux_annulation_global: filteredAll.length ? Math.round(total_annules / filteredAll.length * 100) : 0,
        total_commerciaux:   par_commercial.filter(c => c.nom !== 'Non assigné').length,
        total_installateurs: par_installateur.filter(i => i.nom !== 'Non renseigné').length,
        cur_mois:  curMois,
        prev_mois: prevMois,
        last_updated: new Date().toISOString(),
      }
    })
  } catch (e) {
    console.error('[Commercial API]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
