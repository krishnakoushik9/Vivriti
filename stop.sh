#!/bin/bash

# Safe stop script for IntelliCredit services
# Only kills processes related to this specific project

echo "🛑 Stopping IntelliCredit Services..."

# Target ports for IntelliCredit services
TARGET_PORTS=(8001 8090 3001 3000)

# Function to kill process on specific port
kill_port_process() {
    local port=$1
    local pid=$(lsof -ti :$port 2>/dev/null || true)

    if [ ! -z "$pid" ] && [ "$pid" != "$$" ]; then
        echo " - Killing process on port $port (PID: $pid)"
        kill -TERM $pid 2>/dev/null || true
        sleep 3
        if ps -p $pid > /dev/null 2>&1; then
            echo " - Force killing process on port $port (PID: $pid)"
            kill -KILL $pid 2>/dev/null || true
        fi
    fi
}

# Kill processes by port (most reliable method)
echo "Stopping services by port..."
for port in "${TARGET_PORTS[@]}"; do
    kill_port_process $port
done

# Also try to kill by specific process names (safer approach)
echo "Stopping services by name..."
pkill -TERM -f "uvicorn.*main:app" 2>/dev/null || true
pkill -TERM -f "intellicredit-core" 2>/dev/null || true
pkill -TERM -f "nodemon.*server.js" 2>/dev/null || true
pkill -TERM -f "next-server" 2>/dev/null || true

sleep 5

# Force kill if still running
pkill -KILL -f "uvicorn.*main:app" 2>/dev/null || true
pkill -KILL -f "intellicredit-core" 2>/dev/null || true
pkill -KILL -f "nodemon.*server.js" 2>/dev/null || true
pkill -KILL -f "next-server" 2>/dev/null || true

# Verification
echo "Verifying all services stopped..."
ACTIVE_COUNT=0
for port in "${TARGET_PORTS[@]}"; do
    if lsof -i :$port > /dev/null 2>&1; then
        ((ACTIVE_COUNT++))
        echo " - Port $port still active"
    fi
done

if [ $ACTIVE_COUNT -eq 0 ]; then
    echo "✅ All IntelliCredit services stopped successfully"
else
    echo "⚠️  $ACTIVE_COUNT services may still be running"
fi

echo "Stop script completed."


