export class MyDBError extends Error {
  constructor(message, code = "MYDB_ERROR") {
    super(message)
    this.name = new.target.name
    this.code = code
  }
}

export class ValidationError extends MyDBError {
  constructor(message) {
    super(message, "VALIDATION_ERROR")
  }
}

export class CorruptionError extends MyDBError {
  constructor(message) {
    super(message, "CORRUPTION_ERROR")
  }
}

export class ConstraintError extends MyDBError {
  constructor(message) {
    super(message, "CONSTRAINT_ERROR")
  }
}

export class WriteConflictError extends MyDBError {
  constructor(message) {
    super(message, "WRITE_CONFLICT")
  }
}

export class SqlError extends MyDBError {
  constructor(message, position = -1) {
    super(position < 0 ? message : `${message} at position ${position}`, "SQL_ERROR")
    this.position = position
  }
}
