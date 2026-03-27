#!/bin/bash
set -e

APP_DIR="/var/www/ssy"
BACKUP_DIR="$APP_DIR/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "=== SSY Deploy ==="

# 1. Backup database before deploy
if [ -f "$APP_DIR/ssy.db" ]; then
  mkdir -p "$BACKUP_DIR"
  cp "$APP_DIR/ssy.db" "$BACKUP_DIR/ssy_pre_deploy_$TIMESTAMP.db"
  echo "✓ Database backed up"
fi

# 2. Pull latest code (if git remote configured)
cd "$APP_DIR"
if git remote -v | grep -q origin; then
  git pull origin main 2>/dev/null || git pull origin master 2>/dev/null || echo "⚠ Git pull skipped (no remote or conflict)"
  echo "✓ Code updated"
else
  echo "⚠ No git remote configured, skipping pull"
fi

# 3. Install dependencies
npm install --omit=dev
echo "✓ Dependencies installed"

# 4. Restart application
pm2 restart ssy 2>/dev/null || pm2 start ecosystem.config.js
echo "✓ Application restarted"

# 5. Health check
sleep 2
if curl -sf http://localhost:3000/api/auth/status > /dev/null; then
  echo "✓ Health check passed"
else
  echo "✗ Health check failed!"
  echo "  Check logs: pm2 logs ssy --lines 20"
  exit 1
fi

echo "=== Deploy complete ==="
