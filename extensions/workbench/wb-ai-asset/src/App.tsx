import { useCallback, useEffect, useState } from 'react';
import type { Gen3DAssetManifest } from '@shared/manifest';
import { callTool } from '@/lib/toolClient';
import { hasActiveGame } from '@/lib/gameSlug';
import type { ListAssetsResult, ProviderStatus } from '@/types';
import { onLocaleChange } from '@/i18n';
import { SetupSidebar } from '@/components/SetupSidebar';
import { Workspace } from '@/components/Workspace';
import { AssetLibrary } from '@/components/AssetLibrary';
import { CredentialsModal } from '@/components/CredentialsModal';

interface AppProps {
  pane: 'left' | 'center' | 'standalone';
}

// App owns the shared tool state and routes it into the left pane (setup +
// generate) and the center pane (viewer + secondary stages + asset library).
// The two embedded panes are separate iframes; the disk-backed asset list
// (aiasset:list-assets) is the cross-pane source of truth, so a generation in
// one iframe surfaces in the other on refresh (manual button + window focus).
export function App({ pane }: AppProps) {
  const [localeRev, bumpLocale] = useState(0);
  useEffect(() => onLocaleChange(() => bumpLocale((n) => n + 1)), []);

  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [assets, setAssets] = useState<Gen3DAssetManifest[]>([]);
  const [selected, setSelected] = useState<Gen3DAssetManifest | null>(null);
  const [showCreds, setShowCreds] = useState(false);
  const gameActive = hasActiveGame();

  const refreshAssets = useCallback(async () => {
    if (!gameActive) return;
    const r = await callTool<ListAssetsResult>('aiasset:list-assets', {});
    if (r.ok) setAssets(r.result.assets);
  }, [gameActive]);

  const refreshStatus = useCallback(async () => {
    const r = await callTool<ProviderStatus>('aiasset:provider-status', { checkBalance: true });
    if (r.ok) setStatus(r.result);
  }, []);

  useEffect(() => {
    void refreshStatus();
    void refreshAssets();
  }, [refreshStatus, refreshAssets]);

  // Cheap cross-pane sync: re-pull the asset list when this iframe regains focus.
  useEffect(() => {
    const onFocus = () => void refreshAssets();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshAssets]);

  const handleGenerated = useCallback(
    (m: Gen3DAssetManifest) => {
      setSelected(m);
      void refreshAssets();
    },
    [refreshAssets],
  );

  const showLeft = pane === 'left' || pane === 'standalone';
  const showCenter = pane === 'center' || pane === 'standalone';

  return (
    <div className={`aa-root aa-root--${pane}`} key={localeRev}>
      {showLeft && (
        <SetupSidebar
          status={status}
          gameActive={gameActive}
          onGenerated={handleGenerated}
          onOpenCredentials={() => setShowCreds(true)}
        />
      )}

      {showCenter && (
        <div className="aa-center">
          <div className="aa-center-grid">
            <Workspace selected={selected} onGenerated={handleGenerated} />
            <AssetLibrary
              assets={assets}
              selectedId={selected?.assetPath ?? null}
              gameActive={gameActive}
              onRefresh={refreshAssets}
              onSelect={setSelected}
            />
          </div>
        </div>
      )}

      {showCreds && <CredentialsModal onClose={() => setShowCreds(false)} onSaved={refreshStatus} />}
    </div>
  );
}
