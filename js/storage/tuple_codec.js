import { BinaryWriter } from "../binary/writer.js"
import { DataType } from "../constants.js"
import { CorruptionError, ValidationError } from "../errors.js"
import { decodeUtf8, encodeUtf8 } from "../binary/utf8.js"

export class TupleCodec {
  static encode(schema, row, xmin, xmax = 0n) {
    const nullBytes = Math.ceil(schema.columns.length / 8)
    const encodedText = new Array(schema.columns.length)
    let valuesSize = 0
    for (let index = 0; index < schema.columns.length; index += 1) {
      const type = schema.columns[index].type
      const value = row[index]
      if (value === null) {
        continue
      }
      if (type === DataType.BOOLEAN) {
        valuesSize += 1
      } else if (type === DataType.INT32) {
        valuesSize += 4
      } else if (type === DataType.INT64 || type === DataType.FLOAT64 || type === DataType.TIMESTAMP) {
        valuesSize += 8
      } else if (type === DataType.TEXT) {
        encodedText[index] = encodeUtf8(value)
        valuesSize += 4 + encodedText[index].length
      } else {
        throw new ValidationError(`Unsupported type ${type}`)
      }
    }
    const bytes = new Uint8Array(20 + nullBytes + valuesSize)
    const writer = new BinaryWriter(bytes)
    writer.writeU64(xmin).writeU64(xmax).writeU16(0).writeU16(nullBytes)
    const bitmapOffset = writer.offset
    writer.offset += nullBytes
    for (let index = 0; index < schema.columns.length; index += 1) {
      const column = schema.columns[index]
      const value = row[index]
      if (value === null) {
        bytes[bitmapOffset + (index >> 3)] |= 1 << (index & 7)
        continue
      }
      if (column.type === DataType.BOOLEAN) {
        writer.writeU8(value ? 1 : 0)
      } else if (column.type === DataType.INT32) {
        writer.writeI32(value)
      } else if (column.type === DataType.INT64 || column.type === DataType.TIMESTAMP) {
        writer.writeI64(value)
      } else if (column.type === DataType.FLOAT64) {
        writer.writeF64(value)
      } else if (column.type === DataType.TEXT) {
        writer.writeU32(encodedText[index].length)
        writer.writeBytes(encodedText[index])
      }
    }
    return bytes
  }

  static decode(schema, bytes) {
    if (bytes.length < 20) {
      throw new CorruptionError("Tuple header is truncated")
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const xmin = view.getBigUint64(0, true)
    const xmax = view.getBigUint64(8, true)
    const nullBytes = view.getUint16(18, true)
    const bitmapOffset = 20
    let offset = bitmapOffset + nullBytes
    if (offset > bytes.length) {
      throw new CorruptionError("Tuple null bitmap is truncated")
    }
    const row = new Array(schema.columns.length)
    for (let index = 0; index < schema.columns.length; index += 1) {
      const column = schema.columns[index]
      if (bytes[bitmapOffset + (index >> 3)] & (1 << (index & 7))) {
        row[index] = null
        continue
      }
      let width = column.type === DataType.BOOLEAN ? 1 : column.type === DataType.INT32 ? 4 : column.type === DataType.INT64 || column.type === DataType.TIMESTAMP || column.type === DataType.FLOAT64 ? 8 : 0
      if (column.type === DataType.TEXT) {
        if (offset + 4 > bytes.length) {
          throw new CorruptionError("Tuple text length is truncated")
        }
        width = view.getUint32(offset, true)
        offset += 4
        if (offset + width > bytes.length) {
          throw new CorruptionError("Tuple text is truncated")
        }
        row[index] = decodeUtf8(bytes.subarray(offset, offset + width))
      } else {
        if (!width) {
          throw new ValidationError(`Unsupported type ${column.type}`)
        }
        if (offset + width > bytes.length) {
          throw new CorruptionError("Tuple value is truncated")
        }
        if (column.type === DataType.BOOLEAN) {
          row[index] = view.getUint8(offset) !== 0
        } else if (column.type === DataType.INT32) {
          row[index] = view.getInt32(offset, true)
        } else if (column.type === DataType.INT64 || column.type === DataType.TIMESTAMP) {
          row[index] = view.getBigInt64(offset, true)
        } else {
          row[index] = view.getFloat64(offset, true)
        }
      }
      offset += width
    }
    return { xmin, xmax, row }
  }
}
