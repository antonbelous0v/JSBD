import { WriteAheadLog } from "../wal/wal.js"

export function inspectWal(host, path) {
  const wal = WriteAheadLog.open(host, path)
  try {
    return [...wal.records()].map(record => ({ lsn: record.lsn, transactionId: record.transactionId, type: record.type, pageId: record.pageId, bytes: record.payload.length }))
  } finally { wal.close() }
}
