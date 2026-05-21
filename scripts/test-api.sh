#!/bin/bash

echo "Testing API Endpoints"
echo "========================"

# Test 1: Card Categories (no auth needed)
echo ""
echo "1. Testing /api/card-categories:"
curl -s http://localhost:3001/api/card-categories | jq -r 'keys[]' | head -3

# Test 2: Test with fake auth token (should fail gracefully)
echo ""
echo "2. Testing /api/cards/recategorize with fake token:"
curl -s -X POST \
  -H "Authorization: Bearer fake-token" \
  -H "Content-Type: application/json" \
  http://localhost:3001/api/cards/recategorize

echo ""
echo ""
echo "API endpoint tests completed"
