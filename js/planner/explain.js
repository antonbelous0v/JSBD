export function explain(plan, depth = 0) {
  const indent = "  ".repeat(depth)
  const details = []
  if (plan.reference) {
    details[details.length] = `table: ${plan.reference.name}`
  }
  if (plan.index) {
    details[details.length] = `index: ${plan.index}`
  }
  const lines = [`${indent}${plan.kind}${details.length ? ` (${details.join(", ")})` : ""}`]
  if (plan.input) {
    lines[lines.length] = explain(plan.input, depth + 1)
  }
  if (plan.left) {
    lines[lines.length] = explain(plan.left, depth + 1)
  }
  if (plan.right) {
    lines[lines.length] = explain(plan.right, depth + 1)
  }
  return lines.join("\n")
}
