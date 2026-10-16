/**
 * Swipe-értékelés az ADMIN ügyféloldalon — a DOM-rész (a logika: `swipe-logika.js`).
 *
 * Teljes képernyős réteg négy füllel: **Swipe** (a videó-pakli: húzás jobbra / fel / balra / le, gombok,
 * billentyűk, „vissza”, gyors indoklás-chipek, összesítő), **Párbaj** (két videó, „Ez a jobb” — Elo a böngésző
 * tárában, az admin pontot NEM írja), **Mi nyer?** (pontátlag címkénként) és **Kedvencek** (a szuper pontúak,
 * lejátszás sorban). Az ügyféloldalra nem kerül: ott az ügyfél fájljába írna (`ujraepites-ndart-video-kirakat.md` K3).
 *
 * A mentés a hívóé: `mentPont(sor, pont)` és `mentJegyzet(sor, jegyzet)` — a meglévő admin-mentés (ugyanaz,
 * mint a kártyás nézet pontgombjaié és belső jegyzetéé), és a jelző szövegét adja vissza. Minden felhasználói
 * szöveg (cím, leírás, címke, megjegyzés) `textContent`-tel kerül ki.
 */

import {
  IRANYOK, IRANY_FELIRAT, SORRENDEK, billentyuMuvelet, eloLista, epitPakli, folytatasIndex, gesztusAllapot,
  jegyzetHozzafuz, kedvencek, keszitMenet, koppintas, miNyer, normalBeallitas, parValaszt, parbajBetolt,
  parbajEredmeny, parbajMent, pozicioBetolt, pozicioMent, swipeBeallitasBetolt, swipeBeallitasMent, ujMag,
  videoSorok,
} from "./swipe-logika.js";
import { datumCsoportok, helyiNap } from "./datum-szuro.js";
import { cimkeCsoportok, keszitCimkek } from "./cimke-szuro.js";
import { keszitLeiras, teljesKepernyo, videoUtak } from "./ugyfel-video.js";

const IRANY_JEL = { jobbra: "♥", fel: "★", balra: "✕", le: "⓪" };
const CHIP_IDO_MS = 2500;
const KIREPULES_MS = 260;

function rezeg() {
  try { globalThis.navigator?.vibrate?.(15); } catch { /* nem minden eszköz tud rezegni */ }
}

function csokkentettMozgas() {
  try { return Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches); } catch { return false; }
}

function elem(dok, cimke, osztaly, szoveg) {
  const e = dok.createElement(cimke);
  if (osztaly) e.className = osztaly;
  if (szoveg !== undefined) e.textContent = szoveg;
  return e;
}

function gomb(dok, szoveg, osztaly, kezelo) {
  const g = elem(dok, "button", osztaly, szoveg);
  g.type = "button";
  if (kezelo) g.addEventListener("click", kezelo);
  return g;
}

const atlagSzoveg = (szam) => szam.toLocaleString("hu-HU", { maximumFractionDigits: 1 });

/**
 * A swipe-réteg (vagy `null`, ha az ügyfélnek nincs videó-terve). `{elem, megnyit, bezar}`.
 * `kilep()`: a réteg „✕ Kártyák” gombja (a hívó vált nézetet); `ugrik(id)`: az összesítőből a kártyás nézet
 * arra a tervre ugrik.
 */
export function keszitSwipe({
  dok = globalThis.document, sorok, azonosito, tarhely, ugyfelUt, mentPont, mentJegyzet,
  ugrik = () => {}, kilep = () => {}, ma = helyiNap(),
}) {
  const videok = videoSorok(sorok);
  if (!videok.length) return null;

  let beallitas = swipeBeallitasBetolt(tarhely, azonosito);
  let mag = 1;
  let menet = null;
  let cache = new Map();          // tervId → kártya-elem (az elöl álló + a következő kettő)
  let hangBe = false;
  let foglalt = false;
  let nyitva = false;
  let aktivFul = "pakli";
  let chipIdozito = null;

  const gyoker = elem(dok, "section", "swipe");
  gyoker.hidden = true;
  gyoker.setAttribute("aria-label", "Swipe-értékelés");
  gyoker.innerHTML = `
    <div class="swipe-fej">
      <button type="button" class="swipe-kilep" title="Vissza a kártyás nézetre">✕ Kártyák</button>
      <nav class="swipe-fulek" aria-label="Swipe-nézet fülei">
        <button type="button" data-ful="pakli">Swipe</button>
        <button type="button" data-ful="parbaj">Párbaj</button>
        <button type="button" data-ful="statisztika">Mi nyer?</button>
        <button type="button" data-ful="kedvencek">Kedvencek</button>
      </nav>
      <span class="swipe-szamlalo" aria-live="polite"></span>
      <button type="button" class="swipe-beallit-gomb" aria-expanded="false" title="Beállítások">⚙</button>
    </div>
    <form class="swipe-beallitasok" hidden></form>
    <div class="swipe-panel swipe-pakli" data-panel="pakli">
      <div class="swipe-szinpad"></div>
      <div class="swipe-chipek" hidden></div>
      <div class="swipe-gombok"></div>
      <p class="swipe-statusz" role="status"></p>
    </div>
    <div class="swipe-panel swipe-parbaj" data-panel="parbaj" hidden></div>
    <div class="swipe-panel swipe-stat" data-panel="statisztika" hidden></div>
    <div class="swipe-panel swipe-kedvencek" data-panel="kedvencek" hidden></div>
    <div class="swipe-lejatszo" hidden></div>`;
  dok.body.append(gyoker);

  const $ = (s) => gyoker.querySelector(s);
  const szinpad = $(".swipe-szinpad");
  const chipSor = $(".swipe-chipek");
  const gombSor = $(".swipe-gombok");
  const statusz = $(".swipe-statusz");
  const szamlalo = $(".swipe-szamlalo");
  const urlap = $(".swipe-beallitasok");
  const beallitGomb = $(".swipe-beallit-gomb");
  const lejatszo = $(".swipe-lejatszo");

  /* ------------------------------------------------------------ alsó gombsor */
  const iranyGombok = {};
  gombSor.append(gomb(dok, "↶", "swipe-gomb vissza", () => vissza()));
  gombSor.lastChild.title = "Vissza (Backspace / Z)";
  gombSor.lastChild.setAttribute("aria-label", "Az utolsó döntés visszavonása");
  for (const irany of ["le", "balra", "fel", "jobbra"]) {
    const g = gomb(dok, "", `swipe-gomb ${irany}`, () => kirepul(irany));
    iranyGombok[irany] = g;
    gombSor.append(g);
  }
  function gombFeliratok() {
    const nyil = { jobbra: "→", fel: "↑", balra: "←", le: "↓" };
    for (const irany of IRANYOK) {
      const g = iranyGombok[irany];
      g.replaceChildren(elem(dok, "span", "jel", IRANY_JEL[irany]), elem(dok, "small", "", `${IRANY_FELIRAT[irany]} · ${beallitas.pontok[irany]}`));
      g.setAttribute("aria-label", `${IRANY_FELIRAT[irany]} — ${beallitas.pontok[irany]} pont (${nyil[irany]})`);
      g.title = `${IRANY_FELIRAT[irany]}: ${beallitas.pontok[irany]} pont (${nyil[irany]})`;
    }
  }

  /* ------------------------------------------------------------ kártya */
  function reszletekTolt(panel, sor) {
    const reszek = [elem(dok, "h3", "", sor.cim)];
    const leiras = keszitLeiras(sor.leiras, dok);
    if (leiras) reszek.push(leiras);
    const cimkek = keszitCimkek(sor.cimkek, dok);
    if (cimkek) reszek.push(cimkek);
    const adatok = elem(dok, "dl", "swipe-adatok");
    const sorAdd = (cim, ertek) => { if (ertek) adatok.append(elem(dok, "dt", "", cim), elem(dok, "dd", "", ertek)); };
    sorAdd("Készült", sor.keszult || "–");
    sorAdd("Pontom", typeof sor.enPont === "number" ? `${sor.enPont}/10` : "még nincs");
    sorAdd("Megjegyzésem", sor.enMegjegyzes);
    sorAdd("Belső jegyzetem", sor.enJegyzet);
    reszek.push(adatok);
    panel.replaceChildren(...reszek);
  }

  function keszitKartya(sor) {
    const k = elem(dok, "article", "swipe-kartya");
    k.dataset.id = sor.id;
    const { mp4, poszter } = videoUtak(ugyfelUt + sor.utvonal);
    const video = dok.createElement("video");
    Object.assign(video, { poster: poszter, muted: true, playsInline: true, preload: "metadata", loop: !beallitas.vegenTovabb });
    video.setAttribute("playsinline", "");
    video.setAttribute("muted", "");
    video.src = mp4;
    video.addEventListener("ended", () => {
      if (beallitas.vegenTovabb && k.classList.contains("elol") && !foglalt && nyitva) {
        menet.atugrik();
        statusz.textContent = "Átugorva (a videó véget ért) — pont nélkül.";
        render();
      }
    });
    video.addEventListener("error", () => { k.classList.add("hibas-video"); });

    const belyeg = elem(dok, "div", "swipe-belyeg");
    belyeg.setAttribute("aria-hidden", "true");
    const hang = elem(dok, "span", "swipe-hang", "🔇");
    hang.setAttribute("aria-hidden", "true");
    const fej = elem(dok, "div", "swipe-kartya-fej");
    const reszletGomb = gomb(dok, "ℹ Részletek", "swipe-reszlet-gomb");
    reszletGomb.setAttribute("aria-expanded", "false");
    const nagyit = gomb(dok, "⛶", "swipe-nagyit", () => teljesKepernyo(video));
    nagyit.title = "Teljes képernyő (F)";
    nagyit.setAttribute("aria-label", "Teljes képernyő");
    fej.append(reszletGomb, nagyit);
    const alja = elem(dok, "div", "swipe-kartya-alja");
    alja.append(elem(dok, "h2", "", sor.cim));
    if (typeof sor.enPont === "number") alja.append(elem(dok, "span", "swipe-mostani", `most: ${sor.enPont}/10`));
    const reszletek = elem(dok, "div", "swipe-reszletek");
    reszletek.hidden = true;
    reszletGomb.addEventListener("click", () => {
      const nyit = reszletek.hidden;
      if (nyit) reszletekTolt(reszletek, sor);
      reszletek.hidden = !nyit;
      reszletGomb.setAttribute("aria-expanded", String(nyit));
    });
    k.append(video, belyeg, hang, fej, alja, reszletek);
    kotHuzas(k, video, belyeg);
    return k;
  }

  function hangAllit(video, k) {
    video.muted = !hangBe;
    const jelzo = k.querySelector(".swipe-hang");
    if (jelzo) jelzo.textContent = hangBe ? "🔊" : "🔇";
  }

  function belyegMutat(belyeg, irany, arany) {
    belyeg.className = "swipe-belyeg" + (irany ? ` ${irany}` : "");
    belyeg.textContent = irany ? IRANY_FELIRAT[irany] : "";
    belyeg.style.opacity = irany ? String(Math.min(1, arany * 1.2)) : "0";
  }

  /** Húzás Pointer Events-szel (egér + érintés): követi az ujjat, dől, bélyeg; küszöb fölött kirepül. */
  function kotHuzas(k, video, belyeg) {
    let kezdet = null;
    const meret = () => ({ szelesseg: k.clientWidth || 360, magassag: k.clientHeight || 640 });
    k.addEventListener("pointerdown", (e) => {
      if (!k.classList.contains("elol") || foglalt) return;
      if (e.target.closest("button, .swipe-reszletek")) return;
      if (e.button !== undefined && e.button !== 0) return;
      kezdet = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
      try { k.setPointerCapture(e.pointerId); } catch { /* régi böngésző */ }
      k.classList.add("huzas");
    });
    k.addEventListener("pointermove", (e) => {
      if (!kezdet || e.pointerId !== kezdet.id) return;
      const dx = e.clientX - kezdet.x;
      const dy = e.clientY - kezdet.y;
      k.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.05}deg)`;
      const a = gesztusAllapot(dx, dy, meret());
      belyegMutat(belyeg, a.irany, a.arany);
    });
    const vege = (e, megszakitva) => {
      if (!kezdet || e.pointerId !== kezdet.id) return;
      const dx = e.clientX - kezdet.x;
      const dy = e.clientY - kezdet.y;
      const ido = performance.now() - kezdet.t;
      kezdet = null;
      k.classList.remove("huzas");
      if (!megszakitva && koppintas(dx, dy, ido)) {
        k.style.transform = "";
        hangBe = !hangBe;
        hangAllit(video, k);
        if (video.paused) video.play().catch(() => {});
        return;
      }
      const a = gesztusAllapot(dx, dy, meret());
      if (!megszakitva && a.dont) {
        kirepul(a.irany);
      } else {
        k.style.transform = "";            // visszarugózik (CSS-átmenet)
        belyegMutat(belyeg, null, 0);
      }
    };
    k.addEventListener("pointerup", (e) => vege(e, false));
    k.addEventListener("pointercancel", (e) => vege(e, true));
  }

  /* ------------------------------------------------------------ pakli */
  function elolKartya() {
    const sor = menet?.aktualis();
    return sor ? cache.get(sor.id) ?? null : null;
  }

  function videoLeallit(k) {
    const v = k.querySelector("video");
    if (!v) return;
    v.pause();
    v.removeAttribute("src");   // ne töltsön tovább a háttérben
    try { v.load(); } catch { /* hamis DOM */ }
  }

  function szamlaloFrissit() {
    if (!menet || !menet.hossz) { szamlalo.textContent = "0 / 0"; return; }
    szamlalo.textContent = menet.vege()
      ? `${menet.hossz} / ${menet.hossz} ✓`
      : `${menet.index + 1} / ${menet.hossz}`;
  }

  function pozicioMentes() {
    pozicioMent(tarhely, azonosito, { mag, aktualisId: menet?.aktualis()?.id ?? null });
  }

  function render() {
    szamlaloFrissit();
    pozicioMentes();
    const lathato = menet.vege() ? [] : [menet.aktualis(), ...menet.kovetkezok(2)];
    const uj = new Map();
    lathato.forEach((sor, i) => {
      const k = cache.get(sor.id) ?? keszitKartya(sor);
      k.classList.remove("elol", "hatso-1", "hatso-2", "kirepul");
      k.classList.add(i === 0 ? "elol" : `hatso-${i}`);
      k.setAttribute("aria-hidden", String(i !== 0));
      k.style.transform = "";
      belyegMutat(k.querySelector(".swipe-belyeg"), null, 0);
      uj.set(sor.id, k);
    });
    for (const [id, k] of cache) {
      if (!uj.has(id)) { videoLeallit(k); k.remove(); }
    }
    cache = uj;
    // Az új kártyák a meglévők ALÁ kerülnek (a sorrendet a z-index adja), a lejátszó videót nem mozgatjuk.
    for (const k of uj.values()) if (!k.isConnected) szinpad.prepend(k);
    for (const vege of szinpad.querySelectorAll(".swipe-ures, .swipe-vege")) vege.remove();

    gombSor.hidden = false;
    for (const g of Object.values(iranyGombok)) g.disabled = menet.vege();
    if (!menet.hossz) { uresUzenet(); return; }
    if (menet.vege()) { osszesitoMutat(); return; }

    uj.forEach((k, id) => {
      const v = k.querySelector("video");
      if (id === menet.aktualis().id) {
        v.preload = "auto";
        hangAllit(v, k);
        if (nyitva && aktivFul === "pakli") v.play().catch(() => {});
      } else {
        v.pause();
      }
    });
  }

  function uresUzenet() {
    const doboz = elem(dok, "div", "swipe-ures");
    doboz.append(
      elem(dok, "h2", "", "Nincs ilyen videó"),
      elem(dok, "p", "", beallitas.csakErtekeletlen
        ? "Minden videót értékeltél, ami a szűrőnek megfelel. A ⚙ beállításokban válts „Mind”-ra, vagy lazíts a szűrőn."
        : "A szűrő egyetlen videót sem enged át. Lazíts rajta a ⚙ beállításokban."),
      gomb(dok, "⚙ Beállítások", "swipe-fo-gomb", () => beallitasNyit(true)),
    );
    szinpad.append(doboz);
  }

  function osszesitoMutat() {
    const o = menet.osszesito();
    const doboz = elem(dok, "div", "swipe-vege");
    doboz.append(elem(dok, "h2", "", "A pakli végére értél"));
    const racs = elem(dok, "div", "swipe-vege-racs");
    for (const irany of ["fel", "jobbra", "balra", "le"]) {
      const oszlop = elem(dok, "section", `swipe-vege-oszlop ${irany}`);
      oszlop.append(elem(dok, "h3", "", `${IRANY_JEL[irany]} ${IRANY_FELIRAT[irany]} (${o[irany].length})`));
      const lista = elem(dok, "ul");
      for (const sor of o[irany]) {
        const li = elem(dok, "li");
        li.append(gomb(dok, sor.cim, "swipe-ugras", () => ugrik(sor.id)));
        lista.append(li);
      }
      oszlop.append(lista);
      racs.append(oszlop);
    }
    doboz.append(racs, gomb(dok, "⟲ Újrakezdés", "swipe-fo-gomb", () => ujrakezd()));
    szinpad.append(doboz);
  }

  function ujPakli(kezdoId) {
    for (const k of cache.values()) { videoLeallit(k); k.remove(); }
    cache = new Map();
    const pakli = epitPakli(sorok, beallitas, { ma, mag });
    menet = keszitMenet(pakli, { kezdo: folytatasIndex(pakli, kezdoId) });
    render();
  }

  function ujrakezd() {
    mag = ujMag();
    statusz.textContent = "";
    ujPakli(null);
  }

  function dont(irany) {
    const lepes = menet.dont(irany, beallitas.pontok[irany]);
    if (!lepes) return;
    rezeg();
    statusz.textContent = `${IRANY_FELIRAT[irany]} — ${lepes.pont} pont · Mentés…`;
    Promise.resolve()
      .then(() => mentPont(lepes.sor, lepes.pont))
      .then((szoveg) => { statusz.textContent = `${IRANY_FELIRAT[irany]} — ${lepes.pont} pont · ${szoveg || "Elmentve ✓"}`; })
      .catch(() => { statusz.textContent = "Mentés folyamatban…"; });
    chipekMutat(lepes.sor);
    render();
  }

  function kirepul(irany) {
    if (foglalt || !menet || menet.vege()) return;
    const k = elolKartya();
    if (!k || csokkentettMozgas()) { dont(irany); return; }
    foglalt = true;
    const w = Math.max(k.clientWidth, 300);
    const h = Math.max(k.clientHeight, 500);
    const cel = { jobbra: [1.6 * w, 40, 18], balra: [-1.6 * w, 40, -18], fel: [0, -1.4 * h, 0], le: [0, 1.4 * h, 0] }[irany];
    belyegMutat(k.querySelector(".swipe-belyeg"), irany, 1);
    k.classList.add("kirepul");
    k.style.transform = `translate(${cel[0]}px, ${cel[1]}px) rotate(${cel[2]}deg)`;
    setTimeout(() => { foglalt = false; dont(irany); }, KIREPULES_MS);
  }

  function vissza() {
    if (foglalt || !menet) return;
    const lepes = menet.vissza();
    if (!lepes) { statusz.textContent = "Nincs mit visszavonni."; return; }
    chipElrejt();
    if (lepes.irany) {
      statusz.textContent = "Visszavonva · Mentés…";
      Promise.resolve()
        .then(() => mentPont(lepes.sor, lepes.elozo))
        .then((szoveg) => {
          statusz.textContent = `Visszavonva (${lepes.elozo === null ? "pont nélkül" : `${lepes.elozo} pont`}) · ${szoveg || "Elmentve ✓"}`;
        })
        .catch(() => { statusz.textContent = "Mentés folyamatban…"; });
    } else {
      statusz.textContent = "Visszaléptél.";
    }
    render();
  }

  /* ------------------------------------------------------------ gyors indoklás (chipek) */
  function chipElrejt() {
    clearTimeout(chipIdozito);
    chipSor.hidden = true;
  }

  function chipekMutat(sor) {
    if (!beallitas.chipek.length) return;
    const cim = elem(dok, "span", "swipe-chip-cim", "Miért?");
    const gombok = beallitas.chipek.map((chip) => gomb(dok, chip, "swipe-chip", (e) => {
      const uj = jegyzetHozzafuz(sor.enJegyzet, chip);
      e.currentTarget.classList.add("aktiv");
      idozit();
      if (uj === (sor.enJegyzet ?? "").trim()) return;
      sor.enJegyzet = uj;
      Promise.resolve()
        .then(() => mentJegyzet(sor, uj))
        .then((szoveg) => { statusz.textContent = `Jegyzet: „${chip}” · ${szoveg || "Elmentve ✓"}`; })
        .catch(() => { statusz.textContent = "Mentés folyamatban…"; });
    }));
    chipSor.replaceChildren(cim, ...gombok);
    chipSor.hidden = false;
    idozit();
  }

  function idozit() {
    clearTimeout(chipIdozito);
    chipIdozito = setTimeout(() => { chipSor.hidden = true; }, CHIP_IDO_MS);
  }

  /* ------------------------------------------------------------ beállítások */
  function pakliKulcs(b) {
    return JSON.stringify([b.sorrend, b.csakErtekeletlen, b.datum, b.cimke]);
  }

  function beallitasNyit(nyit) {
    if (nyit) epitUrlap();
    urlap.hidden = !nyit;
    beallitGomb.setAttribute("aria-expanded", String(nyit));
  }

  function mezo(cimke, bemenet) {
    const l = elem(dok, "label");
    l.append(elem(dok, "span", "", cimke), bemenet);
    return l;
  }

  function valaszto(nev, opciok, ertek) {
    const s = dok.createElement("select");
    s.name = nev;
    for (const [kulcs, felirat] of opciok) {
      const o = dok.createElement("option");
      o.value = kulcs;
      o.textContent = felirat;
      s.append(o);
    }
    s.value = opciok.some(([k]) => k === ertek) ? ertek : opciok[0][0];
    return s;
  }

  function epitUrlap() {
    const reszek = [elem(dok, "h2", "", "Beállítások")];
    reszek.push(mezo("Sorrend", valaszto("sorrend", SORRENDEK.map((s) => [s.kulcs, s.felirat]), beallitas.sorrend)));
    reszek.push(mezo("Mely videók", valaszto("csak", [["1", "Csak a még nem értékeltek"], ["0", "Mind"]], beallitas.csakErtekeletlen ? "1" : "0")));
    const datumok = datumCsoportok(videok, ma);
    if (datumok.length > 2) {
      reszek.push(mezo("Készült", valaszto("datum", datumok.map((c) => [c.kulcs, `${c.felirat} (${c.db})`]), beallitas.datum)));
    }
    for (const cs of cimkeCsoportok(videok)) {
      const s = valaszto(`cimke:${cs.kulcs}`, [["", `Mind (${cs.mind})`], ...cs.ertekek.map((e) => [e.kulcs, `${e.felirat} (${e.db})`])], beallitas.cimke[cs.kulcs] ?? "");
      reszek.push(mezo(cs.nev, s));
    }
    const pontDoboz = elem(dok, "fieldset", "swipe-pontok");
    pontDoboz.append(elem(dok, "legend", "", "Pont irányonként (0–10)"));
    for (const irany of ["jobbra", "fel", "balra", "le"]) {
      const be = dok.createElement("input");
      Object.assign(be, { type: "number", name: `pont:${irany}`, min: "0", max: "10", step: "1", value: String(beallitas.pontok[irany]) });
      pontDoboz.append(mezo(`${IRANY_JEL[irany]} ${IRANY_FELIRAT[irany]}`, be));
    }
    reszek.push(pontDoboz);
    const tovabb = dok.createElement("input");
    tovabb.type = "checkbox";
    tovabb.name = "vegenTovabb";
    tovabb.checked = beallitas.vegenTovabb;
    const tovabbCimke = elem(dok, "label", "swipe-jelolo");
    tovabbCimke.append(tovabb, elem(dok, "span", "", "A videó végén automatikusan tovább (pont nélkül)"));
    reszek.push(tovabbCimke);
    const chipBe = dok.createElement("input");
    Object.assign(chipBe, { type: "text", name: "chipek", value: beallitas.chipek.join(", ") });
    reszek.push(mezo("Gyors indoklás (vesszővel; a belső jegyzetbe kerül)", chipBe));
    const also = elem(dok, "div", "swipe-urlap-also");
    also.append(
      gomb(dok, "⟲ Újrakezdés (új keverés)", "", () => { beallitasNyit(false); ujrakezd(); }),
      gomb(dok, "Kész", "swipe-fo-gomb", () => beallitasNyit(false)),
    );
    reszek.push(also);
    urlap.replaceChildren(...reszek);
  }

  function urlapOlvas() {
    const adat = new FormData(urlap);
    const cimke = {};
    const pontok = {};
    for (const [nev, ertek] of adat.entries()) {
      if (nev.startsWith("cimke:") && ertek) cimke[nev.slice(6)] = ertek;
      if (nev.startsWith("pont:")) pontok[nev.slice(5)] = ertek;
    }
    return normalBeallitas({
      sorrend: adat.get("sorrend"),
      csakErtekeletlen: adat.get("csak") === "1",
      datum: adat.get("datum") ?? "mind",
      cimke,
      pontok,
      vegenTovabb: adat.get("vegenTovabb") === "on",
      chipek: String(adat.get("chipek") ?? ""),
    });
  }

  urlap.addEventListener("submit", (e) => { e.preventDefault(); beallitasNyit(false); });
  urlap.addEventListener("change", () => {
    const regi = beallitas;
    beallitas = urlapOlvas();
    swipeBeallitasMent(tarhely, azonosito, beallitas);
    gombFeliratok();
    for (const k of cache.values()) k.querySelector("video").loop = !beallitas.vegenTovabb;
    if (pakliKulcs(regi) !== pakliKulcs(beallitas)) {
      statusz.textContent = "A pakli a beállítások szerint újraépült.";
      ujPakli(null);
    }
  });
  beallitGomb.addEventListener("click", () => beallitasNyit(urlap.hidden));

  /* ------------------------------------------------------------ fülek */
  const fulGombok = [...gyoker.querySelectorAll("[data-ful]")];
  function fulValt(ful) {
    aktivFul = ful;
    for (const g of fulGombok) {
      g.classList.toggle("aktiv", g.dataset.ful === ful);
      g.setAttribute("aria-pressed", String(g.dataset.ful === ful));
    }
    for (const p of gyoker.querySelectorAll("[data-panel]")) p.hidden = p.dataset.panel !== ful;
    beallitGomb.hidden = ful !== "pakli";
    szamlalo.hidden = ful !== "pakli";
    if (ful !== "pakli") { beallitasNyit(false); elolKartya()?.querySelector("video")?.pause(); }
    if (ful !== "parbaj") for (const v of gyoker.querySelectorAll(".swipe-parbaj video")) v.pause();
    if (ful === "pakli" && nyitva && menet && !menet.vege()) elolKartya()?.querySelector("video")?.play().catch(() => {});
    if (ful === "parbaj") parbajMutat();
    if (ful === "statisztika") statMutat();
    if (ful === "kedvencek") kedvencekMutat();
  }
  for (const g of fulGombok) g.addEventListener("click", () => fulValt(g.dataset.ful));
  $(".swipe-kilep").addEventListener("click", () => kilep());

  /* ------------------------------------------------------------ Mi nyer? */
  function statMutat() {
    const panel = $(".swipe-stat");
    const csoportok = miNyer(sorok);
    const reszek = [
      elem(dok, "h2", "", "Mi nyer?"),
      elem(dok, "p", "swipe-sugo", "A pontjaid átlaga címkénként — csak az értékelt videók számítanak. Halvány: 3-nál kevesebb pontból, még nem biztos."),
    ];
    if (!csoportok.length) {
      reszek.push(elem(dok, "p", "swipe-ures-szoveg", "Még nincs mit összevetni: ehhez pontozott videók kellenek olyan címke-csoportban, amelynek legalább két értéke van."));
    }
    for (const cs of csoportok) {
      const doboz = elem(dok, "section", "swipe-stat-csoport");
      doboz.append(elem(dok, "h3", "", cs.nev));
      for (const e of cs.ertekek) {
        const sor = elem(dok, "div", "swipe-stat-sor" + (e.bizonytalan ? " bizonytalan" : ""));
        const sav = elem(dok, "div", "swipe-stat-sav");
        const kitoltes = elem(dok, "span");
        kitoltes.style.width = `${Math.max(2, e.atlag * 10)}%`;
        sav.append(kitoltes);
        sor.append(elem(dok, "span", "swipe-stat-nev", e.felirat), sav, elem(dok, "span", "swipe-stat-szam", `${atlagSzoveg(e.atlag)} · ${e.db} db`));
        if (e.bizonytalan) sor.title = `Csak ${e.db} pontból — még nem biztos.`;
        doboz.append(sor);
      }
      reszek.push(doboz);
    }
    panel.replaceChildren(...reszek);
  }

  /* ------------------------------------------------------------ Kedvencek + lejátszás sorban */
  function kedvencekMutat() {
    const panel = $(".swipe-kedvencek");
    const lista = kedvencek(sorok, beallitas);
    const reszek = [elem(dok, "h2", "", `Kedvencek — ${beallitas.pontok.fel} pontos videók (${lista.length})`)];
    if (!lista.length) {
      reszek.push(elem(dok, "p", "swipe-ures-szoveg", `Még nincs ${beallitas.pontok.fel} pontos videó. A Swipe fülön húzz felfelé egyet (★ SZUPER).`));
    } else {
      reszek.push(gomb(dok, "▶ Lejátszás sorban", "swipe-fo-gomb", () => sorbanLejatszik(lista, 0)));
      const ul = elem(dok, "ol", "swipe-kedvenc-lista");
      lista.forEach((sor, i) => {
        const li = elem(dok, "li");
        li.append(gomb(dok, sor.cim, "swipe-ugras", () => sorbanLejatszik(lista, i)));
        const leiras = keszitLeiras(sor.leiras, dok, "small");
        if (leiras) li.append(leiras);
        ul.append(li);
      });
      reszek.push(ul);
    }
    panel.replaceChildren(...reszek);
  }

  function sorbanLejatszik(lista, kezdo) {
    let i = kezdo;
    const video = dok.createElement("video");
    Object.assign(video, { controls: true, autoplay: true, playsInline: true, preload: "auto" });
    video.setAttribute("playsinline", "");
    const felirat = elem(dok, "p", "swipe-lejatszo-cim");
    const tolt = () => {
      const sor = lista[i];
      const { mp4, poszter } = videoUtak(ugyfelUt + sor.utvonal);
      video.poster = poszter;
      video.src = mp4;
      felirat.textContent = `${i + 1} / ${lista.length} — ${sor.cim}`;
      video.play().catch(() => {});
    };
    const lep = (d) => { i = Math.min(lista.length - 1, Math.max(0, i + d)); tolt(); };
    video.addEventListener("ended", () => {
      if (i < lista.length - 1) lep(1);
      else felirat.textContent = `Vége — ${lista.length} kedvenc lejátszva.`;
    });
    const fej = elem(dok, "div", "swipe-lejatszo-fej");
    fej.append(
      gomb(dok, "⏮ Előző", "", () => lep(-1)),
      gomb(dok, "Következő ⏭", "", () => lep(1)),
      // a csomagoló megy teljes képernyőre, nem a videó: így a következő videó is teljes képernyőn marad
      gomb(dok, "⛶ Teljes képernyő", "", () => teljesKepernyo(lejatszo)),
      gomb(dok, "✕ Bezárás", "bezar", () => lejatszoBezar()),
    );
    lejatszo.replaceChildren(fej, video, felirat);
    lejatszo.hidden = false;
    tolt();
  }

  function lejatszoBezar() {
    const v = lejatszo.querySelector("video");
    if (v) { v.pause(); v.removeAttribute("src"); }
    lejatszo.replaceChildren();
    lejatszo.hidden = true;
    if (dok.fullscreenElement === lejatszo) dok.exitFullscreen?.();
  }

  /* ------------------------------------------------------------ Párbaj */
  let parbajPar = null;
  function parbajMutat() {
    const panel = $(".swipe-parbaj");
    let allapot = parbajBetolt(tarhely, azonosito);
    parbajPar = parValaszt(videok, allapot);
    const reszek = [
      elem(dok, "h2", "", "Párbaj — melyik a jobb?"),
      elem(dok, "p", "swipe-sugo", "Koppintás: hang be/ki. Választás: „Ez a jobb”, húzás, vagy ← / → billentyű. Az eredmény csak a rangsorba megy (ebben a böngészőben), a pontjaidat nem írja."),
    ];
    if (!parbajPar) {
      reszek.push(elem(dok, "p", "swipe-ures-szoveg", "A párbajhoz legalább két videó kell."));
      panel.replaceChildren(...reszek);
      return;
    }
    const par = elem(dok, "div", "swipe-parbaj-par");
    const valaszt = (gyoztes, vesztes) => {
      rezeg();
      allapot = parbajEredmeny(allapot, gyoztes.id, vesztes.id);
      parbajMent(tarhely, azonosito, allapot);
      parbajMutat();
    };
    parbajValaszt = (melyik) => valaszt(parbajPar[melyik], parbajPar[1 - melyik]);
    const videoElemek = [];
    parbajPar.forEach((sor, i) => {
      const fig = elem(dok, "figure", "swipe-parbaj-jelolt");
      const { mp4, poszter } = videoUtak(ugyfelUt + sor.utvonal);
      const v = dok.createElement("video");
      Object.assign(v, { poster: poszter, muted: true, loop: true, autoplay: true, playsInline: true, preload: "auto" });
      v.setAttribute("playsinline", "");
      v.setAttribute("muted", "");
      v.src = mp4;
      videoElemek.push(v);
      const cap = elem(dok, "figcaption", "", sor.cim);
      const jo = gomb(dok, "Ez a jobb ✓", "swipe-fo-gomb", () => valaszt(sor, parbajPar[1 - i]));
      fig.append(v, cap, jo);
      let kezdet = null;
      fig.addEventListener("pointerdown", (e) => {
        if (e.target.closest("button")) return;
        kezdet = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
        try { fig.setPointerCapture(e.pointerId); } catch { /* régi böngésző */ }
      });
      fig.addEventListener("pointermove", (e) => {
        if (!kezdet || e.pointerId !== kezdet.id) return;
        fig.style.transform = `translate(${e.clientX - kezdet.x}px, ${e.clientY - kezdet.y}px)`;
      });
      const vege = (e) => {
        if (!kezdet || e.pointerId !== kezdet.id) return;
        const dx = e.clientX - kezdet.x;
        const dy = e.clientY - kezdet.y;
        const ido = performance.now() - kezdet.t;
        kezdet = null;
        fig.style.transform = "";
        if (koppintas(dx, dy, ido)) {
          // egyszerre csak egy szól
          for (const masik of videoElemek) if (masik !== v) masik.muted = true;
          v.muted = !v.muted;
          return;
        }
        if (gesztusAllapot(dx, dy, { szelesseg: fig.clientWidth || 300, magassag: fig.clientHeight || 300 }).dont) valaszt(sor, parbajPar[1 - i]);
      };
      fig.addEventListener("pointerup", vege);
      fig.addEventListener("pointercancel", () => { kezdet = null; fig.style.transform = ""; });
      par.append(fig);
    });
    reszek.push(par, gomb(dok, "Kihagyom — új pár", "", () => parbajMutat()));
    const rangsor = eloLista(videok, allapot);
    if (rangsor.length) {
      const doboz = elem(dok, "section", "swipe-rangsor");
      doboz.append(elem(dok, "h3", "", "Rangsor (Elo)"));
      const ol = elem(dok, "ol");
      for (const r of rangsor) {
        const li = elem(dok, "li");
        li.append(elem(dok, "span", "", r.sor.cim), elem(dok, "span", "swipe-elo", `${Math.round(r.elo)} · ${r.db} párbaj`));
        ol.append(li);
      }
      doboz.append(ol, gomb(dok, "Rangsor nullázása", "swipe-halk", () => {
        if (!confirm("Törlöd a párbajok eredményét (csak ebben a böngészőben van)?")) return;
        parbajMent(tarhely, azonosito, {});
        parbajMutat();
      }));
      reszek.push(doboz);
    }
    panel.replaceChildren(...reszek);
  }
  let parbajValaszt = () => {};

  /* ------------------------------------------------------------ billentyűk */
  dok.addEventListener("keydown", (e) => {
    if (!nyitva || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest?.("input, textarea, select")) return;
    if (e.key === "Escape") {
      if (!lejatszo.hidden) lejatszoBezar();
      else if (!urlap.hidden) beallitasNyit(false);
      return;
    }
    if (!lejatszo.hidden) return;
    if (aktivFul === "parbaj" && parbajPar) {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); parbajValaszt(0); }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); parbajValaszt(1); }
      return;
    }
    if (aktivFul !== "pakli" || !urlap.hidden) return;
    const m = billentyuMuvelet(e.key);
    if (!m) return;
    e.preventDefault();
    const video = elolKartya()?.querySelector("video");
    if (IRANYOK.includes(m)) kirepul(m);
    else if (m === "vissza") vissza();
    else if (m === "lejatszas" && video) { if (video.paused) video.play().catch(() => {}); else video.pause(); }
    else if (m === "teljes" && video) teljesKepernyo(video);
  });

  /* ------------------------------------------------------------ indulás */
  // Teljes képernyőn a kártya videója vezérlőt kap (a kártyán nincs: ott a húzás a vezérlés).
  dok.addEventListener("fullscreenchange", () => {
    for (const v of szinpad.querySelectorAll("video")) v.controls = dok.fullscreenElement === v;
  });
  gombFeliratok();
  const pozicio = pozicioBetolt(tarhely, azonosito);
  mag = pozicio?.mag ?? ujMag();
  ujPakli(pozicio?.aktualisId ?? null);
  fulValt("pakli");

  return {
    elem: gyoker,
    megnyit() {
      nyitva = true;
      gyoker.hidden = false;
      dok.body.classList.add("swipe-nyitva");
      fulValt(aktivFul);
    },
    bezar() {
      nyitva = false;
      gyoker.hidden = true;
      dok.body.classList.remove("swipe-nyitva");
      lejatszoBezar();
      for (const v of gyoker.querySelectorAll("video")) v.pause();
    },
  };
}
