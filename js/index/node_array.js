export function append(values, value) {
  values[values.length] = value
}

export function appendAll(target, source) {
  let index = 0
  while (index < source.length) {
    target[target.length] = source[index]
    index += 1
  }
}

export function insertAt(values, index, value) {
  let cursor = values.length
  while (cursor > index) {
    values[cursor] = values[cursor - 1]
    cursor -= 1
  }
  values[index] = value
}

export function removeAt(values, index) {
  const value = values[index]
  let cursor = index
  while (cursor + 1 < values.length) {
    values[cursor] = values[cursor + 1]
    cursor += 1
  }
  values.length -= 1
  return value
}

export function takeLast(values) {
  const value = values[values.length - 1]
  values.length -= 1
  return value
}
