import assert from "node:assert/strict"
import test from "node:test"

import { Lexer } from "../js/sql/lexer.js"
import { Parser } from "../js/sql/parser.js"

test("lexer preserves strings numbers and operators", () => {
  const tokens = new Lexer("name != 'Ada''s' AND score >= 10.5").tokenize()
  assert.deepEqual(tokens.slice(0, -1).map(token => token.value), ["name", "!=", "Ada's", "AND", "score", ">=", 10.5])
})

test("parser builds join and ordering syntax", () => {
  const statement = new Parser("SELECT u.name, COUNT(*) FROM users AS u INNER JOIN orders AS o ON o.user_id = u.id WHERE u.id >= 1 ORDER BY u.name DESC LIMIT 5").parse()[0]
  assert.equal(statement.type, "select")
  assert.equal(statement.joins.length, 1)
  assert.equal(statement.orderBy[0].direction, "DESC")
  assert.equal(statement.limit.value, 5n)
})
