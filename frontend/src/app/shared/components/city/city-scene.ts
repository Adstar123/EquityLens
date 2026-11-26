// The ASX 300 as a city: every sector is a district, every company a tower
// whose height is its score and whose colour is its band. Kept free of
// Angular so three.js lives in its own lazily loaded chunk.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export interface CityTower {
  index: number;
  score: number;
  colour: string;
}

export interface CityDistrict {
  towers: CityTower[];
}

export interface CityPalette {
  background: string;
  plinth: string;
  highlight: string;
}

interface Placed {
  x: number;
  z: number;
  h: number;
  district: number;
  delay: number;
}

const PITCH = 0.5; // radians above the horizon
const YAW = -0.24; // a gentle three-quarter view
const SPACING = 1;
const FOOTPRINT = 0.76;
const DISTRICT_GAP = 1.6; // between districts along a street
const STREET_GAP = 2.8; // between streets, leaving room for the labels
const HEIGHT = 4.8; // a perfect score

const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export class CityScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.1, 400);
  private mesh: THREE.InstancedMesh | null = null;
  private plinths = new THREE.Group();
  private ground: THREE.Mesh;
  private light: THREE.DirectionalLight;
  private raycaster = new THREE.Raycaster();
  private dummy = new THREE.Object3D();
  private colour = new THREE.Color();

  private districts: CityDistrict[] = [];
  private towers: CityTower[] = [];
  private placed: Placed[] = [];
  private byIndex = new Map<number, number>(); // tower index -> instance id
  private districtCentres: THREE.Vector3[] = [];
  private districtFront: number[] = []; // z of each district's front edge
  private lastStreet = new Set<number>(); // districts on the front street
  private bounds = new THREE.Box3();
  private baseColours: THREE.Color[] = [];
  private highlightColour = new THREE.Color('#ffffff');

  private width = 1;
  private height = 1;
  private distance = 40;
  private target = new THREE.Vector3();
  private yaw = YAW;
  private pitch = PITCH;
  private aimYaw = YAW;
  private aimPitch = PITCH;

  private introStart = -1;
  private introDuration = 1500;
  private lift = new Map<number, number>(); // instance id -> current lift 0..1
  private hot = -1; // instance id
  private hotDistrict = -1;
  private dim = 0; // 0 = whole city lit, 1 = only the hot district lit
  private fogColour = new THREE.Color('#10151c');
  private frame = 0;
  private running = false;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private canvas: HTMLCanvasElement, private onFrame: () => void) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    // Soft studio reflections give the brass and steel something to catch
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();

    this.scene.add(new THREE.HemisphereLight('#cfdcea', '#0b0f14', 0.35));
    this.light = new THREE.DirectionalLight('#ffeccc', 3.2);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048, 2048);
    this.light.shadow.radius = 4;
    this.light.shadow.bias = -0.0004;
    this.light.shadow.normalBias = 0.02;
    this.scene.add(this.light, this.light.target);

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.ShadowMaterial({ opacity: 0.45 }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground, this.plinths);
  }

  // ── Data ──

  setData(districts: CityDistrict[], streets: number, intro: boolean): void {
    this.districts = districts;
    this.layout(streets);
    this.build();
    if (intro && !this.reducedMotion) this.introStart = performance.now();
    this.fit();
    this.invalidate();
  }

  setPalette(p: CityPalette): void {
    this.scene.fog = new THREE.Fog(p.background, this.distance * 0.9, this.distance * 1.9);
    this.fogColour.set(p.background);
    this.highlightColour.set(p.highlight);
    for (const child of this.plinths.children) {
      ((child as THREE.Mesh).material as THREE.MeshStandardMaterial).color.set(p.plinth);
    }
    this.plinthColour = p.plinth;
    this.recolour();
    this.invalidate();
  }

  private plinthColour = '#151c26';

  /** Place districts with a shelf packer, strongest first, and companies in
   * each district on a spiral so the tallest towers stand in the middle */
  private layout(streets: number): void {
    this.placed = [];
    this.districtCentres = [];
    this.districtFront = [];
    this.lastStreet.clear();
    const sizes = this.districts.map(d => {
      const n = d.towers.length;
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      return { cols, rows, w: cols * SPACING, d: rows * SPACING };
    });

    // Shelf packing into roughly equal streets
    const total = sizes.reduce((acc, sz) => acc + sz.w, 0) + DISTRICT_GAP * (sizes.length - 1);
    const maxRowWidth = (total / Math.max(1, streets)) * 1.12;
    const shelves: { items: number[]; w: number; d: number }[] = [];
    let shelf = { items: [] as number[], w: 0, d: 0 };
    sizes.forEach((s, i) => {
      const add = (shelf.items.length ? DISTRICT_GAP : 0) + s.w;
      if (shelf.items.length && shelf.w + add > maxRowWidth) {
        shelves.push(shelf);
        shelf = { items: [], w: 0, d: 0 };
      }
      shelf.w += (shelf.items.length ? DISTRICT_GAP : 0) + s.w;
      shelf.d = Math.max(shelf.d, s.d);
      shelf.items.push(i);
    });
    if (shelf.items.length) shelves.push(shelf);

    const totalDepth = shelves.reduce((acc, s) => acc + s.d, 0) + STREET_GAP * (shelves.length - 1);
    let z = -totalDepth / 2;
    shelves[shelves.length - 1]?.items.forEach(i => this.lastStreet.add(i));
    for (const s of shelves) {
      let x = -s.w / 2;
      for (const di of s.items) {
        const size = sizes[di];
        // Centre each district within the shelf depth, front aligned
        const z0 = z + (s.d - size.d);
        const cx = x + size.w / 2;
        const cz = z0 + size.d / 2;
        this.districtCentres[di] = new THREE.Vector3(cx, 0, cz);
        this.districtFront[di] = z0 + size.d;

        // Grid cells ordered by distance from the district centre
        const cells: { gx: number; gz: number; dist: number }[] = [];
        for (let r = 0; r < size.rows; r++) {
          for (let c = 0; c < size.cols; c++) {
            const gx = x + (c + 0.5) * SPACING;
            const gz = z0 + (r + 0.5) * SPACING;
            cells.push({ gx, gz, dist: Math.hypot(gx - cx, (gz - cz) * 1.05) });
          }
        }
        cells.sort((a, b) => a.dist - b.dist);
        const maxDist = cells[Math.min(cells.length, this.districts[di].towers.length) - 1]?.dist || 1;

        this.districts[di].towers.forEach((t, k) => {
          const cell = cells[k];
          this.placed.push({
            x: cell.gx,
            z: cell.gz,
            h: 0.14 + Math.pow(Math.max(0, t.score) / 100, 1.5) * HEIGHT,
            district: di,
            // Each district rises from its centre outwards, districts in turn
            delay: di * 70 + (cell.dist / maxDist) * 420,
          });
        });
        x += size.w + DISTRICT_GAP;
      }
      z += s.d + STREET_GAP;
    }

    this.bounds.makeEmpty();
    for (const p of this.placed) {
      this.bounds.expandByPoint(new THREE.Vector3(p.x - 0.5, 0, p.z - 0.5));
      this.bounds.expandByPoint(new THREE.Vector3(p.x + 0.5, p.h, p.z + 0.5));
    }
    this.bounds.getCenter(this.target);
    this.target.y = 0.6;
  }

  private build(): void {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.mesh.dispose();
    }
    for (const child of [...this.plinths.children]) {
      const m = child as THREE.Mesh;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      this.plinths.remove(m);
    }

    const towers = this.districts.flatMap(d => d.towers);
    this.towers = towers;
    const geometry = new RoundedBoxGeometry(FOOTPRINT, 1, FOOTPRINT, 3, 0.07);
    geometry.translate(0, 0.5, 0);
    const material = new THREE.MeshStandardMaterial({ metalness: 0.35, roughness: 0.4 });
    this.mesh = new THREE.InstancedMesh(geometry, material, towers.length);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    this.byIndex.clear();
    this.baseColours = towers.map((t, id) => {
      this.byIndex.set(t.index, id);
      return new THREE.Color(t.colour);
    });
    this.lift.clear();
    this.recolour();
    this.writeMatrices(performance.now());
    this.scene.add(this.mesh);

    // A low plinth under each district so the blocks read as places
    this.districts.forEach((_, di) => {
      const own = this.placed.filter(p => p.district === di);
      const minX = Math.min(...own.map(p => p.x)) - 0.62;
      const maxX = Math.max(...own.map(p => p.x)) + 0.62;
      const minZ = Math.min(...own.map(p => p.z)) - 0.62;
      const maxZ = Math.max(...own.map(p => p.z)) + 0.62;
      const plinth = new THREE.Mesh(
        new RoundedBoxGeometry(maxX - minX, 0.08, maxZ - minZ, 2, 0.04),
        new THREE.MeshStandardMaterial({ color: this.plinthColour, metalness: 0.1, roughness: 0.85 }),
      );
      plinth.position.set((minX + maxX) / 2, 0.04, (minZ + maxZ) / 2);
      plinth.receiveShadow = true;
      this.plinths.add(plinth);
    });

    // Key light sized to the city so shadows stay crisp
    const size = this.bounds.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z) * 0.75;
    const cam = this.light.shadow.camera;
    cam.left = -span; cam.right = span; cam.top = span; cam.bottom = -span;
    cam.near = 1; cam.far = 120;
    cam.updateProjectionMatrix();
    this.light.position.set(this.target.x - 22, 26, this.target.z + 10);
    this.light.target.position.copy(this.target);
  }

  private recolour(): void {
    if (!this.mesh) return;
    this.baseColours.forEach((c, id) => {
      this.colour.copy(c);
      const l = this.lift.get(id) ?? 0;
      if (l > 0) this.colour.lerp(this.highlightColour, 0.28 * l);
      if (this.dim > 0 && this.placed[id]?.district !== this.hotDistrict) {
        this.colour.lerp(this.fogColour, 0.72 * this.dim);
      }
      this.mesh!.setColorAt(id, this.colour);
    });
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Returns true while anything is still moving */
  private writeMatrices(now: number): boolean {
    if (!this.mesh) return false;
    let moving = false;
    const intro = this.introStart >= 0;
    this.placed.forEach((p, id) => {
      let grow = 1;
      if (intro) {
        grow = ease((now - this.introStart - p.delay) / 900);
        if (grow < 1) moving = true;
      }
      const target = id === this.hot ? 1 : 0;
      let l = this.lift.get(id) ?? 0;
      if (Math.abs(target - l) > 0.001) {
        l += (target - l) * 0.25;
        if (Math.abs(target - l) <= 0.01) l = target;
        this.lift.set(id, l);
        moving = true;
      }
      this.dummy.position.set(p.x, 0.08 + l * 0.35, p.z);
      this.dummy.scale.set(1, Math.max(0.001, p.h * grow), 1);
      this.dummy.updateMatrix();
      this.mesh!.setMatrixAt(id, this.dummy.matrix);
    });
    if (intro && !moving) this.introStart = -1;
    this.mesh.instanceMatrix.needsUpdate = true;

    const dimTarget = this.hot >= 0 ? 1 : 0;
    let recolour = moving;
    if (Math.abs(dimTarget - this.dim) > 0.001) {
      this.dim += (dimTarget - this.dim) * 0.18;
      if (Math.abs(dimTarget - this.dim) <= 0.01) this.dim = dimTarget;
      moving = true;
      recolour = true;
    }
    if (recolour) this.recolour();
    return moving;
  }

  // ── Camera ──

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.fit();
    this.invalidate();
  }

  /** Frame the towers themselves: pull the camera back until they fill the
   * stage, then pan the frustum so the city sits dead centre */
  private fit(): void {
    if (!this.placed.length) return;
    this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    const points: THREE.Vector3[] = [];
    const r = FOOTPRINT / 2;
    for (const p of this.placed) {
      points.push(
        new THREE.Vector3(p.x - r, 0, p.z + r), new THREE.Vector3(p.x + r, 0, p.z + r),
        new THREE.Vector3(p.x - r, p.h, p.z - r), new THREE.Vector3(p.x + r, p.h, p.z - r),
      );
    }
    // Keep room for the labels under the front street
    this.lastStreet.forEach(i => {
      const c = this.districtCentres[i];
      if (c) points.push(new THREE.Vector3(c.x, 0, this.districtFront[i] + 1.9));
    });
    const extent = () => {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      const v = new THREE.Vector3();
      for (const pt of points) {
        v.copy(pt).project(this.camera);
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      }
      return { minX, maxX, minY, maxY };
    };

    let dist = 40;
    let e = extent();
    for (let i = 0; i < 6; i++) {
      this.distance = dist;
      this.placeCamera(YAW, PITCH);
      e = extent();
      // Leave a little air at the sides and room under the front labels
      dist *= Math.max((e.maxX - e.minX) / 2 / 0.9, (e.maxY - e.minY) / 2 / 0.8);
    }
    this.distance = dist;
    this.placeCamera(YAW, PITCH);
    e = extent();
    const cx = (e.minX + e.maxX) / 2;
    const cy = (e.minY + e.maxY) / 2 - 0.04;
    this.camera.setViewOffset(
      this.width, this.height,
      cx * this.width / 2, -cy * this.height / 2,
      this.width, this.height,
    );
    this.camera.updateProjectionMatrix();
    this.placeCamera(this.yaw, this.pitch);

    const fog = this.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.near = dist * 0.85;
      fog.far = dist * 1.8;
    }
  }

  private placeCamera(yaw: number, pitch: number): void {
    const t = this.target;
    this.camera.position.set(
      t.x + this.distance * Math.cos(pitch) * Math.sin(yaw),
      t.y + this.distance * Math.sin(pitch),
      t.z + this.distance * Math.cos(pitch) * Math.cos(yaw),
    );
    this.camera.lookAt(t);
    this.camera.updateMatrixWorld();
  }

  /** Pointer in normalised device coordinates; the camera leans toward it */
  lean(nx: number, ny: number): void {
    if (this.reducedMotion) return;
    this.aimYaw = YAW + nx * 0.07;
    this.aimPitch = PITCH + ny * 0.035;
    this.invalidate();
  }

  settle(): void {
    this.aimYaw = YAW;
    this.aimPitch = PITCH;
    this.invalidate();
  }

  // ── Picking and projection ──

  pick(nx: number, ny: number): number {
    if (!this.mesh) return -1;
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const hit = this.raycaster.intersectObject(this.mesh, false)[0];
    if (hit?.instanceId === undefined) return -1;
    return this.towers[hit.instanceId]?.index ?? -1;
  }

  setHot(index: number): void {
    const id = index >= 0 ? this.byIndex.get(index) ?? -1 : -1;
    if (id === this.hot) return;
    this.hot = id;
    if (id >= 0) this.hotDistrict = this.placed[id]?.district ?? -1;
    this.invalidate();
  }

  /** Screen position (css px) of the top of a tower */
  projectTower(index: number): { x: number; y: number } | null {
    const id = this.byIndex.get(index);
    if (id === undefined) return null;
    const p = this.placed[id];
    const lifted = (this.lift.get(id) ?? 0) * 0.35;
    return this.toScreen(new THREE.Vector3(p.x, p.h + 0.08 + lifted, p.z));
  }

  /** Where a district's label goes, in css px. Front street labels sit on
   * the open floor below their block; the rest float above their towers,
   * where there's sky behind them rather than another district. */
  projectDistrict(i: number): { x: number; y: number; below: boolean } | null {
    const c = this.districtCentres[i];
    if (!c) return null;
    if (this.lastStreet.has(i)) {
      const p = this.toScreen(new THREE.Vector3(c.x, 0, this.districtFront[i] + 0.7));
      return { ...p, below: true };
    }
    const top = Math.max(...this.placed.filter(p => p.district === i).map(p => p.h));
    return { ...this.toScreen(new THREE.Vector3(c.x, top + 0.5, c.z)), below: false };
  }

  private toScreen(v: THREE.Vector3) {
    v.project(this.camera);
    return { x: (v.x + 1) / 2 * this.width, y: (1 - v.y) / 2 * this.height };
  }

  // ── Loop ──

  /** Render on demand: the loop runs only while something is moving */
  invalidate(): void {
    if (this.running) return;
    this.running = true;
    this.frame = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    let moving = this.writeMatrices(now);

    const dy = this.aimYaw - this.yaw;
    const dp = this.aimPitch - this.pitch;
    if (Math.abs(dy) > 0.0005 || Math.abs(dp) > 0.0005) {
      this.yaw += dy * 0.08;
      this.pitch += dp * 0.08;
      moving = true;
    }
    this.placeCamera(this.yaw, this.pitch);
    this.renderer.render(this.scene, this.camera);
    this.onFrame();

    if (moving) {
      this.frame = requestAnimationFrame(this.tick);
    } else {
      this.running = false;
    }
  };

  get introRunning(): boolean {
    return this.introStart >= 0;
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.mesh?.geometry.dispose();
    (this.mesh?.material as THREE.Material | undefined)?.dispose();
    this.plinths.children.forEach(c => {
      (c as THREE.Mesh).geometry.dispose();
      ((c as THREE.Mesh).material as THREE.Material).dispose();
    });
    this.ground.geometry.dispose();
    (this.ground.material as THREE.Material).dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }
}
