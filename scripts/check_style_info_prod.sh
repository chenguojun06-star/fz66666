#!/usr/bin/env bash
# check_style_info_prod.sh
# Usage examples:
# 1) Direct DB:
#    DB_HOST=127.0.0.1 DB_PORT=3308 DB_USER=root DB_PASS=changeme DB_NAME=fashion_supplychain ./scripts/check_style_info_prod.sh
# 2) Docker container:
#    CONTAINER_NAME=fashion-mysql-simple DB_USER=root DB_PASS=changeme DB_NAME=fashion_supplychain ./scripts/check_style_info_prod.sh

set -euo pipefail

DB_HOST=${DB_HOST:-127.0.0.1}
DB_PORT=${DB_PORT:-3306}
DB_USER=${DB_USER:-root}
DB_PASS=${DB_PASS:-changeme}
DB_NAME=${DB_NAME:-fashion_supplychain}
CONTAINER_NAME=${CONTAINER_NAME:-}

SQL_COLUMNS="SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='$DB_NAME' AND TABLE_NAME='t_style_info' AND COLUMN_NAME IN ('fabric_composition_parts','fabric_composition','wash_instructions','u_code','wash_temp_code','bleach_code','tumble_dry_code','iron_code','dry_clean_code');"

SQL_FLYWAY="SELECT installed_rank, version, description, script, success, installed_on FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 30;"

echo "=== Checking t_style_info columns in database '$DB_NAME' ==="
if [ -n "$CONTAINER_NAME" ]; then
  echo "Running inside container: $CONTAINER_NAME"
  docker exec -i $CONTAINER_NAME mysql -u$DB_USER -p"$DB_PASS" -e "$SQL_COLUMNS" $DB_NAME || true
else
  mysql -h $DB_HOST -P $DB_PORT -u$DB_USER -p"$DB_PASS" -e "$SQL_COLUMNS" $DB_NAME || true
fi

echo "\n=== Checking flyway_schema_history (latest 30) ==="
if [ -n "$CONTAINER_NAME" ]; then
  docker exec -i $CONTAINER_NAME mysql -u$DB_USER -p"$DB_PASS" -e "$SQL_FLYWAY" $DB_NAME || true
else
  mysql -h $DB_HOST -P $DB_PORT -u$DB_USER -p"$DB_PASS" -e "$SQL_FLYWAY" $DB_NAME || true
fi

echo "\n=== Done. Paste the outputs here for review. ==="
