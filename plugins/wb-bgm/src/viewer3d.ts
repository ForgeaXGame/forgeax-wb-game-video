import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EL } from './dom.ts';
import { showToast, setViewerPanel, basename } from './utils.ts';
import type { UrlResolver } from './zipCache.ts';

/** 贴图缓存里带上的文件名标签（运行时扩展字段） */
type TextureWithLabel = THREE.Texture & { _texLabel?: string };

/** 材质上展示的贴图来源标签（运行时扩展字段） */
type MaterialWithTexLabel = THREE.MeshStandardMaterial & { _texLabel: string };

export interface TexturePair {
  body: THREE.Texture | null;
  wea: THREE.Texture | null;
}

// ==================== 材质 & 贴图工具 ====================

export function buildTexturePair(getUrl: UrlResolver, files: string[]): TexturePair {
  const loader = new THREE.TextureLoader();
  const bFiles = files.filter(
    (f) => /_[Bb]\.[^.]+$/.test(f) && /\.(png|jpg|jpeg|tga|bmp)$/i.test(f)
  );
  const bodyFile = bFiles.find((f) => !f.toLowerCase().includes('wea_'));
  const weaFile = bFiles.find((f) => f.toLowerCase().includes('wea_'));

  const load = (f: string): TextureWithLabel => {
    const t = loader.load(getUrl(f)) as TextureWithLabel;
    t.colorSpace = THREE.SRGBColorSpace;
    t._texLabel = f;
    return t;
  };

  return {
    body: bodyFile ? load(bodyFile) : null,
    wea: weaFile ? load(weaFile) : null,
  };
}

export function pickMaterial(meshName: string | undefined, texPair: TexturePair): THREE.MeshStandardMaterial {
  const mn = (meshName || '').toLowerCase();
  const isWea = mn.startsWith('sm_wea_');
  const tex: TextureWithLabel | null = (isWea && texPair.wea ? texPair.wea : texPair.body) as TextureWithLabel | null;
  const mat = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide,
    map: tex,
    color: tex ? 0xffffff : 0xcccccc,
    metalness: 0.1,
    roughness: 0.8,
  }) as MaterialWithTexLabel;
  mat._texLabel = tex?._texLabel || '无';
  return mat;
}

// ==================== Viewer3D ====================

export class Viewer3D {
  container: HTMLElement;
  scene: THREE.Scene;
  clock: THREE.Clock;
  mixer: THREE.AnimationMixer | null;
  actions: Record<string, THREE.AnimationAction>;
  current: string | null;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  statsOverlay: HTMLDivElement;
  statsHeader: HTMLElement;
  statsExtra: HTMLElement;
  elTri: HTMLElement | null;
  elVert: HTMLElement | null;
  elFile: HTMLElement | null;
  elMeshes: HTMLElement | null;
  elMaterials: HTMLElement | null;
  elTextures: HTMLElement | null;
  elSize: HTMLElement | null;
  elMem: HTMLElement | null;
  controls: OrbitControls;
  _ro: ResizeObserver;
  _raf: number | null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2a2d3a);
    this.clock = new THREE.Clock();
    this.mixer = null;
    this.actions = {};
    this.current = null;

    this.camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.01,
      5000
    );
    this.camera.position.set(0, 2, 5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    ambient.name = 'AmbientLight';
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.name = 'DirectionalLight';
    sun.position.set(5, 10, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xaabbff, 0.6);
    fill.name = 'DirectionalLight';
    fill.position.set(-5, 3, -5);
    this.scene.add(fill);
    const back = new THREE.DirectionalLight(0xffffff, 0.4);
    back.name = 'DirectionalLight';
    back.position.set(0, -5, -8);
    this.scene.add(back);

    const grid = new THREE.GridHelper(20, 40, 0x333355, 0x222233);
    grid.name = 'GridHelper';
    this.scene.add(grid);

    const shadowGeo = new THREE.PlaneGeometry(50, 50);
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.6 });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.name = 'ShadowPlane';
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.001;
    shadowMesh.receiveShadow = true;
    this.scene.add(shadowMesh);

    this.statsOverlay = document.createElement('div');
    this.statsOverlay.className = 'model-stats hidden';
    this.statsOverlay.innerHTML = `
      <div class="stats-header" id="stats-header"><span>更多信息</span> <span class="arrow">›</span></div>
      <div class="stats-basic">
        <div class="stats-row">
          <label class="stats-label"><input type="checkbox" checked disabled class="stats-checkbox"/> 图元数量</label>
          <span class="stats-val" id="stats-tri">0</span>
        </div>
        <div class="stats-row">
          <label class="stats-label"><input type="checkbox" checked disabled class="stats-checkbox"/> 顶点数量</label>
          <span class="stats-val" id="stats-vert">0</span>
        </div>
      </div>
      <div class="stats-extra" id="stats-extra">
        <div class="stats-row">
          <label class="stats-label"><input type="checkbox" checked disabled class="stats-checkbox"/> 文件名</label>
          <span class="stats-val stats-filename" id="stats-filename" title="">-</span>
        </div>
        <div class="stats-row">
          <label class="stats-label"><input type="checkbox" checked disabled class="stats-checkbox"/> 网格数量</label>
          <span class="stats-val" id="stats-meshes">0</span>
        </div>
        <div class="stats-row">
          <label class="stats-label"><input type="checkbox" checked disabled class="stats-checkbox"/> 材质数量</label>
          <span class="stats-val" id="stats-materials">0</span>
        </div>
        <div class="stats-row">
          <label class="stats-label"><input type="checkbox" checked disabled class="stats-checkbox"/> 贴图数量</label>
          <span class="stats-val" id="stats-textures">0</span>
        </div>
        <div class="stats-row">
          <label class="stats-label"><input type="checkbox" checked disabled class="stats-checkbox"/> 模型尺寸</label>
          <span class="stats-val" id="stats-size">0 x 0 x 0</span>
        </div>
        <div class="stats-row">
          <label class="stats-label"><input type="checkbox" checked disabled class="stats-checkbox"/> 网格内存占用</label>
          <span class="stats-val" id="stats-mem">0 KB</span>
        </div>
        <div class="stats-row">
          <label class="stats-label"><input type="checkbox" checked disabled class="stats-checkbox"/> 贴图内存占用</label>
          <span class="stats-val n-a" id="stats-tex-mem">n/a</span>
        </div>
      </div>
    `;
    this.container.appendChild(this.statsOverlay);

    this.statsHeader = this.statsOverlay.querySelector('#stats-header') as HTMLElement;
    this.statsExtra = this.statsOverlay.querySelector('#stats-extra') as HTMLElement;
    this.elTri = this.statsOverlay.querySelector('#stats-tri');
    this.elVert = this.statsOverlay.querySelector('#stats-vert');
    this.elFile = this.statsOverlay.querySelector('#stats-filename');
    this.elMeshes = this.statsOverlay.querySelector('#stats-meshes');
    this.elMaterials = this.statsOverlay.querySelector('#stats-materials');
    this.elTextures = this.statsOverlay.querySelector('#stats-textures');
    this.elSize = this.statsOverlay.querySelector('#stats-size');
    this.elMem = this.statsOverlay.querySelector('#stats-mem');

    this.statsHeader.addEventListener('click', () => {
      this.statsHeader.classList.toggle('expanded');
      this.statsExtra.classList.toggle('show');
    });

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.1;
    this.controls.maxDistance = 2000;

    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(container);

    this._raf = null;
    this._animate();
  }

  _animate(): void {
    this._raf = requestAnimationFrame(() => this._animate());
    const dt = this.clock.getDelta();
    if (this.mixer) this.mixer.update(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  _resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  clearMeshes(): void {
    if (this.statsOverlay) this.statsOverlay.classList.add('hidden');
    const keep = new Set(['AmbientLight', 'DirectionalLight', 'GridHelper', 'ShadowPlane']);
    const rem: THREE.Object3D[] = [];
    this.scene.children.forEach((o) => {
      const obj = o as THREE.Object3D & { isCamera?: boolean };
      if (!keep.has(o.name) && o !== this.scene && !obj.isCamera) {
        rem.push(o);
      }
    });
    rem.forEach((o) => {
      this.scene.remove(o);
      o.traverse((child: THREE.Object3D) => {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
        else mesh.material?.dispose();
      });
    });
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    this.actions = {};
    this.current = null;
  }

  updateStats(obj: THREE.Object3D, fileName = ''): void {
    let triangles = 0;
    let vertices = 0;
    let meshesCount = 0;
    let memBytes = 0;
    const matSet = new Set<string>();
    const texSet = new Set<string>();

    obj.traverse((c: THREE.Object3D) => {
      const mesh = c as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry) {
        meshesCount++;
        const geo = mesh.geometry;
        if (geo.attributes.position) {
          vertices += geo.attributes.position.count;
          triangles += geo.index !== null ? geo.index.count / 3 : geo.attributes.position.count / 3;
        }
        if (geo.attributes.position) memBytes += geo.attributes.position.array.byteLength;
        if (geo.attributes.normal) memBytes += geo.attributes.normal.array.byteLength;
        if (geo.attributes.uv) memBytes += geo.attributes.uv.array.byteLength;
        if (geo.index) memBytes += geo.index.array.byteLength;

        const addMatInfo = (m: THREE.Material): void => {
          matSet.add(m.uuid);
          const std = m as THREE.MeshStandardMaterial;
          if (std.map) texSet.add(std.map.uuid);
        };
        if (Array.isArray(mesh.material)) mesh.material.forEach(addMatInfo);
        else if (mesh.material) addMatInfo(mesh.material);
      }
    });

    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const fmt = (val: number): string => val.toFixed(1);

    if (this.elTri) this.elTri.textContent = triangles.toLocaleString();
    if (this.elVert) this.elVert.textContent = vertices.toLocaleString();
    if (this.elFile) {
      const shortName =
        fileName.length > 25
          ? fileName.substring(0, 10) + '...' + fileName.substring(fileName.length - 12)
          : fileName || '-';
      this.elFile.textContent = shortName;
      this.elFile.title = fileName;
    }
    if (this.elMeshes) this.elMeshes.textContent = String(meshesCount);
    if (this.elMaterials) this.elMaterials.textContent = String(matSet.size);
    if (this.elTextures) this.elTextures.textContent = String(texSet.size);
    if (this.elSize) this.elSize.textContent = `${fmt(size.x)} × ${fmt(size.y)} × ${fmt(size.z)}`;
    if (this.elMem) this.elMem.textContent = (memBytes / 1024).toFixed(1) + ' KB';

    if (this.statsOverlay && (triangles > 0 || vertices > 0)) {
      this.statsOverlay.classList.remove('hidden');
    }
  }

  fitToObject(obj: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());

    obj.position.x -= ctr.x;
    obj.position.z -= ctr.z;
    obj.position.y -= box.min.y;

    const maxD = Math.max(size.x, size.y, size.z) || 1;
    const areaSize = maxD * 5;

    const oldGrid = this.scene.children.find((c) => c.name === 'GridHelper');
    if (oldGrid) {
      this.scene.remove(oldGrid);
      const oldGridLines = oldGrid as THREE.LineSegments;
      oldGridLines.geometry?.dispose();
      const mat = oldGridLines.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    }
    const newGrid = new THREE.GridHelper(areaSize, 40, 0x333355, 0x222233);
    newGrid.name = 'GridHelper';
    this.scene.add(newGrid);

    this.scene.children.forEach((c) => {
      if (c.name === 'ShadowPlane') {
        c.scale.set(areaSize / 50, areaSize / 50, 1);
      }
      if (c.name === 'DirectionalLight' && (c as THREE.DirectionalLight).castShadow) {
        const dir = c as THREE.DirectionalLight;
        dir.position.set(maxD * 0.5, maxD * 1.5, maxD);
        dir.shadow.camera.left = -maxD;
        dir.shadow.camera.right = maxD;
        dir.shadow.camera.top = maxD;
        dir.shadow.camera.bottom = -maxD;
        dir.shadow.camera.near = 0.1;
        dir.shadow.camera.far = maxD * 5;
        dir.shadow.camera.updateProjectionMatrix();
      }
    });

    const fov = this.camera.fov * (Math.PI / 180);
    const dist = Math.abs(maxD / Math.sin(fov / 2)) * 0.8;
    this.camera.position.set(dist * 0.7, dist * 0.6, dist);
    this.camera.far = Math.max(5000, dist * 10);
    this.camera.updateProjectionMatrix();

    const targetY = size.y * 0.5;
    this.camera.lookAt(0, targetY, 0);
    this.controls.target.set(0, targetY, 0);
    this.controls.maxDistance = dist * 10;
    this.controls.update();
  }

  loadStatic(getUrl: UrlResolver, files: string[]): void {
    this.clearMeshes();
    const fbxName = files.find((f) => /\.fbx$/i.test(f));
    if (!fbxName) {
      showToast('zip 中未找到 FBX 文件', '');
      return;
    }

    const texPair = buildTexturePair(getUrl, files);

    const loader = new FBXLoader();
    loader.load(
      getUrl(fbxName),
      (fbx) => {
        fbx.traverse((c: THREE.Object3D) => {
          const mesh = c as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = mesh.receiveShadow = true;
          mesh.material = pickMaterial(mesh.name, texPair);
        });
        this.scene.add(fbx);
        this.fitToObject(fbx);
        this.updateStats(fbx, fbxName);
        this._resize();
      },
      undefined,
      (err) => {
        const e = err as { message?: string };
        showToast(`FBX 加载失败: ${e?.message || err}`, 'error');
      }
    );
  }

  loadAnimation(getUrl: UrlResolver, files: string[], onAnimationsReady?: (keys: string[]) => void): void {
    this.clearMeshes();
    const fbxFiles = files.filter((f) => /\.fbx$/i.test(f));
    if (!fbxFiles.length) {
      showToast('zip 中未找到 FBX 文件', '');
      return;
    }

    const texPair = buildTexturePair(getUrl, files);
    const rigFile = fbxFiles.find((f) => /_rig\b/i.test(f));
    const nonRigFiles = fbxFiles.filter((f) => f !== rigFile);
    const rigPath = rigFile ? getUrl(rigFile) : getUrl(nonRigFiles[0]);
    const animOnlyFiles = rigFile ? nonRigFiles : nonRigFiles.slice(1);

    const loader = new FBXLoader();
    loader.load(
      rigPath,
      (rig) => {
        rig.traverse((c: THREE.Object3D) => {
          const mesh = c as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = mesh.receiveShadow = true;
            mesh.material = pickMaterial(mesh.name, texPair);
          }
        });
        this.scene.add(rig);
        this.fitToObject(rig);
        this.updateStats(rig, rigFile || nonRigFiles[0]);
        this.mixer = new THREE.AnimationMixer(rig);
        this._resize();

        const inlineClips = rig.animations || [];
        inlineClips.forEach((clip, i) => {
          const key = basename(rigFile || fbxFiles[0], '.fbx') + (inlineClips.length > 1 ? `_${i}` : '');
          if (this.mixer) this.actions[key] = this.mixer.clipAction(clip);
        });

        if (animOnlyFiles.length === 0) {
          const keys = Object.keys(this.actions);
          if (keys.length) this.playAction(keys[0]);
          if (onAnimationsReady) onAnimationsReady(keys);
          return;
        }

        const loads = animOnlyFiles.map(
          (af) =>
            new Promise<void>((res) => {
              const al = new FBXLoader();
              al.load(
                getUrl(af),
                (animFbx) => {
                  const clips = animFbx.animations || [];
                  clips.forEach((clip, i) => {
                    const fileKey = basename(af, '.fbx');
                    const key = clips.length > 1 ? `${fileKey}_${i}` : fileKey;
                    if (this.mixer) this.actions[key] = this.mixer.clipAction(clip);
                  });
                  res();
                },
                undefined,
                () => res()
              );
            })
        );

        Promise.all(loads).then(() => {
          const keys = Object.keys(this.actions);
          if (keys.length === 0) {
            showToast('未找到动画数据，仅显示静态模型', '');
          } else {
            this.playAction(keys[0]);
          }
          if (onAnimationsReady) onAnimationsReady(keys);
        });
      },
      undefined,
      (err) => {
        const e = err as { message?: string };
        showToast(`骨骼 FBX 加载失败: ${e?.message || err}`, 'error');
      }
    );
  }

  playAction(name: string): void {
    if (this.current === name) return;
    if (this.current && this.actions[this.current]) this.actions[this.current].fadeOut(0.2);
    const a = this.actions[name];
    if (a) {
      a.reset().fadeIn(0.2).play();
      this.current = name;
    }
  }

  destroy(): void {
    cancelAnimationFrame(this._raf!);
    this._ro.disconnect();
    this.clearMeshes();
    this.renderer.dispose();
    this.container.innerHTML = '';
  }
}

// ==================== 主视图 3D 查看器单例 ====================

let _viewer: Viewer3D | null = null;

export function getViewer(): Viewer3D {
  const wrap = EL.canvasWrap();
  if (!_viewer) {
    _viewer = new Viewer3D(wrap);
  }
  return _viewer;
}

export function load3DModel(getUrl: UrlResolver, files: string[], label: string, isAnim: boolean): void {
  setViewerPanel('viewer3d');
  EL.viewerName().textContent = label;
  EL.animList().classList.add('hidden');
  EL.animBtns().innerHTML = '';

  const viewer = getViewer();

  if (isAnim) {
    viewer.loadAnimation(getUrl, files, (animKeys) => {
      if (!animKeys.length) return;
      EL.animList().classList.remove('hidden');
      EL.animBtns().innerHTML = '';
      const commonPrefix =
        animKeys.length > 1
          ? animKeys.reduce((pre, k) => {
              while (k.indexOf(pre) !== 0) pre = pre.slice(0, -1);
              return pre;
            })
          : '';
      const lastSep = commonPrefix.lastIndexOf('_');
      const stripLen = lastSep > 0 ? lastSep + 1 : 0;

      animKeys.forEach((k, i) => {
        const btnLabel = k.slice(stripLen) || k;
        const b = document.createElement('button');
        b.className = `anim-btn${i === 0 ? ' active' : ''}`;
        b.textContent = btnLabel;
        b.title = k;
        b.onclick = () => {
          document.querySelectorAll('.anim-btn').forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
          viewer.playAction(k);
        };
        EL.animBtns().appendChild(b);
      });
    });
  } else {
    viewer.loadStatic(getUrl, files);
  }
}
