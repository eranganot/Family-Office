# Railway Config as Code → `.railway/railway.ts` cutover (WO-8)

**Deadline: before 2026-12-01.** Railway stops reading `railway.json` on that date
([docs](https://docs.railway.com/deploy/config-as-code): "hard cutoff"). WealthOS's two services
take their build, start command, migrations + seed, healthcheck, cron and restart policy from
`railway.json` and `apps/worker/railway.json`. After the cutoff a deploy may start with Railway's
defaults: a wrong start command (the web app would not boot) or no migrations.

InvestWise did the same cutover on 2026-10-11 (its STATUS "PR 119"). This follows its sequence.
`.railway/railway.reference.ts` is the target; Railway does not read it.

**Owner only** (needs the Railway CLI signed in). About 20 minutes. Do steps 3–6 in one sitting
and **push nothing to main in between**: once step 3 clears the Config-file setting, a deploy
before step 5 would use dashboard defaults.

## 0. Tools (Mac, zsh)

```zsh
npm i -g @railway/cli@latest
railway login
cd ~/Dev/Family-Office
git switch main && git pull
railway link            # project vivacious-presence, environment production, service wealthos-web
```

## 1. Read the live state (read-only)

```zsh
mkdir -p /tmp/wo-cutover
railway config migrate                        > /tmp/wo-cutover/migrate-preview.txt   # preview only, changes nothing
railway config pull --json                    > /tmp/wo-cutover/live.json
```

From `live.json` note: every variable name on **wealthos-web** and **wealthos-worker**; the web
service's **volume name and mount path** (expected `/data`); whether the worker has a GitHub source.

## 2. Check the preview against the reference

Open `/tmp/wo-cutover/migrate-preview.txt` beside `.railway/railway.reference.ts`. InvestWise's
migrate output **dropped the builder and the restart policy**. Anything the reference has that
the preview lacks, you add in step 4.

## 3. Write the file and clear the Config-file setting

```zsh
railway config migrate --apply                # writes .railway/railway.ts; no deploy is triggered
```

## 4. Make `.railway/railway.ts` match the reference

- `build`: `builder: "NIXPACKS"`, `buildCommand: "npm run build"` (both services).
- web `deploy`: the `next start apps/web` start command, the migrate **and** seed preDeploy,
  `healthcheckPath: "/api/health"`, `healthcheckTimeout: 120`.
- web `volumeMounts`: exactly as `pull` shows it, `mountPath: "/data"`. **Never type a volume name
  yourself**: a wrong name can mount a new, empty volume over the household documents.
- worker `deploy`: `cronSchedule: "0 6 * * *"`, `restartPolicyType: "NEVER"`, its start command.
- `variables`: **every** name from `live.json`, each as `preserve()`. A missing name is deleted.

## 5. Plan, then apply

```zsh
railway config plan                           # MUST show: 0 to destroy, no variable removed,
                                              # no volume detached, no source detached
railway config apply                          # triggers one deploy
```

If the plan shows any destroy, stop and fix the file; do not apply. A remaining
`restartPolicyType: ON_FAILURE` diff is a known phantom (Railway stores the default as null): leave it out.

## 6. Verify (the smoke for this phase)

```zsh
SHA=$(git rev-parse --short HEAD)
bash scripts/smoke-prod.sh "" "$SHA"          # expect 15 passed, 0 failed
railway config plan                           # expect: already up to date
railway logs --deployment | grep -E "migrate|seed" | head
```

Also open one uploaded document in the app (proves `/data` is the same volume).

## 7. Commit the cutover

```zsh
git switch -c chore/wo-railway-iac
git rm railway.json apps/worker/railway.json
rm .railway/railway.reference.ts
git add .railway/railway.ts
npm run test --workspace=web                  # apps/web/test/railway-iac.test.ts now checks the real file
git commit -m "WO-8: deploy config is .railway/railway.ts (Config as Code ends 2026-12-01)"
git push -u origin chore/wo-railway-iac       # open the PR; merging deploys once more
```

After the merge deploy: `bash scripts/smoke-prod.sh "" <new sha>` again, then record the cutover
in STATUS.md.
