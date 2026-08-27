import type { ParseResult, ParsedBook, ParsedHighlight } from '@shared/types'

// 微信读书导出文本解析器
// 已知格式特征（以真实样本为准持续校准）：
//   《书名》
//   作者名 / 作者：某某
//   ◆ 章节名
//   >> 划线内容
//   // 想法内容
//   行尾可能带日期 2024/03/15 或 2024年3月15日

const DATE_TAIL = /[（(【\s·—\-–~至]*\d{4}[年/.\-]\d{1,2}[月/.\-]\d{1,2}日?[）)】]?\s*$/
const CHAPTER_PREFIX = /^[◆◇●○■□▶▷·•▼▽]\s*(.+)$/
const CHAPTER_NAME =
  /^(第[0-9〇一二三四五六七八九十百千两]+[章节回卷部篇讲]|序章|序言|自序|他序|前言|导言|导论|引子|楔子|后记|跋|尾声|终章|附录[一二三四五六七八九十]?)\s*[:：.]?\s*(.*)$/
const HIGHLIGHT_PREFIX = /^>{1,2}\s?(.*)$/
const THOUGHT_PREFIX = /^(?:\/\/+|想法\s*[:：]|笔记\s*[:：])\s*(.*)$/
const AUTHOR_PREFIX = /^(?:作者|著者|author)\s*[:：]?\s*(.*)$/i

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
  // 中文直接拼接，西文补空格
  if (/[\x20-\x7e]$/.test(a) && /^[\x20-\x7e]/.test(b)) return `${a} ${b}`
  return a + b
}

export function parseWereadText(raw: string): ParseResult {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n')
  const books: ParsedBook[] = []
  const warnings: string[] = []

  // 用对象持有可变状态：TS 对对象属性的 narrow 在跨语句时会重置，
  // 不会像裸 let + 闭包那样把类型收窄成 never
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

  const useBook = (title: string): ParsedBook => {
    flushStar()
    st.chapter = ''
    const existing = books.find((x) => x.title === title)
    if (existing) {
      st.book = existing
      return existing
    }
    const created: ParsedBook = { title, author: '', chapters: [], highlights: [] }
    books.push(created)
    st.book = created
    return created
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

    // 书名
    const titleMatch = line.match(/^《(.+?)》\s*[^《]*$/)
    if (titleMatch) {
      useBook(titleMatch[1].trim())
      continue
    }

    const b = st.book
    if (!b) continue // 书名之前的杂项（页眉、导出说明等）丢弃

    // 作者
    const authorMatch = line.match(AUTHOR_PREFIX)
    if (authorMatch && !b.author) {
      b.author = stripDateTail(authorMatch[1]).text
      continue
    }

    // 符号标记的章节
    const chapterMatch = line.match(CHAPTER_PREFIX)
    if (chapterMatch && !HIGHLIGHT_PREFIX.test(line) && !THOUGHT_PREFIX.test(line)) {
      useChapter(stripDateTail(chapterMatch[1]).text)
      continue
    }

    // 文字标记的章节（第X章 / 序言 / 后记…）
    if (!HIGHLIGHT_PREFIX.test(line) && !THOUGHT_PREFIX.test(line) && CHAPTER_NAME.test(line)) {
      const m = line.match(CHAPTER_NAME)!
      useChapter(stripDateTail(m[2] ? `${m[1]} ${m[2]}` : m[1]).text)
      continue
    }

    // 划线
    const highlightMatch = line.match(HIGHLIGHT_PREFIX)
    if (highlightMatch) {
      flushStar()
      const { text } = stripDateTail(highlightMatch[1])
      st.star = { content: text, chapter: st.chapter, thoughts: [] }
      st.mode = 'star'
      continue
    }

    // 想法
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

    // 普通行：作者未定且书刚开篇时视为作者；其余视为当前划线/想法的续行
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

  // 无划线的书剔除并告警
  for (const bk of [...books]) {
    if (bk.highlights.length === 0) {
      warnings.push(`《${bk.title}》未解析到任何划线，已跳过`)
      books.splice(books.indexOf(bk), 1)
    }
  }

  return { books, warnings, lineCount: lines.length }
}
