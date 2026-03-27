#!/usr/bin/env bash
# run_alter_t_style_info.sh
# Purpose: backup t_style_info and apply alter_t_style_info.sql in either direct DB or Docker container environments.
# Usage examples:
# 1) Using direct DB client:
#    DB_HOST=127.0.0.1 DB_PORT=3308 DB_USER=root DB_PASS=changeme ./scripts/run_alter_t_style_info.sh
# 2) Using Docker container:
#    CONTAINER_NAME=fashion-mysql-simple ./scripts/run_alter_t_style_info.sh

set -euo pipefail

# Config via env or defaults
DB_HOST=${DB_HOST:-127.0.0.1}
DB_PORT=${DB_PORT:-3306}
DB_USER=${DB_USER:-root}
DB_PASS=${DB_PASS:-changeme}
DB_NAME=${DB_NAME:-fashion_supplychain}
ALTER_SQL_PATH=${ALTER_SQL_PATH:-/tmp/alter_t_style_info.sql}
BACKUP_PATH=${BACKUP_PATH:-/tmp/t_style_info_backup.sql}
CONTAINER_NAME=${CONTAINER_NAME:-}

if [ ! -f "$ALTER_SQL_PATH" ]; then
  echo "ERROR: alter SQL not found at $ALTER_SQL_PATH"
  echo "Place the file there or set ALTER_SQL_PATH to its path. You can copy the repo file:"
  echo "cp ./alter_t_style_info.sql $ALTER_SQL_PATH"
  exit 1
fi

echo "=== Backup t_style_info to $BACKUP_PATH ==="
if [ -n "$CONTAINER_NAME" ]; then
  echo "Running mysqldump inside container $CONTAINER_NAME"
  docker exec $CONTAINER_NAME /usr/bin/mysqldump -u$DB_USER -p$DB_PASS $DB_NAME t_style_info > $BACKUP_PATH
else
  mysqldump -h $DB_HOST -P $DB_PORT -u$DB_USER -p"$DB_PASS" $DB_NAME t_style_info > $BACKUP_PATH
fi

echo "Backup completed"

echo "=== Applying ALTER script: $ALTER_SQL_PATH ==="
if [ -n "$CONTAINER_NAME" ]; then
  echo "Copying SQL into container and executing"
  docker cp "$ALTER_SQL_PATH" $CONTAINER_NAME:/tmp/alter_t_style_info.sql
  docker exec -i $CONTAINER_NAME mysql -u$DB_USER -p"$DB_PASS" $DB_NAME < /tmp/alter_t_style_info.sql
else
  mysql -h $DB_HOST -P $DB_PORT -u$DB_USER -p"$DB_PASS" $DB_NAME < "$ALTER_SQL_PATH"
fi

echo "ALTER script applied. Verifying columns..."

SQL_CHECK="SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='$DB_NAME' AND TABLE_NAME='t_style_info' AND COLUMN_NAME IN ('fabric_composition_parts','fabric_composition','wash_instructions','u_code','wash_temp_code','bleach_code','tumble_dry_code','iron_code','dry_clean_code');"

if [ -n "$CONTAINER_NAME" ]; then
  docker exec -i $CONTAINER_NAME mysql -u$DB_USER -p"$DB_PASS" -e "$SQL_CHECK" $DB_NAME
else
  mysql -h $DB_HOST -P $DB_PORT -u$DB_USER -p"$DB_PASS" -e "$SQL_CHECK" $DB_NAME
fi

echo "Done. If columns present, restart backend and check logs for DbColumnRepairRunner entries." 
