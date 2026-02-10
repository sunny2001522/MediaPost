import * as Diff from 'diff'

export interface DiffOperation {
  type: 'add' | 'remove' | 'replace' | 'keep'
  originalText?: string
  newText?: string
  position: {
    originalStart: number
    originalEnd: number
    newStart: number
    newEnd: number
  }
}

export interface DiffResult {
  operations: DiffOperation[]
  statistics: {
    totalChanges: number
    additionCount: number
    deletionCount: number
    replacementCount: number
    addedChars: number
    removedChars: number
    editSeverity: number // 0-1
  }
}

export class DiffAnalyzer {
  analyze(original: string, edited: string): DiffResult {
    const changes = Diff.diffWords(original, edited)
    const operations: DiffOperation[] = []

    let originalPos = 0
    let newPos = 0

    for (let i = 0; i < changes.length; i++) {
      const change = changes[i]

      if (change.added) {
        // 檢查是否是替換（前一個是刪除）
        const prevOp = operations[operations.length - 1]
        if (prevOp && prevOp.type === 'remove') {
          // 轉換為替換操作
          prevOp.type = 'replace'
          prevOp.newText = change.value
          prevOp.position.newEnd = newPos + change.value.length
        } else {
          operations.push({
            type: 'add',
            newText: change.value,
            position: {
              originalStart: originalPos,
              originalEnd: originalPos,
              newStart: newPos,
              newEnd: newPos + change.value.length,
            },
          })
        }
        newPos += change.value.length
      } else if (change.removed) {
        operations.push({
          type: 'remove',
          originalText: change.value,
          position: {
            originalStart: originalPos,
            originalEnd: originalPos + change.value.length,
            newStart: newPos,
            newEnd: newPos,
          },
        })
        originalPos += change.value.length
      } else {
        // 無變化
        originalPos += change.value.length
        newPos += change.value.length
      }
    }

    // 計算統計
    const stats = this.calculateStatistics(
      operations.filter(op => op.type !== 'keep'),
      original,
      edited
    )

    return {
      operations: operations.filter(op => op.type !== 'keep'),
      statistics: stats,
    }
  }

  private calculateStatistics(
    operations: DiffOperation[],
    original: string,
    edited: string
  ) {
    const addedChars = operations
      .filter(op => op.type === 'add' || op.type === 'replace')
      .reduce((sum, op) => sum + (op.newText?.length || 0), 0)

    const removedChars = operations
      .filter(op => op.type === 'remove' || op.type === 'replace')
      .reduce((sum, op) => sum + (op.originalText?.length || 0), 0)

    // 基於 Levenshtein 的嚴重程度
    const maxLen = Math.max(original.length, edited.length)
    const editSeverity = maxLen > 0
      ? (addedChars + removedChars) / (2 * maxLen)
      : 0

    return {
      totalChanges: operations.length,
      additionCount: operations.filter(op => op.type === 'add').length,
      deletionCount: operations.filter(op => op.type === 'remove').length,
      replacementCount: operations.filter(op => op.type === 'replace').length,
      addedChars,
      removedChars,
      editSeverity: Math.min(editSeverity, 1),
    }
  }
}

export const diffAnalyzer = new DiffAnalyzer()
