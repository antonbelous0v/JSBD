import { evaluate, sqlBoolean } from "./expression.js"

export function* filter(input, condition) {
  for (const row of input) if (sqlBoolean(evaluate(condition, row))) yield row
}

export function* project(input, columns) {
  for (const context of input) {
    if (columns.length === 1 && columns[0].expression.type === "star") {
      yield Object.values(context).flat()
      continue
    }
    yield columns.map(column => evaluate(column.expression, context))
  }
}

export function* nestedLoopJoin(left, rightFactory, condition) {
  for (const leftRow of left) for (const rightRow of rightFactory()) {
    const context = { ...leftRow, ...rightRow }
    if (sqlBoolean(evaluate(condition, context))) yield context
  }
}

export function* limit(input, count) {
  let emitted = 0
  for (const row of input) {
    if (emitted >= count) return
    emitted += 1
    yield row
  }
}

export function sort(input, orderBy) {
  return [...input].sort((left, right) => {
    for (const item of orderBy) {
      const leftValue = evaluate(item.expression, left)
      const rightValue = evaluate(item.expression, right)
      if (leftValue === rightValue) continue
      const order = leftValue === null ? -1 : rightValue === null ? 1 : leftValue < rightValue ? -1 : 1
      return item.direction === "DESC" ? -order : order
    }
    return 0
  })
}
