#!/bin/sh
# Smoke test against a running Everise API.
#
# Usage: scripts/smoke.sh create|verify <base-url> <cookie-jar>
#   create: register a random user, create an article, list it. When the
#           API confirms emails (RESEND_API_KEY set), the sign-up answers
#           "check your email" and signing in is refused until the link is
#           opened, so that is checked instead of the article. The address
#           is Resend's test inbox (delivered+...@resend.dev), which accepts
#           the email and delivers it nowhere.
#   verify: log the saved user in again and fetch the saved article (by its id),
#           e.g. after a restart or redeploy, to check the data persisted
#           (or, for an unconfirmed sign-up, that sign-in is still refused).
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
  BODY=$(printf '%s\n' "$out" | sed '$d' | sed '$d')
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
    E="delivered+$U@resend.dev"
    echo "$U" > "$J.user"
    rm -f "$J.unconfirmed"
    req 201 "register $U"   -X POST "$B/api/users" -d "{\"user\":{\"email\":\"$E\",\"username\":\"$U\",\"password\":\"Passw0rd!\"}}"
    case "$BODY" in
      *'"confirmation"'*)
        echo "     a confirmation link was emailed"
        touch "$J.unconfirmed"
        req 403 "sign-in refused until the email is confirmed" -X POST "$B/api/users/login" -d "{\"user\":{\"email\":\"$E\",\"password\":\"Passw0rd!\"}}"
        ;;
      *)
        req 200 "current user"  "$B/api/user"
        req 201 "create article" -X POST "$B/api/articles" -d "{\"article\":{\"title\":\"Smoke $U\",\"description\":\"d\",\"body\":\"b\",\"tagList\":[\"smoketest\"]}}"
        printf '%s' "$BODY" | sed -n 's/.*"article":{"id":"\([^"]*\)".*/\1/p' > "$J.article"
        req 200 "list articles" "$B/api/articles?author=$U"
        ;;
    esac
    req 200 "list tags"     "$B/api/tags"
    ;;
  verify)
    U=$(cat "$J.user")
    E="delivered+$U@resend.dev"
    if [ -f "$J.unconfirmed" ]; then
      req 403 "login $U (unconfirmed)" -X POST "$B/api/users/login" -d "{\"user\":{\"email\":\"$E\",\"password\":\"Passw0rd!\"}}"
    else
      req 200 "login $U"      -X POST "$B/api/users/login" -d "{\"user\":{\"email\":\"$E\",\"password\":\"Passw0rd!\"}}"
      req 200 "get article"   "$B/api/articles/$(cat "$J.article")"
    fi
    ;;
  *)
    echo "usage: $0 create|verify <base-url> <cookie-jar>" >&2
    exit 2
    ;;
esac

exit $FAILED
