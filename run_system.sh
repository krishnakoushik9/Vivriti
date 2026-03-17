#!/bin/bash

# IntelliCredit System Startup Script
# ===================================
# This script starts all services in the correct order with proper error handling

set -euo pipefail  # Exit on any error/unset var; fail pipelines

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGS_DIR="$PROJECT_ROOT/logs"
SERVICES=(
    "ml-worker:8001:http://localhost:8001/health"
    "java-backend:8090:http://localhost:8090/actuator/health"
    "bff-node:3001:http://localhost:3001/health"
    "frontend:3000:http://localhost:3000"
)

# Create logs directory
mkdir -p "$LOGS_DIR"

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

ensure_python_venv() {
    local venv_dir="$1"
    if [ ! -d "$venv_dir" ]; then
        warning "Python venv not found at $(basename "$venv_dir"). Creating..."
        python3 -m venv "$venv_dir"
    fi
}

ensure_pip_deps() {
    local requirements_file="$1"
    if [ -f "$requirements_file" ]; then
        log "Ensuring Python dependencies are installed..."
        python -m pip install --upgrade pip setuptools wheel >/dev/null 2>&1 || true
        python -m pip install -r "$requirements_file"
    fi
}

recreate_python_venv() {
    local venv_dir="$1"
    warning "Recreating Python venv at $(basename "$venv_dir") due to dependency issues..."
    rm -rf "$venv_dir"
    python3 -m venv "$venv_dir"
}

ensure_npm_deps() {
    local dir="$1"
    cd "$dir"
    # If deps changed since last install, reinstall.
    if [ ! -d "node_modules" ]; then
        log "Installing Node.js dependencies in $(basename "$dir")..."
        npm install --no-fund --no-audit
    elif [ -f "package-lock.json" ] && [ ! -f "node_modules/.package-lock.json" ]; then
        log "Updating Node.js dependencies in $(basename "$dir")..."
        npm install --no-fund --no-audit
    elif [ -f "package-lock.json" ] && [ -f "node_modules/.package-lock.json" ] && [ "package-lock.json" -nt "node_modules/.package-lock.json" ]; then
        log "package-lock.json changed; updating deps in $(basename "$dir")..."
        npm install --no-fund --no-audit
    fi
    cd "$PROJECT_ROOT"
}

# Function to check if a port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        return 0
    else
        return 1
    fi
}

# Function to wait for service to be ready
wait_for_service() {
    local service_name=$1
    local url=$2
    local max_attempts=60  # Increased from 30
    local attempt=1

    log "Waiting for $service_name at $url..."

    while [ $attempt -le $max_attempts ]; do
        if curl -s --max-time 5 "$url" > /dev/null 2>&1; then
            success "$service_name is ready"
            return 0
        fi

        echo -n "."
        sleep 2
        ((attempt++))
    done

    echo ""
    error "$service_name failed to start after $max_attempts attempts"
    return 1
}

# Function to kill process on port
kill_port() {
    local port=$1
    local pids=$(lsof -ti :$port 2>/dev/null)
    if [ ! -z "$pids" ]; then
        echo "$pids" | xargs kill -9 2>/dev/null || true
        sleep 2
    fi
}

# Cleanup function
cleanup() {
    log "Cleaning up running services..."
    for service in "${SERVICES[@]}"; do
        IFS=':' read -r name port url <<< "$service"
        kill_port "$port"
    done
    success "Cleanup complete"
}

# Set up trap for cleanup on exit
trap cleanup EXIT INT TERM

log "🚀 Starting IntelliCredit System..."
echo "=================================================="

# 1. Stop any existing services
cleanup

# 2. Start ML Worker
log "Starting ML Worker (Port 8001)..."
cd "$PROJECT_ROOT/ml-worker-python"

# Set environment variables for ML worker
export GEMINI_API_KEY="${GEMINI_API_KEY:-AIzaSyBeGNOjMLoq_hmCiU0oT7TTD0wgPB7r0bg}"
# Enable external research by default.
export DISABLE_RESEARCH="${DISABLE_RESEARCH:-0}"
export RESEARCH_ENABLED="${RESEARCH_ENABLED:-true}"
export JWT_SECRET="${JWT_SECRET:-VivritiIntelliCreditSecretKey2025AES256BitKeyForProduction}"
export PORT=8001
export MODEL_DRIFT_THRESHOLD=0.05
export JAVA_BACKEND_URL=http://localhost:8090
export BFF_NODE_URL=http://localhost:3001

# Start ML worker with uvicorn
ensure_python_venv "venv"
source venv/bin/activate
if ! ensure_pip_deps "requirements.txt"; then
    deactivate || true
    recreate_python_venv "venv"
    source venv/bin/activate
    ensure_pip_deps "requirements.txt"
fi
nohup uvicorn main:app --host 0.0.0.0 --port 8001 --log-level info > "$LOGS_DIR/ml_worker.log" 2>&1 &
cd "$PROJECT_ROOT"

if wait_for_service "ML Worker" "http://localhost:8001/health"; then
    success "ML Worker started successfully"
else
    error "ML Worker failed to start. Check $LOGS_DIR/ml_worker.log"
    exit 1
fi

# 3. Start Java Backend
log "Starting Java Backend (Port 8090)..."
cd "$PROJECT_ROOT/core-backend-java"

# Build Java project
log "Building Java backend..."
if ! mvn clean package -DskipTests -q; then
    error "Failed to build Java backend"
    exit 1
fi

# Set environment variables for Java backend
export JAVA_OPTS="-Xms512m -Xmx1024m"
export SPRING_PROFILES_ACTIVE="${SPRING_PROFILES_ACTIVE:-default}"
export JWT_SECRET="${JWT_SECRET:-VivritiIntelliCreditSecretKey2025AES256BitKeyForProduction}"
export PYTHON_WORKER_URL=http://localhost:8001
export BFF_NODE_URL=http://localhost:3001

# Start Java backend
JAR_FILE=$(ls -t target/*.jar | head -1)
if [ -z "$JAR_FILE" ]; then
    error "No JAR file found in target directory"
    exit 1
fi
log "Starting Java backend with $JAR_FILE"
nohup java -jar "$JAR_FILE" > "$LOGS_DIR/java_backend.log" 2>&1 &
cd "$PROJECT_ROOT"

if wait_for_service "Java Backend" "http://localhost:8090/actuator/health"; then
    success "Java Backend started successfully"
else
    error "Java Backend failed to start. Check $LOGS_DIR/java_backend.log"
    exit 1
fi

# 4. Start BFF (Node.js)
log "Starting BFF Service (Port 3001)..."
kill_port 3001
ensure_npm_deps "$PROJECT_ROOT/bff-node"
cd "$PROJECT_ROOT/bff-node"

# Set environment variables for BFF
export PORT=3001
export JAVA_BACKEND_URL=http://localhost:8090
export FRONTEND_URL=http://localhost:3000
export JWT_SECRET="${JWT_SECRET:-VivritiIntelliCreditSecretKey2025AES256BitKeyForProduction}"
export PYTHON_WORKER_URL=http://localhost:8001
export NODE_ENV=development

# Start BFF
nohup npm run dev > "$LOGS_DIR/bff.log" 2>&1 &
cd "$PROJECT_ROOT"

if wait_for_service "BFF Service" "http://localhost:3001/health"; then
    success "BFF Service started successfully"
else
    error "BFF Service failed to start. Check $LOGS_DIR/bff.log"
    exit 1
fi

# 5. Start Frontend (Next.js)
log "Starting Frontend (Port 3000)..."
kill_port 3000
ensure_npm_deps "$PROJECT_ROOT/frontend-nextjs"
cd "$PROJECT_ROOT/frontend-nextjs"

# Set environment variables for frontend
export PORT=3000
export NEXT_PUBLIC_API_URL=http://localhost:3001
export NEXT_PUBLIC_BFF_URL=http://localhost:3001
export NEXT_PUBLIC_JAVA_BACKEND_URL=http://localhost:8090
export NEXT_PUBLIC_ML_WORKER_URL=http://localhost:8001
export NODE_ENV=development

# Start frontend
nohup npm run dev > "$LOGS_DIR/nextjs.log" 2>&1 &
cd "$PROJECT_ROOT"

# Give frontend more time to start
sleep 10
if wait_for_service "Frontend" "http://localhost:3000"; then
    success "Frontend started successfully"
else
    warning "Frontend may still be starting. Check $LOGS_DIR/nextjs.log"
fi

echo ""
echo "=================================================="
success "IntelliCredit System Started Successfully!"
echo ""
echo "Service URLs:"
echo "  🌐 Frontend:    http://localhost:3000"
echo "  🔗 BFF API:     http://localhost:3001"
echo "  ☕ Java Backend: http://localhost:8090"
echo "  🧠 ML Worker:   http://localhost:8001"
echo ""
echo "Logs are available in the 'logs/' directory:"
echo "  - logs/ml_worker.log"
echo "  - logs/java_backend.log"
echo "  - logs/bff.log"
echo "  - logs/nextjs.log"
echo ""
echo "To stop all services, run: ./stop.sh"
echo "=================================================="

# Keep script running to show logs
log "System is running. Press Ctrl+C to stop all services."
trap - EXIT  # Remove cleanup trap so services keep running
wait
