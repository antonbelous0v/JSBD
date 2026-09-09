import { WalRecord, WAL_HEADER_SIZE } from "./record.js"
import { CorruptionError } from "../errors.js"

export class WriteAheadLog {
  constructor(host, path, fd, offset, nextLSN) {
    this.host = host
    this.path = path
    this.fd = fd
    this.offset = offset
    this.nextLSN = nextLSN
    this.durableLSN = 0n
    this.bytesWritten = 0
    this.fsyncs = 0
  }

  static open(host, path) {
    const fd = host.fs.open(path, host.fs.O_RDWR | host.fs.O_CREAT)
    const size = host.fs.size(fd)
    let nextLSN = 1n
    if (size) {
      const records = [...WriteAheadLog.readAll(host, fd, size)]
      if (records.length) nextLSN = records.at(-1).lsn + 1n
    }
    return new WriteAheadLog(host, path, fd, size, nextLSN)
  }

  append(transactionId, type, pageId, payload) {
    const record = new WalRecord({ lsn: this.nextLSN++, transactionId, type, pageId, payload })
    const bytes = record.encode()
    if (this.host.fs.pwrite(this.fd, bytes, 0, bytes.length, this.offset) !== bytes.length) throw new Error("Short WAL write")
    this.offset += bytes.length
    this.bytesWritten += bytes.length
    return record.lsn
  }

  sync(lsn = this.nextLSN - 1n) {
    if (lsn <= this.durableLSN) return
    this.host.fs.fsync(this.fd)
    this.host.debug.crashPoint("after-wal-fsync")
    this.durableLSN = lsn
    this.fsyncs += 1
  }

  *records() { yield* WriteAheadLog.readAll(this.host, this.fd, this.offset) }

  static *readAll(host, fd, size) {
    let offset = 0
    while (offset < size) {
      if (size - offset < WAL_HEADER_SIZE) throw new CorruptionError("Truncated WAL header")
      const header = new Uint8Array(WAL_HEADER_SIZE)
      if (host.fs.pread(fd, header, 0, header.length, offset) !== header.length) throw new CorruptionError("Cannot read WAL header")
      const length = new DataView(header.buffer).getUint32(4, true)
      if (length < WAL_HEADER_SIZE || offset + length > size) throw new CorruptionError("Truncated WAL record")
      const bytes = new Uint8Array(length)
      if (host.fs.pread(fd, bytes, 0, length, offset) !== length) throw new CorruptionError("Cannot read WAL record")
      yield WalRecord.decode(bytes)
      offset += length
    }
  }

  close() { this.host.fs.close(this.fd) }
}
