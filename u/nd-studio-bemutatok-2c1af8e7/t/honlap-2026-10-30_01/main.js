// main.js — görgetés → kamera és jelenet. A kamera-kulcsok ötlete (cél, irány, objektív és a képkeret
// magassága; az objektívet logaritmikusan interpolálva a távolság a keretből adódik, így az objektív
// tágítása a keret tartásával "dolly zoom") Samnang Aing flat-to-3d core.js-éből való (MIT, lásd LICENSE).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { hazEpit, soprés, PAPIR } from './haz.js';

const $ = (s) => document.querySelector(s);
const allapot = $('#allapot');
const hiba = (szoveg) => { allapot.textContent = szoveg; allapot.classList.remove('kesz'); };

const D2R = Math.PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const sat = (t) => Math.min(1, Math.max(0, t));
const sima = (t) => { t = sat(t); return t * t * (3 - 2 * t); };
const szakasz = (p, a, b) => sima((p - a) / (b - a));
const mobil = () => innerWidth < 760;

async function indul() {
  let adat;
  try {
    const v = await fetch('alaprajz.json', { cache: 'no-cache' });
    if (!v.ok) throw new Error(v.status);
    adat = await v.json();
  } catch (e) {
    hiba('Az alaprajz nem töltődött be. Frissítsd az oldalt; ha így marad, az alaprajz.json hiányzik vagy hibás.');
    return;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: $('#vaszon'), antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    hiba('Ez a böngésző nem tud 3D-t rajzolni (WebGL). Próbáld meg egy frissebb böngészőben.');
    return;
  }
  const finom = !matchMedia('(pointer: coarse)').matches && innerWidth >= 900;
  renderer.setPixelRatio(Math.min(devicePixelRatio, finom ? 2 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = finom;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  let haz;
  try { haz = hazEpit(adat); } catch (e) { hiba('Az alaprajz hibás: ' + e.message); return; }
  if (haz.hibak.length) console.warn('[alaprajz]', haz.hibak);

  $('#hazNev').firstChild.textContent = (adat.nev || 'Ház') + ' ';
  $('#hazAlcim').textContent = adat.alcim || '';
  document.title = (adat.nev || 'Ház') + ' — alaprajzból 3D';

  const scene = new THREE.Scene();
  const hatter = new THREE.Color(), EG = new THREE.Color('#e7ebe8'), FU = new THREE.Color('#d3d3bb');
  scene.background = hatter;
  scene.add(haz.gyoker);

  // fények: az alaprajzon csak egyenletes környezeti fény (lapos rajz), utána nap + égbolt
  const kornyezet = new THREE.AmbientLight(0xffffff, Math.PI);
  const egbolt = new THREE.HemisphereLight('#e4edf5', '#9c927f', 0);
  const nap = new THREE.DirectionalLight('#fff0d8', 0);
  nap.position.set(-14, 16, 10);
  nap.castShadow = finom;
  nap.shadow.mapSize.set(2048, 2048);
  Object.assign(nap.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
  nap.shadow.bias = -0.0004; nap.shadow.normalBias = 0.02;
  scene.add(kornyezet, egbolt, nap);

  // metszet: egy vágósík a ház anyagain; a talaj nem vágódik
  const metszoSik = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e3);
  for (const m of haz.anyagok) { m.clippingPlanes = [metszoSik]; m.side = THREE.DoubleSide; }
  const keretPontok = (() => {
    const w = haz.meret.w / 2 + 0.6;
    return [new THREE.Vector3(-w, -0.4, 0), new THREE.Vector3(w, -0.4, 0), new THREE.Vector3(w, haz.meret.H + 0.7, 0), new THREE.Vector3(-w, haz.meret.H + 0.7, 0)];
  })();
  const metszoKeret = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(keretPontok), new THREE.LineBasicMaterial({ color: '#b4532a' }));
  scene.add(metszoKeret);
  const metszetZ = (() => { const s = adat.helysegek; const minY = Math.min(...s.map(r => r.y)), maxY = Math.max(...s.map(r => r.y + r.h)); return (minY + maxY) / 2 - (minY + (maxY - minY) * 0.3); })();

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 5000);

  // ---------- feliratok (DOM, a 3D-pontokhoz kötve) ----------
  const tarto = $('#cimkek');
  // a szövegek a JSON-ból jönnek: csak textContent-tel kerülnek a lapra
  const cimke = (sorok, osztaly, pos) => {
    const el = document.createElement('div'); el.className = 'cimke ' + osztaly;
    if (typeof sorok === 'string') el.textContent = sorok;
    else for (const [tag, szoveg] of sorok) { const t = document.createElement(tag); t.textContent = szoveg; el.appendChild(t); }
    tarto.appendChild(el); return { el, pos };
  };
  const szobaCimkek = haz.cimkek.map(c => cimke([['b', c.nev], ['small', c.terulet]], 'szoba', c.pos));
  const meretCimkek = haz.meretek.map(m => cimke(m.szoveg, 'meret', m.pos));
  const xr = haz.meret.w / 2 + 1.0;
  const retegCimkek = [['Tető', 'teto', 3.2], ['Falak', 'fal', 1.5], ['Berendezés', 'butor', 0.5], ['Alap és padlók', 'alap', 0]]
    .map(([n, r, y]) => ({ ...cimke(n, 'reteg', new THREE.Vector3(xr, y, 0)), reteg: r, y }));
  const metszetCimke = cimke('A–A metszet', 'metszet', new THREE.Vector3(-haz.meret.w / 2 - 0.6, haz.meret.H + 1.0, 0));
  const v3 = new THREE.Vector3();
  function cimkeHelyez(c, alfa) {
    if (alfa < 0.01) { if (c.el.style.opacity !== '0') c.el.style.opacity = '0'; return; }
    v3.copy(c.pos).project(camera);
    if (v3.z > 1) { c.el.style.opacity = '0'; return; }
    const x = (v3.x * 0.5 + 0.5) * innerWidth, y = (-v3.y * 0.5 + 0.5) * innerHeight;
    c.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(${c.el.classList.contains('reteg') ? '0' : '-50%'}, -50%)`;
    c.el.style.opacity = alfa.toFixed(3);
  }

  // ---------- kamera-kulcsok ----------
  // keringő kulcs: t cél, az/el fokban, fov fokban, h = a képkeret magassága a célnál (méter)
  function keringoPoz(k) {
    const D = k.h / (2 * Math.tan(k.fov * D2R / 2));
    const ce = Math.cos(k.el * D2R);
    const pos = k.t.clone().add(new THREE.Vector3(ce * Math.sin(k.az * D2R), Math.sin(k.el * D2R), ce * Math.cos(k.az * D2R)).multiplyScalar(D));
    return { pos, nez: k.t.clone(), fov: k.fov, D };
  }
  const keringoLerp = (a, b, u) => ({
    t: a.t.clone().lerp(b.t, u), az: lerp(a.az, b.az, u), el: lerp(a.el, b.el, u),
    fov: Math.exp(lerp(Math.log(a.fov), Math.log(b.fov), u)), h: lerp(a.h, b.h, u),
  });
  const kozvetlenLerp = (a, b, u) => ({ pos: a.pos.clone().lerp(b.pos, u), nez: a.nez.clone().lerp(b.nez, u), fov: lerp(a.fov, b.fov, u) });

  const { w: HW, d: HD, H } = haz.meret;
  const setaFov = () => (innerWidth / innerHeight < 0.8 ? 76 : 62);
  // a kártyák elfoglalta rész nélküli képarány
  const szabadArany = () => { const a = innerWidth / innerHeight; return mobil() ? a : a * (1 - 460 / innerWidth); };
  const illeszt = (w, d, rahagy) => Math.max(d, w / szabadArany()) * rahagy;

  // a bejárás első pontja keringő kulcsként (így a kamera a ház körül ér oda, nem rajta át)
  function setaKulcs(i, azKozel) {
    const m = haz.bejaras[i];
    const d = m.pos.clone().sub(m.nez), hossz = d.length();
    let az = Math.atan2(d.x, d.z) / D2R;
    while (az < azKozel - 180) az += 360;
    while (az > azKozel + 180) az -= 360;
    const fov = setaFov();
    return { t: m.nez.clone(), az, el: Math.asin(d.y / hossz) / D2R, fov, h: 2 * hossz * Math.tan(fov * D2R / 2) };
  }

  function kulcsok() {
    const kozep = new THREE.Vector3(0, 0, 0), kozep1 = new THREE.Vector3(0, 1.0, 0);
    const k = {};
    k.terv = { t: kozep, az: 0, el: 89.6, fov: 1.2, h: illeszt(HW + 5.5, HD + 4, 1.12) };
    k.harom = { t: kozep, az: 22, el: 38, fov: 30, h: illeszt(HW, HD, 1.6) };
    k.anyag = { t: kozep, az: 38, el: 33, fov: 30, h: illeszt(HW, HD, 1.55) };
    k.korbe0 = { t: kozep1, az: 38, el: 27, fov: 30, h: illeszt(HW + 3, HD, 1.5) };
    k.korbe1 = { t: kozep1, az: 38 + 322, el: 22, fov: 30, h: illeszt(HW + 3, HD, 1.5) };
    k.szet = { t: new THREE.Vector3(0, 3.2, 0), az: 392, el: 24, fov: 30, h: Math.max(illeszt(HW + 5, HD, 1.1), 15) };
    k.metszet = { t: new THREE.Vector3(0, 1.3, 0), az: 375, el: 11, fov: 32, h: illeszt(HW + 1, 4.5, 1.15) };
    if (haz.bejaras.length) k.seta0 = setaKulcs(0, k.metszet.az + 90);
    k.vege = { t: new THREE.Vector3(0, 0.6, 0), az: 30, el: 52, fov: 32, h: illeszt(HW + 1, HD + 1, 1.5) };
    return k;
  }

  // a bejárás: pontról pontra; két pont között előbb fordul, aztán lép; a pontokon kicsit megáll
  function setaPoz(u) {
    const B = haz.bejaras, n = B.length;
    if (n === 1) return { pos: B[0].pos.clone(), nez: B[0].nez.clone(), fov: setaFov(), f: 0 };
    const f = sat(u) * (n - 1), i = Math.min(Math.floor(f), n - 2), t = f - i;
    const lep = sima((t - 0.14) / 0.72), fordul = sima((t - 0.04) / 0.6);
    const a = B[i], b = B[i + 1];
    const pos = a.pos.clone().lerp(b.pos, lep);
    const iranyA = a.nez.clone().sub(a.pos), iranyB = b.nez.clone().sub(b.pos);
    let yA = Math.atan2(iranyA.x, iranyA.z), yB = Math.atan2(iranyB.x, iranyB.z);
    if (yB - yA > Math.PI) yB -= 2 * Math.PI; if (yA - yB > Math.PI) yB += 2 * Math.PI;
    const pA = Math.atan2(iranyA.y, Math.hypot(iranyA.x, iranyA.z)), pB = Math.atan2(iranyB.y, Math.hypot(iranyB.x, iranyB.z));
    const yaw = lerp(yA, yB, fordul), pitch = lerp(pA, pB, fordul);
    const nez = pos.clone().add(new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)));
    return { pos, nez, fov: setaFov(), f };
  }

  // ---------- a görgetés idővonala: p (0..1) → minden ----------
  const SETA = [0.79, 0.955];
  function allapotP(p) {
    const k = kulcsok();
    let kam;
    if (p < 0.08) kam = keringoPoz(k.terv);
    else if (p < 0.26) kam = keringoPoz(keringoLerp(k.terv, k.harom, szakasz(p, 0.08, 0.255)));
    else if (p < 0.38) kam = keringoPoz(keringoLerp(k.harom, k.anyag, szakasz(p, 0.26, 0.38)));
    else if (p < 0.40) kam = keringoPoz(keringoLerp(k.anyag, k.korbe0, szakasz(p, 0.38, 0.40)));
    else if (p < 0.52) kam = keringoPoz(keringoLerp(k.korbe0, k.korbe1, (p - 0.40) / 0.12));
    else if (p < 0.64) kam = keringoPoz(keringoLerp(k.korbe1, k.szet, szakasz(p, 0.52, 0.58)));
    else if (p < 0.755 || !k.seta0) kam = keringoPoz(keringoLerp(k.szet, k.metszet, szakasz(p, 0.64, 0.68)));
    else if (p < SETA[0]) kam = keringoPoz(keringoLerp(k.metszet, k.seta0, szakasz(p, 0.755, SETA[0])));
    else if (p < 0.962) kam = setaPoz((p - SETA[0]) / (SETA[1] - SETA[0]));
    else {
      // ki a házból: előbb fel (a tető már elment), aztán hátra
      const a = setaPoz(1), b = keringoPoz(k.vege), u = szakasz(p, 0.962, 0.995);
      const ufel = 1 - Math.pow(1 - u, 2.2), uki = Math.pow(u, 1.6);
      kam = { pos: new THREE.Vector3(lerp(a.pos.x, b.pos.x, uki), lerp(a.pos.y, b.pos.y, ufel), lerp(a.pos.z, b.pos.z, uki)), nez: a.nez.clone().lerp(b.nez, sima(u * 1.3)), fov: lerp(a.fov, b.fov, u) };
    }
    const seta = p >= SETA[0] - 0.01 && p < 0.962;
    let felirat = '', feliratAlfa = 0;
    if (seta && kam.f !== undefined) {
      const r = Math.round(kam.f), m = haz.bejaras[r];
      felirat = m?.felirat || '';
      feliratAlfa = felirat ? 1 - sima((Math.abs(kam.f - r) - 0.1) / 0.18) : 0;
    }
    return {
      kam,
      vagas: lerp(0.06, H + 0.001, szakasz(p, 0.09, 0.24)),
      terv: 1 - szakasz(p, 0.085, 0.13),
      vonal: lerp(0.85, 0.22, szakasz(p, 0.27, 0.36)),
      sopres: szakasz(p, 0.26, 0.37),
      feny: szakasz(p, 0.245, 0.34),
      kert: szakasz(p, 0.30, 0.40),
      teto: szakasz(p, 0.38, 0.44) * (1 - szakasz(p, 0.955, 0.966)),
      tetoKi: szakasz(p, 0.955, 0.966),
      szet: szakasz(p, 0.535, 0.585) - szakasz(p, 0.605, 0.635),
      metszet: szakasz(p, 0.655, 0.695) - szakasz(p, 0.735, 0.76),
      eltolas: seta ? 0 : 1,
      felirat, feliratAlfa, seta,
      bent: szakasz(p, 0.775, 0.80) * (1 - szakasz(p, 0.955, 0.966)),
    };
  }

  // ---------- az állapot alkalmazása ----------
  const [sopA, sopB] = haz.sopresTav;
  let utolsoVagas = -1;
  function alkalmaz(s) {
    if (Math.abs(s.vagas - utolsoVagas) > 1e-4) { haz.vagas(s.vagas); utolsoVagas = s.vagas; }
    haz.rajzVonalAnyag.opacity = s.terv;
    haz.tervRajz.visible = s.terv > 0.01;
    haz.vonalAnyag.opacity = s.vonal;
    soprés.value = s.sopres <= 0 ? -1e4 : lerp(sopA, sopB, s.sopres);
    haz.talaj.material.color.copy(PAPIR).lerp(FU, s.sopres);
    // bent (a tető alatt) a nap nem ér be: a bejárás alatt több szórt fény
    kornyezet.intensity = lerp(Math.PI, 0.55, s.feny) + (s.bent ?? 0) * 1.2;
    egbolt.intensity = lerp(0, 1.05, s.feny);
    nap.intensity = lerp(0, 2.1, s.feny);
    hatter.copy(PAPIR).lerp(EG, s.feny);
    haz.kert.scale.setScalar(Math.max(0.001, sima(s.kert)));
    haz.kert.visible = s.kert > 0.001 && s.metszet < 0.05; // a metszetnél a fák (és árnyékuk) eltakarnák a vágást

    const e = sima(s.szet);
    haz.reteg.butor.position.y = 0.9 * e;
    haz.reteg.fal.position.y = 2.4 * e;
    const tetoLe = 1 - Math.pow(1 - s.teto, 3);
    haz.reteg.teto.visible = s.teto > 0.001;
    haz.reteg.teto.position.y = 5.2 * e + (1 - tetoLe) * 7 + s.tetoKi * 8;
    for (const c of retegCimkek) {
      c.pos.y = c.y + ({ teto: H + 5.2 * e, fal: 1.4 + 2.4 * e, butor: 0.5 + 0.9 * e, alap: 0 })[c.reteg];
    }

    const m = sima(s.metszet);
    metszoSik.constant = m > 0.001 ? lerp(HD / 2 + 1, metszetZ, m) : 1e3;
    metszoKeret.visible = m > 0.001;
    metszoKeret.position.z = metszoSik.constant;
    metszetCimke.pos.z = metszoSik.constant;

    const { kam } = s;
    camera.position.copy(kam.pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(kam.nez);
    camera.fov = kam.fov;
    const tav = kam.pos.distanceTo(kam.nez);
    camera.near = Math.max(0.05, tav - 120);
    camera.far = tav + 2500;
    // a kártyák mellett a kép eltolva (asztalon jobbra, telefonon felfelé)
    const W = innerWidth, Hh = innerHeight;
    camera.aspect = W / Hh;
    const elt = s.eltolas;
    if (elt > 0.001) camera.setViewOffset(W, Hh, mobil() ? 0 : -200 * elt, mobil() ? Hh * 0.17 * elt : 0, W, Hh);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(); // a feliratok vetítése még a rajzolás előtt történik

    for (const c of szobaCimkek) cimkeHelyez(c, s.terv);
    for (const c of meretCimkek) cimkeHelyez(c, s.terv);
    for (const c of retegCimkek) cimkeHelyez(c, sat(e * 1.6 - 0.6) * (c.reteg === 'teto' ? sat(s.teto * 2 - 1) : 1));
    cimkeHelyez(metszetCimke, sat(m * 1.5 - 0.5));

    const fel = $('#felirat');
    if (s.felirat && fel.textContent !== s.felirat) fel.textContent = s.felirat;
    fel.style.opacity = s.feliratAlfa.toFixed(3);
  }

  // ---------- görgetés ----------
  const kartyak = [...document.querySelectorAll('.kartya')];
  const lepesLista = $('#lepesek');
  const gorgethetoMagassag = () => document.documentElement.scrollHeight - innerHeight;
  kartyak.forEach((k) => {
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.innerHTML = `<span>${k.dataset.cim}</span><i></i>`;
    b.addEventListener('click', () => scrollTo({ top: (+k.dataset.tol + 0.002) * gorgethetoMagassag(), behavior: 'smooth' }));
    li.appendChild(b); lepesLista.appendChild(li); k._gomb = b;
  });

  let cel = 0, sim = 0, rajzolj = true;
  const celFrissit = () => { cel = sat(scrollY / Math.max(1, gorgethetoMagassag())); };
  addEventListener('scroll', celFrissit, { passive: true });
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); celFrissit(); rajzolj = true; });
  renderer.setSize(innerWidth, innerHeight, false);
  celFrissit(); sim = cel;
  window.__alaprajz = { renderer }; // mérés / hibakeresés

  function kartyakFrissit(p) {
    for (const k of kartyak) {
      const a = +k.dataset.tol, b = +k.dataset.ig;
      const alfa = Math.min(sat((p - a + 0.012) / 0.012), sat((b - p) / 0.012));
      k.style.opacity = alfa.toFixed(3);
      k.classList.toggle('lathato', alfa > 0.5);
      k._gomb.classList.toggle('aktiv', p >= a - 0.012 && p < b);
    }
    $('#sav').style.width = (p * 100).toFixed(2) + '%';
    $('#gorgess').style.opacity = (1 - sat(p / 0.02)).toFixed(2);
  }

  // ---------- szabad mód: forgatás, kapcsolók, önálló bejárás ----------
  const vezerlo = new OrbitControls(camera, renderer.domElement);
  vezerlo.enabled = false; vezerlo.enableDamping = true; vezerlo.enablePan = false;
  vezerlo.maxPolarAngle = 86 * D2R; vezerlo.minDistance = 8; vezerlo.maxDistance = 80;
  vezerlo.addEventListener('change', () => { rajzolj = true; });
  const szabad = { be: false, szet: 0, metszet: 0, teto: 0, celSzet: 0, celMetszet: 0, celTeto: 0, seta: null };
  const gombok = [...document.querySelectorAll('[data-mod]')];

  function szabadBe() {
    if (szabad.be) return;
    szabad.be = true; document.body.classList.add('szabad');
    const s = allapotP(1); alkalmaz(s);
    camera.clearViewOffset(); camera.updateProjectionMatrix();
    vezerlo.target.copy(s.kam.nez); vezerlo.enabled = true; vezerlo.update();
  }
  function szabadKi() {
    szabad.be = false; szabad.seta = null; vezerlo.enabled = false;
    Object.assign(szabad, { celSzet: 0, celMetszet: 0, celTeto: 0, szet: 0, metszet: 0, teto: 0 });
    gombok.forEach(g => g.hasAttribute('aria-pressed') && g.setAttribute('aria-pressed', 'false'));
    document.body.classList.remove('szabad'); rajzolj = true;
  }
  $('#vissza').addEventListener('click', szabadKi);
  for (const g of gombok) g.addEventListener('click', () => {
    szabadBe();
    const mod = g.dataset.mod;
    if (mod === 'szet' || mod === 'metszet' || mod === 'teto') {
      const kulcs = 'cel' + mod[0].toUpperCase() + mod.slice(1);
      szabad[kulcs] = szabad[kulcs] ? 0 : 1;
      g.setAttribute('aria-pressed', szabad[kulcs] ? 'true' : 'false');
    }
    if (mod === 'seta' && haz.bejaras.length) {
      szabad.seta = { t0: performance.now(), mentes: { pos: camera.position.clone(), cel: vezerlo.target.clone() } };
      szabad.celTeto = 1; vezerlo.enabled = false;
      gombok.find(x => x.dataset.mod === 'teto')?.setAttribute('aria-pressed', 'true');
    }
    rajzolj = true;
  });
  renderer.domElement.addEventListener('pointerdown', () => {
    if (szabad.seta) { // a húzás megszakítja a sétát
      camera.position.copy(szabad.seta.mentes.pos); vezerlo.target.copy(szabad.seta.mentes.cel);
      szabad.seta = null; vezerlo.enabled = true; vezerlo.update();
    }
  });

  function szabadAllapot(dt) {
    const k = 1 - Math.exp(-dt * 5);
    let mozog = false;
    for (const n of ['szet', 'metszet', 'teto']) {
      const c = szabad['cel' + n[0].toUpperCase() + n.slice(1)];
      if (Math.abs(szabad[n] - c) > 1e-3) { szabad[n] = lerp(szabad[n], c, k); mozog = true; } else szabad[n] = c;
    }
    const s = allapotP(1);
    s.szet = szabad.szet; s.metszet = szabad.metszet; s.teto = szabad.teto; s.tetoKi = 0; s.eltolas = 0;
    if (szabad.seta) {
      const u = (performance.now() - szabad.seta.t0) / (haz.bejaras.length * 3200);
      if (u >= 1) {
        camera.position.copy(szabad.seta.mentes.pos); vezerlo.target.copy(szabad.seta.mentes.cel);
        szabad.seta = null; vezerlo.enabled = true;
      } else {
        s.kam = setaPoz(u); s.seta = true; s.bent = szabad.teto;
        const r = Math.round(s.kam.f); s.felirat = haz.bejaras[r]?.felirat || '';
        s.feliratAlfa = s.felirat ? 1 - sima((Math.abs(s.kam.f - r) - 0.1) / 0.18) : 0;
        mozog = true;
      }
    }
    if (!szabad.seta) {
      vezerlo.update();
      s.kam = { pos: camera.position.clone(), nez: vezerlo.target.clone(), fov: allapotP(1).kam.fov };
    }
    return { s, mozog };
  }

  // ---------- rajzolási hurok: csak akkor rajzol, ha változott valami ----------
  let elozo = performance.now();
  function hurok(most) {
    const dt = Math.min(0.1, (most - elozo) / 1000); elozo = most;
    if (szabad.be) {
      const { s, mozog } = szabadAllapot(dt);
      if (mozog || rajzolj || szabad.seta) { alkalmaz(s); renderer.render(scene, camera); rajzolj = false; }
    } else {
      const uj = Math.abs(cel - sim) < 1e-5 ? cel : lerp(sim, cel, 1 - Math.exp(-dt * 7));
      if (uj !== sim || rajzolj) {
        sim = uj;
        alkalmaz(allapotP(sim));
        kartyakFrissit(sim);
        renderer.render(scene, camera);
        rajzolj = false;
      }
    }
    requestAnimationFrame(hurok);
  }
  // ?p=0.5 → a görgetés rögzítése (képernyőképhez, ellenőrzéshez)
  const rogzitett = new URLSearchParams(location.search).get('p');
  if (rogzitett !== null) { history.scrollRestoration = 'manual'; requestAnimationFrame(() => { scrollTo(0, +rogzitett * gorgethetoMagassag()); celFrissit(); sim = cel; rajzolj = true; }); }

  alkalmaz(allapotP(sim)); kartyakFrissit(sim); renderer.render(scene, camera);
  allapot.classList.add('kesz');
  requestAnimationFrame(hurok);
}

indul().catch((e) => { console.error(e); hiba('Hiba történt a ház rajzolásakor. Frissítsd az oldalt.'); });
