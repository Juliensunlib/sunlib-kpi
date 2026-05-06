# SunLib KPI Dashboard

Dashboard de KPIs temps-réel pour la direction SunLib, connecté à Airtable avec journal des modifications.

## Stack
- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS** pour le style
- **Recharts** pour les graphiques
- **Vercel** pour l'hébergement
- **Airtable REST API** comme source de données

## Fonctionnalités
- 🔐 Accès protégé par mot de passe (cookie JWT, 7 jours)
- 📊 KPIs mois par mois : contrats signés, poses (F2), CAPEX, kWc, durée
- 🔍 Filtres ISO : segment (Pro/Solo/Duo), type d'installation, année
- 📋 Journal des modifications : détecte automatiquement les changements de KPIs entre snapshots
- 📸 Snapshots manuels ou automatiques (via cron)

## Déploiement

### 1. Créer le repo GitHub
```bash
git init
git add .
git commit -m "init: sunlib-kpi dashboard"
git remote add origin https://github.com/VOTRE_ORG/sunlib-kpi.git
git push -u origin main
```

### 2. Créer la table KPI_Snapshots dans Airtable (BDD Abonné)
Créer manuellement une table avec ces champs :
- `snapshot_date` (Date)
- `snapshot_data` (Long text)
- `changes` (Long text)
- `triggered_by` (Single line text)

Récupérer l'ID de la table (tblXXXXXXXXXXXXXX depuis l'URL Airtable).

### 3. Variables d'environnement Vercel
```
KPI_PASSWORD=votre_mot_de_passe_securise
JWT_SECRET=$(openssl rand -base64 32)
AIRTABLE_API_KEY=patXXXXXXXXXXXXXX.XXXXXXXXXXXXXXXX
AIRTABLE_BASE_ID=appe55vTZRk6Ssd2w
AIRTABLE_ABONNES_TABLE=tblcACuSWYttnFQNr
AIRTABLE_SNAPSHOTS_TABLE=tblXXXXXXXXXXXXXX
```

### 4. Déployer sur Vercel
Importer le repo GitHub dans Vercel, ajouter les env vars, déployer.

### 5. (Optionnel) Snapshot automatique quotidien
Ajouter un cron Vercel dans `vercel.json` :
```json
{
  "crons": [{ "path": "/api/snapshot", "schedule": "0 8 * * *" }]
}
```

## Dev local
```bash
cp .env.example .env.local
# Remplir .env.local avec vos vraies valeurs
npm install
npm run dev
```

## Architecture KPIs
| KPI | Source | Description |
|-----|--------|-------------|
| Contrats signés | `Contrat d'abonnement signé` = true | Grouped par `Mois de signature contrat` |
| Poses (F2) | `Etat facture 2` = Validée | Grouped par mois de pose calculé |
| CAPEX HT | `Prix installation HT pro` | Somme par mois de signature |
| kWc | `Puissance installe en KWc` | Somme par mois |
| Durée F2 | `Durée entre date signature et facture 2 validée` | Moyenne (valeurs > 0 uniquement) |
| Abonnement moyen | `Prix En nombre` | Moyenne en €/mois |
| Durée contrat | `Durée contrat KPI` | Moyenne en années |

## Journal des modifications (changelog)
Le système compare chaque snapshot avec le précédent et détecte :
- Variations des KPIs globaux (ex: +3 contrats signés)
- Variations par mois (ex: Octobre 2025 : +2 poses)
- Nouveaux mois qui apparaissent

Cliquer sur **📸 Snapshot** pour créer un point de comparaison manuel.
