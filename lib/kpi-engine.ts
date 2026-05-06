import { RawRecord, F, fieldStr, fieldNum, fieldBool } from './airtable'

export type Segment     = 'Tous' | 'Pro' | 'Solo' | 'Duo'
export type TypeInstall = 'Tous' | 'PV seul' | 'PV + Batterie' | 'PV + Batterie Virtuelle'

export interface MonthlyRow {
  month: string; label: string
  nb_signes: number; nb_signes_pro: number; nb_signes_part: number
  kwc_signes: number; capex_ht: number; moy_abonnement: number; moy_duree_contrat: number
  nb_poses: number; nb_poses_pro: number; nb_poses_part: number
  kwc_poses: number; moy_duree_f2: number; nb_f3: number
}

export interface KPIGlobal {
  total_signes: number; total_kwc: number; total_capex_ht: number; total_poses: number
  moy_abonnement: number; moy_duree_contrat: number; moy_duree_f2: number
  mandats_signes: number; mandats_total: number
  par_segment: Record<string, number>
  par_type_install: Record<string, number>
  par_statut: Record<string, number>
}

export interface KPIData {
  global: KPIGlobal; monthly: MonthlyRow[]
  total_records: number; last_updated: string
}

export interface ChangeEntry {
  metric: string; old_val: number | null; new_val: number
  delta: number; delta_pct: number | null; context?: string
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }).replace('.', '')
}

function avgArr(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

export function computeKPIs(
  records: RawRecord[],
  opts: { segment?: Segment; typeInstall?: TypeInstall; annee?: number } = {}
): KPIData {
  const { segment = 'Tous', typeInstall = 'Tous', annee } = opts

  const filtered = records.filter(r => {
    if (segment !== 'Tous' && fieldStr(r.fields[F.SEGMENT]) !== segment) return false
    if (typeInstall !== 'Tous' && fieldStr(r.fields[F.TYPE_INSTALLATION]) !== typeInstall) return false
    if (annee && !fieldStr(r.fields[F.MOIS_SIGNATURE]).startsWith(String(annee))) return false
    return true
  })

  const byMonth = new Map<string, { signes: RawRecord[]; poses: RawRecord[]; f3: RawRecord[] }>()
  const ensure  = (m: string) => {
    if (!byMonth.has(m)) byMonth.set(m, { signes: [], poses: [], f3: [] })
    return byMonth.get(m)!
  }

  for (const r of filtered) {
    const f       = r.fields
    const moisSig = fieldStr(f[F.MOIS_SIGNATURE])
    const etatF2  = fieldStr(f[F.ETAT_F2])
    const etatF3  = fieldStr(f[F.ETAT_F3])
    const dureeF2 = fieldNum(f[F.DUREE_F2_J])

    // Contrats signés → mois de signature
    if (fieldBool(f[F.CONTRAT_SIGNE]) && moisSig) {
      ensure(moisSig).signes.push(r)
    }

    // Poses F2 validées → mois de pose estimé
    if (etatF2 === 'Validée' && dureeF2 > 0 && moisSig) {
      const dateSig = fieldStr(f[F.DATE_SIGNATURE])
      let moisPose = moisSig
      if (dateSig) {
        const d = new Date(dateSig)
        if (!isNaN(d.getTime())) {
          d.setDate(d.getDate() + dureeF2)
          moisPose = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        }
      }
      ensure(moisPose).poses.push(r)
    }

    // F3
    if (etatF3 === 'Validée' && moisSig) {
      ensure(moisSig).f3.push(r)
    }
  }

  const isPro = (r: RawRecord) => fieldStr(r.fields[F.SEGMENT]) === 'Pro'

  const monthly: MonthlyRow[] = Array.from(byMonth.keys()).sort().map(month => {
    const { signes, poses, f3 } = byMonth.get(month)!
    return {
      month, label: monthLabel(month),
      nb_signes:      signes.length,
      nb_signes_pro:  signes.filter(isPro).length,
      nb_signes_part: signes.filter(r => !isPro(r)).length,
      kwc_signes:     Math.round(signes.reduce((s, r) => s + fieldNum(r.fields[F.KWC]), 0) * 10) / 10,
      capex_ht:       Math.round(signes.reduce((s, r) => s + fieldNum(r.fields[F.CAPEX_HT]), 0)),
      moy_abonnement: Math.round(avgArr(signes.map(r => fieldNum(r.fields[F.ABONNEMENT_KPI])).filter(v => v > 0))),
      moy_duree_contrat: Math.round(avgArr(signes.map(r => fieldNum(r.fields[F.DUREE_CONTRAT_KPI])).filter(v => v > 0)) * 10) / 10,
      nb_poses:       poses.length,
      nb_poses_pro:   poses.filter(isPro).length,
      nb_poses_part:  poses.filter(r => !isPro(r)).length,
      kwc_poses:      Math.round(poses.reduce((s, r) => s + fieldNum(r.fields[F.KWC]), 0) * 10) / 10,
      moy_duree_f2:   Math.round(avgArr(poses.map(r => fieldNum(r.fields[F.DUREE_F2_J])).filter(v => v > 0))),
      nb_f3:          f3.length,
    }
  })

  const allSignes = filtered.filter(r => fieldBool(r.fields[F.CONTRAT_SIGNE]))
  const allPoses  = filtered.filter(r => fieldStr(r.fields[F.ETAT_F2]) === 'Validée' && fieldNum(r.fields[F.DUREE_F2_J]) > 0)

  const par_segment: Record<string, number>      = {}
  const par_type_install: Record<string, number> = {}
  const par_statut: Record<string, number>       = {}

  for (const r of allSignes) {
    const seg = fieldStr(r.fields[F.SEGMENT])           || 'Non défini'
    const ti  = fieldStr(r.fields[F.TYPE_INSTALLATION]) || 'Non défini'
    const st  = fieldStr(r.fields[F.STATUT_DOSSIER])    || 'Non défini'
    par_segment[seg]     = (par_segment[seg]     || 0) + 1
    par_type_install[ti] = (par_type_install[ti] || 0) + 1
    par_statut[st]       = (par_statut[st]       || 0) + 1
  }

  const global: KPIGlobal = {
    total_signes:      allSignes.length,
    total_kwc:         Math.round(allSignes.reduce((s, r) => s + fieldNum(r.fields[F.KWC]), 0) * 10) / 10,
    total_capex_ht:    Math.round(allSignes.reduce((s, r) => s + fieldNum(r.fields[F.CAPEX_HT]), 0)),
    total_poses:       allPoses.length,
    moy_abonnement:    Math.round(avgArr(allSignes.map(r => fieldNum(r.fields[F.ABONNEMENT_KPI])).filter(v => v > 0))),
    moy_duree_contrat: Math.round(avgArr(allSignes.map(r => fieldNum(r.fields[F.DUREE_CONTRAT_KPI])).filter(v => v > 0)) * 10) / 10,
    moy_duree_f2:      Math.round(avgArr(allPoses.map(r => fieldNum(r.fields[F.DUREE_F2_J])).filter(v => v > 0))),
    mandats_signes:    allSignes.filter(r => fieldBool(r.fields[F.MANDAT_SIGNE])).length,
    mandats_total:     allSignes.length,
    par_segment, par_type_install, par_statut,
  }

  return { global, monthly, total_records: filtered.length, last_updated: new Date().toISOString() }
}

export function diffSnapshots(prev: KPIData, curr: KPIData): ChangeEntry[] {
  const changes: ChangeEntry[] = []
  const check = (metric: string, o: number, n: number, thr = 1, ctx?: string) => {
    const delta = n - o
    if (Math.abs(delta) >= thr) changes.push({
      metric, old_val: o, new_val: n, delta,
      delta_pct: o ? Math.round(delta / o * 1000) / 10 : null, context: ctx
    })
  }
  const g0 = prev.global, g1 = curr.global
  check('Contrats signés',       g0.total_signes,      g1.total_signes)
  check('Poses F2 validées',     g0.total_poses,       g1.total_poses)
  check('kWc signés',            g0.total_kwc,         g1.total_kwc, 0.5)
  check('CAPEX HT (€)',          g0.total_capex_ht,    g1.total_capex_ht, 1000)
  check('Abonnement moyen',      g0.moy_abonnement,    g1.moy_abonnement, 5)
  check('Durée moy. F2 (j)',     g0.moy_duree_f2,      g1.moy_duree_f2, 2)
  check('Durée moy. contrat',    g0.moy_duree_contrat, g1.moy_duree_contrat, 0.1)
  check('Mandats SEPA',          g0.mandats_signes,    g1.mandats_signes)

  const prevMap = Object.fromEntries(prev.monthly.map(m => [m.month, m]))
  for (const row of curr.monthly) {
    const old = prevMap[row.month]
    if (!old) {
      if (row.nb_signes > 0) changes.push({ metric: `Nouveau mois — ${row.label}`, old_val: 0, new_val: row.nb_signes, delta: row.nb_signes, delta_pct: null })
      continue
    }
    if (row.nb_signes !== old.nb_signes) check(`Signés — ${row.label}`, old.nb_signes, row.nb_signes)
    if (row.nb_poses  !== old.nb_poses)  check(`Poses — ${row.label}`, old.nb_poses, row.nb_poses)
  }
  return changes
}
