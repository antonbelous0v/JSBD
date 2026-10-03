import { evaluate, sqlBoolean } from "./expression.js"

export function filter(input, condition) {
  const rows = new Array(input.length)
  let count = 0
  for (let index = 0; index < input.length; index += 1) {
    if (sqlBoolean(evaluate(condition, input[index]))) {
      rows[count++] = input[index]
    }
  }
  rows.length = count
  return rows
}

export function project(input, columns) {
  const rows = new Array(input.length)
  for (let index = 0; index < input.length; index += 1) {
    const context = input[index]
    if (columns.length === 1 && columns[0].expression.type === "star") {
      rows[index] = Object.values(context).flat()
      continue
    }
    const row = new Array(columns.length)
    for (let column = 0; column < columns.length; column += 1) {
      row[column] = evaluate(columns[column].expression, context)
    }
    rows[index] = row
  }
  return rows
}

export function nestedLoopJoin(left, rightFactory, condition) {
  const right = rightFactory()
  const rows = []
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const leftRow = left[leftIndex]
      const rightRow = right[rightIndex]
      const context = { ...leftRow, ...rightRow }
      if (sqlBoolean(evaluate(condition, context))) {
        rows[rows.length] = context
      }
    }
  }
  return rows
}

export function limit(input, count) {
  if (count >= input.length) {
    return input
  }
  return input.slice(0, Math.max(0, count))
}

export function sort(input, orderBy) {
  return input.sort((left, right) => {
    for (const item of orderBy) {
      const leftValue = evaluate(item.expression, left)
      const rightValue = evaluate(item.expression, right)
      if (leftValue === rightValue) {
        continue
      }
      const order = leftValue === null ? -1 : rightValue === null ? 1 : leftValue < rightValue ? -1 : 1
      return item.direction === "DESC" ? -order : order
    }
    return 0
  })
}
