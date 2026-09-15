import { SqlError } from "../errors.js"

const KEYWORDS = new Set("CREATE TABLE DROP INDEX UNIQUE INSERT INTO VALUES UPDATE SET DELETE FROM SELECT WHERE ORDER BY ASC DESC LIMIT BEGIN COMMIT ROLLBACK EXPLAIN INNER JOIN ON AS AND OR NOT IS NULL PRIMARY KEY REFERENCES BOOLEAN INT INTEGER BIGINT FLOAT REAL TEXT TIMESTAMP COUNT SUM MIN MAX AVG GROUP".split(" "))

export class Lexer {
  constructor(sql) {
    this.sql = sql
    this.position = 0
  }

  tokenize() {
    const tokens = []
    while (this.position < this.sql.length) {
      const start = this.position
      const char = this.sql[this.position]
      if (/\s/.test(char)) { this.position += 1; continue }
      if (char === "'" || char === '"') { tokens.push(this.string(char, start)); continue }
      if (/[A-Za-z_]/.test(char)) { tokens.push(this.word(start)); continue }
      if (/\d/.test(char)) { tokens.push(this.number(start)); continue }
      const pair = this.sql.slice(this.position, this.position + 2)
      if (["<=", ">=", "!=", "<>"].includes(pair)) { this.position += 2; tokens.push({ type: "operator", value: pair === "<>" ? "!=" : pair, position: start }); continue }
      if ("(),;.*+-/=<>".includes(char)) { this.position += 1; tokens.push({ type: "symbol", value: char, position: start }); continue }
      throw new SqlError(`Unexpected character ${char}`, start)
    }
    tokens.push({ type: "eof", value: "EOF", position: this.position })
    return tokens
  }

  word(start) {
    while (this.position < this.sql.length && /[A-Za-z0-9_]/.test(this.sql[this.position])) this.position += 1
    const raw = this.sql.slice(start, this.position)
    const upper = raw.toUpperCase()
    if (upper === "TRUE" || upper === "FALSE") return { type: "literal", value: upper === "TRUE", position: start }
    if (upper === "NULL") return { type: "literal", value: null, position: start }
    return { type: KEYWORDS.has(upper) ? "keyword" : "identifier", value: KEYWORDS.has(upper) ? upper : raw, position: start }
  }

  number(start) {
    while (this.position < this.sql.length && /\d/.test(this.sql[this.position])) this.position += 1
    if (this.sql[this.position] === ".") {
      this.position += 1
      while (this.position < this.sql.length && /\d/.test(this.sql[this.position])) this.position += 1
    }
    const raw = this.sql.slice(start, this.position)
    const value = raw.includes(".") ? Number(raw) : BigInt(raw)
    return { type: "literal", value, position: start }
  }

  string(quote, start) {
    this.position += 1
    let value = ""
    while (this.position < this.sql.length) {
      const char = this.sql[this.position++]
      if (char === quote) {
        if (this.sql[this.position] === quote) { value += quote; this.position += 1; continue }
        return { type: quote === '"' ? "identifier" : "literal", value, position: start }
      }
      value += char
    }
    throw new SqlError("Unterminated string", start)
  }
}
