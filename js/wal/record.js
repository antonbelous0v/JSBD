import { BinaryReader } from "../binary/reader.js"
import { BinaryWriter } from "../binary/writer.js"
import { crc32c } from "../binary/checksum.js"
import { WAL_MAGIC } from "../constants.js"
import { CorruptionError, ValidationError } from "../errors.js"

export const WAL_HEADER_SIZE = 40

export class WalRecord {
  constructor({ lsn, transactionId, type, pageId = 0xffffffff, payload = new Uint8Array() }) {
    if (!(payload instanceof Uint8Array)) {
      throw new ValidationError("WAL payload must be bytes")
    }
    this.lsn = BigInt(lsn)
    this.transactionId = BigInt(transactionId)
    this.type = type
    this.pageId = pageId
    this.payload = payload
  }

  encode() {
    const bytes = new Uint8Array(WAL_HEADER_SIZE + this.payload.length)
    const writer = new BinaryWriter(bytes)
    writer.writeU32(WAL_MAGIC).writeU32(bytes.length).writeU64(this.lsn).writeU64(this.transactionId).writeU16(this.type).writeU16(0).writeU32(this.pageId).writeU32(this.payload.length).writeU32(0).writeBytes(this.payload)
    new DataView(bytes.buffer).setUint32(36, crc32c(bytes), true)
    return bytes
  }

  static decode(bytes) {
    const reader = new BinaryReader(bytes)
    if (reader.readU32() !== WAL_MAGIC) {
      throw new CorruptionError("Invalid WAL magic")
    }
    const length = reader.readU32()
    if (length !== bytes.length || length < WAL_HEADER_SIZE) {
      throw new CorruptionError("Invalid WAL record length")
    }
    const lsn = reader.readU64()
    const transactionId = reader.readU64()
    const type = reader.readU16()
    reader.readU16()
    const pageId = reader.readU32()
    const payloadLength = reader.readU32()
    const stored = reader.readU32()
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(36, 0, true)
    const actual = crc32c(bytes)
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(36, stored, true)
    if (stored !== actual || payloadLength !== length - WAL_HEADER_SIZE) {
      throw new CorruptionError("WAL checksum mismatch")
    }
    return new WalRecord({ lsn, transactionId, type, pageId, payload: reader.readBytes(payloadLength) })
  }
}
