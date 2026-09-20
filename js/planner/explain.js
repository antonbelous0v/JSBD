export function explain(plan, depth = 0) {
  const indent = "  ".repeat(depth)
  const details = []
  if (plan.reference) details.push(`table: ${plan.reference.name}`)
  if (plan.index) details.push(`index: ${plan.index}`)
  const lines = [`${indent}${plan.kind}${details.length ? ` (${details.join(", ")})` : ""}`]
  if (plan.input) lines.push(explain(plan.input, depth + 1))
  if (plan.left) lines.push(explain(plan.left, depth + 1))
  if (plan.right) lines.push(explain(plan.right, depth + 1))
  return lines.join("\n")
}
