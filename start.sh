#!/bin/bash

# Ensure scripts are executable
chmod +x stop.sh wait-for-it.sh

# Stop existing servers first
./stop.sh

# Create the logs directory if it doesn't exist
mkdir -p logs

# Function to check if service started successfully
check_service_startup() {
    local service_name=$1
    local url=$2
    local max_attempts=$3
    
    echo "� Verifying $service_name startup..."
    for i in $(seq 1 $max_attempts); do
        if curl -s --max-time 5 "$url" > /dev/null 2>&1; then
            echo "✅ $service_name is responding"
            return 0
        fi
        echo "⏳ Waiting for $service_name... (attempt $i/$max_attempts)"
        sleep 3
    done
    
    echo "❌ $service_name failed to respond after $max_attempts attempts"
    return 1
}

# Prerequisite checks
CHECK_FAIL=0
if ! command -v npm &> /dev/null; then echo "❌ Error: npm is not installed."; CHECK_FAIL=1; fi
if ! command -v mvn &> /dev/null; then echo "❌ Error: maven (mvn) is not installed."; CHECK_FAIL=1; fi
echo "--------------------------------------------------"
echo "🚀 Starting Vivriti IntelliCredit Ecosystem..."
echo "--------------------------------------------------"

# 1. ML Worker (Python)
echo "📦 Starting ML Worker [Port 8001]..."
if [ ! -d "ml-worker-python/venv" ]; then
    echo "⚠️ Warning: Python venv not found in ml-worker-python/."
fi
cd ml-worker-python
source venv/bin/activate
export GEMINI_API_KEY=${GEMINI_API_KEY:-"your_gemini_api_key_here"}
export JWT_SECRET=${JWT_SECRET:-"VivritiIntelliCreditSecretKey2025AES256BitKeyForProduction"}
export DISABLE_RESEARCH=${DISABLE_RESEARCH:-"0"}
export RESEARCH_ENABLED=${RESEARCH_ENABLED:-"true"}
export CRAWL_DELAY_MIN_S=${CRAWL_DELAY_MIN_S:-"0.2"}
export CRAWL_DELAY_MAX_S=${CRAWL_DELAY_MAX_S:-"0.5"}
export PORT=8001
export MODEL_DRIFT_THRESHOLD=0.05
export JAVA_BACKEND_URL=http://localhost:8090
export BFF_NODE_URL=http://localhost:3001
export BFF_RESEARCH_URL=http://localhost:3001/api/research
export BFF_URL=http://localhost:3001
nohup uvicorn main:app --host 0.0.0.0 --port 8001 --log-level info > ../logs/ml_worker.log 2>&1 &
cd ..
./wait-for-it.sh http://localhost:8001/health
if ! check_service_startup "ML Worker" "http://localhost:8001/health" 5; then
    echo "❌ Failed to start ML Worker. Check logs/ml_worker.log"
    exit 1
fi

# 2. Core Backend (Java)
echo "☕ Starting Java Core Backend [Port 8090]..."
cd core-backend-java
# Build the project first
echo "Building Java backend..."
mvn clean package -DskipTests -q
if [ $? -ne 0 ]; then
    echo "❌ Failed to build Java backend"
    exit 1
fi
export JAVA_OPTS="-Xms512m -Xmx1024m"
export SPRING_PROFILES_ACTIVE=${SPRING_PROFILES_ACTIVE:-"default"}
export JWT_SECRET=${JWT_SECRET:-"VivritiIntelliCreditSecretKey2025AES256BitKeyForProduction"}
export PYTHON_WORKER_URL=http://localhost:8001
export BFF_NODE_URL=http://localhost:3001
nohup java -jar target/*.jar > ../logs/java_backend.log 2>&1 &
cd ..
./wait-for-it.sh http://localhost:8090/actuator/health
if ! check_service_startup "Java Backend" "http://localhost:8090/actuator/health" 10; then
    echo "❌ Failed to start Java Backend. Check logs/java_backend.log"
    exit 1
fi

# 3. BFF (Node.js)
echo "🔗 Starting Node.js BFF [Port 3001]..."
if [ ! -d "bff-node/node_modules" ]; then
    echo "⚠️ Warning: node_modules not found in bff-node. Attempting auto-install..."
    cd bff-node && npm install && cd ..
fi
cd bff-node
export PORT=3001
export JAVA_BACKEND_URL=http://localhost:8090
export FRONTEND_URL=http://localhost:3000
export JWT_SECRET=${JWT_SECRET:-"VivritiIntelliCreditSecretKey2025AES256BitKeyForProduction"}
export PYTHON_WORKER_URL=http://localhost:8001
export NODE_ENV=development
nohup npm run dev > ../logs/bff.log 2>&1 &
cd ..
./wait-for-it.sh http://localhost:3001/health
if ! check_service_startup "BFF" "http://localhost:3001/health" 5; then
    echo "❌ Failed to start BFF. Check logs/bff.log"
    exit 1
fi

# 4. Frontend (Next.js)
echo "🖥️ Starting Next.js Frontend [Port 3000]..."
if [ ! -d "frontend-nextjs/node_modules" ]; then
    echo "⚠️ Warning: node_modules not found in frontend-nextjs. Attempting auto-install..."
    cd frontend-nextjs && npm install && cd ..
fi
cd frontend-nextjs
export PORT=3000
export NEXT_PUBLIC_API_URL=http://localhost:3001
export NEXT_PUBLIC_BFF_URL=http://localhost:3001
export NEXT_PUBLIC_JAVA_BACKEND_URL=http://localhost:8090
export NEXT_PUBLIC_ML_WORKER_URL=http://localhost:8001
export NODE_ENV=development
nohup npm run dev > ../logs/nextjs.log 2>&1 &
cd ..
# Give frontend a moment to start
sleep 5
if ! check_service_startup "Frontend" "http://localhost:3000" 8; then
    echo "⚠️ Frontend may still be starting or encountered port conflicts. Check logs/nextjs.log"
    echo "   It might be available on a different port if 3000 was busy."
fi


echo "--------------------------------------------------"
echo "✅ All servers started successfully!"
echo "--------------------------------------------------"
echo "Logs are available in the 'logs/' directory:"
echo " - logs/ml_worker.log"
echo " - logs/bff.log"
echo " - logs/java_backend.log"
echo " - logs/nextjs.log"
echo "--------------------------------------------------"
echo "Access the app at: http://localhost:3000"
echo "--------------------------------------------------"

