#!/bin/bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
DB_PATH="${DB_PATH:-$APP_DIR/ssy.db}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
TIMESTAMP="${BACKUP_TIMESTAMP:-$(date +%Y-%m-%dT%H-%M-%S)}"
BACKUP_PATH="$BACKUP_DIR/ssy_$TIMESTAMP.db"

if [ ! -f "$DB_PATH" ]; then
  echo "Database not found: $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
cp "$DB_PATH" "$BACKUP_PATH"

echo "$BACKUP_PATH"
