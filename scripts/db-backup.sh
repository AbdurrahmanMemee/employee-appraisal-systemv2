#!/usr/bin/env bash

set -u

BACKUP_DIR="/opt/eas-v2/backups"
CONTAINER_NAME="eas-mysql"
DATABASE_NAME="employee_appraisal_v2"
TIMESTAMP="$(date +%F_%H-%M-%S)"
BACKUP_FILE="${BACKUP_DIR}/eas-${TIMESTAMP}.sql"
TEMP_FILE="${BACKUP_FILE}.tmp"

mkdir -p "$BACKUP_DIR"

if ! docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    echo "$(date): Backup FAILED: container $CONTAINER_NAME was not found"
    exit 1
fi

if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME")" != "true" ]; then
    echo "$(date): Backup FAILED: container $CONTAINER_NAME is not running"
    exit 1
fi

if ! docker exec "$CONTAINER_NAME" sh -c \
    'exec mysqldump \
        --user=root \
        --password="$MYSQL_ROOT_PASSWORD" \
        --single-transaction \
        --quick \
        --routines \
        --triggers \
        --events \
        --no-tablespaces \
        employee_appraisal_v2' > "$TEMP_FILE"; then

    rm -f "$TEMP_FILE"
    echo "$(date): Backup FAILED: mysqldump returned an error"
    exit 1
fi

if [ ! -s "$TEMP_FILE" ]; then
    rm -f "$TEMP_FILE"
    echo "$(date): Backup FAILED: dump file is empty"
    exit 1
fi

mv "$TEMP_FILE" "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"

find "$BACKUP_DIR" \
    -type f \
    -name 'eas-*.sql' \
    -mtime +7 \
    -delete

echo "$(date): Backup completed successfully: $BACKUP_FILE"
