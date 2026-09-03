import { FORMAT_VERSION, PAGE_HEADER_SIZE, PAGE_MAGIC, PAGE_SIZE } from "../constants.js"
import { crc32c } from "../binary/checksum.js"
import { CorruptionError, ValidationError } from "../errors.js"

const CHECKSUM_OFFSET = 24

export class Page {
  constructor(id, type, bytes = new Uint8Array(PAGE_SIZE)) {
    if (!Number.isSafeInteger(id) || id < 0) throw new ValidationError("Invalid page id")
    if (!(bytes instanceof Uint8Array) || bytes.length !== PAGE_SIZE) throw new ValidationError("Invalid page buffer")
    this.id = id
    this.type = type
    this.bytes = bytes
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    this.dirty = false
    this.pinCount = 0
    this.referenced = true
  }

  static create(id, type) {
    const page = new Page(id, type)
    page.view.setUint32(0, PAGE_MAGIC, true)
    page.view.setUint16(4, FORMAT_VERSION, true)
    page.view.setUint32(8, id, true)
    page.view.setUint16(12, type, true)
    page.view.setBigUint64(16, 0n, true)
    page.view.setUint16(28, PAGE_HEADER_SIZE, true)
    page.view.setUint16(30, PAGE_SIZE, true)
    page.seal()
    return page
  }

  static decode(bytes, expectedId) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (bytes.length !== PAGE_SIZE || view.getUint32(0, true) !== PAGE_MAGIC) throw new CorruptionError("Invalid page magic")
    if (view.getUint16(4, true) !== FORMAT_VERSION) throw new CorruptionError("Unsupported page version")
    if (view.getUint32(8, true) !== expectedId) throw new CorruptionError("Page id mismatch")
    const stored = view.getUint32(CHECKSUM_OFFSET, true)
    view.setUint32(CHECKSUM_OFFSET, 0, true)
    const actual = crc32c(bytes)
    view.setUint32(CHECKSUM_OFFSET, stored, true)
    if (actual !== stored) throw new CorruptionError(`Checksum mismatch for page ${expectedId}`)
    return new Page(expectedId, view.getUint16(12, true), bytes)
  }

  get pageLSN() { return this.view.getBigUint64(16, true) }
  set pageLSN(value) { this.view.setBigUint64(16, BigInt(value), true) }
  get freeStart() { return this.view.getUint16(28, true) }
  set freeStart(value) { this.view.setUint16(28, value, true) }
  get freeEnd() { return this.view.getUint16(30, true) }
  set freeEnd(value) { this.view.setUint16(30, value, true) }

  seal() {
    this.view.setUint32(CHECKSUM_OFFSET, 0, true)
    this.view.setUint32(CHECKSUM_OFFSET, crc32c(this.bytes), true)
  }
}
