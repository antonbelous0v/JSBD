import { DataType } from "../constants.js"
import { SqlError } from "../errors.js"

const TYPE_MAP = {
  BOOLEAN: DataType.BOOLEAN,
  INT: DataType.INT32,
  INTEGER: DataType.INT32,
  BIGINT: DataType.INT64,
  FLOAT: DataType.FLOAT64,
  REAL: DataType.FLOAT64,
  TEXT: DataType.TEXT,
  TIMESTAMP: DataType.TIMESTAMP,
}

export class Binder {
  constructor(catalog) {
    this.catalog = catalog
  }

  bind(statement) {
    if (statement.type === "create_table") {
      return this.bindCreateTable(statement)
    }
    if (["insert", "update", "delete"].includes(statement.type)) {
      return this.bindMutation(statement)
    }
    if (statement.type === "select") {
      return this.bindSelect(statement)
    }
    if (statement.type === "explain") {
      return { ...statement, statement: this.bind(statement.statement) }
    }
    if (statement.type === "create_index") {
      const table = this.catalog.getTable(statement.table)
      for (const column of statement.columns) {
        table.schema.indexOf(column)
      }
    }
    return statement
  }

  bindCreateTable(statement) {
    return {
      ...statement,
      columns: statement.columns.map((column) => {
        const dataType = TYPE_MAP[column.dataType]
        if (!dataType) {
          throw new SqlError(`Unsupported data type ${column.dataType}`)
        }
        return { ...column, dataType }
      }),
    }
  }

  bindMutation(statement) {
    const table = this.catalog.getTable(statement.table)
    if (statement.columns) {
      for (const column of statement.columns) {
        table.schema.indexOf(column)
      }
    }
    if (statement.assignments) {
      for (const assignment of statement.assignments) {
        table.schema.indexOf(assignment.column)
      }
    }
    if (statement.assignments) {
      for (const assignment of statement.assignments) {
        this.bindExpression(assignment.value, [{ name: table.schema.name, alias: table.schema.name, schema: table.schema }])
      }
    }
    if (statement.where) {
      this.bindExpression(statement.where, [{ name: table.schema.name, alias: table.schema.name, schema: table.schema }])
    }
    return { ...statement, metadata: table }
  }

  bindSelect(statement) {
    const references = [statement.from, ...statement.joins.map(join => join.table)].map((reference) => {
      const table = this.catalog.getTable(reference.name)
      return { name: reference.name, alias: reference.alias ?? reference.name, schema: table.schema, metadata: table }
    })
    for (const item of statement.columns) {
      this.bindExpression(item.expression, references)
    }
    for (const join of statement.joins) {
      this.bindExpression(join.on, references)
    }
    if (statement.where) {
      this.bindExpression(statement.where, references)
    }
    for (const item of statement.orderBy) {
      this.bindExpression(item.expression, references)
    }
    return { ...statement, references }
  }

  bindExpression(expression, references) {
    if (expression.type === "column") {
      let match = null
      let matches = 0
      for (let referenceIndex = 0; referenceIndex < references.length; referenceIndex += 1) {
        const reference = references[referenceIndex]
        if (expression.table && reference.alias !== expression.table && reference.name !== expression.table) {
          continue
        }
        for (let columnIndex = 0; columnIndex < reference.schema.columns.length; columnIndex += 1) {
          if (reference.schema.columns[columnIndex].name !== expression.name) {
            continue
          }
          match = reference
          matches += 1
          break
        }
      }
      if (matches !== 1) {
        throw new SqlError(matches ? `Ambiguous column ${expression.name}` : `Unknown column ${expression.name}`)
      }
      expression.binding = {
        table: match.alias,
        index: match.schema.indexOf(expression.name),
      }
    } else if (expression.type === "binary") {
      this.bindExpression(expression.left, references)
      this.bindExpression(expression.right, references)
    } else if (expression.type === "unary" || expression.type === "is_null") {
      this.bindExpression(expression.operand, references)
    } else if (expression.type === "call") {
      for (const argument of expression.args) {
        if (argument.type !== "star") {
          this.bindExpression(argument, references)
        }
      }
    }
  }
}
