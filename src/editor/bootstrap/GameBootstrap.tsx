import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { WorkbenchClientError } from '@forgeax/workbench-host/extension'
import { useT } from '../../i18n'
import { getWorkbenchHost } from '../../lib/workbench-host'

type PackageState = 'uninitialized' | 'initialized' | 'inconsistent'
type PackageStatus = { state: PackageState; missing?: string[] }
type PackageError = { code?: string; target?: string; hint?: string; retryable?: boolean }

export interface GameBootstrapProps {
  slug: string
  onBoot: () => void
  children: ReactNode
}

type BootstrapState =
  | { kind: 'loading' }
  | { kind: 'guide' }
  | { kind: 'dismissed' }
  | { kind: 'ready' }
  | { kind: 'inconsistent'; missing: string[] }
  | { kind: 'error'; error: PackageError; retry: 'status' | 'initialize' }

function statusOf(value: unknown): PackageStatus | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as { state?: unknown; missing?: unknown }
  if (
    candidate.state !== 'uninitialized'
    && candidate.state !== 'initialized'
    && candidate.state !== 'inconsistent'
  ) return null
  return {
    state: candidate.state,
    missing: Array.isArray(candidate.missing)
      ? candidate.missing.filter((item): item is string => typeof item === 'string')
      : undefined,
  }
}

function packageError(cause: unknown, target: string): PackageError {
  if (cause instanceof WorkbenchClientError) {
    return {
      code: cause.code,
      target: cause.target,
      hint: cause.message,
      retryable: cause.retryable,
    }
  }
  return {
    target,
    hint: cause instanceof Error ? cause.message : String(cause),
    retryable: true,
  }
}

export function GameBootstrap({ slug: _slug, onBoot, children }: GameBootstrapProps): JSX.Element | null {
  const t = useT()
  const [state, setState] = useState<BootstrapState>({ kind: 'loading' })

  const bootExisting = useCallback(() => {
    setState({ kind: 'ready' })
    onBoot()
  }, [onBoot])

  const readStatus = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      const status = statusOf(await getWorkbenchHost().gamePackage.status())
      if (status?.state === 'initialized') bootExisting()
      else if (status?.state === 'inconsistent') setState({ kind: 'inconsistent', missing: status.missing ?? [] })
      else if (status?.state === 'uninitialized') setState({ kind: 'guide' })
      else setState({ kind: 'error', retry: 'status', error: { target: 'package status', hint: 'Invalid package status', retryable: true } })
    } catch (cause) {
      setState({ kind: 'error', retry: 'status', error: packageError(cause, 'package status') })
    }
  }, [bootExisting])

  useEffect(() => { void readStatus() }, [readStatus])

  const initialize = async () => {
    setState({ kind: 'loading' })
    try {
      const status = statusOf(await getWorkbenchHost().gamePackage.initialize())
      if (status?.state === 'initialized') bootExisting()
      else if (status?.state === 'inconsistent') setState({ kind: 'inconsistent', missing: status.missing ?? [] })
      else setState({ kind: 'error', retry: 'initialize', error: { target: 'package', hint: 'Invalid package status', retryable: true } })
    } catch (cause) {
      setState({ kind: 'error', retry: 'initialize', error: packageError(cause, 'package') })
    }
  }

  if (state.kind === 'ready') return <>{children}</>
  if (state.kind === 'loading') return <section className="ga-bootstrap" aria-live="polite"><p>{t('bootstrap.checking')}</p></section>
  if (state.kind === 'dismissed') return null
  if (state.kind === 'inconsistent') {
    return <section className="ga-bootstrap" role="alert"><h1>{t('bootstrap.inconsistent.title')}</h1><p>{t('bootstrap.inconsistent.missing')} {state.missing.join(', ') || t('bootstrap.inconsistent.requiredFiles')}</p><p>{t('bootstrap.inconsistent.fix')}</p></section>
  }
  if (state.kind === 'error') {
    const { error } = state
    return <section className="ga-bootstrap" role="alert"><h1>{t('bootstrap.failed.title')}</h1><p>{t('bootstrap.failed.target')} {error.target ?? t('bootstrap.failed.workspace')}</p><p>{error.hint ?? t('bootstrap.failed.noDetails')}</p>{error.retryable !== false && <button type="button" onClick={() => void (state.retry === 'status' ? readStatus() : initialize())}>{t('bootstrap.retry')}</button>}</section>
  }
  return <section className="ga-bootstrap" aria-labelledby="ga-bootstrap-title">
    <h1 id="ga-bootstrap-title">{t('bootstrap.guide.title')}</h1>
    <p>{t('bootstrap.guide.description')}</p>
    <div className="ga-bootstrap-actions">
      <button type="button" onClick={() => void initialize()}>{t('bootstrap.guide.yes')}</button>
      <button type="button" onClick={() => setState({ kind: 'dismissed' })}>{t('bootstrap.guide.no')}</button>
    </div>
  </section>
}
