#!/bin/bash
# wait-for-it.sh - simple check for port readiness

URL=$1
MAX_RETRIES=60
RETRY_INTERVAL=2

echo "⏳ Waiting for $URL to be ready..."
for i in $(seq 1 $MAX_RETRIES); do
  # Use GET instead of HEAD as some frameworks return 405 for HEAD
  # Check for 200 OK or 401/403 (means app is up but needs auth)
  # Added -k for insecure if needed, though not strictly required here
  STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
  
  if [[ "$STATUS_CODE" -ge 200 && "$STATUS_CODE" -lt 500 ]]; then
    echo "✅ $URL is ready (Status: $STATUS_CODE)!"
    exit 0
  fi
  
  printf "."
  sleep $RETRY_INTERVAL
done

echo -e "\n❌ Timeout waiting for $URL after $((MAX_RETRIES * RETRY_INTERVAL)) seconds."
exit 1

