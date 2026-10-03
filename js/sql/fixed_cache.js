import { ValidationError } from "../errors.js"

export class FixedCache {
  constructor(capacity) {
    if (!Number.isSafeInteger(capacity) || capacity < 2 || capacity & capacity - 1) {
      throw new ValidationError("Cache capacity must be a power of two")
    }
    this.keys = new Array(capacity)
    this.values = new Array(capacity)
    this.mask = capacity - 1
    this.size = 0
  }

  get(key) {
    let index = hash(key) & this.mask
    let probes = 0
    while (probes <= this.mask) {
      const stored = this.keys[index]
      if (stored === key) {
        return this.values[index]
      }
      if (stored === undefined) {
        return undefined
      }
      index = index + 1 & this.mask
      probes += 1
    }
    return undefined
  }

  set(key, value) {
    if (this.size * 4 >= this.keys.length * 3) {
      this.clear()
    }
    let index = hash(key) & this.mask
    while (this.keys[index] !== undefined && this.keys[index] !== key) {
      index = index + 1 & this.mask
    }
    if (this.keys[index] === undefined) {
      this.size += 1
    }
    this.keys[index] = key
    this.values[index] = value
  }

  clear() {
    this.keys.fill(undefined)
    this.values.fill(undefined)
    this.size = 0
  }
}

function hash(value) {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result = Math.imul(result ^ value.charCodeAt(index), 16777619)
  }
  return result >>> 0
}
