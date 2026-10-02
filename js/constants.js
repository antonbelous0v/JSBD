export const PAGE_SIZE = 8192
export const PAGE_MAGIC = 0x4d594450
export const DATABASE_MAGIC = 0x4d594442
export const WAL_MAGIC = 0x4d594457
export const FORMAT_VERSION = 1
export const PAGE_HEADER_SIZE = 40
export const DATABASE_HEADER_SIZE = 64

export const PageType = Object.freeze({
  META: 1,
  HEAP: 2,
  BTREE_INTERNAL: 3,
  BTREE_LEAF: 4,
  FREELIST: 5,
  CATALOG: 6
})

export const WalType = Object.freeze({
  BEGIN: 1,
  INSERT: 2,
  UPDATE: 3,
  DELETE: 4,
  PAGE_ALLOC: 5,
  PAGE_FREE: 6,
  COMMIT: 7,
  ABORT: 8,
  CHECKPOINT: 9,
  PAGE_WRITE: 10
})

export const TransactionState = Object.freeze({
  ACTIVE: "ACTIVE",
  COMMITTED: "COMMITTED",
  ABORTED: "ABORTED"
})

export const DataType = Object.freeze({
  NULL: "NULL",
  BOOLEAN: "BOOLEAN",
  INT32: "INT32",
  INT64: "INT64",
  FLOAT64: "FLOAT64",
  TEXT: "TEXT",
  TIMESTAMP: "TIMESTAMP"
})
