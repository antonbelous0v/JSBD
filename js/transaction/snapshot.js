import { TransactionState } from "../constants.js"

export function isVisible(version, snapshot, ownTransactionId, states) {
  if (version.xmin === ownTransactionId) {
    return version.xmax === 0n || version.xmax !== ownTransactionId
  }
  if (version.xmin >= snapshot.xmax || snapshot.active.has(version.xmin) || states.get(version.xmin) !== TransactionState.COMMITTED) {
    return false
  }
  if (version.xmax === 0n) {
    return true
  }
  if (version.xmax === ownTransactionId) {
    return false
  }
  if (version.xmax >= snapshot.xmax || snapshot.active.has(version.xmax)) {
    return true
  }
  return states.get(version.xmax) !== TransactionState.COMMITTED
}
