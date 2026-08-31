// 双端 schema 装载：读 PRAGMA user_version 决定建库/拒绝，为 db 文件互通上保险
import { SCHEMA, SCHEMA_VERSION } from './schema'
import type { AsyncSqliteExecutor } from './executor'

export async function applySchema(db: AsyncSqliteExecutor): Promise<void> {
  const uvRows = await db.query<{ user_version: number }>('PRAGMA user_version')
  const uv = uvRows[0]?.user_version ?? 0
  if (uv > SCHEMA_VERSION) {
    throw new Error(`数据库版本(${uv})高于当前应用支持的版本(${SCHEMA_VERSION})，拒绝初始化以免损坏数据`)
  }
  if (uv === SCHEMA_VERSION) return
  await db.exec(SCHEMA)
  // 老库补列：CREATE IF NOT EXISTS 不会给已有表加列
  if (0 < uv && uv < 3) {
    try {
      await db.run("ALTER TABLE books ADD COLUMN category TEXT NOT NULL DEFAULT ''")
    } catch {
      /* 列已存在 */
    }
  }
  await db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`)
}
