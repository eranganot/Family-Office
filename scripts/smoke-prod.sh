#!/usr/bin/env bash
# Read-only production smoke (GET only), runnable on the Mac or in CI.
#   scripts/smoke-prod.sh [base_url] [expected_short_sha]
set -u
BASE="${1:-https://wealthos-web-production-c1f7.up.railway.app}"
SHA="${2:-}"
pass=0; fail=0
ok()  { echo "PASS  $1"; pass=$((pass+1)); }
bad() { echo "FAIL  $1"; fail=$((fail+1)); }

health=$(curl -s -m 20 "$BASE/api/health")
echo "$health" | grep -q '"ok":true' && ok "/api/health ok" || bad "/api/health: $health"
echo "$health" | grep -q '"db":{"ok":true' && ok "/api/health database ping" || bad "no database ping in /api/health"
commit=$(echo "$health" | sed -n 's/.*"commit":"\([0-9a-f]*\)".*/\1/p')
[ -n "$commit" ] && ok "/api/health reports commit $commit" || bad "/api/health has no commit"
if [ -n "$SHA" ]; then [ "$commit" = "$SHA" ] && ok "serving expected $SHA" || bad "serving '$commit', expected $SHA"; fi

loc=$(curl -s -o /dev/null -m 20 -w '%{http_code} %{redirect_url}' "$BASE/")
case "$loc" in 307*/he/login*) ok "/ redirects anonymous users to /he/login";; *) bad "/ answered: $loc";; esac
for p in /he/allocation /he/strategy /he/scenarios; do
  r=$(curl -s -o /dev/null -m 20 -w '%{http_code} %{redirect_url}' "$BASE$p")
  case "$r" in 307*login*) ok "$p is not served anonymously";; *) bad "$p answered anonymously: $r";; esac
done

hdr=$(curl -sI -m 20 "$BASE/he/login" | tr 'A-Z' 'a-z')
echo "$hdr" | grep -q '^http/[0-9.]* 200' && ok "/he/login 200" || bad "/he/login not 200"
for h in strict-transport-security x-frame-options content-security-policy x-content-type-options referrer-policy; do
  echo "$hdr" | grep -q "^$h:" && ok "header $h" || bad "header $h missing"
done
case "$BASE" in https://*)
  echo "$hdr" | grep '^set-cookie: next_locale' | grep -q 'secure' && ok "NEXT_LOCALE cookie is Secure" || bad "NEXT_LOCALE cookie lacks Secure";;
esac

echo "=== $pass passed, $fail failed ==="
[ "$fail" -eq 0 ]
