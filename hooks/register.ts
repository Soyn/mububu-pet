// muse-pet: a pixel Muse above the prompt. The frames are the real 3D Muse through the Mububu Gadget's
// pixelator (hooks/sprites.ts, made by scripts/render-pet-sprites.cjs), head and shoulders, one clip
// per pose, drawn as half-block cells so each terminal row holds two pixel rows.
//
// It is useful, not only cute: it waves and chimes when Claude is waiting for you (a permission or a
// question), chimes when a long turn is done, and carries the context meter and the session's cost;
// as the context fills it gets sleepy and asks for /compact. /pet pets it. /muse <id> makes it your
// own Muse, from the Gadget's "terminal pet" (gadget.mububu.app). /pet small|big sets its size.
import type { Register } from 'claude-code'
import { SHEETS } from './sprites'

const DEFAULT_COLOR = 0x01000000 // the terminal's own
const HEART = 0xfe2c55, HEART_SOFT = 0xf6b9b3, ZZ = 0xa89580
const PET_HOST = 'https://gadget.mububu.app'

type Sheet = { w: number; h: number; palette: readonly string[]; clips: Record<string, readonly (readonly string[])[]>; name?: string }
type Mood = 'idle' | 'thinking' | 'tool' | 'waiting' | 'done' | 'petted' | 'sleepy'
const CLIP: Record<Mood, string> = { idle: 'idle', thinking: 'think', tool: 'walk', waiting: 'wave', done: 'jump', petted: 'cheer', sleepy: 'sit' }

const MUSINGS = ['pondering', 'fluffing', 'combing the fur', 'brewing', 'consulting the plush', 'counting strands', 'warming up the pixels', 'tuning the dither', 'untangling', 'herding pixels', 'mulling it over', 'rummaging in the wardrobe']
const DONE = ['ta-da', 'all fluffed', 'done, i think', 'that was fun', 'nailed it', 'next?']
const PURRS = ['purrrr', 'the fur approves', 'more please', 'ahh, right there', 'fluffed and happy']
const pick = (a: readonly string[]) => a[Math.floor(Math.random() * a.length)]

// one frame as a grid of colours (null = clear), with the extras this mood draws over it
function frame(sheet: Sheet, mood: Mood, at: number): (number | null)[][] {
  const clip = sheet.clips[CLIP[mood]] ?? sheet.clips.idle
  const rows = clip[at % clip.length]
  const pal = sheet.palette.map((c) => parseInt(c.slice(1), 16))
  const W = sheet.w, H = sheet.h
  const g: (number | null)[][] = []
  for (let y = 0; y < H; y++) { const row: (number | null)[] = []; for (let x = 0; x < W; x++) { const k = parseInt(rows[y]?.[x] ?? '0', 36); row.push(k ? pal[k] : null) } g.push(row) }
  const put = (x: number, y: number, c: number) => { if (g[y] && x >= 0 && x < W && g[y][x] === null) g[y][x] = c }
  if (mood === 'petted') { // two hearts rising, one each side
    const rise = Math.floor(at / 2) % 6
    const heart = (x: number, y: number, c: number) => { for (const [r, cc] of [[0, 1], [0, 3], [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [2, 1], [2, 2], [2, 3], [3, 2]]) put(x + cc, y + r, c) }
    heart(1, Math.max(0, 7 - rise), HEART); heart(W - 6, Math.max(0, 10 - rise), HEART_SOFT)
  }
  if (mood === 'sleepy' && Math.floor(at / 5) % 2 === 0) for (const [r, c] of [[0, 0], [0, 1], [0, 2], [1, 1], [2, 0], [2, 1], [2, 2]]) put(W - 5 + c, 1 + r, ZZ)
  return g
}
// Raster cells: two pixel rows per terminal row, upper and lower half blocks
function cellsOf(g: (number | null)[][], W: number, H: number): string {
  const n: number[] = []
  for (let r = 0; r < H; r += 2) for (let c = 0; c < W; c++) {
    const top = g[r][c], bot = g[r + 1]?.[c] ?? null
    if (top === null && bot === null) n.push(32, DEFAULT_COLOR, DEFAULT_COLOR)
    else if (bot === null) n.push(0x2580, top as number, DEFAULT_COLOR)
    else if (top === null) n.push(0x2584, bot, DEFAULT_COLOR)
    else n.push(0x2580, top, bot)
  }
  return new Uint8Array(Uint32Array.from(n).buffer).toBase64()
}
// a sheet from the Gadget's /p/<id>.json, checked before it is trusted
function asSheet(x: unknown): Sheet | null {
  const s = x as Sheet
  if (!s || typeof s !== 'object' || !(s.w > 0 && s.w <= 32 && s.h > 0 && s.h <= 32 && s.h % 2 === 0)) return null
  if (!Array.isArray(s.palette) || s.palette.length > 36 || !s.palette.every((c) => /^#[0-9a-f]{6}$/i.test(c))) return null
  if (!s.clips || typeof s.clips !== 'object' || !s.clips.idle) return null
  for (const fr of Object.values(s.clips)) if (!Array.isArray(fr) || !fr.length || !fr.every((f) => Array.isArray(f) && f.length === s.h && f.every((r) => typeof r === 'string' && r.length === s.w))) return null
  return { w: s.w, h: s.h, palette: s.palette, clips: s.clips, name: typeof s.name === 'string' ? s.name.slice(0, 40) : undefined }
}
const meter = (pct: number) => { const n = Math.round(pct / 20); return '▮'.repeat(n) + '▯'.repeat(5 - n) }

export const register: Register = (on) => {
  let mood: Mood = 'idle'
  let tick = 0, since = 0, quiet = 0, phraseTick = 0, tools = 0, waited = false
  let line = 'hello. your muse is here.'
  let size: 'big' | 'small' = 'big'
  let custom: Sheet | null = null
  let ctx = 0, usd = 0
  const sheet = (): Sheet => custom ?? (SHEETS[size] as unknown as Sheet)
  const set = (m: Mood, text?: string) => { mood = m; since = 0; quiet = 0; if (text !== undefined) line = text }

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'pet', description: 'Pet the Muse; /pet small or /pet big sets its size' })
    await $.command.register({ name: 'muse', description: 'Make the pet your own Muse: /muse <id or link from gadget.mububu.app>, /muse default' })
    const saved = await $.store.get('size'); if (saved === 'small' || saved === 'big') size = saved
    custom = asSheet(await $.store.get('sheet'))
    // the frame clock (the terminal caps the band's redraws, so about 10 a second)
    $.clock.every(100, () => {
      tick += 1; since += 1; quiet += 1
      if (mood === 'thinking' && tick - phraseTick > 22) { phraseTick = tick; line = pick(MUSINGS) }
      if (mood === 'tool' && since > 12) set('thinking', line)
      if (mood === 'done' && since > 14) set('idle', 'resting')
      if (mood === 'petted' && since > 24) set('idle', 'content')
      if (mood === 'idle' && quiet > 900 && ctx < 80) set('sleepy', 'zzz') // a quiet minute and a half: a nap
      $.ui.invalidate('ui.render')
    })
    // the context and the cost, as the status line has them
    $.clock.every(5000, async () => {
      try {
        const u = await $.session.usage()
        ctx = Math.round(u.context?.percent ?? 0)
        usd = u.cost?.usd ?? usd
        if (mood === 'idle' && ctx >= 92) set('sleepy', `stuffed · ${ctx}% · /compact`)
        else if (mood === 'idle' && ctx >= 80) set('sleepy', `getting full · ${ctx}% · /compact?`)
      } catch { /* no usage here */ }
    })
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => { if (mood === 'waiting') set('idle'); return next(e) })
  on('turn.start', async ($, e, next) => { tools = 0; waited = false; phraseTick = tick; set('thinking', pick(MUSINGS)); return next(e) })
  on('tool.call', async ($, e, next) => {
    tools += 1
    if (e.tool === 'AskUserQuestion') { waited = true; set('waiting', 'a question for you'); $.audio.play({ asset: 'sounds/waiting.wav' }).catch(() => {}) }
    else set('tool', `peeking at ${e.tool}`)
    const result = await next(e)
    if (mood === 'waiting') set('thinking', pick(MUSINGS))
    return result
  })
  // a permission prompt: the decision the rules reached is "ask", so Claude is now waiting for you
  on('tool.check', async ($, e, next) => {
    const decided = await next(e)
    if (decided?.decision === 'ask' && mood !== 'waiting') { waited = true; set('waiting', `waiting for you · ${e.tool}`); $.audio.play({ asset: 'sounds/waiting.wav' }).catch(() => {}) }
    return decided
  })
  on('turn.complete', async ($, e, next) => {
    const secs = Math.round((e.durationMs ?? 0) / 1000)
    set('done', e.isAborted ? 'oh. okay.' : `${pick(DONE)} · ${secs}s, ${tools} tool${tools === 1 ? '' : 's'}`)
    if (!e.isAborted && (secs >= 15 || waited)) $.audio.play({ asset: 'sounds/done.wav' }).catch(() => {})
    return next(e)
  })

  on('command.run', { command: 'pet' }, async ($, e) => {
    const arg = (e.args ?? '').trim().toLowerCase()
    if (arg === 'small' || arg === 'big') { size = arg; await $.store.set('size', size); return { text: `the muse is now ${size}` } }
    set('petted', pick(PURRS))
    $.audio.play({ asset: 'sounds/purr.wav' }).catch(() => {})
    return {}
  })
  on('command.run', { command: 'muse' }, async ($, e) => {
    const arg = (e.args ?? '').trim()
    if (!arg) return { text: custom ? `your muse${custom.name ? ` "${custom.name}"` : ''} is on. /muse default goes back to the mububu muse.` : `the default muse is on. make yours at ${PET_HOST} (share → terminal pet), then /muse <id>.` }
    if (arg === 'default') { custom = null; await $.store.delete('sheet'); return { text: 'back to the mububu muse' } }
    const id = (/\/p\/([a-z0-9]{1,24})\.json/i.exec(arg) || /^([a-z0-9]{6,24})$/i.exec(arg))?.[1]
    if (!id) return { text: `that is not a pet id or link. make one at ${PET_HOST}.` }
    try {
      const r = await $.http.fetch(`${PET_HOST}/p/${id.toLowerCase()}.json`)
      if (!r.ok) return { text: `no pet at that id (${r.status}). make one at ${PET_HOST}.` }
      const s = asSheet(JSON.parse(r.text))
      if (!s) return { text: 'that pet file is not one this version can draw' }
      custom = s; await $.store.set('sheet', s)
      set('petted', 'that is me!')
      return { text: `your muse${s.name ? ` "${s.name}"` : ''} is here` }
    } catch (err) { return { text: `could not fetch the pet: ${(err as Error)?.message ?? err}` } }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const dots = mood === 'thinking' ? '.'.repeat(1 + (Math.floor(tick / 4) % 3)) : ''
    const stats = `${meter(ctx)} ${ctx}%` + (usd ? ` · $${usd.toFixed(2)}` : '')
    const words = Box({ flexDirection: 'column', children: [
      Text({ bold: true, children: [custom?.name || 'muse'] }),
      Text({ dimColor: mood === 'idle' || mood === 'sleepy', bold: mood === 'waiting', children: [line + dots] }),
      Text({ dimColor: true, children: [stats] }),
    ] })
    if (e.surface !== 'terminal') {
      const face = mood === 'thinking' ? '( ˘ ᵕ ˘ )' : mood === 'done' || mood === 'petted' ? '( ^ ᵕ ^ )' : mood === 'sleepy' ? '( - ᵕ - )' : mood === 'waiting' ? '( • ᵕ • )/' : '( • ᵕ • )'
      return Box({ flexDirection: 'row', columnGap: 2, children: [Text({ children: [face] }), words] })
    }
    const { Raster } = $.ui.resolve(e)
    const s = sheet()
    return Box({ flexDirection: 'row', columnGap: 2, children: [
      Raster({ key: 'muse', columns: s.w, rows: s.h / 2, cells: cellsOf(frame(s, mood, tick), s.w, s.h) }),
      Box({ flexDirection: 'column', justifyContent: 'center', children: [words] }),
    ] })
  })
}
