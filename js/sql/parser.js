import { Lexer } from "./lexer.js"
import { SqlError } from "../errors.js"

const PRECEDENCE = { OR: 1, AND: 2, "=": 3, "!=": 3, "<": 3, "<=": 3, ">": 3, ">=": 3, "+": 4, "-": 4, "*": 5, "/": 5 }

export class Parser {
  constructor(sql) {
    this.tokens = new Lexer(sql).tokenize()
    this.position = 0
  }

  parse() {
    const statements = []
    while (!this.at("EOF")) {
      statements.push(this.statement())
      if (!this.match(";")) this.expect("EOF")
    }
    return statements
  }

  statement() {
    if (this.match("CREATE")) return this.create()
    if (this.match("DROP")) return this.drop()
    if (this.match("INSERT")) return this.insert()
    if (this.match("UPDATE")) return this.update()
    if (this.match("DELETE")) return this.delete()
    if (this.match("SELECT")) return this.select()
    if (this.match("BEGIN")) return { type: "begin" }
    if (this.match("COMMIT")) return { type: "commit" }
    if (this.match("ROLLBACK")) return { type: "rollback" }
    if (this.match("EXPLAIN")) return { type: "explain", statement: this.statement() }
    throw this.error(`Unexpected token ${this.current().value}`)
  }

  create() {
    const unique = this.match("UNIQUE")
    if (this.match("TABLE")) return this.createTable()
    this.expect("INDEX")
    const name = this.identifier()
    this.expect("ON")
    const table = this.identifier()
    this.expect("(")
    const columns = this.list(() => this.identifier())
    this.expect(")")
    return { type: "create_index", name, table, columns, unique }
  }

  createTable() {
    const name = this.identifier()
    this.expect("(")
    const columns = []
    const primaryKey = []
    do {
      if (this.match("PRIMARY")) {
        this.expect("KEY").value
        this.expect("(")
        primaryKey.push(...this.list(() => this.identifier()))
        this.expect(")")
        continue
      }
      const column = { name: this.identifier(), dataType: this.current().value, nullable: true, primary: false, unique: false, references: null }
      this.position += 1
      while (!this.at(",") && !this.at(")")) {
        if (this.match("NOT")) { this.expect("NULL"); column.nullable = false }
        else if (this.match("PRIMARY")) { this.expect("KEY"); column.primary = true; column.nullable = false }
        else if (this.match("UNIQUE")) column.unique = true
        else if (this.match("REFERENCES")) { const table = this.identifier(); this.expect("("); const referenced = this.identifier(); this.expect(")"); column.references = { table, column: referenced } }
        else throw this.error(`Unexpected column constraint ${this.current().value}`)
      }
      columns.push(column)
    } while (this.match(","))
    this.expect(")")
    primaryKey.push(...columns.filter(column => column.primary).map(column => column.name))
    return { type: "create_table", name, columns, primaryKey, unique: columns.filter(column => column.unique).map(column => [column.name]) }
  }

  drop() {
    if (this.match("TABLE")) return { type: "drop_table", name: this.identifier() }
    this.expect("INDEX")
    return { type: "drop_index", name: this.identifier() }
  }

  insert() {
    this.expect("INTO")
    const table = this.identifier()
    let columns = null
    if (this.match("(")) { columns = this.list(() => this.identifier()); this.expect(")") }
    this.expect("VALUES")
    const values = []
    do { this.expect("("); values.push(this.list(() => this.expression())); this.expect(")") } while (this.match(","))
    return { type: "insert", table, columns, values }
  }

  update() {
    const table = this.identifier()
    this.expect("SET")
    const assignments = []
    do { const column = this.identifier(); this.expect("="); assignments.push({ column, value: this.expression() }) } while (this.match(","))
    const where = this.match("WHERE") ? this.expression() : null
    return { type: "update", table, assignments, where }
  }

  delete() {
    this.expect("FROM")
    const table = this.identifier()
    const where = this.match("WHERE") ? this.expression() : null
    return { type: "delete", table, where }
  }

  select() {
    const columns = this.list(() => this.selectItem())
    this.expect("FROM")
    const from = this.tableReference()
    const joins = []
    while (this.match("INNER")) { this.expect("JOIN"); const table = this.tableReference(); this.expect("ON"); joins.push({ table, on: this.expression() }) }
    const where = this.match("WHERE") ? this.expression() : null
    let orderBy = []
    if (this.match("ORDER")) { this.expect("BY"); orderBy = this.list(() => ({ expression: this.expression(), direction: this.match("DESC") ? "DESC" : (this.match("ASC"), "ASC") })) }
    const limit = this.match("LIMIT") ? this.expression() : null
    return { type: "select", columns, from, joins, where, orderBy, limit }
  }

  selectItem() {
    const expression = this.expression()
    const alias = this.match("AS") ? this.identifier() : null
    return { expression, alias }
  }

  tableReference() {
    const name = this.identifier()
    const alias = this.match("AS") ? this.identifier() : (this.current().type === "identifier" ? this.identifier() : null)
    return { name, alias }
  }

  expression(precedence = 0) {
    let left
    if (this.match("NOT") || this.match("-") || this.match("+")) left = { type: "unary", operator: this.previous().value, operand: this.expression(6) }
    else if (this.match("(")) { left = this.expression(); this.expect(")") }
    else if (this.current().type === "literal") { left = { type: "literal", value: this.current().value }; this.position += 1 }
    else if (this.match("*")) left = { type: "star" }
    else {
      const name = this.identifier()
      if (this.match("(")) { const args = this.at("*") ? (this.position += 1, [{ type: "star" }]) : this.list(() => this.expression()); this.expect(")"); left = { type: "call", name: name.toUpperCase(), args } }
      else if (this.match(".")) left = { type: "column", table: name, name: this.identifier() }
      else left = { type: "column", table: null, name }
    }
    while (true) {
      if (this.match("IS")) { const not = this.match("NOT"); this.expect("NULL"); left = { type: "is_null", operand: left, not }; continue }
      const operator = this.current().value
      const next = PRECEDENCE[operator]
      if (!next || next <= precedence) break
      this.position += 1
      left = { type: "binary", operator, left, right: this.expression(next) }
    }
    return left
  }

  list(parse) {
    const values = [parse()]
    while (this.match(",")) values.push(parse())
    return values
  }

  identifier() {
    const token = this.current()
    if (token.type !== "identifier") throw this.error(`Expected identifier, received ${token.value}`)
    this.position += 1
    return token.value
  }

  current() { return this.tokens[this.position] }
  previous() { return this.tokens[this.position - 1] }
  at(value) { return this.current().value === value }
  match(value) { if (!this.at(value)) return false; this.position += 1; return true }
  expect(value) { if (!this.match(value)) throw this.error(`Expected ${value}, received ${this.current().value}`); return this.previous() }
  error(message) { return new SqlError(message, this.current().position) }
}
