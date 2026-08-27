import type { ParseResult, ParsedBook, ParsedHighlight } from '@shared/types'

// 微信读书导出文本解析器（双格式）
//
// 格式 A「App 复制/分享」（2026-08 真实样本校准）：
//   《书名》
//   作者
//   35个笔记
//   4                      ← 纯数字行 = 章节号
//   ◆ 划线原文             ← ◆ = 划线
//   ◆ 2026/07/21发表想法    ← 想法块：日期头
//   想法正文（可多段）
//   原文：变色龙            ← 锚点：想法所属的原文（可能不在划线列表中，需补建）
//   开场白 大江东去          ← 纯文字行 = 章节标题
//   -- 来自微信读书         ← 尾注
//
// 格式 B「传统标记」：
//   《书名》 / 作者：某某 / ◆ 章节 / >> 划线 / // 想法

const DATE_TAIL = /[（(【\s·—\-–~至]*\d{4}[年/.\-]\d{1,2}[月/.\-]\d{1,2}日?[）)】]?\s*$/
const CHAPTER_PREFIX = /^[◆◇●○■□▶▷·•▼▽]\s*(.+)$/
const CHAPTER_NAME =
  /^(第[0-9〇一二三四五六七八九十百千两]+[章节回卷部篇讲]|序章|序言|自序|他序|前言|导言|导论|引子|楔子|后记|跋|尾声|终章|附录[一二三四五六七八九十]?)\s*[:：.]?\s*(.*)$/
const HIGHLIGHT_PREFIX = /^>{1,2}\s?(.*)$/
const THOUGHT_PREFIX = /^(?:\/\/+|想法\s*[:：]|笔记\s*[:：])\s*(.*)$/
const AUTHOR_PREFIX = /^(?:作者|著者|author)\s*[:：]?\s*(.*)$/i
const APP_THOUGHT_HEADER = /^◆\s*(\d{4}[年/.\-]\d{1,2}[月/.\-]\d{1,2}日?)\s*发表想法\s*$/
const APP_ANCHOR = /^原文\s*[:：]\s?(.*)$/
const PURE_NUMBER = /^\d{1,4}$/
const FOOTER = /^--\s*来自微信读书\s*$/
const NOTE_COUNT = /^\d+个笔记$/

interface StripResult {
  text: string
  date: string | null
}

function stripDateTail(line: string): StripResult {
  const m = line.match(DATE_TAIL)
  if (!m) return { text: line.trim(), date: null }
  return { text: line.slice(0, m.index).trim(), date: m[0].trim() }
}

function joinText(a: string, b: string): string {
  if (!a) return b
  if (/[\x20-\x7e]$/.test(a) && /^[\x20-\x7e]/.test(b)) return `${a} ${b}`
  return a + b
}

function stripQuotes(text: string): string {
  return text
    .replace(/^[“”"'‘’「『」』\s、，。]+/, '')
    .replace(/[“”"'‘’「』」\s]+$/, '')
    .trim()
}

export function parseWereadText(raw: string): ParseResult {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n')
  const isLegacy = lines.some((l) => /^>{1,2}\s?\S/.test(l.trim()))
  return isLegacy ? parseLegacy(lines) : parseApp(lines)
}

// ================= 格式 A：App 复制/分享 =================

function parseApp(lines: string[]): ParseResult {
  const books: ParsedBook[] = []
  const warnings: string[] = []

  const st: {
    book: ParsedBook | null
    chapter: string
    authorPending: boolean
    seenCount: boolean
    mode: 'idle' | 'thought' | 'anchor'
    thoughtDate: string | null
    thoughtLines: string[]
    anchor: string
    thoughtChapter: string
  } = {
    book: null,
    chapter: '',
    authorPending: false,
    seenCount: false,
    mode: 'idle',
    thoughtDate: null,
    thoughtLines: [],
    anchor: '',
    thoughtChapter: ''
  }

  const structural = (l: string): boolean =>
    /^《.+?》/.test(l) || /^◆/.test(l) || PURE_NUMBER.test(l) || FOOTER.test(l) || NOTE_COUNT.test(l)

  const finishThought = (): void => {
    if (st.mode === 'idle') return
    const content = st.thoughtLines.join('\n').trim()
    const anchorRaw = st.anchor.trim()
    const b = st.book
    if (b && content) {
      let target: ParsedHighlight | null = null
      if (anchorRaw) {
        const norm = stripQuotes(anchorRaw)
        for (const h of b.highlights) {
          const hc = stripQuotes(h.content)
          const exact = h.content === anchorRaw || hc === norm
          const fuzzy =
            (norm.length >= 6 && h.content.includes(norm)) ||
            (hc.length >= 6 && norm.includes(hc))
          if (exact || fuzzy) {
            target = h
            break
          }
        }
        if (!target) {
          // 原文不在划线列表中（微信读书常这样），补建这条划线
          target = { content: norm, chapter: st.thoughtChapter, thoughts: [] }
          b.highlights.push(target)
        }
      } else if (b.highlights.length > 0) {
        target = b.highlights[b.highlights.length - 1]
      } else {
        warnings.push(`想法「${content.slice(0, 18)}…」缺少归属划线，已跳过`)
      }
      if (target) target.thoughts.push({ content, date: st.thoughtDate })
    }
    st.mode = 'idle'
    st.thoughtLines = []
    st.anchor = ''
    st.thoughtDate = null
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    // 书名
    const titleMatch = line.match(/^《(.+?)》\s*[^《]*$/)
    if (titleMatch && st.mode === 'idle') {
      const title = titleMatch[1].trim()
      const existing = books.find((x) => x.title === title)
      if (existing) {
        st.book = existing
      } else {
        const created: ParsedBook = { title, author: '', chapters: [], highlights: [] }
        books.push(created)
        st.book = created
        st.authorPending = true
        st.seenCount = false
      }
      st.chapter = ''
      continue
    }

    const b = st.book
    if (!b) continue // 书名之前的杂项丢弃

    // 尾注 / 计数行
    if (FOOTER.test(line) || NOTE_COUNT.test(line)) {
      st.seenCount = true
      finishThought()
      continue
    }

    // 想法块内部
    if (st.mode !== 'idle') {
      if (st.mode === 'thought') {
        const anchorMatch = line.match(APP_ANCHOR)
        if (anchorMatch) {
          st.anchor = anchorMatch[1]
          st.mode = 'anchor'
          continue
        }
        if (structural(line)) {
          finishThought()
          // 落回主流程处理当前行（不 continue）
        } else {
          st.thoughtLines.push(line)
          continue
        }
      } else {
        // anchor 模式：原文可能折行
        if (structural(line)) {
          finishThought()
          // 落回主流程
        } else {
          st.anchor += line
          continue
        }
      }
    }

    // 纯数字 = 章节号
    if (PURE_NUMBER.test(line)) {
      st.chapter = line
      continue
    }

    // ◆ 日期发表想法 = 想法块开始
    const thoughtHeader = line.match(APP_THOUGHT_HEADER)
    if (thoughtHeader) {
      finishThought()
      st.mode = 'thought'
      st.thoughtDate = stripDateTail(thoughtHeader[1]).date ?? thoughtHeader[1]
      st.thoughtChapter = st.chapter
      continue
    }

    // ◆ 划线
    const appHighlight = line.match(/^◆\s?(.*)$/)
    if (appHighlight) {
      finishThought()
      const { text } = stripDateTail(appHighlight[1])
      if (text) {
        b.highlights.push({ content: text, chapter: st.chapter, thoughts: [] })
        if (st.chapter && !b.chapters.includes(st.chapter)) b.chapters.push(st.chapter)
      }
      continue
    }

    // 作者：书名后、计数行前的第一个普通行
    const authorMatch = line.match(AUTHOR_PREFIX)
    if (authorMatch && !b.author) {
      b.author = stripDateTail(authorMatch[1]).text
      st.authorPending = false
      continue
    }
    if (st.authorPending && !st.seenCount && !b.author) {
      b.author = stripDateTail(line).text
      st.authorPending = false
      continue
    }

    // 其余普通行 = 章节标题（如「开场白 大江东去」）
    st.chapter = stripDateTail(line).text
    if (!b.chapters.includes(st.chapter)) b.chapters.push(st.chapter)
  }

  finishThought()

  for (const bk of [...books]) {
    if (bk.highlights.length === 0) {
      warnings.push(`《${bk.title}》未解析到任何划线，已跳过`)
      books.splice(books.indexOf(bk), 1)
    }
  }

  return { books, warnings, lineCount: lines.length }
}

// ================= 格式 B：传统标记 =================

function parseLegacy(lines: string[]): ParseResult {
  const books: ParsedBook[] = []
  const warnings: string[] = []

  const st: {
    book: ParsedBook | null
    chapter: string
    star: ParsedHighlight | null
    mode: 'none' | 'star' | 'thought'
  } = { book: null, chapter: '', star: null, mode: 'none' }

  const flushStar = (): void => {
    const b = st.book
    const s = st.star
    if (b && s && s.content.trim()) b.highlights.push(s)
    st.star = null
    st.mode = 'none'
  }

  const useChapter = (name: string): void => {
    flushStar()
    st.chapter = name
    const b = st.book
    if (b && !b.chapters.includes(name)) b.chapters.push(name)
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    const titleMatch = line.match(/^《(.+?)》\s*[^《]*$/)
    if (titleMatch) {
      flushStar()
      st.chapter = ''
      const title = titleMatch[1].trim()
      const existing = books.find((x) => x.title === title)
      if (existing) {
        st.book = existing
      } else {
        const created: ParsedBook = { title, author: '', chapters: [], highlights: [] }
        books.push(created)
        st.book = created
      }
      continue
    }

    const b = st.book
    if (!b) continue

    const authorMatch = line.match(AUTHOR_PREFIX)
    if (authorMatch && !b.author) {
      b.author = stripDateTail(authorMatch[1]).text
      continue
    }

    const chapterMatch = line.match(CHAPTER_PREFIX)
    if (chapterMatch && !HIGHLIGHT_PREFIX.test(line) && !THOUGHT_PREFIX.test(line)) {
      useChapter(stripDateTail(chapterMatch[1]).text)
      continue
    }

    if (!HIGHLIGHT_PREFIX.test(line) && !THOUGHT_PREFIX.test(line) && CHAPTER_NAME.test(line)) {
      const m = line.match(CHAPTER_NAME)!
      useChapter(stripDateTail(m[2] ? `${m[1]} ${m[2]}` : m[1]).text)
      continue
    }

    const highlightMatch = line.match(HIGHLIGHT_PREFIX)
    if (highlightMatch) {
      flushStar()
      const { text } = stripDateTail(highlightMatch[1])
      st.star = { content: text, chapter: st.chapter, thoughts: [] }
      st.mode = 'star'
      continue
    }

    const thoughtMatch = line.match(THOUGHT_PREFIX)
    if (thoughtMatch) {
      const { text, date } = stripDateTail(thoughtMatch[1])
      const s = st.star
      if (s) {
        s.thoughts.push({ content: text, date })
        st.mode = 'thought'
      } else if (b.highlights.length > 0) {
        b.highlights[b.highlights.length - 1].thoughts.push({ content: text, date })
        st.mode = 'none'
      } else {
        warnings.push(`想法「${text.slice(0, 20)}…」缺少所属划线，已跳过`)
      }
      continue
    }

    const { text, date } = stripDateTail(line)
    const s = st.star
    if (!b.author && b.highlights.length === 0 && !s) {
      b.author = text
      continue
    }
    if (st.mode === 'star' && s) {
      s.content = joinText(s.content, text)
    } else if (st.mode === 'thought' && s && s.thoughts.length > 0) {
      const last = s.thoughts[s.thoughts.length - 1]
      last.content = joinText(last.content, text)
      if (date) last.date = date
    } else {
      warnings.push(`无法识别的行「${text.slice(0, 24)}…」已忽略`)
    }
  }

  flushStar()

  for (const bk of [...books]) {
    if (bk.highlights.length === 0) {
      warnings.push(`《${bk.title}》未解析到任何划线，已跳过`)
      books.splice(books.indexOf(bk), 1)
    }
  }

  return { books, warnings, lineCount: lines.length }
}
