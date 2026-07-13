# ============================================================================
# WealthOS v1.1 (M10-M13) deploy script
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File "C:\dev\Family Office Replacement\deploy-v1.1.ps1"
# Prereqs: git configured with push access to eranganot/Family-Office,
#          Railway PROJECT token (Railway dashboard > project > Settings > Tokens)
# ============================================================================

$ErrorActionPreference = "Stop"
$repo = "C:\dev\Family Office Replacement"
$branch = "feat/m10-m13-v1.1"
$prodUrl = "https://wealthos-web-production-c1f7.up.railway.app"

Set-Location $repo

# ---- 0. Sanity: the v1.1 changes are actually in the working tree ----------
if (-not (Select-String -Path "packages\engine-strategy\src\generators.ts" -Pattern "rationaleHe" -Quiet)) {
    throw "generators.ts has no rationaleHe - wrong folder or changes missing. Aborting."
}
if (-not (Test-Path "packages\db\prisma\migrations\20260713090000_m12_allocation\migration.sql")) {
    throw "M12 migration missing. Aborting."
}
Write-Host "Sanity checks passed." -ForegroundColor Green

# ---- 1. Git state ----------------------------------------------------------
git fetch origin
$behind = git rev-list --count "HEAD..origin/main"
if ([int]$behind -gt 0) {
    throw "Local main is $behind commit(s) behind origin/main. Reconcile first (git pull --rebase), then rerun."
}

Write-Host "`nChanges to be committed:" -ForegroundColor Cyan
git status --short
$answer = Read-Host "`nCommit and push everything above? (y/n)"
if ($answer -ne "y") { throw "Aborted by user." }

# ---- 2. Branch, commit, merge --no-ff, push (repo milestone flow) ----------
git checkout -b $branch
git add -A
git commit -m "feat: v1.1 M10-M13 - Hebrew rationale, full edit UI, allocation engine, allocation drift

M10: full rationaleHe in all generators + Recommendation.rationaleHe (migration
20260713080000); locale-aware strategy UI with en fallback for pre-M10 rows.
M11: update mutations (accounts/realEstate/mortgage+tracks/cashFlow/insurance/loan,
all audited); goal+member inline edit; /mapping/edit/[id] kind-specific forms.
M12: AccountDetail.growthSharePct (migration 20260713090000); additive
SnapshotItem.growthSharePct; 7 new assumptions; allocation analyzer
(deriveTargetGrowthPct; unknown mix excluded-and-reported, refusal >50% unknown);
4 bilingual generators; risk questionnaire on strategy page.
M13: HouseholdMetrics.growthSharePct; ALLOCATION_DRIFT in DriftDetector;
drift_allocation_pct threshold wired into monitoring.

Verified: tsc all packages, engine-strategy 24 tests, engine-monitoring 17 tests,
prisma validate."

git checkout main
git merge --no-ff $branch -m "merge: $branch into main (v1.1 M10-M13)"
git push origin main
git push origin $branch
Write-Host "`nPushed. Check CI: https://github.com/eranganot/Family-Office/actions" -ForegroundColor Yellow

# ---- 3. Railway deploy ------------------------------------------------------
if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
    Write-Host "Railway CLI not found - installing..." -ForegroundColor Yellow
    npm install -g @railway/cli
}
if (-not $env:RAILWAY_TOKEN) {
    $secure = Read-Host "Paste Railway PROJECT token (input hidden)" -AsSecureString
    $env:RAILWAY_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}

# web: preDeploy applies BOTH migrations (20260713080000, 20260713090000) and
# seeds the 7 new assumptions before the new code starts.
Write-Host "`nDeploying wealthos-web..." -ForegroundColor Cyan
railway up --service wealthos-web --detach

# worker shares the monitoring code path (ALLOCATION_DRIFT) - redeploy it too.
Write-Host "Deploying wealthos-worker..." -ForegroundColor Cyan
railway up --service wealthos-worker --detach

# ---- 4. Health check --------------------------------------------------------
Write-Host "`nWaiting for the web deploy to go live (up to ~5 min)..." -ForegroundColor Cyan
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 10
    try {
        $r = Invoke-WebRequest -Uri "$prodUrl/api/health" -UseBasicParsing -TimeoutSec 10
        if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch { Write-Host "  ...not up yet ($($i+1)/30)" }
}
if ($ok) {
    Write-Host "`nDEPLOY HEALTHY: $prodUrl" -ForegroundColor Green
} else {
    Write-Host "`nHealth check did not pass in 5 min - check Railway dashboard build/deploy logs." -ForegroundColor Red
}

# ---- 5. Post-deploy checklist ------------------------------------------------
Write-Host @"

Post-deploy checklist (in the app, Hebrew UI):
 1. אסטרטגיה > שאלון סיכון - answer the 3 questions, save.
 2. מיפוי > עריכה on each pension/gemel/hishtalmut/brokerage account - fill רכיב צמיחה %.
    (Bank/cash accounts need nothing - they count as defensive automatically.)
 3. יעדים - use עריכה to set the missing target dates / required funding.
 4. אסטרטגיה > run - recommendations regenerate fully in Hebrew incl. allocation advice.
 5. ניטור - next 06:00 UTC cron (or manual run) now watches allocation drift.
"@ -ForegroundColor Cyan
