#!/usr/bin/env bash
# Prints a demo link carrying a fresh 30-minute Deck session token (tk_) in the URL fragment.
# The org secret key comes from $DECK_SK or the macOS keychain item HOSTAWAY_CPO_DEMO_deck_sk;
# it never leaves this machine and nothing is committed.
set -euo pipefail
SITE="${SITE:-https://fredeck-deck.github.io/pms-switch-onboarding-demo/}"
SK="${DECK_SK:-$(security find-generic-password -s HOSTAWAY_CPO_DEMO_deck_sk -w 2>/dev/null || true)}"
[ -n "$SK" ] || { echo "Set DECK_SK or add the keychain item HOSTAWAY_CPO_DEMO_deck_sk" >&2; exit 1; }
resp=$(curl -sS -X POST https://api.deck.co/v2/token -H "Authorization: Bearer $SK" -d '')
token=$(printf %s "$resp" | sed -n 's/.*"token" *: *"\(tk_[^"]*\)".*/\1/p')
[ -n "$token" ] || { echo "Token mint failed: $resp" >&2; exit 1; }
expires=$(printf %s "$resp" | sed -n 's/.*"expires_at" *: *"\([^"]*\)".*/\1/p')
echo "${SITE}#token=${token}"
echo "Valid until ${expires} (UTC)" >&2
