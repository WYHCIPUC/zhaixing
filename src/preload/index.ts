import { contextBridge, ipcRenderer } from 'electron'
import type { ZhaixingApi } from '@shared/types'
import type { BookPatch, StarPatch } from '@shared/types'

const api = {
  parseWereadText: (text: string) => ipcRenderer.invoke('import:parse', text),
  confirmImport: (text: string) => ipcRenderer.invoke('import:confirm', text),
  listArchives: () => ipcRenderer.invoke('import:archives'),

  listBooks: () => ipcRenderer.invoke('books:list'),
  getBook: (id: number) => ipcRenderer.invoke('books:get', id),
  updateBook: (id: number, patch: BookPatch) => ipcRenderer.invoke('books:update', id, patch),
  deleteBook: (id: number) => ipcRenderer.invoke('books:delete', id),

  listStars: (bookId: number) => ipcRenderer.invoke('stars:list', bookId),
  getStar: (id: number) => ipcRenderer.invoke('stars:get', id),
  updateStar: (id: number, patch: StarPatch) => ipcRenderer.invoke('stars:update', id, patch),
  deleteStar: (id: number) => ipcRenderer.invoke('stars:delete', id),
  mergeStars: (ids: number[], content: string) => ipcRenderer.invoke('stars:merge', ids, content),
  addThought: (starId: number, content: string) => ipcRenderer.invoke('thoughts:add', starId, content),
  updateThought: (id: number, content: string) => ipcRenderer.invoke('thoughts:update', id, content),
  deleteThought: (id: number) => ipcRenderer.invoke('thoughts:delete', id),
  setStarTags: (starId: number, tags: string[]) => ipcRenderer.invoke('stars:setTags', starId, tags),

  search: (q: string) => ipcRenderer.invoke('search', q),

  createNebula: (name: string, starIds: number[], summary?: string) =>
    ipcRenderer.invoke('nebula:create', name, starIds, summary),
  addStarsToNebula: (nebulaId: number, starIds: number[]) =>
    ipcRenderer.invoke('nebula:addStars', nebulaId, starIds),
  removeStarFromNebula: (nebulaId: number, starId: number) =>
    ipcRenderer.invoke('nebula:removeStar', nebulaId, starId),
  updateNebula: (id: number, patch: { name?: string; summary?: string; color?: string | null }) =>
    ipcRenderer.invoke('nebula:update', id, patch),
  deleteNebula: (id: number) => ipcRenderer.invoke('nebula:delete', id),
  listLinks: (status: 'suggested' | 'confirmed') => ipcRenderer.invoke('links:list', status),
  decideLink: (id: number, status: 'confirmed' | 'dismissed') =>
    ipcRenderer.invoke('links:decide', id, status),
  createLink: (fromId: number, toId: number, note: string) =>
    ipcRenderer.invoke('links:create', fromId, toId, note),
  deleteLink: (id: number) => ipcRenderer.invoke('links:delete', id),
  getStarMap: () => ipcRenderer.invoke('starmap:get'),
  bumpRevisit: (starId: number) => ipcRenderer.invoke('stars:bumpRevisit', starId),
  topRevisited: (limit: number) => ipcRenderer.invoke('stars:topRevisited', limit),
  runAiAnalysis: () => ipcRenderer.invoke('ai:runAnalysis'),
  pickGems: () => ipcRenderer.invoke('ai:pickGems'),

  getMeteor: () => ipcRenderer.invoke('meteor:today'),
  markMeteorRevisited: (logId: number) => ipcRenderer.invoke('meteor:revisited', logId),
  createCapsule: (starId: number, deliverAt: string, message: string) =>
    ipcRenderer.invoke('capsule:create', starId, deliverAt, message),
  listCapsules: () => ipcRenderer.invoke('capsule:list'),
  nightFlightStars: (limit: number) => ipcRenderer.invoke('meteor:nightFlight', limit),

  listArticles: (nebulaId?: number) => ipcRenderer.invoke('articles:list', nebulaId),
  draftNebulaArticle: (nebulaId: number) => ipcRenderer.invoke('articles:draft', nebulaId),
  saveArticle: (id: number, contentMd: string) => ipcRenderer.invoke('articles:save', id, contentMd),
  updateArticleTitle: (id: number, title: string) => ipcRenderer.invoke('articles:title', id, title),
  deleteArticle: (id: number) => ipcRenderer.invoke('articles:delete', id),
  rewriteQuote: (starId: number, style: 'tweet' | 'card' | 'speech' | 'review') =>
    ipcRenderer.invoke('ai:rewrite', starId, style),
  socraticAsk: (starId: number, thought: string) => ipcRenderer.invoke('ai:socratic', starId, thought),
  askSky: (question: string) => ipcRenderer.invoke('ai:askSky', question),

  dailyCounts: () => ipcRenderer.invoke('stats:daily'),
  spiritSpectrum: (refresh: boolean) => ipcRenderer.invoke('ai:spirit', refresh),
  saveImage: (defaultName: string, dataUrl: string) => ipcRenderer.invoke('app:saveImage', defaultName, dataUrl),

  wereadNotebooks: () => ipcRenderer.invoke('weread:notebooks'),
  wereadSyncBook: (bookId: string) => ipcRenderer.invoke('weread:syncBook', bookId),

  exportMarkdown: (bookId: number | 'all') => ipcRenderer.invoke('export:markdown', bookId),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Record<string, string>) => ipcRenderer.invoke('settings:set', patch),
  testAi: () => ipcRenderer.invoke('ai:test'),

  overview: () => ipcRenderer.invoke('stats:overview'),
  backupNow: () => ipcRenderer.invoke('app:backup')
}

export type Api = typeof api

// 编译期契约校验：preload 实现必须与共享 API 接口完全一致
const _contractCheck: ZhaixingApi = api
void _contractCheck

contextBridge.exposeInMainWorld('api', api)
