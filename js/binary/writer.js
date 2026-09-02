import { ValidationError } from "../errors.js"

const encoder = new TextEncoder()

export class BinaryWriter {
  constructor(buffer) {
    this.buffer = buffer
    this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    this.offset = 0
  }

  ensure(length) {
    if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.buffer.length) throw new ValidationError("Binary write exceeds buffer")
  }

  writeU8(value) { this.ensure(1); this.view.setUint8(this.offset, value); this.offset += 1; return this }
  writeU16(value) { this.ensure(2); this.view.setUint16(this.offset, value, true); this.offset += 2; return this }
  writeU32(value) { this.ensure(4); this.view.setUint32(this.offset, value, true); this.offset += 4; return this }
  writeU64(value) { this.ensure(8); this.view.setBigUint64(this.offset, BigInt(value), true); this.offset += 8; return this }
  writeI32(value) { this.ensure(4); this.view.setInt32(this.offset, value, true); this.offset += 4; return this }
  writeI64(value) { this.ensure(8); this.view.setBigInt64(this.offset, BigInt(value), true); this.offset += 8; return this }
  writeF64(value) { this.ensure(8); this.view.setFloat64(this.offset, value, true); this.offset += 8; return this }

  writeBytes(value) {
    this.ensure(value.length)
    this.buffer.set(value, this.offset)
    this.offset += value.length
    return this
  }

  writeString(value) {
    const bytes = encoder.encode(value)
    this.writeU32(bytes.length)
    return this.writeBytes(bytes)
  }
}
