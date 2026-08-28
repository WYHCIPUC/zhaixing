import type { Transition, Variants } from 'framer-motion'

// v5 spec §3.1 动效令牌的 framer-motion 侧对应（CSS 侧在 styles.css :root）
// 规则：进出/响应一律 ease-out 家族，禁 ease-in；UI ≤300ms；bounce 仅限 §4.5 稀有时刻与手势释放

export const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1]
export const EASE_IN_OUT: [number, number, number, number] = [0.77, 0, 0.175, 1]
export const EASE_DRAWER: [number, number, number, number] = [0.32, 0.72, 0, 1]

export const DUR = { fast: 0.12, base: 0.2, slow: 0.28, delight: 0.45 } as const
export const STAGGER = 0.04

/** 默认弹簧：无弹跳 —— 抽屉/面板/布局变化 */
export const SPRING_SETTLE: Transition = { type: 'spring', duration: 0.4, bounce: 0 }
/** 手势释放弹簧：轻微 bounce —— 仅跟手手势的释放（v5 §3.1） */
export const SPRING_FLICK: Transition = { type: 'spring', duration: 0.5, bounce: 0.18 }

/** 抽屉速度甩出判定（v5 §4.3）：位移超阈值 或 速度 > 0.11px/ms 即关，快甩不必拖到底 */
export function flickShouldDismiss(offset: number, velocity: number, distanceThreshold = 80): boolean {
  return Math.abs(offset) > distanceThreshold || Math.abs(velocity) > 110
}

/** 列表/网格组进出场：容器用（纯装饰，不阻塞交互） */
export const staggerParent = (stagger = STAGGER): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger } }
})

/** 单项进场：从 scale(0.96)+y8 升起（禁止 scale(0) 凭空出现） */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 8, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: DUR.slow, ease: EASE_OUT } }
}
