import { CorruptionError, ValidationError } from "../errors.js"

export function encodeUtf8(value) {
  const bytes = []
  for (let index = 0; index < value.length; index += 1) {
    let point = value.charCodeAt(index)
    if (point >= 0xd800 && point <= 0xdbff) {
      const low = value.charCodeAt(++index)
      if (low < 0xdc00 || low > 0xdfff) throw new ValidationError("Invalid UTF-16 surrogate pair")
      point = 0x10000 + ((point - 0xd800) << 10) + low - 0xdc00
    } else if (point >= 0xdc00 && point <= 0xdfff) throw new ValidationError("Invalid UTF-16 surrogate pair")
    if (point < 0x80) bytes.push(point)
    else if (point < 0x800) bytes.push(0xc0 | point >> 6, 0x80 | point & 0x3f)
    else if (point < 0x10000) bytes.push(0xe0 | point >> 12, 0x80 | point >> 6 & 0x3f, 0x80 | point & 0x3f)
    else bytes.push(0xf0 | point >> 18, 0x80 | point >> 12 & 0x3f, 0x80 | point >> 6 & 0x3f, 0x80 | point & 0x3f)
  }
  return Uint8Array.from(bytes)
}

export function decodeUtf8(bytes) {
  let value = ""
  for (let index = 0; index < bytes.length;) {
    const first = bytes[index++]
    let point
    let remaining
    if (first < 0x80) { point = first; remaining = 0 }
    else if (first >= 0xc2 && first <= 0xdf) { point = first & 0x1f; remaining = 1 }
    else if (first >= 0xe0 && first <= 0xef) { point = first & 0x0f; remaining = 2 }
    else if (first >= 0xf0 && first <= 0xf4) { point = first & 0x07; remaining = 3 }
    else throw new CorruptionError("Invalid UTF-8 sequence")
    for (let offset = 0; offset < remaining; offset += 1) {
      const next = bytes[index++]
      if ((next & 0xc0) !== 0x80) throw new CorruptionError("Invalid UTF-8 sequence")
      point = point << 6 | next & 0x3f
    }
    if (point > 0x10ffff || point >= 0xd800 && point <= 0xdfff || remaining === 2 && point < 0x800 || remaining === 3 && point < 0x10000) throw new CorruptionError("Invalid UTF-8 sequence")
    value += String.fromCodePoint(point)
  }
  return value
}
