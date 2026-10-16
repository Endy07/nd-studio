/**
 * Swipe-értékelés az ADMIN ügyféloldalon — a DOM-rész (a logika: `swipe-logika.js`).
 *
 * Teljes képernyős réteg négy füllel: **Swipe** (a terv-pakli: húzás jobbra / fel / balra / le, gombok,
 * billentyűk, „vissza”, gyors indoklás-chipek, összesítő), **Párbaj** (két terv, „Ez a jobb” — Elo a böngésző
 * tárában, az admin pontot NEM írja), **Mi nyer?** (pontátlag címkénként, típusonként) és **Kedvencek** (a szuper
 * pontúak: videó sorban lejátszva, weboldal / kép lapozva). Az ügyféloldalra nem kerül: ott az ügyfél fájljába írna
 * (`ujraepites-ndart-video-kirakat.md` K3).
 *
 * Minden tervtípusra (2026-10-16 este, a felhasználó kérése: „ugyanilyen oldalt … a weboldalaknak is”):
 *  - **videó**: a videó maga (némítva, loopol; koppintás = hang);
 *  - **weboldal (HTML)**: a terv `index.html`-je iframe-ben, ASZTALI (1280 px) vagy MOBIL (390 px) szélességen
 *    renderelve és a kártyába kicsinyítve, lassú **bemutató-görgetéssel** (fent áll → le → lent áll → vissza). Egy
 *    átlátszó **takaró** fedi: amíg görget, a húzás a kártyáé. Koppintás / görgő / ⏸ → **kézi mód**: a takaró
 *    lekerül, az oldal kézzel görgethető; ilyenkor a kártya a fejlécén, az alján, a két szélső sávon és a gombjain
 *    húzható, ▶ visszaadja a bemutatót. A billentyűk a keretből is ide jutnak (azonos eredetű keret: `keydown`
 *    továbbítás). Nem elérhető keret (más eredet, hiba) → csendes visszaesés: statikus nézet, kézi görgetés;
 *  - **kép**: a kép-terv saját megjelenítője (`kep_terv.mini_html`: a kép `contain`) iframe-ben, kattintás nélkül.
 * Élő iframe csak az aktuális és a következő kártyán (`eloKeretek`); a harmadik `about:blank`.
 *
 * A mentés a hívóé: `mentPont(sor, pont)` és `mentJegyzet(sor, jegyzet)` — a meglévő admin-mentés (ugyanaz,
 * mint a kártyás nézet pontgombjaié és belső jegyzetéé), és a jelző szövegét adja vissza. Minden felhasználói
 * szöveg (cím, leírás, címke, megjegyzés) `textContent`-tel kerül ki.
 */

import {
  IRANYOK, IRANY_FELIRAT, SORRENDEK, TIPUSOK, billentyuMuvelet, eloKeretek, eloLista, elteltPoziciobol,
  elerhetoTipusok, epitPakli, ervenyesTipusok, folytatasIndex, gesztusAllapot, gorgetesCiklus, gorgetoAtmenet,
  jegyzetHozzafuz, kedvencek, keretMeretezes, keszitMenet, kimeno, koppintas, miNyer, normalBeallitas, parValaszt,
  parbajBetolt, parbajEredmeny, parbajMent, pozicioBetolt, pozicioMent, swipeBeallitasBetolt, swipeBeallitasMent,
  tervTipus, tipusFonev, tipusSorok, tipusSzerint, ujMag, vanCimke,
} from "./swipe-logika.js";
import { datumCsoportok, helyiNap } from "./datum-szuro.js";
import { cimkeCsoportok, keszitCimkek } from "./cimke-szuro.js";
import { keszitLeiras, teljesKepernyo, videoUtak } from "./ugyfel-video.js";

const IRANY_JEL = { jobbra: "♥", fel: "★", balra: "✕", le: "⓪" };
const CHIP_IDO_MS = 2500;
const KIREPULES_MS = 260;
const TIPUS_FELIRAT = Object.fromEntries(TIPUSOK.map((t) => [t.kulcs, t.felirat]));
// A weboldal-keret: a terv szkriptjei futnak (a kinézet megmarad), és AZONOS eredetű, hogy a bemutató-görgetés és a
// billentyű-továbbítás elérje. Űrlap, felugró ablak, a fő lap elnavigálása tiltott. (Az admin „Megnézem” linkje
// ugyanezt a tervet ugyanígy, azonos eredettel nyitja — új kitettség ezzel nem keletkezik; `rendszer.md` 16/v.)
const WEB_SANDBOX = "allow-scripts allow-same-origin";
// A kép-terv megjelenítője statikus HTML + egy kép: semmi joga nem kell.
const KEP_SANDBOX = "";

const atlagSzoveg = (szam) => szam.toLocaleString("hu-HU", { maximumFractionDigits: 1 });

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

function ujLapLink(dok, url, osztaly = "swipe-uj-lap") {
  const a = elem(dok, "a", osztaly, "↗");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  a.title = "Megnyitás új lapon";
  a.setAttribute("aria-label", "Megnyitás új lapon");
  return a;
}

/** Egy terv iframe-je (a forrás csak élesítéskor kerül rá: `keretEbreszt`). */
function ujKeret(dok, sor, url, osztaly) {
  const keret = elem(dok, "iframe", osztaly);
  keret.title = sor.cim;
  keret.loading = "lazy";
  keret.setAttribute("loading", "lazy");
  keret.setAttribute("sandbox", tervTipus(sor) === "kep" ? KEP_SANDBOX : WEB_SANDBOX);
  keret.dataset.src = url;
  return keret;
}

/** Az iframe kicsinyítése a dobozába (`keretMeretezes`); rejtett (0 méretű) doboznál nem nyúl hozzá. */
function illeszt(doboz, keret, eszkoz) {
  const szelesseg = doboz.clientWidth;
  const magassag = doboz.clientHeight;
  if (!szelesseg || !magassag) return;
  const m = keretMeretezes({ szelesseg, magassag, eszkoz });
  Object.assign(keret.style, {
    width: `${m.szelesseg}px`, height: `${m.magassag}px`, left: `${m.bal}px`, transform: `scale(${m.arany})`,
  });
}

/** Teljes képernyő egy keret-dobozra; ahol elemre nem kérhető (iPhone), CSS-es „teljes” réteg bezáró gombbal. */
function teljesDoboz(dok, doboz) {
  if (doboz.requestFullscreen || doboz.webkitRequestFullscreen) {
    try {
      const v = (doboz.requestFullscreen ?? doboz.webkitRequestFullscreen).call(doboz);
      v?.catch?.(() => {});
    } catch { /* nem engedte: marad a kártyán */ }
    return;
  }
  // A kártya `will-change: transform`-ja a `position: fixed`-et a kártyához kötné: ezért a KÁRTYA kapja az osztályt.
  const cel = doboz.closest(".swipe-kartya") ?? doboz;
  cel.classList.add("teljes");
  if (!doboz.querySelector(".swipe-teljes-bezar")) {
    doboz.append(gomb(dok, "✕ Bezárás", "swipe-teljes-bezar", (e) => {
      e.stopPropagation();
      cel.classList.remove("teljes");
      e.currentTarget.remove();
    }));
  }
}

/**
 * A swipe-réteg (vagy `null`, ha az ügyfélnek nincs kimenő terve). `{elem, megnyit, bezar}`.
 * `kilep()`: a réteg „✕ Kártyák” gombja (a hívó vált nézetet); `ugrik(id)`: az összesítőből a kártyás nézet
 * arra a tervre ugrik.
 */
export function keszitSwipe({
  dok = globalThis.document, sorok, azonosito, tarhely, ugyfelUt, mentPont, mentJegyzet,
  ugrik = () => {}, kilep = () => {}, ma = helyiNap(),
}) {
  if (!(sorok ?? []).some(kimeno)) return null;
  const elerheto = elerhetoTipusok(sorok);

  let beallitas = swipeBeallitasBetolt(tarhely, azonosito);
  let mag = 1;
  let menet = null;
  let cache = new Map();          // tervId → kártya-elem (az elöl álló + a következő kettő)
  const keretek = new WeakMap();  // kártya-elem → {keret, doboz, url, web, allapot, origo, …} (weboldal / kép)
  let hangBe = false;
  let foglalt = false;
  let nyitva = false;
  let aktivFul = "pakli";
  let chipIdozito = null;
  let animacio = null;
  let aktivKeret = null;          // a bemutató-görgetés alatt álló keret-állapot (az elöl álló weboldal-kártyáé)

  const tipusok = () => ervenyesTipusok(beallitas.tipusok, sorok);
  const fonev = (tobbes = false) => tipusFonev(tipusok(), { tobbes });
  const tervUt = (sor) => ugyfelUt + sor.utvonal;

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
    sorAdd("Típus", TIPUS_FELIRAT[tervTipus(sor)]);
    sorAdd("Készült", sor.keszult || "–");
    if (tervTipus(sor) !== "video") {
      const honnan = [sor.modell, sor.prompt].filter((x) => x && x !== "–").join(" · ");
      sorAdd("Honnan", honnan);
      sorAdd("Publikus", sor.publikus ? "igen" : "nem (az ügyfél nem látja)");
    }
    sorAdd("Pontom", typeof sor.enPont === "number" ? `${sor.enPont}/10` : "még nincs");
    sorAdd("Megjegyzésem", sor.enMegjegyzes);
    sorAdd("Belső jegyzetem", sor.enJegyzet);
    reszek.push(adatok);
    panel.replaceChildren(...reszek);
  }

  /** A minden típuson közös rész: bélyeg, fejléc (ℹ Részletek + a típus gombjai), alja (cím), részletek, húzás. */
  function kartyaKeret(k, sor, fejGombok, koppint) {
    const belyeg = elem(dok, "div", "swipe-belyeg");
    belyeg.setAttribute("aria-hidden", "true");
    const fej = elem(dok, "div", "swipe-kartya-fej");
    const reszletGomb = gomb(dok, "ℹ Részletek", "swipe-reszlet-gomb");
    reszletGomb.setAttribute("aria-expanded", "false");
    const jobb = elem(dok, "div", "swipe-fej-jobb");
    jobb.append(...fejGombok);
    fej.append(reszletGomb, jobb);
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
    k.append(belyeg, fej, alja, reszletek);
    kotHuzas(k, belyeg, koppint);
  }

  function keszitVideoKartya(sor) {
    const k = elem(dok, "article", "swipe-kartya video");
    k.dataset.id = sor.id;
    const { mp4, poszter } = videoUtak(tervUt(sor));
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
    const hang = elem(dok, "span", "swipe-hang", "🔇");
    hang.setAttribute("aria-hidden", "true");
    const nagyit = gomb(dok, "⛶", "swipe-nagyit", () => teljesKepernyo(video));
    nagyit.title = "Teljes képernyő (F)";
    nagyit.setAttribute("aria-label", "Teljes képernyő");
    k.append(video, hang);
    kartyaKeret(k, sor, [nagyit], () => {
      hangBe = !hangBe;
      hangAllit(video, k);
      if (video.paused) video.play().catch(() => {});
    });
    return k;
  }

  /** Weboldal- és kép-kártya: a terv iframe-je egy dobozban (weboldalon takaróval, szélső húzósávokkal, gombokkal). */
  function keszitKeretKartya(sor) {
    const web = tervTipus(sor) === "html";
    const k = elem(dok, "article", `swipe-kartya ${web ? "web" : "kep"}`);
    k.dataset.id = sor.id;
    const url = tervUt(sor);
    const doboz = elem(dok, "div", "swipe-keret-doboz");
    const keret = ujKeret(dok, sor, url, "swipe-keret");
    doboz.append(keret);
    const allapot = { keret, doboz, url, web, allapot: "tolt", origo: null, takaro: null, inditGomb: null, eszkozGomb: null };
    keretek.set(k, allapot);
    k.append(doboz);

    const nagyit = gomb(dok, "⛶", "swipe-nagyit", () => teljesDoboz(dok, doboz));
    nagyit.title = "Teljes képernyő (F)";
    nagyit.setAttribute("aria-label", "Teljes képernyő");
    const fejGombok = [];
    if (web) {
      const takaro = elem(dok, "div", "swipe-takaro");
      takaro.title = "Koppints: megállítod, és kézzel görgetheted";
      // a görgő a bemutatót megállítja, és a görgetést továbbadja a keretnek
      takaro.addEventListener("wheel", (e) => {
        erint(allapot);
        try { keret.contentWindow.scrollBy(0, e.deltaY); } catch { /* nem elérhető keret: marad a statikus nézet */ }
      }, { passive: true });
      doboz.append(takaro);
      for (const oldal of ["bal", "jobb"]) {
        const szel = elem(dok, "div", `swipe-szel ${oldal}`);
        szel.setAttribute("aria-hidden", "true");
        k.append(szel);
      }
      const indit = gomb(dok, "⏸", "swipe-indit", () => {
        if (allapot.allapot === "fut" || allapot.allapot === "tolt") erint(allapot);
        else inditas(allapot);
      });
      const eszkozGomb = gomb(dok, "", "swipe-eszkoz", () => eszkozValt(beallitas.eszkoz === "mobil" ? "asztali" : "mobil"));
      Object.assign(allapot, { takaro, inditGomb: indit, eszkozGomb });
      fejGombok.push(indit, eszkozGomb);
      keret.addEventListener("load", () => keretBetoltve(allapot));
    }
    fejGombok.push(ujLapLink(dok, url), nagyit);
    kartyaKeret(k, sor, fejGombok, (e) => { if (web && e.target === allapot.takaro) erint(allapot); });
    k.classList.toggle("mobil", web && beallitas.eszkoz === "mobil");
    keretRajzol(allapot);
    return k;
  }

  function keszitKartya(sor) {
    return tervTipus(sor) === "video" ? keszitVideoKartya(sor) : keszitKeretKartya(sor);
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

  /**
   * Húzás Pointer Events-szel (egér + érintés): követi az ujjat, dől, bélyeg; küszöb fölött kirepül. A kártya
   * minden olyan pontján indul, ami a kártyáé (videó, weboldal-takaró, fejléc, alja, szélső sávok) — az iframe-be
   * (kézi módban) lenyomott ujj a kereté, oda a kártya eseménye el sem jut.
   */
  function kotHuzas(k, belyeg, koppint) {
    let kezdet = null;
    const meret = () => ({ szelesseg: k.clientWidth || 360, magassag: k.clientHeight || 640 });
    k.addEventListener("pointerdown", (e) => {
      if (!k.classList.contains("elol") || foglalt) return;
      if (e.target.closest("button, a, .swipe-reszletek")) return;
      if (e.button !== undefined && e.button !== 0) return;
      kezdet = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, cel: e.target };
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
      const cel = kezdet.cel;
      kezdet = null;
      k.classList.remove("huzas");
      if (!megszakitva && koppintas(dx, dy, ido)) {
        k.style.transform = "";
        koppint({ target: cel });
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

  /* ------------------------------------------------------------ weboldal-keret: élet, méret, bemutató-görgetés */
  function keretRajzol(a) {
    if (!a.web) return;
    const k = a.doboz.parentElement;
    const takaroKell = a.allapot === "fut" || a.allapot === "tolt";
    a.takaro.hidden = !takaroKell;
    k?.classList.toggle("kezi", !takaroKell);
    a.inditGomb.hidden = a.allapot === "statikus";
    const fut = a.allapot === "fut" || a.allapot === "tolt";
    a.inditGomb.textContent = fut ? "⏸" : "▶";
    a.inditGomb.title = fut ? "Bemutató megállítása — utána kézzel görgethető (Szóköz)" : "Bemutató-görgetés indítása (Szóköz)";
    a.inditGomb.setAttribute("aria-label", fut ? "Bemutató megállítása" : "Bemutató indítása");
    const mobil = beallitas.eszkoz === "mobil";
    a.eszkozGomb.textContent = mobil ? "🖥" : "📱";
    a.eszkozGomb.title = mobil ? "Asztali nézet (1280 px)" : "Mobil nézet (390 px)";
    a.eszkozGomb.setAttribute("aria-label", a.eszkozGomb.title);
  }

  function erint(a) {
    a.allapot = gorgetoAtmenet(a.allapot, "erintes");
    a.origo = null;
    keretRajzol(a);
  }

  function inditas(a) {
    a.allapot = gorgetoAtmenet(a.allapot, "inditas");
    a.origo = null;
    keretRajzol(a);
  }

  /** Betöltés után: elérhető-e (azonos eredet), és ha igen, a keretből jövő érintés / billentyű ide fut be. */
  function keretBetoltve(a) {
    if (a.keret.getAttribute("src") !== a.url) return;   // az `about:blank` (alvó) betöltése
    let elerheto = false;
    try {
      const belso = a.keret.contentDocument;
      elerheto = Boolean(belso?.documentElement);
      if (elerheto) {
        const megall = () => { if (a.allapot === "fut") erint(a); };
        belso.addEventListener("pointerdown", megall, { passive: true });
        belso.addEventListener("wheel", megall, { passive: true });
        belso.addEventListener("touchstart", megall, { passive: true });
        belso.addEventListener("keydown", billentyu);
      }
    } catch {
      elerheto = false;
    }
    a.allapot = gorgetoAtmenet(a.allapot, "betoltve", { elerheto, mozgasCsokkentett: csokkentettMozgas() });
    a.origo = null;
    keretRajzol(a);
  }

  /** Élesítés / altatás (`eloKeretek`): az alvó keret `about:blank` — nem tölt, nem fut benne szkript. */
  function keretEbreszt(a) {
    if (a.keret.getAttribute("src") === a.url) return;
    a.allapot = "tolt";
    a.origo = null;
    a.keret.setAttribute("src", a.url);
    keretRajzol(a);
  }
  function keretAltat(a) {
    if (a.keret.getAttribute("src") === "about:blank" || !a.keret.hasAttribute("src")) return;
    a.keret.setAttribute("src", "about:blank");
    a.allapot = "tolt";
    keretRajzol(a);
  }

  function meretez(k) {
    const a = keretek.get(k);
    if (a?.web) illeszt(a.doboz, a.keret, beallitas.eszkoz);
  }
  function meretezMind() {
    for (const k of cache.values()) meretez(k);
    for (const p of parbajKeretek) illeszt(p.doboz, p.keret, beallitas.eszkoz);
  }

  function eszkozValt(eszkoz) {
    beallitas = normalBeallitas({ ...beallitas, eszkoz });
    swipeBeallitasMent(tarhely, azonosito, beallitas);
    eszkozAlkalmaz();
    statusz.textContent = eszkoz === "mobil" ? "Mobil nézet (390 px)." : "Asztali nézet (1280 px).";
    const mezo = urlap.querySelector("[name=eszkoz]");
    if (mezo) mezo.value = eszkoz;
  }
  function eszkozAlkalmaz() {
    for (const k of cache.values()) {
      const a = keretek.get(k);
      if (!a?.web) continue;
      k.classList.toggle("mobil", beallitas.eszkoz === "mobil");
      a.origo = null;
      keretRajzol(a);
    }
    meretezMind();
    if (aktivFul === "parbaj") parbajMutat(parbajPar);
  }

  /** Egy képkocka: csak az ELÖL álló weboldal-kártya görget, és csak ha látszik és senki nem nyúl hozzá. */
  function lep(most) {
    animacio = null;
    if (!nyitva) return;
    const k = elolKartya();
    const a = k ? keretek.get(k) : null;
    if (aktivKeret && aktivKeret !== a) aktivKeret.origo = null;
    aktivKeret = a?.web ? a : null;
    const mehet = aktivKeret && aktivKeret.allapot === "fut" && aktivFul === "pakli" && !foglalt
      && !k.classList.contains("huzas") && lejatszo.hidden && urlap.hidden && !dok.hidden;
    if (mehet) {
      try {
        const ablak = aktivKeret.keret.contentWindow;
        const lap = ablak.document.scrollingElement ?? ablak.document.documentElement;
        const tavolsag = lap.scrollHeight - ablak.innerHeight;
        if (aktivKeret.origo === null) aktivKeret.origo = most - elteltPoziciobol(ablak.scrollY, tavolsag);
        const { y } = gorgetesCiklus(most - aktivKeret.origo, tavolsag);
        if (Math.abs(ablak.scrollY - y) >= 1) {
          // „instant”: a terv saját `scroll-behavior: smooth`-ja minden képkockán lemaradó animációt indítana
          try { ablak.scrollTo({ top: y, left: 0, behavior: "instant" }); } catch { ablak.scrollTo(0, y); }
        }
      } catch {
        aktivKeret.allapot = gorgetoAtmenet(aktivKeret.allapot, "hiba");
        keretRajzol(aktivKeret);
      }
    } else if (aktivKeret) {
      aktivKeret.origo = null;   // ha újra mehet, onnan folytatja, ahol a lap most áll
    }
    animacio = globalThis.requestAnimationFrame?.(lep) ?? null;
  }
  function animacioIndit() {
    if (animacio === null && globalThis.requestAnimationFrame) animacio = globalThis.requestAnimationFrame(lep);
  }
  function animacioAll() {
    if (animacio !== null) globalThis.cancelAnimationFrame?.(animacio);
    animacio = null;
  }

  /* ------------------------------------------------------------ pakli */
  function elolKartya() {
    const sor = menet?.aktualis();
    return sor ? cache.get(sor.id) ?? null : null;
  }

  function kartyaLeallit(k) {
    const v = k.querySelector("video");
    if (v) {
      v.pause();
      v.removeAttribute("src");   // ne töltsön tovább a háttérben
      try { v.load(); } catch { /* hamis DOM */ }
    }
    const a = keretek.get(k);
    if (a) {
      a.keret.setAttribute("src", "about:blank");
      if (aktivKeret === a) aktivKeret = null;
    }
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
      if (!uj.has(id)) { kartyaLeallit(k); k.remove(); }
    }
    cache = uj;
    // Az új kártyák a meglévők ALÁ kerülnek (a sorrendet a z-index adja), a lejátszó videót nem mozgatjuk.
    for (const k of uj.values()) if (!k.isConnected) szinpad.prepend(k);
    for (const vege of szinpad.querySelectorAll(".swipe-ures, .swipe-vege")) vege.remove();

    // Élő iframe csak az elöl álló és a következő kártyán; a harmadik alszik (`about:blank`).
    const { eles } = eloKeretek(lathato.map((s) => s.id));
    for (const [id, k] of uj) {
      const a = keretek.get(k);
      if (!a) continue;
      if (eles.includes(id)) keretEbreszt(a);
      else keretAltat(a);
      meretez(k);
    }

    gombSor.hidden = false;
    for (const g of Object.values(iranyGombok)) g.disabled = menet.vege();
    if (!menet.hossz) { uresUzenet(); return; }
    if (menet.vege()) { osszesitoMutat(); return; }

    uj.forEach((k, id) => {
      const v = k.querySelector("video");
      if (!v) return;
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
      elem(dok, "h2", "", `Nincs ilyen ${fonev()}`),
      elem(dok, "p", "", beallitas.csakErtekeletlen
        ? `Minden ${fonev()}t értékeltél, ami a szűrőnek megfelel. A ⚙ beállításokban válts „Mind”-ra, vagy lazíts a szűrőn.`
        : `A szűrő egyetlen ${fonev()}t sem enged át. Lazíts rajta a ⚙ beállításokban.`),
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
    for (const k of cache.values()) { kartyaLeallit(k); k.remove(); }
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
    return JSON.stringify([ervenyesTipusok(b.tipusok, sorok), b.sorrend, b.csakErtekeletlen, b.datum, b.cimke]);
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

  function jelolo(nev, ertek, felirat, bejelolve) {
    const be = dok.createElement("input");
    Object.assign(be, { type: "checkbox", name: nev, value: ertek, checked: bejelolve });
    const l = elem(dok, "label", "swipe-jelolo");
    l.append(be, elem(dok, "span", "", felirat));
    return l;
  }

  function epitUrlap() {
    const reszek = [elem(dok, "h2", "", "Beállítások")];
    const valasztott = tipusok();
    if (elerheto.length > 1) {
      const tipusDoboz = elem(dok, "fieldset", "swipe-tipusok");
      tipusDoboz.append(elem(dok, "legend", "", "Mi jöjjön fel (több is választható)"));
      for (const kulcs of elerheto) {
        const db = sorok.filter((s) => tervTipus(s) === kulcs).length;
        tipusDoboz.append(jelolo("tipus", kulcs, `${TIPUS_FELIRAT[kulcs]} (${db})`, valasztott.includes(kulcs)));
      }
      reszek.push(tipusDoboz);
    }
    if (valasztott.includes("html")) {
      reszek.push(mezo("Weboldal nézet", valaszto("eszkoz", [["asztali", "Asztali (1280 px, kicsinyítve)"], ["mobil", "Mobil (390 px)"]], beallitas.eszkoz)));
    }
    const szurheto = tipusSorok(sorok, valasztott);
    reszek.push(mezo("Sorrend", valaszto("sorrend", SORRENDEK.map((s) => [s.kulcs, s.felirat]), beallitas.sorrend)));
    reszek.push(mezo(`Mely ${fonev(true)}`, valaszto("csak", [["1", "Csak a még nem értékeltek"], ["0", "Mind"]], beallitas.csakErtekeletlen ? "1" : "0")));
    const datumok = datumCsoportok(szurheto, ma);
    if (datumok.length > 2) {
      reszek.push(mezo("Készült", valaszto("datum", datumok.map((c) => [c.kulcs, `${c.felirat} (${c.db})`]), beallitas.datum)));
    }
    for (const cs of cimkeCsoportok(szurheto)) {
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
    if (valasztott.includes("video")) {
      reszek.push(jelolo("vegenTovabb", "on", "A videó végén automatikusan tovább (pont nélkül)", beallitas.vegenTovabb));
    }
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
      // ha a típus-jelölők nincsenek kint (egy típus), a régi választás marad
      tipusok: urlap.querySelector("[name=tipus]") ? adat.getAll("tipus") : beallitas.tipusok,
      eszkoz: adat.get("eszkoz") ?? beallitas.eszkoz,
      sorrend: adat.get("sorrend"),
      csakErtekeletlen: adat.get("csak") === "1",
      datum: adat.get("datum") ?? "mind",
      cimke,
      pontok,
      vegenTovabb: urlap.querySelector("[name=vegenTovabb]") ? adat.get("vegenTovabb") === "on" : beallitas.vegenTovabb,
      chipek: String(adat.get("chipek") ?? ""),
    });
  }

  urlap.addEventListener("submit", (e) => { e.preventDefault(); beallitasNyit(false); });
  urlap.addEventListener("change", () => {
    const regi = beallitas;
    beallitas = urlapOlvas();
    swipeBeallitasMent(tarhely, azonosito, beallitas);
    gombFeliratok();
    for (const k of cache.values()) {
      const v = k.querySelector("video");
      if (v) v.loop = !beallitas.vegenTovabb;
    }
    if (regi.eszkoz !== beallitas.eszkoz) eszkozAlkalmaz();
    const tipusValtozott = JSON.stringify(ervenyesTipusok(regi.tipusok, sorok)) !== JSON.stringify(tipusok());
    if (tipusValtozott) epitUrlap();   // a dátum- és címke-csoportok a választott típusokból jönnek
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
    if (ful !== "parbaj") parbajUrit();
    if (ful === "pakli" && nyitva && menet && !menet.vege()) elolKartya()?.querySelector("video")?.play().catch(() => {});
    if (ful === "pakli") meretezMind();
    if (ful === "parbaj") parbajMutat();
    if (ful === "statisztika") statMutat();
    if (ful === "kedvencek") kedvencekMutat();
  }
  for (const g of fulGombok) g.addEventListener("click", () => fulValt(g.dataset.ful));
  $(".swipe-kilep").addEventListener("click", () => kilep());

  /* ------------------------------------------------------------ Mi nyer? */
  function statSor(e) {
    const sor = elem(dok, "div", "swipe-stat-sor" + (e.bizonytalan ? " bizonytalan" : ""));
    const sav = elem(dok, "div", "swipe-stat-sav");
    const kitoltes = elem(dok, "span");
    kitoltes.style.width = `${Math.max(2, e.atlag * 10)}%`;
    sav.append(kitoltes);
    sor.append(elem(dok, "span", "swipe-stat-nev", e.felirat), sav, elem(dok, "span", "swipe-stat-szam", `${atlagSzoveg(e.atlag)} · ${e.db} db`));
    if (e.bizonytalan) sor.title = `Csak ${e.db} pontból — még nem biztos.`;
    return sor;
  }

  function statCsoport(nev, ertekek) {
    const doboz = elem(dok, "section", "swipe-stat-csoport");
    doboz.append(elem(dok, "h3", "", nev), ...ertekek.map(statSor));
    return doboz;
  }

  function statMutat() {
    const panel = $(".swipe-stat");
    const csoportok = miNyer(sorok, tipusok());
    const tipusonkent = tipusSzerint(sorok);
    const reszek = [
      elem(dok, "h2", "", "Mi nyer?"),
      elem(dok, "p", "swipe-sugo", `A pontjaid átlaga címkénként — csak az értékelt ${fonev(true)} számítanak. Halvány: 3-nál kevesebb pontból, még nem biztos.`),
    ];
    if (!vanCimke(sorok)) {
      reszek[1].textContent = "Ehhez az ügyfélhez nincsenek címkék — címke szerinti összevetés nincs. Helyette a pontjaid átlaga típus szerint (halvány: 3-nál kevesebb pontból).";
      if (tipusonkent.length) reszek.push(statCsoport("Típus", tipusonkent));
      else reszek.push(elem(dok, "p", "swipe-ures-szoveg", "Még nincs pontozott terv. A Swipe fülön húzz el néhányat, és itt látod az átlagot."));
      panel.replaceChildren(...reszek);
      return;
    }
    if (!csoportok.length) {
      reszek.push(elem(dok, "p", "swipe-ures-szoveg", `Még nincs mit összevetni: ehhez pontozott ${fonev(true)} kellenek olyan címke-csoportban, amelynek legalább két értéke van.`));
    }
    for (const cs of csoportok) reszek.push(statCsoport(cs.nev, cs.ertekek));
    // típus szerint akkor, ha van mit összevetni (legalább két típus pontozott)
    if (tipusonkent.length > 1) reszek.push(statCsoport("Típus", tipusonkent));
    panel.replaceChildren(...reszek);
  }

  /* ------------------------------------------------------------ Kedvencek: videó sorban lejátszva, weboldal / kép lapozva */
  function kedvencekMutat() {
    const panel = $(".swipe-kedvencek");
    const lista = kedvencek(sorok, beallitas);
    const reszek = [elem(dok, "h2", "", `Kedvencek — ${beallitas.pontok.fel} pontos ${fonev(true)} (${lista.length})`)];
    if (!lista.length) {
      reszek.push(elem(dok, "p", "swipe-ures-szoveg", `Még nincs ${beallitas.pontok.fel} pontos ${fonev()}. A Swipe fülön húzz felfelé egyet (★ SZUPER).`));
    } else {
      const csakVideo = lista.every((s) => tervTipus(s) === "video");
      reszek.push(gomb(dok, csakVideo ? "▶ Lejátszás sorban" : "▶ Lapozás", "swipe-fo-gomb", () => sorbanLejatszik(lista, 0)));
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

  let lejatszoLep = () => {};
  function sorbanLejatszik(lista, kezdo) {
    let i = kezdo;
    const felirat = elem(dok, "p", "swipe-lejatszo-cim");
    const hely = elem(dok, "div", "swipe-lejatszo-hely");
    const ujLap = ujLapLink(dok, "#", "swipe-lejatszo-uj-lap");
    ujLap.textContent = "↗ Új lapon";
    const tolt = () => {
      const sor = lista[i];
      const regi = hely.querySelector("video");
      if (regi) { regi.pause(); regi.removeAttribute("src"); }
      ujLap.href = tervUt(sor);
      felirat.textContent = `${i + 1} / ${lista.length} — ${sor.cim}`;
      if (tervTipus(sor) === "video") {
        const video = dok.createElement("video");
        Object.assign(video, { controls: true, autoplay: true, playsInline: true, preload: "auto" });
        video.setAttribute("playsinline", "");
        const { mp4, poszter } = videoUtak(tervUt(sor));
        video.poster = poszter;
        video.src = mp4;
        video.addEventListener("ended", () => {
          if (i < lista.length - 1) lepes(1);
          else felirat.textContent = `Vége — ${lista.length} kedvenc lejátszva.`;
        });
        hely.replaceChildren(video);
        video.play().catch(() => {});
      } else {
        // weboldal / kép: lapozó nézet, a keret teljes méretben, kézzel görgethető (nincs automatikus továbblépés)
        const keret = ujKeret(dok, sor, tervUt(sor), "swipe-lejatszo-keret");
        keret.removeAttribute("loading");
        keret.addEventListener("load", () => {
          try { keret.contentDocument?.addEventListener("keydown", billentyu); } catch { /* más eredet: a billentyű a keretben marad */ }
        });
        keret.setAttribute("src", tervUt(sor));
        hely.replaceChildren(keret);
      }
    };
    const lepes = (d) => { i = Math.min(lista.length - 1, Math.max(0, i + d)); tolt(); };
    lejatszoLep = lepes;
    const fej = elem(dok, "div", "swipe-lejatszo-fej");
    fej.append(
      gomb(dok, "⏮ Előző", "", () => lepes(-1)),
      gomb(dok, "Következő ⏭", "", () => lepes(1)),
      // a csomagoló megy teljes képernyőre, nem a videó: így a következő terv is teljes képernyőn marad
      gomb(dok, "⛶ Teljes képernyő", "", () => teljesKepernyo(lejatszo)),
      ujLap,
      gomb(dok, "✕ Bezárás", "bezar", () => lejatszoBezar()),
    );
    lejatszo.replaceChildren(fej, hely, felirat);
    lejatszo.hidden = false;
    tolt();
  }

  function lejatszoBezar() {
    const v = lejatszo.querySelector("video");
    if (v) { v.pause(); v.removeAttribute("src"); }
    lejatszo.replaceChildren();
    lejatszo.hidden = true;
    lejatszoLep = () => {};
    if (dok.fullscreenElement === lejatszo) dok.exitFullscreen?.();
  }

  /* ------------------------------------------------------------ Párbaj */
  let parbajPar = null;
  const parbajKeretek = new Set();   // {doboz, keret} — a weboldal-jelöltek kicsinyítéséhez (átméretezéskor újra)

  function parbajUrit() {
    for (const v of gyoker.querySelectorAll(".swipe-parbaj video")) v.pause();
    for (const p of parbajKeretek) p.keret.setAttribute("src", "about:blank");
    parbajKeretek.clear();
  }

  /** `megtart`: ugyanaz a pár (pl. eszköz-váltás után) — különben új pár. */
  function parbajMutat(megtart = null) {
    const panel = $(".swipe-parbaj");
    parbajUrit();
    let allapot = parbajBetolt(tarhely, azonosito);
    const jeloltek = tipusSorok(sorok, tipusok());
    parbajPar = megtart && megtart.every((s) => jeloltek.includes(s)) ? megtart : parValaszt(jeloltek, allapot);
    const reszek = [
      elem(dok, "h2", "", "Párbaj — melyik a jobb?"),
      elem(dok, "p", "swipe-sugo", "Választás: „Ez a jobb”, húzás, vagy ← / → billentyű; videón koppintás = hang be/ki. Az eredmény csak a rangsorba megy (ebben a böngészőben), a pontjaidat nem írja."),
    ];
    if (!parbajPar) {
      reszek.push(elem(dok, "p", "swipe-ures-szoveg", `A párbajhoz legalább két ${fonev()} kell.`));
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
    const ujKeretek = [];
    parbajPar.forEach((sor, i) => {
      const tipus = tervTipus(sor);
      const fig = elem(dok, "figure", `swipe-parbaj-jelolt ${tipus}`);
      let media;
      if (tipus === "video") {
        const { mp4, poszter } = videoUtak(tervUt(sor));
        media = dok.createElement("video");
        Object.assign(media, { poster: poszter, muted: true, loop: true, autoplay: true, playsInline: true, preload: "auto" });
        media.setAttribute("playsinline", "");
        media.setAttribute("muted", "");
        media.src = mp4;
        videoElemek.push(media);
      } else {
        // kicsinyített, NEM interaktív keret (a húzás és a koppintás a jelölté); megnézni: ↗
        media = elem(dok, "div", `swipe-parbaj-keret${tipus === "html" && beallitas.eszkoz === "mobil" ? " mobil" : ""}`);
        const keret = ujKeret(dok, sor, tervUt(sor), "swipe-keret");
        keret.removeAttribute("loading");
        keret.setAttribute("tabindex", "-1");
        media.append(keret);
        if (tipus === "html") ujKeretek.push({ doboz: media, keret });
        keret.setAttribute("src", tervUt(sor));
      }
      const cap = elem(dok, "figcaption", "", sor.cim);
      if (tipus !== "video") cap.append(" ", ujLapLink(dok, tervUt(sor)));
      const jo = gomb(dok, "Ez a jobb ✓", "swipe-fo-gomb", () => valaszt(sor, parbajPar[1 - i]));
      fig.append(media, cap, jo);
      let kezdet = null;
      fig.addEventListener("pointerdown", (e) => {
        if (e.target.closest("button, a")) return;
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
          if (tipus !== "video") return;
          // egyszerre csak egy szól
          for (const masik of videoElemek) if (masik !== media) masik.muted = true;
          media.muted = !media.muted;
          return;
        }
        if (gesztusAllapot(dx, dy, { szelesseg: fig.clientWidth || 300, magassag: fig.clientHeight || 300 }).dont) valaszt(sor, parbajPar[1 - i]);
      };
      fig.addEventListener("pointerup", vege);
      fig.addEventListener("pointercancel", () => { kezdet = null; fig.style.transform = ""; });
      par.append(fig);
    });
    reszek.push(par, gomb(dok, "Kihagyom — új pár", "", () => parbajMutat()));
    const rangsor = eloLista(jeloltek, allapot);
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
    for (const p of ujKeretek) { parbajKeretek.add(p); illeszt(p.doboz, p.keret, beallitas.eszkoz); }
  }
  let parbajValaszt = () => {};

  /* ------------------------------------------------------------ billentyűk (a weboldal-keretből is ide futnak) */
  function billentyu(e) {
    if (!nyitva || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target?.closest?.("input, textarea, select, [contenteditable=''], [contenteditable=true]")) return;
    if (e.key === "Escape") {
      if (!lejatszo.hidden) lejatszoBezar();
      else if (!urlap.hidden) beallitasNyit(false);
      return;
    }
    if (!lejatszo.hidden) {
      if (e.key === "ArrowLeft") { e.preventDefault(); lejatszoLep(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); lejatszoLep(1); }
      return;
    }
    if (aktivFul === "parbaj" && parbajPar) {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); parbajValaszt(0); }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); parbajValaszt(1); }
      return;
    }
    if (aktivFul !== "pakli" || !urlap.hidden) return;
    const m = billentyuMuvelet(e.key);
    if (!m) return;
    e.preventDefault();
    const k = elolKartya();
    const video = k?.querySelector("video");
    const a = k ? keretek.get(k) : null;
    if (IRANYOK.includes(m)) kirepul(m);
    else if (m === "vissza") vissza();
    else if (m === "lejatszas" && video) { if (video.paused) video.play().catch(() => {}); else video.pause(); }
    else if (m === "lejatszas" && a?.web) { if (a.allapot === "kezi") inditas(a); else erint(a); }
    else if (m === "teljes" && video) teljesKepernyo(video);
    else if (m === "teljes" && a) teljesDoboz(dok, a.doboz);
  }
  dok.addEventListener("keydown", billentyu);

  /* ------------------------------------------------------------ indulás */
  // Teljes képernyőn a kártya videója vezérlőt kap (a kártyán nincs: ott a húzás a vezérlés).
  dok.addEventListener("fullscreenchange", () => {
    for (const v of szinpad.querySelectorAll("video")) v.controls = dok.fullscreenElement === v;
  });
  // A kicsinyítés a doboz méretéből jön: ablak- / tájolásváltáskor újra.
  if (globalThis.ResizeObserver) new globalThis.ResizeObserver(() => meretezMind()).observe(szinpad);
  globalThis.addEventListener?.("resize", () => meretezMind());
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
      meretezMind();
      animacioIndit();
    },
    bezar() {
      nyitva = false;
      gyoker.hidden = true;
      dok.body.classList.remove("swipe-nyitva");
      animacioAll();
      lejatszoBezar();
      for (const v of gyoker.querySelectorAll("video")) v.pause();
    },
  };
}

