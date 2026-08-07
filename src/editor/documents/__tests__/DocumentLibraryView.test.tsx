import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDocumentNav } from '../../persist/documentNavStore'
import { DocumentLibraryView } from '../DocumentLibraryView'

const mocks = vi.hoisted(() => ({
  fetchProjectDocuments: vi.fn(),
  fetchProjectDocument: vi.fn(),
}))

vi.mock('../document-client', () => ({
  fetchProjectDocuments: mocks.fetchProjectDocuments,
  fetchProjectDocument: mocks.fetchProjectDocument,
}))

describe('DocumentLibraryView', () => {
  beforeEach(() => {
    mocks.fetchProjectDocuments.mockReset()
    mocks.fetchProjectDocument.mockReset()
    useDocumentNav.setState({ documentType: 'intake' })
  })

  it('shows a read-only empty state when a new project has no Markdown documents', async () => {
    mocks.fetchProjectDocuments.mockResolvedValue({ documents: [] })

    render(<DocumentLibraryView />)

    await waitFor(() => {
      expect(screen.getByText('当前项目尚无需求。')).toBeTruthy()
    })
    expect(screen.queryByRole('button', { name: /创建|上传|编辑|采用/ })).toBeNull()
  })

  it('renders a single registered document for the active type', async () => {
    mocks.fetchProjectDocuments.mockResolvedValue({
      documents: [
        { id: 'doc-core', name: '核心方案', documentType: 'core', updatedAt: 1 },
      ],
    })
    mocks.fetchProjectDocument.mockResolvedValue({
      id: 'doc-core', name: '核心方案', documentType: 'core', updatedAt: 1, content: '# 核心',
    })
    useDocumentNav.setState({ documentType: 'core' })

    render(<DocumentLibraryView />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: '核心' })).toBeTruthy()
    })
    expect(screen.queryByRole('button', { name: '采用' })).toBeNull()
  })
})
