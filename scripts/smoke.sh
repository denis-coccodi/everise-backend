#!/bin/sh
# Smoke test against a running Everise API.
#
# Usage: scripts/smoke.sh create|verify <base-url> <cookie-jar>
#   create: register a random user, create an article, list it.
#   verify: log the saved user in again and fetch the saved article,
#           e.g. after a restart or redeploy, to check the data persisted.
#
# Exits non-zero if any request returns an unexpected status code.
#
# If the target is behind Cloudflare Access (staging), set CF_ACCESS_CLIENT_ID
# and CF_ACCESS_CLIENT_SECRET to an Access service token; they are sent as
# headers on every request.
set -u
MODE=${1:-}; B=${2:-}; J=${3:-}
FAILED=0
CF_ACCESS_CLIENT_ID=${CF_ACCESS_CLIENT_ID:-}
CF_ACCESS_CLIENT_SECRET=${CF_ACCESS_CLIENT_SECRET:-}

# req <expected-status> <label> <curl args...>
req() {
  expected=$1; label=$2; shift 2
  if [ -n "$CF_ACCESS_CLIENT_ID" ]; then
    set -- -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" "$@"
  fi
  out=$(curl -s -b "$J" -c "$J" -w '\n%{redirect_url}\n%{http_code}' -H 'Content-Type: application/json' "$@")
  code=$(printf '%s' "$out" | tail -n 1)
  redirect=$(printf '%s' "$out" | tail -n 2 | head -n 1)
  if [ "$code" = "$expected" ]; then
    echo "ok   [$code] $label"
  else
    echo "FAIL [$code, expected $expected] $label"
    case "$redirect" in
      *cloudflareaccess.com*) access_hint "$redirect" ;;
      *) printf '%s\n' "$out" | sed '$d' | sed '$d' | sed 's/"token":"[^"]*"/"token":"…"/' | head -c 500; echo ;;
    esac
    FAILED=1
  fi
}

# Explains a redirect to the Cloudflare Access login, using the flags Access
# puts in the redirect's "meta" token (no secrets are printed).
access_hint() {
  echo "     Blocked by Cloudflare Access (redirected to its login page)."
  meta=$(printf '%s' "$1" | sed -n 's/.*[?&]meta=\([^&]*\).*/\1/p' | cut -d. -f2 | tr '_-' '/+')
  while [ $(( ${#meta} % 4 )) -ne 0 ]; do meta="$meta="; done
  flags=$(printf '%s' "$meta" | base64 -d 2>/dev/null | grep -oE '"(service_token_status|auth_status)":("[^"]*"|true|false)' | sort -u | tr '\n' ' ')
  [ -n "$flags" ] && echo "     Access says: $flags"
  if [ -z "$CF_ACCESS_CLIENT_ID" ]; then
    echo "     No service token sent: set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET."
  else
    case "$flags" in
      *'"service_token_status":true'*) echo "     The token is valid, but no Service Auth policy on this app includes it." ;;
      *) echo "     The token was not accepted: check the secrets hold only the values (no 'CF-Access-Client-...:' prefix or spaces) and the token is not revoked." ;;
    esac
  fi
}

case "$MODE" in
  create)
    U="smoke$(date +%s)"
    echo "$U" > "$J.user"
    req 201 "register $U"   -X POST "$B/api/users" -d "{\"user\":{\"email\":\"$U@example.com\",\"username\":\"$U\",\"password\":\"Passw0rd!\"}}"
    req 200 "current user"  "$B/api/user"
    req 201 "create article" -X POST "$B/api/articles" -d "{\"article\":{\"title\":\"Smoke $U\",\"description\":\"d\",\"body\":\"b\",\"tagList\":[\"smoketest\"]}}"
    req 200 "list articles" "$B/api/articles?author=$U"
    req 200 "list tags"     "$B/api/tags"
    ;;
  verify)
    U=$(cat "$J.user")
    req 200 "login $U"      -X POST "$B/api/users/login" -d "{\"user\":{\"email\":\"$U@example.com\",\"password\":\"Passw0rd!\"}}"
    req 200 "get article"   "$B/api/articles/smoke-$U"
    ;;
  *)
    echo "usage: $0 create|verify <base-url> <cookie-jar>" >&2
    exit 2
    ;;
esac

exit $FAILED
