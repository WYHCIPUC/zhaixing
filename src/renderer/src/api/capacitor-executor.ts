// @capacitor-community/sqlite → AsyncSqliteExecutor 适配
// 手机壳内使用；连接一次，全 app 复用（foreign_keys 由 PRAGMA 显式开启）
// 实测约束（MM1）：①不能设 journal_mode=WAL（插件隐式事务内报错）；
// ②插件原生事务不可靠（线程相关的 inTransaction 标记），transaction() 降级为顺序自动提交；
// ③连接必须单例——SQLiteConnection 多实例并发 createConnection 会报 "Connection already exists"
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { AsyncSqliteExecutor, RunResult } from '@shared/db/executor'

interface CapResult {
  errors?: string[]
  changes?: { changes?: number }
  values?: unknown[]
}

const executors = new Map<string, Promise<AsyncSqliteExecutor>>()
const sqliteConn = new SQLiteConnection(CapacitorSQLite)

export function createCapacitorExecutor(dbName = 'zhaixing'): Promise<AsyncSqliteExecutor> {
  let p = executors.get(dbName)
  if (!p) {
    p = build(dbName)
    executors.set(dbName, p)
  }
  return p
}

async function build(dbName: string): Promise<AsyncSqliteExecutor> {
  // readonly=false, 加密=no-encryption, 版本=1, 只读连接=false
  const conn: SQLiteDBConnection = await sqliteConn.createConnection(dbName, false, 'no-encryption', 1, false)
  await conn.open()
  await conn.execute(`PRAGMA foreign_keys = ON`)

  const check = (res: CapResult): void => {
    if (res.errors?.length) throw new Error(res.errors.join('; '))
  }

  return {
    exec: async (sql, opts) => {
      // noTx：VACUUM 等语句不能在事务内执行（插件 execute 默认包事务）
      check((await conn.execute(sql, !opts?.noTx)) as CapResult)
    },
    run: async (sql, params = []) => {
      // 插件桥不支持二进制绑定（实测报 "No value for type"）：
      // Uint8Array 参数自动转 base64 TEXT 落库，读取侧 shared ai/client blobToVectors 已兼容
      const serialised = params.map((p) =>
        p instanceof Uint8Array
          ? btoa(String.fromCharCode(...p))
          : p
      )
      const res = (await conn.run(sql, serialised as unknown[])) as CapResult
      check(res)
      return { changes: res.changes?.changes ?? 0 }
    },
    query: async <T>(sql: string, params: unknown[] = []) => {
      const res = (await conn.query(sql, params as unknown[])) as CapResult
      check(res)
      return (res.values ?? []) as T[]
    },
    transaction: async <T>(fn: () => Promise<T>): Promise<T> => {
      // 插件的原生事务在此平台不可靠：execute/run 各自包 begin/commit，且
      // beginTransaction 会因线程相关的 inTransaction 标记误报 "Already in transaction"。
      // 因此降级为顺序自动提交（每条语句独立事务），原子性以幂等去重兜底：
      // 导入/同步的哈希去重保证重跑不产生重复数据。测试执行器保持真事务。
      return fn()
    }
  }
}
