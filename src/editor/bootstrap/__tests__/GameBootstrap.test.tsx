import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { setLocale } from '../../../i18n'
import { GameBootstrap } from '../GameBootstrap'

const client = {
  gamePackage: {
    status: vi.fn(),
    initialize: vi.fn(),
  },
}

vi.mock('../../../lib/workbench-host', () => ({
  getWorkbenchHost: () => client,
}))

beforeEach(() => {
  client.gamePackage.status.mockReset()
  client.gamePackage.initialize.mockReset()
  setLocale('en')
})

test('renders the guide in the active locale', async () => {
  setLocale('zh')
  client.gamePackage.status.mockResolvedValueOnce({ state: 'uninitialized', missing: [] })
  render(<GameBootstrap slug="demo" onBoot={vi.fn()}><div>workspace</div></GameBootstrap>)
  expect(await screen.findByRole('heading', { name: '从模板新建视频游戏' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '从模板新建' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '否，稍后再说' })).toBeTruthy()
})

test('shows guide without initializing an uninitialized package', async () => {
  client.gamePackage.status.mockResolvedValueOnce({ state: 'uninitialized', missing: [] })
  const boot = vi.fn()
  render(<GameBootstrap slug="demo" onBoot={boot}><div>workspace</div></GameBootstrap>)
  expect(await screen.findByRole('heading', { name: 'Create a video game from template' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Create from template' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'No, maybe later' })).toBeTruthy()
  expect(boot).not.toHaveBeenCalled()
  expect(client.gamePackage.status).toHaveBeenCalledTimes(1)
  expect(client.gamePackage.initialize).not.toHaveBeenCalled()
})

test('initializes once on yes and then mounts workspace', async () => {
  client.gamePackage.status.mockResolvedValueOnce({ state: 'uninitialized', missing: [] })
  client.gamePackage.initialize.mockResolvedValueOnce({ state: 'initialized', missing: [], initialized: true })
  const boot = vi.fn()
  render(<GameBootstrap slug="demo" onBoot={boot}><div>workspace</div></GameBootstrap>)
  await screen.findByRole('button', { name: 'Create from template' })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create from template' })) })
  await waitFor(() => expect(boot).toHaveBeenCalledTimes(1))
  expect(screen.getByText('workspace')).toBeTruthy()
  expect(client.gamePackage.status).toHaveBeenCalledTimes(1)
  expect(client.gamePackage.initialize).toHaveBeenCalledTimes(1)
})

test('closes the guide on no without writing, then retries a failed initialize', async () => {
  client.gamePackage.status.mockResolvedValueOnce({ state: 'uninitialized', missing: [] })
  const boot = vi.fn()
  const first = render(<GameBootstrap slug="demo" onBoot={boot}><div>workspace</div></GameBootstrap>)
  await screen.findByRole('button', { name: 'No, maybe later' })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'No, maybe later' })) })
  expect(screen.queryByRole('heading', { name: 'Create a video game from template' })).toBeNull()
  expect(boot).not.toHaveBeenCalled()
  expect(client.gamePackage.status).toHaveBeenCalledTimes(1)

  first.unmount()
  client.gamePackage.status.mockResolvedValueOnce({ state: 'uninitialized', missing: [] })
  render(<GameBootstrap slug="demo" onBoot={boot}><div>workspace</div></GameBootstrap>)
  await screen.findByRole('button', { name: 'Create from template' })
  client.gamePackage.initialize.mockRejectedValueOnce(new Error('temporary'))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create from template' })) })
  expect(await screen.findByText('Initialization failed')).toBeTruthy()
  client.gamePackage.initialize.mockResolvedValueOnce({ state: 'initialized', missing: [], initialized: true })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })) })
  await waitFor(() => expect(boot).toHaveBeenCalledTimes(1))
  expect(screen.getByText('workspace')).toBeTruthy()
  expect(client.gamePackage.status).toHaveBeenCalledTimes(2)
  expect(client.gamePackage.initialize).toHaveBeenCalledTimes(2)
})

test('renders inconsistent packages as an explicit non-retryable error', async () => {
  client.gamePackage.status.mockResolvedValueOnce({ state: 'inconsistent', missing: ['blueprint.json'] })
  render(<GameBootstrap slug="demo" onBoot={vi.fn()}><div>workspace</div></GameBootstrap>)
  expect(await screen.findByText('Video game files are inconsistent')).toBeTruthy()
  expect(screen.getByRole('alert')).toHaveTextContent('blueprint.json')
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
})
