import { expect, test } from 'claude-code/testing'

// the pet follows a turn: thinking after it starts, peeking at a tool, done when it ends; /pet purrs
test('the band draws the muse on both surfaces and follows a turn', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const drawing = await $.ui.mount({ plugin: 'muse-pet', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80 } })
    expect(await drawing.find({ text: 'muse' })).toBeDefined()
    await drawing.unmount()
  }
  await $.turn.start({ turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  const after = await $.ui.mount({ plugin: 'muse-pet', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 80 } })
  expect(await after.find({ text: /peeking at Bash/ })).toBeDefined()
  await after.unmount()
  await $.turn.complete({ turnId: 't1', durationMs: 4200, isAborted: false, answer: 'done' })
  const done = await $.ui.mount({ plugin: 'muse-pet', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80 } })
  expect(await done.find({ text: /4s, 1 tool/ })).toBeDefined()
  await done.unmount()
  const purr = await $.command.run({ command: 'pet', args: '' })
  expect(purr).toBeTruthy()
})

// waiting: a permission prompt makes it wave and chime; /pet small shrinks it; /muse fetches a sheet
test('it waits, resizes and takes a muse of its own', async ($, on) => {
  const played: string[] = []
  on('audio.play', (_, e) => { played.push(JSON.stringify(e)); return { value: undefined } })
  on('tool.check', () => ({ decision: 'ask' as const }))
  const store: Record<string, unknown> = {}
  on('store.set', (_, e) => { const { key, value } = e as { key: string; value: unknown }; store[key] = value; return { value: undefined } })
  on('store.get', (_, e) => ({ value: store[(e as { key: string }).key] }))
  on('store.delete', (_, e) => { delete store[(e as { key: string }).key]; return { value: undefined } })
  const sheet = { w: 2, h: 2, palette: ['#ff00ff', '#f2e9d8'], clips: { idle: [['11', '10']] }, name: 'Mochi' }
  on('http.fetch', () => ({ value: { ok: true, status: 200, headers: {}, text: JSON.stringify(sheet) } }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await $.turn.start({ turnId: 't2' })
  await $.tool.check({ tool: 'Bash', input: { command: 'rm -rf build' } })
  const waiting = await $.ui.mount({ plugin: 'muse-pet', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 80 } })
  expect(await waiting.find({ text: /waiting for you · Bash/ })).toBeDefined()
  await waiting.unmount()
  expect(played.some((p) => p.includes('waiting.wav'))).toBe(true)

  const small = await $.command.run({ command: 'pet', args: 'small' })
  expect(small.text).toBe('the muse is now small')

  const mine = await $.command.run({ command: 'muse', args: 'ab12cd34' })
  expect(mine.text).toBe('your muse "Mochi" is here')
  const own = await $.ui.mount({ plugin: 'muse-pet', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80 } })
  expect(await own.find({ text: 'Mochi' })).toBeDefined()
  await own.unmount()
  const back = await $.command.run({ command: 'muse', args: 'default' })
  expect(back.text).toBe('back to the mububu muse')
})

// /pet mute silences the chimes and is remembered; /pet sound brings them back
test('/pet mute silences the chimes, /pet sound restores them', async ($, on) => {
  const played: string[] = []
  on('audio.play', (_, e) => { played.push(JSON.stringify(e)); return { value: undefined } })
  const store: Record<string, unknown> = {}
  on('store.set', (_, e) => { const { key, value } = e as { key: string; value: unknown }; store[key] = value; return { value: undefined } })
  on('store.get', (_, e) => ({ value: store[(e as { key: string }).key] }))
  const muted = await $.command.run({ command: 'pet', args: 'mute' })
  expect(muted.text).toMatch(/muted/)
  expect(store.muted).toBe(true)
  await $.command.run({ command: 'pet', args: '' })
  expect(played.length).toBe(0)
  const band = await $.ui.mount({ plugin: 'muse-pet', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80 } })
  expect(await band.find({ text: /muted/ })).toBeDefined()
  await band.unmount()
  const back = await $.command.run({ command: 'pet', args: 'sound' })
  expect(back.text).toBe('the muse has its voice back')
  expect(store.muted).toBe(false)
  expect(played.some((p) => p.includes('purr.wav'))).toBe(true)
})

// the controls under the muse: hide folds it to one line with a show control; mute toggles the chimes
test('the hide and mute controls work with a press, and /pet hide|show match them', async ($, on) => {
  const store: Record<string, unknown> = {}
  on('store.set', (_, e) => { const { key, value } = e as { key: string; value: unknown }; store[key] = value; return { value: undefined } })
  on('store.get', (_, e) => ({ value: store[(e as { key: string }).key] }))
  const mount = () => $.ui.mount({ plugin: 'muse-pet', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80 } })
  let band = await mount()
  expect(await band.find({ text: 'hide' })).toBeDefined()
  await band.press({ key: 'hide' })
  await band.unmount(); band = await mount()
  expect(await band.find({ text: 'show' })).toBeDefined()
  expect(await band.find({ text: /▸ muse/ })).toBeDefined()
  await band.press({ key: 'mute' })
  await band.unmount(); band = await mount()
  expect(store.muted).toBe(true)
  expect(await band.find({ text: 'sound' })).toBeDefined()
  await band.press({ key: 'show' })
  await band.unmount(); band = await mount()
  expect(await band.find({ text: 'hide' })).toBeDefined()
  await band.unmount()
  const hid = await $.command.run({ command: 'pet', args: 'hide' })
  expect(hid.text).toMatch(/one line/)
  const shown = await $.command.run({ command: 'pet', args: 'show' })
  expect(shown.text).toBe('the muse is back')
})
