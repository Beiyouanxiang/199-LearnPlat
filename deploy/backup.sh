#!/usr/bin/env bash
# Exam199-Study 备份脚本：数据库（WAL 三件套）+ 图片一起打包，保留 7 天。
# crontab: 0 3 * * * /data/data_home/xuyifan/Exam199-Study/deploy/backup.sh
set -euo pipefail

APP_DIR="/data/data_home/xuyifan/Exam199-Study"
BACKUP_DIR="${APP_DIR}/data/backups"
RETAIN_DAYS=7
TS=$(date +%Y%m%d-%H%M%S)
OUT="${BACKUP_DIR}/exam199-${TS}.tar.gz"

mkdir -p "${BACKUP_DIR}"
cd "${APP_DIR}"

DB_FILE="data/exam199.db"
if [ ! -f "${DB_FILE}" ]; then
  echo "[backup] 数据库不存在，跳过"
  exit 0
fi

# 动态构建文件列表：db + 可能的 wal/shm + uploads
FILES=()
FILES+=("data/exam199.db")
[ -f "data/exam199.db-wal" ] && FILES+=("data/exam199.db-wal")
[ -f "data/exam199.db-shm" ] && FILES+=("data/exam199.db-shm")
[ -d "uploads" ] && FILES+=("uploads")

tar -czf "${OUT}" "${FILES[@]}"
echo "[backup] 已备份 -> ${OUT} ($(du -h "${OUT}" | cut -f1))"

find "${BACKUP_DIR}" -name 'exam199-*.tar.gz' -mtime "+${RETAIN_DAYS}" -delete
echo "[backup] 清理 ${RETAIN_DAYS} 天前的备份完成"
