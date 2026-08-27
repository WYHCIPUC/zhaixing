// 手机端插件与测试执行器的最小公共面
// capacitor-executor（@capacitor-community/sqlite）与 test-executor（node:sqlite 内存库）
// 都实现此接口；mobile-api 只依赖此抽象，从而可在 vitest 里全量 TDD
// run 返回 changes：INSERT OR IGNORE 的去重判断依据（同 better-sqlite3 的 info.changes）
export interface RunResult {
  changes: number
}

export interface AsyncSqliteExecutor {
  exec(sql: string): Promise<void>
  run(sql: string, params?: unknown[]): Promise<RunResult>
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
}
