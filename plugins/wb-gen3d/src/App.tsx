import { useCallback, useEffect, useRef, useState } from 'react';
import type { Gen3DAssetManifest } from '@shared/manifest';
import { callTool } from '@/lib/toolClient';
import { hasActiveGame } from '@/lib/gameSlug';
import type { GenerateResult, ListAssetsResult, Mode, ProviderStatus } from '@/types';
import { modeMeta } from '@/ui-meta';
import { SetupSidebar } from '@/components/SetupSidebar';
import { Workspace } from '@/components/Workspace';
import { AssetLibrary, InspectorReserved } from '@/components/AssetLibrary';

interface AppProps {
  pane: 'left' | 'center' | 'standalone';
}

// App owns the shared tool state and routes it into the staged left pane (setup
// + generate) and the center pane (result workspace + asset library). The two
// embedded panes are separate iframes; persisted assets are the cross-pane
// source of truth (gen3d:list-assets), so the center pane stays useful even
// when generation was triggered in the other iframe.
export function App({ pane }: AppProps) {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [assets, setAssets] = useState<Gen3DAssetManifest[]>([]);
  const [latest, setLatest] = useState<GenerateResult | null>(null);
  const [selected, setSelected] = useState<Gen3DAssetManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // No game in the URL → store tools would reject (missing_game); render an
  // empty/disabled state instead of firing calls that always fail.
  const gameActive = hasActiveGame();
  // The last submit, replayed by the workspace error "重试" action.
  const lastActionRef = useRef<null | (() => void)>(null);

  const refreshAssets = useCallback(async () => {
    if (!gameActive) return;
    const r = await callTool<ListAssetsResult>('gen3d:list-assets', {});
    if (r.ok) setAssets(r.result.assets);
  }, [gameActive]);

  const refreshStatus = useCallback(async () => {
    const r = await callTool<ProviderStatus>('gen3d:provider-status', {});
    if (r.ok) setStatus(r.result);
  }, []);

  useEffect(() => {
    void refreshStatus();
    void refreshAssets();
  }, [refreshStatus, refreshAssets]);

  const deleteAsset = useCallback(
    async (assetPath: string) => {
      const r = await callTool('gen3d:delete-asset', { assetPath });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSelected((cur) => (cur?.assetPath === assetPath ? null : cur));
      setLatest((cur) => (cur?.manifest.assetPath === assetPath ? null : cur));
      void refreshAssets();
    },
    [refreshAssets],
  );

  const runGenerate = useCallback(
    async (mode: Mode, args: unknown) => {
      setBusy(true);
      setError(null);
      const { toolId } = modeMeta[mode];
      const r = await callTool<GenerateResult>(toolId, args);
      setBusy(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setLatest(r.result);
      setSelected(null);
      void refreshAssets();
    },
    [refreshAssets],
  );

  // Meshy-only second stage: texture a prior white-mesh preview. previewTaskId is
  // the manifest.sourceJobId of a real Meshy text result.
  const runRefine = useCallback(
    async (previewTaskId: string) => {
      setBusy(true);
      setError(null);
      const r = await callTool<GenerateResult>('gen3d:refine-mesh', { previewTaskId });
      setBusy(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setLatest(r.result);
      setSelected(null);
      void refreshAssets();
    },
    [refreshAssets],
  );

  const handleGenerate = useCallback(
    (mode: Mode, args: unknown) => {
      lastActionRef.current = () => void runGenerate(mode, args);
      void runGenerate(mode, args);
    },
    [runGenerate],
  );

  const handleRefine = useCallback(
    (previewTaskId: string) => {
      lastActionRef.current = () => void runRefine(previewTaskId);
      void runRefine(previewTaskId);
    },
    [runRefine],
  );

  const handleRetry = useCallback(() => {
    lastActionRef.current?.();
  }, []);

  const showLeft = pane === 'left' || pane === 'standalone';
  const showCenter = pane === 'center' || pane === 'standalone';

  return (
    <div className={`gx-root gx-root--${pane}`}>
      {showLeft && (
        <SetupSidebar
          status={status}
          assetCount={assets.length}
          busy={busy}
          gameActive={gameActive}
          onGenerate={handleGenerate}
        />
      )}

      {showCenter && (
        <div className="gx-center">
          <div className="gx-center-scroll">
            <div className="gx-center-grid">
              <Workspace
                latest={latest}
                selected={selected}
                busy={busy}
                error={error}
                canRetry={lastActionRef.current !== null}
                onRetry={handleRetry}
                onDismissError={() => setError(null)}
                onRefine={handleRefine}
              />
              <div className="gx-rightcol">
                <AssetLibrary
                  assets={assets}
                  selectedId={selected?.assetPath ?? null}
                  gameActive={gameActive}
                  onRefresh={refreshAssets}
                  onSelect={setSelected}
                  onDelete={deleteAsset}
                />
                <InspectorReserved selected={selected} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
