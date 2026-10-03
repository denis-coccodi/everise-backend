#!/bin/sh
# Prints how many articles a running Everise API holds. CI runs it before and
# after a deploy to check that no data was lost (e.g. a deploy to a Worker or
# database with the wrong name starts empty).
#
# Usage: scripts/count-articles.sh <base-url>
#
# For an API behind Cloudflare Access (staging), set CF_ACCESS_CLIENT_ID and
# CF_ACCESS_CLIENT_SECRET to an Access service token.
set -u
B=${1:?usage: $0 <base-url>}
CF_ACCESS_CLIENT_ID=${CF_ACCESS_CLIENT_ID:-}
CF_ACCESS_CLIENT_SECRET=${CF_ACCESS_CLIENT_SECRET:-}

if [ -n "$CF_ACCESS_CLIENT_ID" ]; then
  body=$(curl -sf -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" "$B/api/articles?limit=1000000")
else
  body=$(curl -sf "$B/api/articles?limit=1000000")
fi

# articlesCount is the size of the returned page, hence the large limit.
count=$(printf '%s' "$body" | grep -oE '"articlesCount":[0-9]+' | cut -d: -f2)
if [ -z "$count" ]; then
  echo "could not read articlesCount from $B/api/articles" >&2
  exit 1
fi
echo "$count"
