#\!/bin/bash

# Test transaction update API
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"zuomiao.hu@gmail.com\", \"password\": \"testpassword\"}")

echo "Login response: $LOGIN_RESPONSE"

TOKEN=$(echo "$LOGIN_RESPONSE" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

echo "Token: $TOKEN"

if [ \! -z "$TOKEN" ]; then
  echo "Testing PUT /api/transactions/1"
  curl -v -X PUT http://localhost:3001/api/transactions/1 \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"amount\": -25.50, \"description\": \"Updated Test Transaction\", \"category\": \"Food\"}"
else
  echo "Failed to get token"
fi
SCRIPT_END < /dev/null