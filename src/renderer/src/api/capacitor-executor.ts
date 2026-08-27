// @capacitor-community/sqlite → AsyncSqliteExecutor 适配
// 手机壳内使用；连接一次，全 app 复用（foreign_keys + WAL 由 PRAGMA 显式开启）
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { AsyncSqliteExecutor, RunResult } from '@shared/db/executor'

interface CapResult {
  errors?: string[]
  changes?: { changes?: number }
  values?: unknown[]
}

export async function createCapacitorExecutor(dbName = 'zhaixing'): Promise<AsyncSqliteExecutor> {
  const sqlite = new SQLiteConnection(CapacitorSQLite)
  // readonly=false, 加密=no-encryption, 版本=1, 只读连接=false
  const conn: SQLiteDBConnection = await sqlite.createConnection(dbName, false, 'no-encryption', 1, false)
  await conn.open()
  await conn.execute(`PRAGMA foreign_keys = ON`)
  await conn.execute(`PRAGMA journal_mode = WAL`)

  const check = (res: CapResult): void => {
    if (res.errors?.length) throw new Error(res.errors.join('; '))
  }

  return {
    exec: async (sql) => {
      check((await conn.execute(sql)) as CapResult)
    },
    run: async (sql, params = []) => {
      const res = (await conn.run(sql, params as unknown[])) as CapResult
      check(res)
      return { changes: res.changes?.changes ?? 0 } satisfies RunResult
    },
    query: async <T>(sql: string, params: unknown[] = []) => {
      const res = (await conn.query(sql, params as unknown[])) as CapResult
      check(res)
      return (res.values ?? []) as T[]
    }
  }
}
