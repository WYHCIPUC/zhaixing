// 手机端插件与测试执行器的最小公共面
// capacitor-executor（@capacitor-community/sqlite）与 test-executor（better-sqlite3 内存库）
// 都实现此接口；mobile-api 只依赖此抽象，从而可在 vitest 里全量 TDD
export interface AsyncSqliteExecutor {
  exec(sql: string): Promise<void>
  run(sql: string, params?: unknown[]): Promise<void>
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
}
