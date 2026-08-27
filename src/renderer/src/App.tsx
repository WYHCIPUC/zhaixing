import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
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
    <div className="flex h-full flex-col md:flex-row">
      <Toaster
        theme="light"
        position="bottom-center"
        gap={8}
        toastOptions={{
          style: {
            background: 'rgba(255, 253, 248, 0.97)',
            border: '1px solid rgba(146,116,67,0.3)',
            color: '#43382b'
          }
        }}
      />
      <div className="hidden md:block">
        <Sidebar view={view} onNavigate={(v) => { setView(v); if (v !== 'shelf') setBookId(null) }} />
      </div>
      <MobileTopBar onSearch={() => setSearchOpen(true)} />

      <main className="flex-1 overflow-hidden pb-[56px] md:pb-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={view + (bookId ?? '')}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
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
  )
}
