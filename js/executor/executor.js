import { aggregate } from "./aggregate.js"
import { evaluate } from "./expression.js"
import { filter, limit, nestedLoopJoin, project, sort } from "./operators.js"
import { indexScan, limitedSequenceScan, sequenceScan } from "./scans.js"

export class Executor {
  constructor(resolveTable, transaction) {
    this.resolveTable = resolveTable
    this.transaction = transaction
  }

  execute(plan) {
    if (plan.kind === "SeqScan") {
      return sequenceScan(this.resolveTable(plan.reference.name), plan.reference, this.transaction)
    }
    if (plan.kind === "IndexScan") {
      return indexScan(this.resolveTable(plan.reference.name), plan.reference, plan.index, plan.key, this.transaction)
    }
    if (plan.kind === "Filter") {
      return filter(this.execute(plan.input), plan.condition)
    }
    if (plan.kind === "Project") {
      return project(this.execute(plan.input), plan.columns)
    }
    if (plan.kind === "Aggregate") {
      return aggregate(this.execute(plan.input), plan.columns)
    }
    if (plan.kind === "NestedLoopJoin") {
      return nestedLoopJoin(this.execute(plan.left), () => this.execute(plan.right), plan.condition)
    }
    if (plan.kind === "Sort") {
      return sort(this.execute(plan.input), plan.orderBy)
    }
    if (plan.kind === "Limit") {
      const count = Number(evaluate(plan.limit, {}))
      const input = plan.input
      if (input.kind === "Project" && input.input.kind === "Filter" && input.input.input.kind === "SeqScan") {
        const scan = input.input.input
        return project(limitedSequenceScan(this.resolveTable(scan.reference.name), scan.reference, this.transaction, input.input.condition, count), input.columns)
      }
      return limit(this.execute(input), count)
    }
    throw new Error(`Unknown physical operator ${plan.kind}`)
  }
}
