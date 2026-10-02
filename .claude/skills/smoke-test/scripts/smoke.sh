#!/bin/sh
# Usage: smoke.sh create|verify <base-url> <cookie-jar>
#   create: register a random user, create an article, list it.
#   verify: log the saved user in again and fetch the saved article.
set -u
MODE=$1; B=$2; J=$3
req() { curl -s -b "$J" -c "$J" -w "  [%{http_code}]\n" -H 'Content-Type: application/json' "$@" \
  | sed 's/"token":"[^"]*"/"token":"…"/'; }

case "$MODE" in
  create)
    U="smoke$(date +%s)"
    echo "$U" > "$J.user"
    echo "== register $U";    req -X POST "$B/api/users" -d "{\"user\":{\"email\":\"$U@example.com\",\"username\":\"$U\",\"password\":\"Passw0rd!\"}}"
    echo "== current user";   req "$B/api/user"
    echo "== create article"; req -X POST "$B/api/articles" -d "{\"article\":{\"title\":\"Smoke $U\",\"description\":\"d\",\"body\":\"b\",\"tagList\":[\"smoketest\"]}}"
    echo "== list articles";  req "$B/api/articles?author=$U"
    echo "== tags";           req "$B/api/tags"
    ;;
  verify)
    U=$(cat "$J.user")
    echo "== login $U";       req -X POST "$B/api/users/login" -d "{\"user\":{\"email\":\"$U@example.com\",\"password\":\"Passw0rd!\"}}"
    echo "== get article";    req "$B/api/articles/smoke-$U"
    ;;
  *)
    echo "usage: $0 create|verify <base-url> <cookie-jar>" >&2; exit 2 ;;
esac
