// haz.js — a ház felépítése az alaprajz-JSON-ból (alaprajz.json). Minden test kódból készül:
// nincs kép-, textúra- vagy 3D-modellfájl. A JSON formátuma: docs/alaprajz-3d.md
//
// A fő ötlet (Samnang Aing, flat-to-3d és casa-serra, MIT): az alaprajz nem kép, hanem maga a 3D modell,
// egy vízszintes "vágósík" alatt. Kezdetben a vágás a padló fölött van, ezért felülről lapos rajz; a vágás
// emelésével nőnek ki a falak. Ezért minden test egy "darab" (piece) saját y0..y1 magassággal, és a
// látható magassága: clamp(vágás − y0, 0, y1 − y0).
import * as THREE from 'three';

const EPS = 1e-4;
export const TINTA = new THREE.Color('#26231f');
export const PAPIR = new THREE.Color('#f3eee3');

// Az anyag-söprés helye: ami a söprés-vonal mögött van, már valódi színű, ami előtte, még papír/tinta.
export const soprés = { value: -1e4 };
export const SOPRES_IRANY = new THREE.Vector2(0.8, -0.6); // délnyugatról északkelet felé

const anyagok = [];      // minden házanyag (a metszet vágósíkja ezekre kerül)
const vonalAnyag = new THREE.LineBasicMaterial({ color: TINTA, transparent: true, opacity: 0.85 });
const rajzVonalAnyag = new THREE.LineBasicMaterial({ color: TINTA, transparent: true, opacity: 1 }); // csak alaprajzon
anyagok.push(vonalAnyag);

function rajzAnyag(valodi, terv, extra = {}) {
  const m = new THREE.MeshStandardMaterial({ color: valodi, roughness: 0.85, metalness: 0, ...extra });
  const tervSzin = new THREE.Color(terv);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSopres = soprés;
    sh.uniforms.uTerv = { value: tervSzin };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vVilag;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvVilag = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vVilag;\nuniform float uSopres;\nuniform vec3 uTerv;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float sw = smoothstep(uSopres - 0.9, uSopres + 0.9, dot(vVilag.xz, vec2(${SOPRES_IRANY.x}, ${SOPRES_IRANY.y})));
        diffuseColor.rgb = mix(diffuseColor.rgb, uTerv, sw);`);
  };
  anyagok.push(m);
  return m;
}

const anyagTar = new Map();
function anyag(valodi, terv = PAPIR) {
  const k = valodi + '|' + (terv.getHexString ? terv.getHexString() : terv);
  if (!anyagTar.has(k)) anyagTar.set(k, rajzAnyag(valodi, terv));
  return anyagTar.get(k);
}

// Egységnyi alakzatok (1×1×1, a talpuk y=0-n): minden darab ezek méretezett példánya.
const ALAK = {
  doboz: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  henger: new THREE.CylinderGeometry(0.5, 0.5, 1, 20).translate(0, 0.5, 0),
  gomb: new THREE.SphereGeometry(0.5, 20, 14).translate(0, 0.5, 0),
};
const ELEK = {
  doboz: new THREE.EdgesGeometry(ALAK.doboz),
  henger: new THREE.EdgesGeometry(ALAK.henger, 30),
};

// ---------- procedurális padló-textúrák (vászonra rajzolva, fájl nélkül) ----------
function padloTextura(fajta) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const r = (a, b) => a + Math.random() * (b - a);
  if (fajta === 'fa') {
    for (let i = 0; i < 8; i++) {            // 8 deszkasor, eltolt illesztéssel
      let x = -r(0, 200);
      while (x < 256) {
        const l = r(110, 200), l2 = r(-8, 8);
        g.fillStyle = `hsl(${30 + l2 * 0.5}, ${38 + r(-4, 4)}%, ${58 + r(-6, 6)}%)`;
        g.fillRect(x, i * 32, l, 32);
        g.strokeStyle = 'rgba(70,45,25,0.35)'; g.lineWidth = 1.2; g.strokeRect(x, i * 32, l, 32);
        for (let k = 0; k < 5; k++) { g.strokeStyle = 'rgba(90,60,35,0.10)'; g.beginPath(); const y = i * 32 + r(3, 29); g.moveTo(x, y); g.lineTo(x + l, y + r(-2, 2)); g.stroke(); }
        x += l;
      }
    }
  } else if (fajta === 'csempe') {
    g.fillStyle = '#dcd8d0'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = `hsl(40, 8%, ${84 + r(-3, 3)}%)`; g.fillRect(i * 64 + 1.5, j * 64 + 1.5, 61, 61); }
  } else {
    g.fillStyle = '#bdb8af'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '60,55,50'},0.06)`; g.fillRect(r(0, 256), r(0, 256), r(1, 3), r(1, 3)); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
const PADLO_MERET = { fa: 1.6, csempe: 1.2, beton: 3 }; // egy textúra-ismétlés mérete méterben

// ---------- bútorok: helyi alaprajzi koordináták (x jobbra, y előre=észak; a "front" dél felé néz) ----------
// Egy elem: [alak, x, y, szélesség, mélység, y0, y1, szín]
const B = (alak, x, y, w, d, y0, y1, szin) => ({ alak, x, y, w, d, y0, y1, szin });
const BUTOR = {
  szonyeg: (w = 2, h = 1.4) => [B('doboz', 0, 0, w, h, 0, 0.015, '#cdbb9f')],
  kanape: (w = 2.2) => [
    B('doboz', 0, -0.05, w - 0.36, 0.8, 0.08, 0.44, '#7f8b8c'),
    B('doboz', 0, 0.36, w, 0.22, 0.08, 0.84, '#76817f'),
    B('doboz', -w / 2 + 0.09, -0.03, 0.18, 0.88, 0.08, 0.62, '#76817f'),
    B('doboz', w / 2 - 0.09, -0.03, 0.18, 0.88, 0.08, 0.62, '#76817f'),
    B('doboz', 0, 0, w, 0.9, 0, 0.08, '#3d3a36'),
  ],
  fotel: () => [
    B('doboz', 0, -0.05, 0.6, 0.65, 0.1, 0.44, '#b3764f'), B('doboz', 0, 0.32, 0.85, 0.18, 0.1, 0.86, '#a96d48'),
    B('doboz', -0.34, 0, 0.17, 0.82, 0.1, 0.6, '#a96d48'), B('doboz', 0.34, 0, 0.17, 0.82, 0.1, 0.6, '#a96d48'),
    B('doboz', 0, 0, 0.85, 0.82, 0, 0.1, '#3d3a36'),
  ],
  dohanyzoasztal: () => [B('doboz', 0, 0, 1.1, 0.6, 0.34, 0.4, '#8a6747'), B('doboz', 0, 0, 0.9, 0.4, 0, 0.34, '#5d4632')],
  etkezo: (w = 1.8, h = 0.9) => {
    const r = [B('doboz', 0, 0, w, h, 0.72, 0.76, '#9a7552')];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) r.push(B('doboz', sx * (w / 2 - 0.08), sy * (h / 2 - 0.08), 0.06, 0.06, 0, 0.72, '#4b3a2b'));
    for (const sx of [-0.25, 0.25]) for (const sy of [-1, 1]) {
      const cx = sx * w, cy = sy * (h / 2 + 0.28);
      r.push(B('doboz', cx, cy, 0.44, 0.44, 0.42, 0.46, '#d8cfc0'));
      r.push(B('doboz', cx, cy + sy * 0.2, 0.44, 0.05, 0.46, 0.9, '#d8cfc0'));
      r.push(B('doboz', cx, cy, 0.36, 0.36, 0, 0.42, '#4b3a2b'));
    }
    return r;
  },
  konyhapult: (w = 0.6, h = 3) => [
    B('doboz', 0, 0, w, h, 0.1, 0.86, '#e9e5dd'), B('doboz', 0, 0, w + 0.02, h, 0.86, 0.9, '#3b3a38'),
    B('doboz', 0.02, 0, w - 0.04, h, 0, 0.1, '#2f2d2b'),
    B('doboz', 0.1, 0, 0.35, h, 1.5, 2.2, '#e9e5dd'),
  ],
  sziget: (w = 1.6, h = 0.8) => [B('doboz', 0, 0, w, h, 0, 0.88, '#5d6e66'), B('doboz', 0, 0, w + 0.06, h + 0.06, 0.88, 0.92, '#e4e1da')],
  noveny: () => [B('henger', 0, 0, 0.38, 0.38, 0, 0.42, '#c26c4b'), B('gomb', 0, 0, 0.75, 0.75, 0.38, 1.25, '#5e7c4f')],
  agy: (w = 1.8, h = 2.1) => [
    B('doboz', 0, 0, w, h, 0, 0.3, '#8a6747'), B('doboz', 0, -0.03, w - 0.08, h - 0.1, 0.3, 0.52, '#f1eee8'),
    B('doboz', 0, h / 2 - 0.04, w + 0.06, 0.08, 0, 1.05, '#6f5440'),
    B('doboz', -w / 4, h / 2 - 0.32, w / 2 - 0.16, 0.36, 0.52, 0.64, '#faf8f4'), B('doboz', w / 4, h / 2 - 0.32, w / 2 - 0.16, 0.36, 0.52, 0.64, '#faf8f4'),
    B('doboz', 0, -h / 2 + h * 0.3, w - 0.02, h * 0.62, 0.52, 0.57, '#8fa3b5'),
  ],
  ejjeli: () => [B('doboz', 0, 0, 0.45, 0.4, 0, 0.5, '#8a6747'), B('henger', 0, 0, 0.16, 0.16, 0.5, 0.82, '#e8dcc4')],
  szekreny: (w = 0.6, h = 1.6) => [B('doboz', 0, 0, w, h, 0, 2.2, '#dcd5c8')],
  iroasztal: (w = 1.6, h = 0.7) => [
    B('doboz', 0, 0, w, h, 0.72, 0.75, '#c9b08f'), B('doboz', -w / 2 + 0.03, 0, 0.04, h, 0, 0.72, '#3d3a36'), B('doboz', w / 2 - 0.03, 0, 0.04, h, 0, 0.72, '#3d3a36'),
    B('doboz', 0.2, 0.15, 0.55, 0.06, 0.75, 1.1, '#2a2a2c'),
  ],
  szek: () => [B('doboz', 0, 0, 0.48, 0.48, 0.44, 0.5, '#34383c'), B('doboz', 0, 0.22, 0.46, 0.05, 0.5, 0.95, '#34383c'), B('henger', 0, 0, 0.08, 0.08, 0, 0.44, '#555')],
  polc: (w = 2.4, h = 0.36) => {
    const r = [B('doboz', 0, 0, w, h, 0, 0.04, '#c9b49a')];
    for (let i = 1; i <= 5; i++) r.push(B('doboz', 0, 0, w, h, i * 0.4 - 0.03, i * 0.4, '#c9b49a'));
    for (const sx of [-1, 0, 1]) r.push(B('doboz', sx * (w / 2 - 0.02), 0, 0.04, h, 0, 2.0, '#bfa98e'));
    for (let i = 0; i < 12; i++) r.push(B('doboz', -w / 2 + 0.15 + i * (w - 0.3) / 12, 0, 0.06 + (i % 3) * 0.02, h - 0.08, (1 + i % 4) * 0.4, (1 + i % 4) * 0.4 + 0.24 + (i % 2) * 0.05, ['#8b4a3c', '#4d6178', '#c9a24a', '#5e7a5a'][i % 4]));
    return r;
  },
  kad: (w = 1.7, h = 0.75) => [B('doboz', 0, 0, w, h, 0, 0.56, '#f4f3f0'), B('doboz', 0, 0, w - 0.16, h - 0.16, 0.56, 0.565, '#cfe0e5')],
  mosdo: () => [B('doboz', 0, 0.05, 0.6, 0.42, 0.1, 0.8, '#cbbfae'), B('doboz', 0, 0.03, 0.62, 0.46, 0.8, 0.86, '#f6f5f2'), B('doboz', 0, 0.21, 0.55, 0.03, 1.0, 1.75, '#b9cfd6')],
  wc: () => [B('henger', 0, -0.08, 0.38, 0.5, 0, 0.42, '#f6f5f2'), B('doboz', 0, 0.2, 0.38, 0.16, 0, 0.82, '#f6f5f2')],
  cipos: (w = 1.4, h = 0.36) => [B('doboz', 0, 0, w, h, 0, 0.9, '#dcd5c8')],
};

// ---------- a ház ----------
export function hazEpit(adat) {
  const H = adat.falmagassag ?? 2.8;
  const tK = adat.falvastagsag?.kulso ?? 0.3, tB = adat.falvastagsag?.belso ?? 0.12;
  const szobak = adat.helysegek;
  if (!Array.isArray(szobak) || !szobak.length) throw new Error('Az alaprajzban nincs helyiség (helysegek).');

  // A középpont: a helyiségek befoglaló téglalapja. P(x, y): alaprajz → világ (x kelet, -z észak).
  const minX = Math.min(...szobak.map(r => r.x)), maxX = Math.max(...szobak.map(r => r.x + r.w));
  const minY = Math.min(...szobak.map(r => r.y)), maxY = Math.max(...szobak.map(r => r.y + r.h));
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const P = (x, y, h = 0) => new THREE.Vector3(x - cx, h, cy - y);

  const gyoker = new THREE.Group();
  const reteg = { alap: new THREE.Group(), butor: new THREE.Group(), fal: new THREE.Group(), teto: new THREE.Group() };
  for (const g of Object.values(reteg)) gyoker.add(g);
  const tervRajz = new THREE.Group(); gyoker.add(tervRajz); // csak az alaprajzi jelek (ajtóív, ablakjel, méretvonal)
  const kert = new THREE.Group(); gyoker.add(kert);
  const darabok = [];

  // egy darab: méretezett egységalak + élvonalak; az y-méretét a vágás állítja
  function darab(szulo, alak, anyagok_, pos, w, d, y0, y1, elek = true) {
    const m = new THREE.Mesh(ALAK[alak], anyagok_);
    m.position.set(pos.x, y0, pos.z);
    m.scale.set(w, y1 - y0, d);
    m.userData = { y0, y1 };
    m.castShadow = m.receiveShadow = true;
    if (elek && ELEK[alak]) m.add(new THREE.LineSegments(ELEK[alak], vonalAnyag));
    szulo.add(m); darabok.push(m);
    return m;
  }

  // ---- alap és padlók ----
  const kulsoT = tK / 2;
  {
    const w = maxX - minX + tK, d = maxY - minY + tK;
    const m = new THREE.Mesh(ALAK.doboz, anyag('#cfc8bb'));
    m.position.set(0, -0.35, 0); m.scale.set(w + 0.1, 0.35, d + 0.1); m.receiveShadow = true;
    reteg.alap.add(m);
  }
  for (const r of szobak) {
    const fajta = r.padlo || 'fa';
    const tex = padloTextura(fajta);
    const ism = PADLO_MERET[fajta] ?? 2;
    tex.repeat.set(r.w / ism, r.h / ism);
    const mat = rajzAnyag('#ffffff', PAPIR, { map: tex, roughness: fajta === 'csempe' ? 0.4 : 0.8 });
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    const c = P(r.x + r.w / 2, r.y + r.h / 2, 0.004);
    m.position.copy(c); m.scale.set(r.w, 1, r.h); m.receiveShadow = true;
    reteg.alap.add(m);
  }

  // ---- falak: a helyiség-téglalapok éleiből. Ahol egy helyiség határolja: külső fal; ahol kettő: belső. ----
  const szakaszok = [];
  for (const o of ['h', 'v']) {
    const vonalak = new Map();
    for (const r of szobak) {
      const elek_ = o === 'h' ? [[r.y, r.x, r.x + r.w], [r.y + r.h, r.x, r.x + r.w]] : [[r.x, r.y, r.y + r.h], [r.x + r.w, r.y, r.y + r.h]];
      for (const [l, a, b] of elek_) {
        const k = l.toFixed(3);
        if (!vonalak.has(k)) vonalak.set(k, { l, iv: [] });
        vonalak.get(k).iv.push([a, b]);
      }
    }
    for (const { l, iv } of vonalak.values()) {
      const pontok = [...new Set(iv.flat().map(v => +v.toFixed(3)))].sort((p, q) => p - q);
      let cur = null;
      for (let i = 0; i < pontok.length - 1; i++) {
        const m = (pontok[i] + pontok[i + 1]) / 2;
        const n = iv.filter(([a, b]) => a < m && b > m).length;
        if (!n) { if (cur) { szakaszok.push(cur); cur = null; } continue; }
        const kulso = n === 1;
        if (cur && cur.kulso === kulso) cur.b = pontok[i + 1];
        else { if (cur) szakaszok.push(cur); cur = { o, l, a: pontok[i], b: pontok[i + 1], kulso, t: kulso ? tK : tB, nyilasok: [] }; }
      }
      if (cur) szakaszok.push(cur);
    }
  }
  // a végek: sarokban a vízszintes fal túlnyúlik, a függőleges rövidül; T-csatlakozásnál a csatlakozó fal a másik síkjáig ér
  for (const s of szakaszok) {
    for (const veg of ['a', 'b']) {
      const p = s[veg];
      const meroleges = szakaszok.filter(q => q.o !== s.o && Math.abs(q.l - p) < EPS && q.a <= s.l + EPS && q.b >= s.l - EPS);
      let delta = 0;
      if (meroleges.length) {
        const t = Math.max(...meroleges.map(q => q.t));
        const atmegy = meroleges.some(q => q.a < s.l - EPS) && meroleges.some(q => q.b > s.l + EPS);
        delta = (s.o === 'h' && !atmegy) ? t / 2 : -t / 2;
      }
      s[veg + '2'] = p + (veg === 'a' ? -delta : delta);
    }
  }

  // ---- nyílások a falakon ----
  const ALAP = {
    ajto: { parapet: 0, teteje: 2.1 },
    atjaro: { parapet: 0, teteje: 2.3 },
    ablak: { parapet: 0.9, teteje: 2.2 },
  };
  const hibak = [];
  for (const n0 of adat.nyilasok || []) {
    const n = { ...ALAP[n0.tipus] || ALAP.ablak, ...n0 };
    const s = szakaszok.find(s => s.o === 'h' && Math.abs(s.l - n.y) < 0.05 && n.x > s.a && n.x < s.b)
      || szakaszok.find(s => s.o === 'v' && Math.abs(s.l - n.x) < 0.05 && n.y > s.a && n.y < s.b);
    if (!s) { hibak.push(`A(z) ${n.tipus} (${n.x}; ${n.y}) nem esik falra.`); continue; }
    n.u = s.o === 'h' ? n.x : n.y;
    s.nyilasok.push(n);
  }

  const falSzin = '#efe9df', falTeteje = '#ddd5c8';
  const falAnyag = [anyag(falSzin), anyag(falSzin), anyag(falTeteje, TINTA), anyag(falSzin), anyag(falSzin), anyag(falSzin)];
  const parapetAnyag = anyag(falSzin);
  const uveg = rajzAnyag('#bcd4dc', PAPIR, { transparent: true, opacity: 0.28, roughness: 0.05, depthWrite: false });
  const ajtoAnyag = anyag('#b79a78');

  // egy faldarab a szakasz mentén [p, q] között
  function falDarab(s, p, q, y0, y1, mat, vastag = s.t) {
    if (q - p < 0.005 || y1 - y0 < 0.005) return;
    const pos = s.o === 'h' ? P((p + q) / 2, s.l) : P(s.l, (p + q) / 2);
    const w = s.o === 'h' ? q - p : vastag, d = s.o === 'h' ? vastag : q - p;
    return darab(reteg.fal, 'doboz', mat, pos, w, d, y0, y1);
  }
  const rajzVonal = (pontok) => {
    const g = new THREE.BufferGeometry().setFromPoints(pontok);
    tervRajz.add(new THREE.Line(g, rajzVonalAnyag));
  };
  const JEL_Y = 0.09;

  for (const s of szakaszok) {
    s.nyilasok.sort((a, b) => a.u - b.u);
    let cur = s.a2;
    const pont = (u, off = 0, h = JEL_Y) => s.o === 'h' ? P(u, s.l + off, h) : P(s.l + off, u, h);
    for (const n of s.nyilasok) {
      const p = n.u - n.szel / 2, q = n.u + n.szel / 2;
      falDarab(s, cur, p, 0, H, falAnyag);
      if (n.parapet > 0) falDarab(s, p, q, 0, n.parapet, parapetAnyag);
      falDarab(s, p, q, n.teteje, H, falAnyag);
      if (n.tipus === 'ablak') {
        falDarab(s, p, q, n.parapet, n.teteje, uveg, 0.03);
        for (const off of [-s.t / 2, 0, s.t / 2]) rajzVonal([pont(p, off), pont(q, off)]);
      }
      if (n.tipus === 'ajto') {
        // az ajtólap a nyílás elején (kisebb koordináta) forog; a "nyit" az égtáj, amerre kinyílik
        const irany = { N: 1, E: 1, S: -1, W: -1 }[n.nyit] ?? -1;
        const hossz = n.szel - 0.04, lap = 0.04;
        const kp = s.o === 'h'
          ? P(p + lap / 2 + 0.01, s.l + irany * (s.t / 2 + hossz / 2))
          : P(s.l + irany * (s.t / 2 + hossz / 2), p + lap / 2 + 0.01);
        const w = s.o === 'h' ? lap : hossz, d = s.o === 'h' ? hossz : lap;
        darab(reteg.fal, 'doboz', ajtoAnyag, kp, w, d, 0, 2.05);
        // alaprajzi ív: a csuklóból, sugara az ajtószélesség
        const iv = [];
        for (let i = 0; i <= 24; i++) {
          const f = (i / 24) * Math.PI / 2;
          const along = p + Math.cos(f) * hossz, across = irany * (s.t / 2 + Math.sin(f) * hossz);
          iv.push(pont(along, across));
        }
        rajzVonal(iv);
      }
      cur = q;
    }
    falDarab(s, cur, s.b2, 0, H, falAnyag);
  }

  // ---- bútorok ----
  for (const b of adat.butorok || []) {
    const gyar = BUTOR[b.tipus];
    if (!gyar) { hibak.push(`Ismeretlen bútortípus: ${b.tipus}`); continue; }
    const csop = new THREE.Group();
    csop.position.copy(P(b.x, b.y));
    csop.rotation.y = THREE.MathUtils.degToRad(b.forgas || 0);
    const elemek = (b.w !== undefined || b.h !== undefined) ? gyar(b.w, b.h) : gyar();
    for (const e of elemek) {
      darab(csop, e.alak, anyag(e.szin), new THREE.Vector3(e.x, 0, -e.y), e.w, e.d, e.y0, e.y1, e.alak !== 'gomb');
    }
    reteg.butor.add(csop);
  }

  // ---- terasz ----
  if (adat.terasz) {
    const t = adat.terasz;
    darab(reteg.alap, 'doboz', anyag('#b49c7c'), P(t.x + t.w / 2, t.y + t.h / 2), t.w, t.h, -0.04, 0.02);
    for (let i = 1; i < t.w / 0.15; i++) rajzVonal([P(t.x + i * 0.15, t.y, 0.03), P(t.x + i * 0.15, t.y + t.h, 0.03)]);
  }

  // ---- fák (nem vágódnak: a kerttel együtt nőnek) ----
  for (const [x, y] of adat.fak || []) {
    const fa = new THREE.Group(); fa.position.copy(P(x, y));
    const torzs = new THREE.Mesh(ALAK.henger, anyag('#6b5544')); torzs.scale.set(0.22, 2.2, 0.22);
    const lomb = new THREE.Mesh(ALAK.gomb, anyag('#6f8a5a')); lomb.scale.set(3, 3.2, 3); lomb.position.y = 1.7;
    for (const m of [torzs, lomb]) { m.castShadow = true; fa.add(m); }
    kert.add(fa);
    const kor = [];
    for (let i = 0; i <= 40; i++) { const f = i / 40 * Math.PI * 2; kor.push(P(x + Math.cos(f) * 1.4, y + Math.sin(f) * 1.4, 0.02)); }
    rajzVonal(kor);
  }

  // ---- méretvonalak (alaprajz) ----
  const meretek = [];
  {
    const k = 1.4, tick = 0.18;
    const alja = Math.min(minY, adat.terasz ? adat.terasz.y : minY); // a terasz alá
    const y = alja - kulsoT - k, x = minX - kulsoT - k;
    rajzVonal([P(minX - kulsoT, y), P(maxX + kulsoT, y)]);
    for (const xx of [minX - kulsoT, maxX + kulsoT]) rajzVonal([P(xx - tick, y - tick), P(xx + tick, y + tick)]);
    rajzVonal([P(x, minY - kulsoT), P(x, maxY + kulsoT)]);
    for (const yy of [minY - kulsoT, maxY + kulsoT]) rajzVonal([P(x - tick, yy - tick), P(x + tick, yy + tick)]);
    const fmt = v => v.toFixed(2).replace('.', ',');
    meretek.push({ szoveg: fmt(maxX - minX + tK) + ' m', pos: P(cx, y - 0.45) });
    meretek.push({ szoveg: fmt(maxY - minY + tK) + ' m', pos: P(x - 0.75, cy), fuggoleges: true });
  }

  // ---- tető (lapostető, kicsit túlnyúlik) ----
  {
    const ki = 0.35, w = maxX - minX + tK + 2 * ki, d = maxY - minY + tK + 2 * ki;
    const fodem = new THREE.Mesh(ALAK.doboz, [anyag('#e5e0d7'), anyag('#e5e0d7'), anyag('#9a958c'), anyag('#f5f2ec'), anyag('#e5e0d7'), anyag('#e5e0d7')]);
    fodem.position.set(0, H, 0); fodem.scale.set(w, 0.28, d); fodem.castShadow = fodem.receiveShadow = true;
    fodem.add(new THREE.LineSegments(ELEK.doboz, vonalAnyag));
    reteg.teto.add(fodem);
    const attika = 0.25;
    for (const [px, pz, sw, sd] of [[0, -d / 2 + 0.06, w, 0.12], [0, d / 2 - 0.06, w, 0.12], [-w / 2 + 0.06, 0, 0.12, d], [w / 2 - 0.06, 0, 0.12, d]]) {
      const m = new THREE.Mesh(ALAK.doboz, anyag('#e5e0d7')); m.position.set(px, H + 0.28, pz); m.scale.set(sw, attika, sd); m.castShadow = true;
      reteg.teto.add(m);
    }
  }

  // ---- talaj (papírlap → kert) ----
  // a talaj nem söprődik (a végtelen sík a söprés-tartományon kívül esne): a színét a main.js váltja egyben
  const talaj = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: PAPIR.clone(), roughness: 1 }));
  talaj.position.y = -0.002; talaj.receiveShadow = true;
  gyoker.add(talaj);

  // ---- feliratok és bejárás ----
  const cimkek = szobak.map(r => ({ nev: r.nev, terulet: (r.w * r.h).toFixed(1).replace('.', ',') + ' m²', pos: P(r.x + r.w / 2, r.y + r.h / 2, 0.1) }));
  const SZEM = 1.6;
  const bejaras = (adat.bejaras || []).map(m => ({ pos: P(m.x, m.y, SZEM), nez: P(m.nez[0], m.nez[1], SZEM - 0.15), felirat: m.felirat || '' }));

  // a vágás: minden darab látható magassága
  function vagas(c) {
    for (const m of darabok) {
      const { y0, y1 } = m.userData;
      const h = Math.min(Math.max(c - y0, 0), y1 - y0);
      m.visible = h > 0.002;
      if (m.visible) m.scale.y = h;
    }
  }

  return {
    gyoker, reteg, tervRajz, kert, talaj, vagas, cimkek, meretek, bejaras, hibak,
    anyagok, vonalAnyag, rajzVonalAnyag,
    meret: { w: maxX - minX + tK, d: maxY - minY + tK, H },
    sopresTav: (() => { // a söprés kezdő és záró értéke (a ház sarkai a söprés irányára vetítve, kerttel)
      const v = [];
      for (const x of [minX - 8, maxX + 8]) for (const y of [minY - 8, maxY + 8]) { const p = P(x, y); v.push(p.x * SOPRES_IRANY.x + p.z * SOPRES_IRANY.y); }
      return [Math.min(...v), Math.max(...v)];
    })(),
  };
}
