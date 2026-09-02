const table = new Uint32Array(256)

for (let index = 0; index < 256; index += 1) {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0x82f63b78 ^ (value >>> 1) : value >>> 1
  table[index] = value >>> 0
}

export function crc32c(bytes, start = 0, end = bytes.length) {
  let value = 0xffffffff
  for (let index = start; index < end; index += 1) value = table[(value ^ bytes[index]) & 0xff] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}
