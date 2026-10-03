import { CorruptionError } from "../errors.js"
import { decodeUtf8 } from "./utf8.js"

export class BinaryReader {
  constructor(buffer) {
    this.buffer = buffer
    this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    this.offset = 0
  }

  ensure(length) {
    if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.buffer.length) {
      throw new CorruptionError("Binary read exceeds buffer")
    }
  }

  readU8() {
    this.ensure(1)
    const value = this.view.getUint8(this.offset)
    this.offset += 1
    return value
  }

  readU16() {
    this.ensure(2)
    const value = this.view.getUint16(this.offset, true)
    this.offset += 2
    return value
  }

  readU32() {
    this.ensure(4)
    const value = this.view.getUint32(this.offset, true)
    this.offset += 4
    return value
  }

  readU64() {
    this.ensure(8)
    const value = this.view.getBigUint64(this.offset, true)
    this.offset += 8
    return value
  }

  readI32() {
    this.ensure(4)
    const value = this.view.getInt32(this.offset, true)
    this.offset += 4
    return value
  }

  readI64() {
    this.ensure(8)
    const value = this.view.getBigInt64(this.offset, true)
    this.offset += 8
    return value
  }

  readF64() {
    this.ensure(8)
    const value = this.view.getFloat64(this.offset, true)
    this.offset += 8
    return value
  }

  readBytes(length) {
    this.ensure(length)
    const value = this.buffer.subarray(this.offset, this.offset + length)
    this.offset += length
    return value
  }

  readString() {
    return decodeUtf8(this.readBytes(this.readU32()))
  }
}
