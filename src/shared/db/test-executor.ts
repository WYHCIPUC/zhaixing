// node:sqlite 内存库包成异步执行器：与两端同一 SQLite 引擎，契约测试语义一致
// 用内置 node:sqlite 而非 better-sqlite3——后者已被 @electron/rebuild 编成 Electron ABI，
// 在纯 Node（vitest）里加载会报 NODE_MODULE_VERSION 冲突
// 仅测试引用（vitest / Node），禁止被 renderer / mobile 构建引用
import { DatabaseSync } from 'node:sqlite'
import type { AsyncSqliteExecutor, RunResult } from './executor'

export interface TestExecutor extends AsyncSqliteExecutor {
  raw: DatabaseSync
}

export function createTestExecutor(): TestExecutor {
  const raw = new DatabaseSync(':memory:')
  raw.exec('PRAGMA foreign_keys = ON')
  return {
    raw,
    exec: async (sql) => {
      raw.exec(sql)
    },
    run: async (sql, params = []) => raw.prepare(sql).run(...(params as never[])) as unknown as RunResult,
    query: async <T>(sql: string, params: unknown[] = []) => raw.prepare(sql).all(...(params as never[])) as T[],
    transaction: async <T>(fn: () => Promise<T>): Promise<T> => {
      raw.exec('BEGIN')
      try {
        const out = await fn()
        raw.exec('COMMIT')
        return out
      } catch (err) {
        raw.exec('ROLLBACK')
        throw err
      }
    }
  }
}
