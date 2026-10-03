#!/bin/sh
# Smoke test against a running Conduit API.
#
# Usage: scripts/smoke.sh create|verify <base-url> <cookie-jar>
#   create: register a random user, create an article, list it.
#   verify: log the saved user in again and fetch the saved article,
#           e.g. after a restart or redeploy, to check the data persisted.
#
# Exits non-zero if any request returns an unexpected status code.
set -u
MODE=${1:-}; B=${2:-}; J=${3:-}
FAILED=0

# req <expected-status> <label> <curl args...>
req() {
  expected=$1; label=$2; shift 2
  out=$(curl -s -b "$J" -c "$J" -w '\n%{http_code}' -H 'Content-Type: application/json' "$@")
  code=$(printf '%s' "$out" | tail -n 1)
  if [ "$code" = "$expected" ]; then
    echo "ok   [$code] $label"
  else
    echo "FAIL [$code, expected $expected] $label"
    printf '%s\n' "$out" | sed '$d' | sed 's/"token":"[^"]*"/"token":"…"/' | head -c 500
    echo
    FAILED=1
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
