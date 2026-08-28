import * as Tooltip from '@radix-ui/react-tooltip'
import { motion } from 'framer-motion'

// Radix Tooltip 封装：深墨小片提示，带轻微浮入动效
export default function Hint({
  label,
  children,
  side = 'top'
}: {
  label: string
  children: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
}) {
  return (
    <Tooltip.Root delayDuration={280}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side={side} sideOffset={8} asChild>
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: side === 'top' ? 3 : -3 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }}
            className="rounded-md bg-[#2b2723] px-2.5 py-1.5 text-[11.5px] font-medium text-[#faf8f5] shadow-[0_4px_16px_rgba(43,39,35,0.3)]"
          >
            {label}
            <Tooltip.Arrow className="fill-[#2b2723]" width={10} height={5} />
          </motion.div>
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
