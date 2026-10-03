import { crc32c } from "../binary/checksum.js"
import { DATABASE_HEADER_SIZE, DATABASE_MAGIC, FORMAT_VERSION, PAGE_SIZE } from "../constants.js"
import { CorruptionError } from "../errors.js"

const CHECKSUM_OFFSET = 48

export class DatabaseHeader {
  constructor({ databaseId, catalogRoot = 0, freeListRoot = 0, checkpointLSN = 0n, pageCount = 1 }) {
    this.databaseId = BigInt(databaseId)
    this.catalogRoot = catalogRoot
    this.freeListRoot = freeListRoot
    this.checkpointLSN = BigInt(checkpointLSN)
    this.pageCount = pageCount
  }

  encode(target) {
    const view = new DataView(target.buffer, target.byteOffset, target.byteLength)
    view.setUint32(0, DATABASE_MAGIC, true)
    view.setUint16(4, FORMAT_VERSION, true)
    view.setUint32(8, PAGE_SIZE, true)
    view.setBigUint64(16, this.databaseId, true)
    view.setUint32(24, this.catalogRoot, true)
    view.setUint32(28, this.freeListRoot, true)
    view.setBigUint64(32, this.checkpointLSN, true)
    view.setUint32(40, this.pageCount, true)
    view.setUint32(CHECKSUM_OFFSET, 0, true)
    view.setUint32(CHECKSUM_OFFSET, crc32c(target, 0, DATABASE_HEADER_SIZE), true)
  }

  static decode(source) {
    const view = new DataView(source.buffer, source.byteOffset, source.byteLength)
    if (view.getUint32(0, true) !== DATABASE_MAGIC) {
      throw new CorruptionError("Invalid database magic")
    }
    if (view.getUint16(4, true) !== FORMAT_VERSION || view.getUint32(8, true) !== PAGE_SIZE) {
      throw new CorruptionError("Unsupported database format")
    }
    const stored = view.getUint32(CHECKSUM_OFFSET, true)
    view.setUint32(CHECKSUM_OFFSET, 0, true)
    const actual = crc32c(source, 0, DATABASE_HEADER_SIZE)
    view.setUint32(CHECKSUM_OFFSET, stored, true)
    if (actual !== stored) {
      throw new CorruptionError("Database header checksum mismatch")
    }
    return new DatabaseHeader({ databaseId: view.getBigUint64(16, true), catalogRoot: view.getUint32(24, true), freeListRoot: view.getUint32(28, true), checkpointLSN: view.getBigUint64(32, true), pageCount: view.getUint32(40, true) })
  }
}
