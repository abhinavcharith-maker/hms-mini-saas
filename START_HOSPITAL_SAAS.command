#!/usr/bin/env bash
set -euo pipefail

# Navigate to the project directory automatically
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Ensure Homebrew / standard macOS Node paths are available when launched from Finder
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

echo "============================================================"
echo "  VerdantCare HMS — Mini Hospital Management & Referral SaaS"
echo "============================================================"
echo "Project Directory: $SCRIPT_DIR"
echo ""

# 1. Check required dependencies (Node.js & npm)
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] Node.js and npm are required to run VerdantCare HMS."
  echo "Please install Node.js 20+ from https://nodejs.org/ and try again."
  read -r -p "Press Enter to exit..."
  exit 1
fi

echo "✓ Node.js $(node -v) & npm $(npm -v) detected."

# 2. Ensure .env configuration exists without overwriting existing data
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    echo "• Creating .env from .env.example with a fresh cryptographic SESSION_SECRET..."
    GENERATED_SECRET="$(openssl rand -hex 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
    sed "s/replace-with-secure-random-64-char-hex-secret/${GENERATED_SECRET}/" .env.example > .env
  else
    echo "[ERROR] Missing .env and .env.example files."
    read -r -p "Press Enter to exit..."
    exit 1
  fi
else
  echo "✓ Environment configuration (.env) found."
fi

# 3. Install npm packages if node_modules is missing
if [ ! -d "node_modules" ]; then
  echo "• Installing npm dependencies..."
  npm install
else
  echo "✓ Dependencies installed."
fi

# 4. Verify database availability & apply non-destructive migrations
echo "• Verifying database & applying Prisma migrations (preserving existing data)..."
if ! npx prisma generate; then
  echo "[ERROR] Failed to generate Prisma client."
  read -r -p "Press Enter to exit..."
  exit 1
fi

if ! npx prisma migrate deploy; then
  echo "[ERROR] Database verification or migration failed. Check DATABASE_URL in .env."
  read -r -p "Press Enter to exit..."
  exit 1
fi
echo "✓ Database ready and migrations up to date."

# 5. Build Next.js production bundle if .next does not exist
if [ ! -d ".next" ]; then
  echo "• Building production application bundle..."
  npm run build
fi

# 6. Check if port 3000 is already serving this app
PORT="${PORT:-3000}"
if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "✓ A server is already listening on http://localhost:$PORT"
  open "http://localhost:$PORT"
  exit 0
fi

echo "• Starting VerdantCare HMS on http://localhost:$PORT ..."
echo "  (Keep this Terminal window open while using the application; press Ctrl+C to stop)"
echo ""

# Launch background browser opener once /api/health responds
(
  for _ in $(seq 1 40); do
    if curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
      open "http://localhost:$PORT"
      break
    fi
    sleep 0.5
  done
) &

exec npm run start -- -p "$PORT"
