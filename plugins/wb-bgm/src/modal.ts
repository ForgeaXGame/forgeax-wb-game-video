import type { AssetMeta, VersionInfo } from './state.ts';
import { EL, $ } from './dom.ts';
import { getTypeMeta, getLatestVersion, getCosKeyForVersion, isZip, basename } from './utils.ts';
import { Viewer3D } from './viewer3d.ts';
import { downloadAndExtract } from './zipCache.ts';
import type { UrlResolver } from './zipCache.ts';
import { proxyUrl } from './proxyUrl.ts';
import { audioKindOf } from './config.ts';
import { attachToGame, type AudioSelection } from './attach.ts';
import { openGamePicker } from './gameSelect.ts';

let _modalViewer: Viewer3D | null = null;

function setModalViewer(name: string | null): void {
  EL.modalLoading().classList.add('hidden');
  EL.modalProgress().classList.add('hidden');
  EL.modalViewer3d().classList.add('hidden');
  EL.modalViewerTexture().classList.add('hidden');
  EL.modalViewerAudio().classList.add('hidden');
  EL.modalViewerVideo().classList.add('hidden');
  EL.modalPreviewPlaceholder().classList.add('hidden');
  if (name) $(name)?.classList.remove('hidden');
}

function showModalTexture(url: string): void {
  setModalViewer('modalViewerTexture');
  (EL.modalTextureImg() as HTMLImageElement).src = url;
}

function showModalAudio(url: string): void {
  setModalViewer('modalViewerAudio');
  const player = EL.modalAudioPlayer() as HTMLAudioElement;
  player.src = url;
  player.load();
}

function showModalVideo(url: string): void {
  setModalViewer('modalViewerVideo');
  const player = EL.modalVideoPlayer() as HTMLVideoElement;
  player.src = url;
  player.load();
}

function getModalViewer(): Viewer3D {
  if (!_modalViewer) _modalViewer = new Viewer3D(EL.modalCanvasWrap());
  return _modalViewer;
}

function loadModal3DModel(getUrl: UrlResolver, files: string[], _label: string, isAnim: boolean): void {
  setModalViewer('modalViewer3d');
  EL.modalAnimList().classList.add('hidden');
  EL.modalAnimBtns().innerHTML = '';
  const viewer = getModalViewer();

  if (isAnim) {
    viewer.loadAnimation(getUrl, files, (animKeys: string[]) => {
      if (!animKeys.length) return;
      EL.modalAnimList().classList.remove('hidden');
      EL.modalAnimBtns().innerHTML = '';
      const commonPrefix = animKeys.length > 1
        ? animKeys.reduce((pre, k) => { while (k.indexOf(pre) !== 0) pre = pre.slice(0, -1); return pre; })
        : '';
      const lastSep = commonPrefix.lastIndexOf('_');
      const stripLen = lastSep > 0 ? lastSep + 1 : 0;
      animKeys.forEach((k, i) => {
        const b = document.createElement('button');
        b.className = `anim-btn${i === 0 ? ' active' : ''}`;
        b.textContent = k.slice(stripLen) || k;
        b.title = k;
        b.onclick = () => {
          document.querySelectorAll('#modalAnimBtns .anim-btn').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          viewer.playAction(k);
        };
        EL.modalAnimBtns().appendChild(b);
      });
    });
  } else {
    viewer.loadStatic(getUrl, files);
  }
}

function showModalViewerFromZip(type: number | undefined, getUrl: UrlResolver, files: string[], label: string): void {
  if (type === 1 || type === 10) {
    loadModal3DModel(getUrl, files, label, false);
  } else if (type === 5) {
    loadModal3DModel(getUrl, files, label, true);
  } else if (type === 2) {
    const img = files.find(f => /\.(png|jpg|jpeg|tga|tiff?)$/i.test(f));
    if (img) showModalTexture(getUrl(img));
    else { setModalViewer('modalPreviewPlaceholder'); EL.modalPlaceholderText().textContent = 'zip 中未找到贴图文件'; }
  } else {
    setModalViewer('modalPreviewPlaceholder');
    EL.modalPlaceholderText().textContent = '已缓存，该类型暂不支持预览';
  }
}

async function loadModalPreview(asset: AssetMeta, versionObj: VersionInfo | null | undefined, cosKey: string): Promise<void> {
  if (_modalViewer) { _modalViewer.destroy(); _modalViewer = null; }
  (EL.modalAudioPlayer() as HTMLAudioElement).pause();
  (EL.modalVideoPlayer() as HTMLVideoElement).pause();

  if (!cosKey) { setModalViewer('modalPreviewPlaceholder'); EL.modalPlaceholderText().textContent = '无效的资产路径'; return; }
  const type = asset?.type;
  if (!versionObj) { setModalViewer('modalPreviewPlaceholder'); EL.modalPlaceholderText().textContent = '该资产暂无可用版本'; return; }
  const downloadUrl = versionObj.res_url || '';

  if (type === 2 && !isZip(cosKey)) { showModalTexture(proxyUrl(downloadUrl)); return; }
  if ((type === 3 || type === 7) && !isZip(cosKey)) { showModalAudio(proxyUrl(downloadUrl)); return; }
  if (type === 4 && !isZip(cosKey)) { showModalVideo(proxyUrl(downloadUrl)); return; }
  if (!isZip(cosKey)) { setModalViewer('modalPreviewPlaceholder'); EL.modalPlaceholderText().textContent = '暂不支持预览该文件类型'; return; }

  if (!downloadUrl) { setModalViewer('modalPreviewPlaceholder'); EL.modalPlaceholderText().textContent = '缺少下载链接'; return; }

  setModalViewer('modalProgress');
  EL.modalProgressTitle().textContent = `准备下载：${basename(cosKey, '.zip')}`;
  EL.modalProgressFill().style.width = '0%';
  EL.modalProgressMsg().textContent = '';

  try {
    const { files, getUrl } = await downloadAndExtract(downloadUrl, cosKey, (pct, msg) => {
      EL.modalProgressFill().style.width = `${pct}%`;
      EL.modalProgressMsg().textContent = msg;
    });
    showModalViewerFromZip(type, getUrl, files, basename(cosKey, '.zip'));
  } catch (e) {
    setModalViewer('modalPreviewPlaceholder');
    EL.modalPlaceholderText().textContent = `错误: ${e instanceof Error ? e.message : String(e)}`;
  }
}

function wireModalAttach(asset: AssetMeta, versionObj: VersionInfo | null | undefined): void {
  const btn = EL.modalAttachBtn() as HTMLButtonElement;
  const type = asset?.type;
  const resUrl = versionObj?.res_url || '';
  const cosKey = getCosKeyForVersion(asset, versionObj ?? null) || '';
  if ((type === 3 || type === 7) && resUrl) {
    const sel: AudioSelection = {
      assetId: asset.asset_id || asset.id || '',
      name: asset.display_name || asset.name || basename(cosKey),
      kind: audioKindOf(type),
      version: versionObj?.display_version_name || versionObj?.version_name || '',
      resUrl,
      filename: basename(cosKey),
    };
    btn.classList.remove('hidden');
    btn.onclick = () => { void openGamePicker(btn, (slug) => { void attachToGame(sel, btn, slug); }); };
  } else {
    btn.classList.add('hidden');
    btn.onclick = null;
  }
}

function switchModalVersion(asset: AssetMeta, versionObj: VersionInfo | null | undefined): void {
  const verStr = versionObj?.display_version_name || versionObj?.version_name || asset.current_version || '未知';
  EL.infoVersion().textContent = verStr === '未知' ? verStr : `${verStr} 版本`;

  const formatTime = (t: number | string | undefined): string => {
    if (!t) return '-';
    if (typeof t === 'number') return new Date(t < 1e12 ? t * 1000 : t).toLocaleString();
    return String(t);
  };
  EL.infoCreateTime().textContent = formatTime(versionObj?.create_time || asset.create_time);
  EL.infoUpdateTime().textContent = formatTime(versionObj?.update_time || asset.update_time);

  // wb-bgm is read + attach only — never delete from the shared library.
  // (Host-side allowlist in /api/wb/bgm/backend would reject it anyway.)
  EL.modalDeleteBtn().classList.add('hidden');
  EL.modalDeleteBtn().onclick = null;

  // "配入游戏" — only for audio(3)/音效(7) with a downloadable version.
  wireModalAttach(asset, versionObj);

  EL.infoPath().textContent = getCosKeyForVersion(asset, versionObj ?? null) || '-';
  void loadModalPreview(asset, versionObj, getCosKeyForVersion(asset, versionObj ?? null));
}

export function openModal(asset: AssetMeta, cosKey: string): void {
  const tm = getTypeMeta(asset.type);
  EL.modalTitle().textContent = asset.name || '资产详情';
  EL.infoName().textContent = asset.name || '-';
  EL.infoId().textContent = asset.id || '-';
  EL.infoType().textContent = tm.label;
  const stateMap: Record<number, string> = { 1: '上线', 5: '导入成功', 9: '下线', 10: '删除' };
  EL.infoState().textContent = stateMap[asset.state ?? -1] || `未知 (${asset.state || '-'})`;
  EL.infoDescription().textContent = asset.description || '暂无描述';
  EL.infoPath().textContent = cosKey || '-';

  if (asset.ai_meta) { EL.infoAiMetaRow().classList.remove('hidden'); EL.infoAiMeta().textContent = typeof asset.ai_meta === 'object' ? JSON.stringify(asset.ai_meta, null, 2) : String(asset.ai_meta); }
  else EL.infoAiMetaRow().classList.add('hidden');
  if (asset.extra) { EL.infoExtraRow().classList.remove('hidden'); EL.infoExtra().textContent = typeof asset.extra === 'object' ? JSON.stringify(asset.extra, null, 2) : String(asset.extra); }
  else EL.infoExtraRow().classList.add('hidden');

  const versions = asset.versions || [];
  const latestVer = getLatestVersion(asset) || versions[0];
  if (versions.length > 1) {
    EL.modalVersionTabs().classList.remove('hidden');
    const container = EL.modalVersionTabs();
    container.innerHTML = '';
    versions.forEach(v => {
      const btn = document.createElement('button');
      btn.className = 'version-tab';
      if (v === latestVer) btn.classList.add('active');
      const verName = v.display_version_name || v.version_name || '未知';
      btn.textContent = verName === '未知' ? verName : `${verName} 版本`;
      btn.onclick = () => { container.querySelectorAll('.version-tab').forEach(b => b.classList.remove('active')); btn.classList.add('active'); switchModalVersion(asset, v); };
      container.appendChild(btn);
    });
  } else { EL.modalVersionTabs().classList.add('hidden'); EL.modalVersionTabs().innerHTML = ''; }

  const tags = [...(asset.custom_tags || []), ...(asset.gen_tags || [])];
  if (tags.length) { EL.infoTagsRow().classList.remove('hidden'); EL.infoTags().innerHTML = tags.map(t => `<span class="info-tag">${t}</span>`).join(''); }
  else EL.infoTagsRow().classList.add('hidden');

  EL.modalOverlay().classList.remove('hidden');
  switchModalVersion(asset, latestVer);
}

export function closeModal(): void {
  EL.modalOverlay().classList.add('hidden');
  if (_modalViewer) { _modalViewer.destroy(); _modalViewer = null; }
  (EL.modalAudioPlayer() as HTMLAudioElement).pause();
  (EL.modalVideoPlayer() as HTMLVideoElement).pause();
}

export function initModal(): void {
  EL.modalCloseBtn().addEventListener('click', closeModal);
  EL.modalOverlay().addEventListener('click', (e) => { if (e.target === EL.modalOverlay()) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !EL.modalOverlay().classList.contains('hidden')) closeModal(); });
}
