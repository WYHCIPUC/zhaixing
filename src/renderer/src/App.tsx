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
    <div className="flex h-full">
      <Toaster
        theme="dark"
        position="bottom-right"
        gap={8}
        toastOptions={{
          style: {
            background: 'rgba(11, 17, 32, 0.96)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#dbe4f3'
          }
        }}
      />
      <Sidebar view={view} onNavigate={(v) => { setView(v); if (v !== 'shelf') setBookId(null) }} />

      <main className="flex-1 overflow-hidden">
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

      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} onOpenBook={openBook} />}
    </div>
  )
}
