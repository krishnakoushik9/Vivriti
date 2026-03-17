#!/bin/bash

# Quick test script to verify each service
echo "🧪 Testing IntelliCredit Services..."

echo "1. Testing ML Worker..."
if curl -s http://localhost:8001/health > /dev/null; then
    echo "✅ ML Worker: OK"
else
    echo "❌ ML Worker: FAILED"
fi

echo "2. Testing Java Backend..."
if curl -s http://localhost:8090/actuator/health > /dev/null; then
    echo "✅ Java Backend: OK"
else
    echo "❌ Java Backend: FAILED"
fi

echo "3. Testing BFF..."
if curl -s http://localhost:3001/health > /dev/null; then
    echo "✅ BFF: OK"
else
    echo "❌ BFF: FAILED"
fi

echo "4. Testing Frontend..."
if curl -s http://localhost:3000 > /dev/null; then
    echo "✅ Frontend: OK"
else
    echo "❌ Frontend: FAILED"
fi

echo "Test complete."
