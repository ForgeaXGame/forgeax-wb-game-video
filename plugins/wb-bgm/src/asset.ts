import { EL } from './dom.ts';
import { getLatestVersion, getCosKeyForVersion, isZip, basename, showToast, setViewerPanel } from './utils.ts';
import type { AssetMeta, VersionInfo } from './state.ts';
import { load3DModel } from './viewer3d.ts';
import { downloadAndExtract } from './zipCache.ts';
import type { UrlResolver } from './zipCache.ts';
import { proxyUrl } from './proxyUrl.ts';
import { audioKindOf } from './config.ts';
import { attachToGame, type AudioSelection } from './attach.ts';
import { openGamePicker } from './gameSelect.ts';

/** 当前正在试听的 BGM/音效选择，供「配入游戏」使用。 */
let currentAudioSel: AudioSelection | null = null;

function showTexture(_cosKey: string | null, label: string, directUrl: string): void {
  setViewerPanel('viewerTexture');
  EL.textureName().textContent = label;
  (EL.textureImg() as HTMLImageElement).src = directUrl;
}

function showAudio(_cosKey: string | null, label: string, directUrl: string): void {
  setViewerPanel('viewerAudio');
  EL.audioName().textContent = label;
  const player = EL.audioPlayer() as HTMLAudioElement;
  player.src = directUrl;
  player.load();
}

function showVideo(_cosKey: string | null, label: string, directUrl: string): void {
  setViewerPanel('viewerVideo');
  EL.videoName().textContent = label;
  const player = EL.videoPlayer() as HTMLVideoElement;
  player.src = directUrl;
  player.load();
}

function showViewerFromZip(type: number | undefined, getUrl: UrlResolver, files: string[], label: string): void {
  if (type === 1 || type === 10) {
    load3DModel(getUrl, files, label, false);
  } else if (type === 5) {
    load3DModel(getUrl, files, label, true);
  } else if (type === 2) {
    const img = files.find(f => /\.(png|jpg|jpeg|tga|tiff?)$/i.test(f));
    if (img) showTexture(null, label, getUrl(img));
    else showToast('zip 中未找到贴图文件', '');
  } else {
    showToast(`该类型暂不支持预览`, '');
    setViewerPanel(null);
    EL.placeholder().classList.remove('hidden');
  }
}

export async function openAsset(asset: AssetMeta): Promise<void> {
  if (!asset) return;

  const versions = asset.versions || [];
  const latestVer = getLatestVersion(asset) || versions[0];

  if (versions.length > 1) {
    EL.assetVersionTabs().classList.remove('hidden');
    const container = EL.assetVersionTabs();
    container.innerHTML = '<span style="font-size: 13px; font-weight: 600; color: var(--text-2); margin-right: 4px;">【版本】</span>';
    versions.forEach(v => {
      const btn = document.createElement('button');
      btn.className = 'version-tab';
      if (v === latestVer) btn.classList.add('active');
      const verName = v.display_version_name || v.version_name || '未知';
      btn.textContent = verName === '未知' ? verName : `${verName} 版本`;
      btn.onclick = () => {
        container.querySelectorAll('.version-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        openAssetVersion(asset, v);
      };
      container.appendChild(btn);
    });
  } else {
    EL.assetVersionTabs().classList.add('hidden');
    EL.assetVersionTabs().innerHTML = '';
  }

  openAssetVersion(asset, latestVer);
}

async function openAssetVersion(asset: AssetMeta, versionObj: VersionInfo | undefined): Promise<void> {
  const cosKey = getCosKeyForVersion(asset, versionObj ?? null);
  if (!cosKey) return;

  const type = asset?.type;
  if (!versionObj) {
    showToast('该资产暂无可用版本（未发布或版本信息异常）', 'error');
    return;
  }
  const downloadUrl = versionObj.res_url || '';

  if (type === 2 && !isZip(cosKey)) {
    showTexture(null, basename(cosKey), proxyUrl(downloadUrl));
    return;
  }

  if ((type === 3 || type === 7) && !isZip(cosKey)) {
    currentAudioSel = {
      assetId: asset.asset_id || asset.id || '',
      name: asset.display_name || asset.name || basename(cosKey),
      kind: audioKindOf(type),
      version: versionObj.display_version_name || versionObj.version_name || '',
      resUrl: downloadUrl,
      filename: basename(cosKey),
    };
    showAudio(null, basename(cosKey), proxyUrl(downloadUrl));
    return;
  }
  currentAudioSel = null;

  if (type === 4 && !isZip(cosKey)) {
    showVideo(null, basename(cosKey), proxyUrl(downloadUrl));
    return;
  }

  if (!isZip(cosKey)) {
    showToast(`暂不支持预览该文件类型：${cosKey}`, '');
    setViewerPanel(null);
    EL.placeholder().classList.remove('hidden');
    const p = EL.placeholder().querySelector('p');
    if (p) p.textContent = `暂不支持预览：${basename(cosKey)}`;
    return;
  }

  if (!downloadUrl) {
    showToast('缺少下载链接', 'error');
    return;
  }

  setViewerPanel('progressPanel');
  EL.progressTitle().textContent = `准备下载：${basename(cosKey, '.zip')}`;
  EL.progressFill().style.width  = '0%';
  EL.progressMsg().textContent   = '';

  try {
    const { files, getUrl } = await downloadAndExtract(downloadUrl, cosKey, (pct, msg) => {
      EL.progressFill().style.width = `${pct}%`;
      EL.progressMsg().textContent = msg;
    });
    showViewerFromZip(type, getUrl, files, basename(cosKey, '.zip'));
  } catch (e) {
    showToast(`错误: ${e instanceof Error ? e.message : String(e)}`, 'error');
    setViewerPanel(null);
    EL.placeholder().classList.remove('hidden');
  }
}

export function initAudioAttach(): void {
  const btn = EL.attachAudioBtn() as HTMLButtonElement;
  if (btn) btn.addEventListener('click', () => {
    if (!currentAudioSel) { void attachToGame(currentAudioSel, btn, ''); return; }
    void openGamePicker(btn, (slug) => { void attachToGame(currentAudioSel, btn, slug); });
  });
}
