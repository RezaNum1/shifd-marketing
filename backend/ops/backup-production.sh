#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

required=(DATABASE_URL ASSET_STORAGE_ROOT RESTIC_REPOSITORY RESTIC_PASSWORD)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Required backup setting is missing: $name" >&2
    exit 1
  fi
done

command -v pg_dump >/dev/null || { echo "pg_dump is required." >&2; exit 1; }
command -v restic >/dev/null || { echo "restic is required." >&2; exit 1; }
[[ -d "$ASSET_STORAGE_ROOT" ]] || { echo "Asset storage directory does not exist." >&2; exit 1; }

state_dir="${BACKUP_STATE_DIR:-/var/lib/shifd-marketing-backup}"
install -d -m 0700 "$state_dir"
exec 9>"$state_dir/backup.lock"
flock -n 9 || { echo "Another backup is running." >&2; exit 1; }

work_dir=$(mktemp -d "$state_dir/run.XXXXXX")
trap 'rm -rf "$work_dir"' EXIT

echo "Creating PostgreSQL custom-format dump..."
pg_dump --format=custom --no-owner --no-privileges --file="$work_dir/database.dump" "$DATABASE_URL"
pg_restore --list "$work_dir/database.dump" >/dev/null

echo "Creating asset archive..."
tar --create --file="$work_dir/assets.tar" --directory="$ASSET_STORAGE_ROOT" .
tar --list --file="$work_dir/assets.tar" >/dev/null

if [[ "${RESTIC_INIT:-0}" == "1" ]]; then
  restic snapshots >/dev/null 2>&1 || restic init
fi

echo "Uploading encrypted backup to Restic repository..."
restic backup --tag shifd-marketing --host "${BACKUP_HOSTNAME:-$(hostname -f)}" "$work_dir/database.dump" "$work_dir/assets.tar"
restic forget --tag shifd-marketing --keep-daily 30 --keep-weekly 8 --keep-monthly 12 --prune
restic check --read-data-subset=1%
echo "Backup completed and repository check passed."
