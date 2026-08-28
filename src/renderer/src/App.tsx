import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { Toaster } from 'sonner'
import Sidebar from './components/Sidebar'
import BookshelfView from './views/BookshelfView'
import BookDetailView from './views/BookDetailView'
import SettingsView from './views/SettingsView'
import SkyView from './views/SkyView'
import MeteorView from './views/MeteorView'
import WeaveView from './views/WeaveView'
import StatsView from './views/StatsView'
import SearchOverlay from './components/SearchOverlay'
import { MobileBottomNav, MobileTopBar } from './components/MobileChrome'
import { DUR, EASE_OUT } from './motion'

export type ViewKey = 'shelf' | 'sky' | 'meteor' | 'weave' | 'stats' | 'settings'

export default function App() {
  const [view, setView] = useState<ViewKey>('shelf')
  const [bookId, setBookId] = useState<number | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [reload, setReload] = useState(0)
  const refresh = useCallback(() => setReload((n) => n + 1), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === 'Escape') setSearchOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const openBook = useCallback((id: number) => {
    setBookId(id)
    setView('shelf')
  }, [])

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative flex h-full flex-col md:flex-row">
        <Toaster
          theme="light"
          position="bottom-center"
          gap={8}
          toastOptions={{
            style: {
              background: 'rgba(255, 255, 255, 0.88)',
              backdropFilter: 'blur(20px) saturate(180%)',
              border: '1px solid var(--line)',
              boxShadow: 'var(--shadow-lg)',
              color: 'var(--text)'
            }
          }}
        />
        <div className="relative z-10 hidden md:block">
          <Sidebar view={view} onNavigate={(v) => { setView(v); if (v !== 'shelf') setBookId(null) }} />
        </div>
        <MobileTopBar onSearch={() => setSearchOpen(true)} />

        <main className="relative z-10 flex-1 overflow-hidden pb-[56px] md:pb-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={view + (bookId ?? '')}
              initial={view === 'sky' ? { opacity: 0 } : { opacity: 0, y: 10 }}
              animate={view === 'sky' ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={
                view === 'sky'
                  ? { opacity: 0, transition: { duration: DUR.base, ease: EASE_OUT } }
                  : { opacity: 0, y: -6, transition: { duration: 0.14, ease: EASE_OUT } }
              }
              transition={{ duration: DUR.base, ease: EASE_OUT }}
              className="h-full"
            >
            {view === 'shelf' &&
              (bookId ? (
                <BookDetailView bookId={bookId} onBack={() => setBookId(null)} onChanged={refresh} />
              ) : (
                <BookshelfView reloadKey={reload} onOpenBook={openBook} onImported={refresh} />
              ))}
            {view === 'settings' && <SettingsView />}
            {view === 'sky' && <SkyView />}
            {view === 'meteor' && <MeteorView />}
            {view === 'weave' && <WeaveView />}
            {view === 'stats' && <StatsView />}
          </motion.div>
        </AnimatePresence>
      </main>

      <MobileBottomNav view={view} onNavigate={(v) => { setView(v); if (v !== 'shelf') setBookId(null) }} />

      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} onOpenBook={openBook} />}
      </div>
    </MotionConfig>
  )
}
