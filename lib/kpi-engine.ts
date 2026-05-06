import { AirtableRecord, F } from './airtable'

// ─── Types ────────────────────────────────────────────────────────────────────
export type Segment = 'Pro' | 'Solo' | 'Duo' | 'Tous'
export type TypeInstall = 'Tous' | 'PV seul' | 'PV + Batterie' | 'PV + Batterie Virtuelle'

export interface MonthlyRow {
  month: string       // "YYYY-MM"
  label: string       // "Jan 25"
  // Contrats signés
  nb_signes_total: number
  nb_signes_pro: number
  nb_signes_part: number   // Solo + Duo
  kwc_signes: number
  capex_ht: number
  moy_abonnement: number
  moy_duree_contrat: number
  // Poses (F2 validée)
  nb_poses: number
  nb_poses_pro: number
  nb_poses_part: number
  kwc_poses: number
  moy_duree_f2: number
  // F3
  nb_f3: number
}

export interface KPIGlobal {
  // Totaux cumulés (filtre actif)
  total_signes: number
  total_kwc: number
  total_capex_ht: number
  total_poses: number
  moy_abonnement: number
  moy_duree_contrat: number
  moy_duree_f2: number
  // Statuts
  par_statut: Record<string, number>
  par_type_install: Record<string, number>
  par_segment: Record<string, number>
  // Mandats
  mandats_signes: number
  mandats_total: number
}

export interface KPIData {
  global: KPIGlobal
  monthly: MonthlyRow[]
  last_updated: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function str(v: unknown): string {
  if (!v) return ''
  if (typeof v === 'object' && 'name' in (v as object)) return (v as { name: string }).name
  return String(v)
}
function num(v: unknown): number {
  const n = Number(v)
  return isNaN(n) ? 0 : n
}
function bool(v: unknown): boolean {
  return v === true || v === 'true'
}

const MONTH_LABELS: Record<string, string> = {}
function monthLabel(ym: string): string {
  if (MONTH_LABELS[ym]) return MONTH_LABELS[ym]
  const [y, m] = ym.split('-')
  const d = new Date(Number(y), Number(m) - 1)
  const label = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
  MONTH_LABELS[ym] = label.replace('.', '')
  return MONTH_LABELS[ym]
}

function getMonthFromDate(d: unknown): string | null {
  if (!d) return null
  const s = String(d).substring(0, 7)
  if (/^\d{4}-\d{2}$/.test(s)) return s
  return null
}

// ─── Main compute function ────────────────────────────────────────────────────
export function computeKPIs(
  records: AirtableRecord[],
  opts: { segment?: Segment; typeInstall?: TypeInstall; annee?: number } = {}
): KPIData {
  const { segment = 'Tous', typeInstall = 'Tous', annee } = opts

  // Filtrer
  const filtered = records.filter(r => {
    const f = r.fields
    const seg = str(f[F.SEGMENT])
    if (segment !== 'Tous' && seg !== segment) return false
    const ti = str(f[F.TYPE_INSTALLATION] || '')
    if (typeInstall !== 'Tous' && ti !== typeInstall) return false
    if (annee) {
      const mois = str(f[F.MOIS_SIGNATURE])
      if (!mois.startsWith(String(annee))) return false
    }
    return true
  })

  // Agrégats par mois
  const byMonth = new Map<string, {
    signes: AirtableRecord[]; poses: AirtableRecord[]
    f3: AirtableRecord[]
  }>()

  for (const r of filtered) {
    const f = r.fields
    const moisSig = str(f[F.MOIS_SIGNATURE])
    const contractSigne = bool(f[F.CONTRAT_SIGNE])
    const etatF2 = str(f[F.ETAT_F2])
    const etatF3 = str(f[F.ETAT_F3])
    const dureeF2 = num(f[F.DUREE_F2_J])

    // Contrats signés — regroupés par mois de signature
    if (contractSigne && moisSig) {
      if (!byMonth.has(moisSig)) byMonth.set(moisSig, { signes: [], poses: [], f3: [] })
      byMonth.get(moisSig)!.signes.push(r)
    }

    // Poses (F2 Validée) — regroupés par mois de validation (approx = mois sig si date passage absent)
    if (etatF2 === 'Validée' && dureeF2 > 0) {
      // Calculer le mois de validation via date sig + durée
      const dateSig = str(f[F.DATE_SIGNATURE])
      let moisPose = moisSig
      if (dateSig) {
        const d = new Date(dateSig)
        d.setDate(d.getDate() + dureeF2)
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        moisPose = ym
      }
      if (!moisPose) moisPose = moisSig
      if (moisPose) {
        if (!byMonth.has(moisPose)) byMonth.set(moisPose, { signes: [], poses: [], f3: [] })
        byMonth.get(moisPose)!.poses.push(r)
      }
    }

    // F3
    if (etatF3 === 'Validée' && moisSig) {
      if (!byMonth.has(moisSig)) byMonth.set(moisSig, { signes: [], poses: [], f3: [] })
      byMonth.get(moisSig)!.f3.push(r)
    }
  }

  // Tri des mois
  const months = Array.from(byMonth.keys()).sort()

  const monthly: MonthlyRow[] = months.map(month => {
    const { signes, poses, f3 } = byMonth.get(month)!

    const nb_signes_total = signes.length
    const nb_signes_pro = signes.filter(r => str(r.fields[F.SEGMENT]) === 'Pro').length
    const nb_signes_part = nb_signes_total - nb_signes_pro

    const kwc_signes = signes.reduce((s, r) => s + num(r.fields[F.PUISSANCE_KWC]), 0)
    const capex_ht = signes.reduce((s, r) => s + num(r.fields[F.CAPEX_HT]), 0)

    const abo_vals = signes.map(r => num(r.fields[F.ABONNEMENT_KPI])).filter(v => v > 0)
    const moy_abonnement = abo_vals.length ? abo_vals.reduce((a, b) => a + b, 0) / abo_vals.length : 0

    const duree_vals = signes.map(r => num(r.fields[F.DUREE_CONTRAT_KPI])).filter(v => v > 0)
    const moy_duree_contrat = duree_vals.length ? duree_vals.reduce((a, b) => a + b, 0) / duree_vals.length : 0

    const nb_poses = poses.length
    const nb_poses_pro = poses.filter(r => str(r.fields[F.SEGMENT]) === 'Pro').length
    const nb_poses_part = nb_poses - nb_poses_pro
    const kwc_poses = poses.reduce((s, r) => s + num(r.fields[F.PUISSANCE_KWC]), 0)

    const f2_vals = poses.map(r => num(r.fields[F.DUREE_F2_J])).filter(v => v > 0)
    const moy_duree_f2 = f2_vals.length ? f2_vals.reduce((a, b) => a + b, 0) / f2_vals.length : 0

    return {
      month, label: monthLabel(month),
      nb_signes_total, nb_signes_pro, nb_signes_part,
      kwc_signes: Math.round(kwc_signes * 10) / 10,
      capex_ht: Math.round(capex_ht),
      moy_abonnement: Math.round(moy_abonnement),
      moy_duree_contrat: Math.round(moy_duree_contrat * 10) / 10,
      nb_poses, nb_poses_pro, nb_poses_part,
      kwc_poses: Math.round(kwc_poses * 10) / 10,
      moy_duree_f2: Math.round(moy_duree_f2),
      nb_f3: f3.length,
    }
  })

  // Global
  const allSignes = filtered.filter(r => bool(r.fields[F.CONTRAT_SIGNE]))
  const allPoses = filtered.filter(r => str(r.fields[F.ETAT_F2]) === 'Validée' && num(r.fields[F.DUREE_F2_J]) > 0)

  const par_statut: Record<string, number> = {}
  const par_type_install: Record<string, number> = {}
  const par_segment: Record<string, number> = {}

  for (const r of filtered) {
    const statut = str(r.fields[F.STATUT_DOSSIER]) || 'Non défini'
    par_statut[statut] = (par_statut[statut] || 0) + 1
    const ti = str(r.fields[F.TYPE_INSTALLATION]) || 'Non défini'
    par_type_install[ti] = (par_type_install[ti] || 0) + 1
    const seg = str(r.fields[F.SEGMENT]) || 'Non défini'
    par_segment[seg] = (par_segment[seg] || 0) + 1
  }

  const abo_all = allSignes.map(r => num(r.fields[F.ABONNEMENT_KPI])).filter(v => v > 0)
  const duree_all = allSignes.map(r => num(r.fields[F.DUREE_CONTRAT_KPI])).filter(v => v > 0)
  const f2_all = allPoses.map(r => num(r.fields[F.DUREE_F2_J])).filter(v => v > 0)

  const mandatsTotal = allSignes.length
  const mandatsSigned = allSignes.filter(r => bool(r.fields[F.MANDAT_SIGNE])).length

  const global: KPIGlobal = {
    total_signes: allSignes.length,
    total_kwc: Math.round(allSignes.reduce((s, r) => s + num(r.fields[F.PUISSANCE_KWC]), 0) * 10) / 10,
    total_capex_ht: Math.round(allSignes.reduce((s, r) => s + num(r.fields[F.CAPEX_HT]), 0)),
    total_poses: allPoses.length,
    moy_abonnement: abo_all.length ? Math.round(abo_all.reduce((a, b) => a + b, 0) / abo_all.length) : 0,
    moy_duree_contrat: duree_all.length ? Math.round(duree_all.reduce((a, b) => a + b, 0) / duree_all.length * 10) / 10 : 0,
    moy_duree_f2: f2_all.length ? Math.round(f2_all.reduce((a, b) => a + b, 0) / f2_all.length) : 0,
    par_statut, par_type_install, par_segment,
    mandats_signes: mandatsSigned,
    mandats_total: mandatsTotal,
  }

  return { global, monthly, last_updated: new Date().toISOString() }
}

// ─── Diff pour changelog ──────────────────────────────────────────────────────
export interface ChangeEntry {
  date: string
  metric: string
  old_val: number | null
  new_val: number
  delta: number
  delta_pct: number | null
  context?: string
}

export function diffSnapshots(prev: KPIData, curr: KPIData): ChangeEntry[] {
  const changes: ChangeEntry[] = []
  const now = new Date().toISOString().substring(0, 10)

  // KPIs globaux à surveiller
  const globalKeys: { key: keyof KPIGlobal; label: string; threshold: number }[] = [
    { key: 'total_signes', label: 'Contrats signés (total)', threshold: 1 },
    { key: 'total_poses', label: 'Poses réalisées (F2)', threshold: 1 },
    { key: 'total_kwc', label: 'kWc signés (total)', threshold: 1 },
    { key: 'total_capex_ht', label: 'CAPEX HT engagé (€)', threshold: 1000 },
    { key: 'moy_abonnement', label: 'Abonnement moyen (€/mois)', threshold: 5 },
    { key: 'moy_duree_f2', label: 'Durée moy. signature → F2 (j)', threshold: 2 },
    { key: 'moy_duree_contrat', label: 'Durée moy. contrat (années)', threshold: 0.1 },
    { key: 'mandats_signes', label: 'Mandats SEPA signés', threshold: 1 },
  ]

  for (const { key, label, threshold } of globalKeys) {
    const oldVal = typeof prev.global[key] === 'number' ? prev.global[key] as number : null
    const newVal = typeof curr.global[key] === 'number' ? curr.global[key] as number : 0
    const delta = oldVal !== null ? newVal - oldVal : 0
    if (Math.abs(delta) >= threshold) {
      changes.push({
        date: now, metric: label,
        old_val: oldVal, new_val: newVal, delta,
        delta_pct: oldVal ? Math.round((delta / oldVal) * 1000) / 10 : null,
      })
    }
  }

  // Détecter les mois qui ont changé
  const prevByMonth = Object.fromEntries(prev.monthly.map(m => [m.month, m]))
  for (const row of curr.monthly) {
    const old = prevByMonth[row.month]
    if (!old) {
      if (row.nb_signes_total > 0) {
        changes.push({
          date: now, metric: `Nouveau mois — ${row.label}`,
          old_val: 0, new_val: row.nb_signes_total, delta: row.nb_signes_total,
          delta_pct: null, context: `${row.nb_signes_total} contrat(s) signé(s)`
        })
      }
      continue
    }
    // Signes
    if (row.nb_signes_total !== old.nb_signes_total) {
      changes.push({
        date: now, metric: `Contrats signés — ${row.label}`,
        old_val: old.nb_signes_total, new_val: row.nb_signes_total,
        delta: row.nb_signes_total - old.nb_signes_total, delta_pct: null,
      })
    }
    // Poses
    if (row.nb_poses !== old.nb_poses) {
      changes.push({
        date: now, metric: `Poses (F2) — ${row.label}`,
        old_val: old.nb_poses, new_val: row.nb_poses,
        delta: row.nb_poses - old.nb_poses, delta_pct: null,
      })
    }
    // CAPEX
    if (Math.abs(row.capex_ht - old.capex_ht) > 500) {
      changes.push({
        date: now, metric: `CAPEX HT — ${row.label}`,
        old_val: old.capex_ht, new_val: row.capex_ht,
        delta: row.capex_ht - old.capex_ht, delta_pct: null,
        context: `${row.nb_signes_total} contrats ce mois`
      })
    }
  }

  return changes
}
