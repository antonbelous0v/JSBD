export class LogicalPlanner {
  plan(statement) {
    if (statement.type !== "select") {
      return { kind: statement.type, statement }
    }
    let plan = { kind: "scan", reference: statement.references[0] }
    for (let index = 0; index < statement.joins.length; index += 1) {
      plan = { kind: "join", left: plan, right: { kind: "scan", reference: statement.references[index + 1] }, condition: statement.joins[index].on }
    }
    if (statement.where) {
      plan = { kind: "filter", input: plan, condition: statement.where }
    }
    if (statement.orderBy.length) {
      plan = { kind: "sort", input: plan, orderBy: statement.orderBy }
    }
    let aggregates = false
    for (let index = 0; index < statement.columns.length; index += 1) {
      if (statement.columns[index].expression.type === "call") {
        aggregates = true
        break
      }
    }
    plan = { kind: aggregates ? "aggregate" : "project", input: plan, columns: statement.columns }
    if (statement.limit) {
      plan = { kind: "limit", input: plan, limit: statement.limit }
    }
    return plan
  }
}
