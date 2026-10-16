/**
 * Swipe-értékelés (Tinder-szerű terv-pakli az ADMIN ügyféloldalon) — a tiszta logika: se DOM, se hálózat.
 * A felhasználó kérése (2026-10-16): „ugyanígy kártyaszerűen feljönnek az elkészített videók, csak úgy, mint a
 * Tinderen … jobbra vagy balra kell húznom, vagy esetleg felfelé, ha szuperlájkolom, lefelé, ha nullást adok neki”.
 * Ugyanaznap: „Tudnál egy ugyanilyen oldalt csinálni a weboldalaknak is, az ügyfél weboldalaknak?” — azóta a pakli
 * MINDEN tervtípusra épül (weboldal / kép / videó, `TIPUSOK`), és itt él a weboldal-kártya keretének méretezése, az
 * élő keretek (előtöltés) és a bemutató-görgetés állapotgépe is.
 *
 * Itt él: a beállítások (alapértékek, normalizálás, hibatűrő tár), a pakli építése (szűrők, sorrend, csak az
 * értékeletlenek), a gesztus-döntés (elmozdulás → irány/küszöb), a menet (döntések, „vissza”, összesítő),
 * a folytatási pozíció, a „Mi nyer?” statisztika, a gyors indoklás (chip → belső jegyzet), a kedvencek és a
 * párbaj (Elo, párosítás). A DOM-rész: `admin-swipe.js`. A pontot NEM ez menti: a hívó a meglévő admin-mentést
 * hívja (`admin-ugyfel.js` `mentes`), ugyanazt, mint a kártyás nézet pontgombjai.
 *
 * A szűrés a dátum- és a címke-szűrő SAJÁT logikáját használja (ugyanazok a csoportok, ugyanaz az illesztés).
 */

import { datumCsoportok, ervenyesKulcs, keszultNap, lathato } from "./datum-szuro.js";
import { cimkeCsoportok, cimkeLathato, cimkeLista, ervenyesValasztas } from "./cimke-szuro.js";

export const IRANYOK = ["jobbra", "fel", "balra", "le"];
export const IRANY_FELIRAT = { jobbra: "TETSZIK", fel: "SZUPER", balra: "NEM", le: "NULLA" };
export const SORRENDEK = [
  { kulcs: "veletlen", felirat: "Véletlen" },
  { kulcs: "uj", felirat: "Legújabb elöl" },
  { kulcs: "regi", felirat: "Legrégebbi elöl" },
];
export const ALAP_CHIPEK = ["túl lassú", "jó nyitás", "gyenge vége", "zsúfolt", "szép", "rossz hang"];

/** A pakli tervtípusai (a terv `tipus` mezője: üres = weboldal, `kep`, `video`), a felület sorrendjében. */
export const TIPUSOK = [
  { kulcs: "html", felirat: "Weboldal (HTML)", fonev: "weboldal", tobbes: "weboldalak" },
  { kulcs: "kep", felirat: "Kép", fonev: "kép", tobbes: "képek" },
  { kulcs: "video", felirat: "Videó", fonev: "videó", tobbes: "videók" },
];
const TIPUS_KULCSOK = TIPUSOK.map((t) => t.kulcs);

/** Weboldal-kártya: asztali (1280 px széles, a kártyába kicsinyítve) vagy mobil (390 px) nézet. */
export const ESZKOZOK = Object.freeze({ asztali: 1280, mobil: 390 });

export const SWIPE_ALAP = Object.freeze({
  // `null` = „ami az ügyfélnél van” (`alapTipusok`): videós ügyfélnél csak a videók, mint eddig.
  tipusok: null,
  eszkoz: "asztali",
  sorrend: "veletlen",
  csakErtekeletlen: true,
  datum: "mind",
  cimke: {},
  pontok: { jobbra: 7, fel: 10, balra: 3, le: 0 },
  vegenTovabb: false,
  chipek: ALAP_CHIPEK,
});

export const SWIPE_KULCS_ELOTAG = "nd-studio:swipe:";
export const POZICIO_KULCS_ELOTAG = "nd-studio:swipe-pozicio:";
export const PARBAJ_KULCS_ELOTAG = "nd-studio:parbaj:";

const CHIP_MAX_DB = 12;
const CHIP_MAX_HOSSZ = 30;

function pontErtek(ertek, alap) {
  const szam = typeof ertek === "string" && ertek.trim() !== "" ? Number(ertek) : ertek;
  return Number.isInteger(szam) && szam >= 0 && szam <= 10 ? szam : alap;
}

/** A chip-lista: levágott, nem üres, ismétlés nélküli rövid szövegek; szövegből vesszővel bontva is. */
export function chipLista(ertek) {
  const nyers = typeof ertek === "string" ? ertek.split(",") : ertek;
  if (!Array.isArray(nyers)) return [];
  const latott = new Set();
  const lista = [];
  for (const elem of nyers) {
    if (typeof elem !== "string") continue;
    const tiszta = elem.trim().slice(0, CHIP_MAX_HOSSZ);
    if (!tiszta || latott.has(tiszta.toLocaleLowerCase("hu"))) continue;
    latott.add(tiszta.toLocaleLowerCase("hu"));
    lista.push(tiszta);
    if (lista.length >= CHIP_MAX_DB) break;
  }
  return lista;
}

/** Bármilyen (régi, sérült, kézzel írt) beállításból teljes, érvényes beállítás; minden hibás mező → alapérték. */
export function normalBeallitas(nyers) {
  const f = nyers && typeof nyers === "object" && !Array.isArray(nyers) ? nyers : {};
  const pontok = {};
  for (const irany of IRANYOK) pontok[irany] = pontErtek(f.pontok?.[irany], SWIPE_ALAP.pontok[irany]);
  const cimke = {};
  if (f.cimke && typeof f.cimke === "object" && !Array.isArray(f.cimke)) {
    for (const [k, v] of Object.entries(f.cimke)) if (typeof v === "string") cimke[k] = v;
  }
  const chipek = Array.isArray(f.chipek) || typeof f.chipek === "string" ? chipLista(f.chipek) : [...ALAP_CHIPEK];
  const tipusok = Array.isArray(f.tipusok) ? TIPUS_KULCSOK.filter((k) => f.tipusok.includes(k)) : [];
  return {
    tipusok: tipusok.length ? tipusok : null,
    eszkoz: typeof f.eszkoz === "string" && Object.hasOwn(ESZKOZOK, f.eszkoz) ? f.eszkoz : SWIPE_ALAP.eszkoz,
    sorrend: SORRENDEK.some((s) => s.kulcs === f.sorrend) ? f.sorrend : SWIPE_ALAP.sorrend,
    csakErtekeletlen: typeof f.csakErtekeletlen === "boolean" ? f.csakErtekeletlen : SWIPE_ALAP.csakErtekeletlen,
    datum: typeof f.datum === "string" && f.datum ? f.datum : SWIPE_ALAP.datum,
    cimke,
    pontok,
    vegenTovabb: typeof f.vegenTovabb === "boolean" ? f.vegenTovabb : SWIPE_ALAP.vegenTovabb,
    chipek,
  };
}

/** A tár hibája (privát ablak, tiltott tár, sérült JSON) sosem dob: a beállítás csak kényelmi. */
function jsonBetolt(tarhely, kulcs) {
  try {
    const nyers = tarhely?.getItem(kulcs);
    return nyers ? JSON.parse(nyers) : null;
  } catch {
    return null;
  }
}
function jsonMent(tarhely, kulcs, ertek) {
  try {
    tarhely?.setItem(kulcs, JSON.stringify(ertek));
    return true;
  } catch {
    return false;
  }
}

export function swipeBeallitasBetolt(tarhely, azonosito) {
  return normalBeallitas(jsonBetolt(tarhely, SWIPE_KULCS_ELOTAG + azonosito));
}
export function swipeBeallitasMent(tarhely, azonosito, beallitas) {
  return jsonMent(tarhely, SWIPE_KULCS_ELOTAG + azonosito, normalBeallitas(beallitas));
}

/** Folytatás: a pakli magja és az aktuális kártya azonosítója. Hibás tárnál `null` (új pakli). */
export function pozicioBetolt(tarhely, azonosito) {
  const p = jsonBetolt(tarhely, POZICIO_KULCS_ELOTAG + azonosito);
  if (!p || typeof p !== "object" || !Number.isInteger(p.mag)) return null;
  return { mag: p.mag, aktualisId: typeof p.aktualisId === "string" ? p.aktualisId : null };
}
export function pozicioMent(tarhely, azonosito, pozicio) {
  return jsonMent(tarhely, POZICIO_KULCS_ELOTAG + azonosito, pozicio);
}

export function ujMag(veletlen = Math.random) {
  return Math.floor(veletlen() * 2 ** 31);
}

/** Magos ál-véletlen (mulberry32): ugyanaz a mag → ugyanaz a sorozat. */
export function magosVeletlen(mag) {
  let a = mag >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates a maggal; a bemenetet nem módosítja. */
export function magosKever(lista, mag) {
  const v = magosVeletlen(mag);
  const eredmeny = [...lista];
  for (let i = eredmeny.length - 1; i > 0; i -= 1) {
    const j = Math.floor(v() * (i + 1));
    [eredmeny[i], eredmeny[j]] = [eredmeny[j], eredmeny[i]];
  }
  return eredmeny;
}

export const ertekelt = (sor) => typeof sor?.enPont === "number";

/** A pakli videói (csak `tipus === "video"`). */
export const videoSorok = (sorok) => (sorok ?? []).filter((s) => s?.tipus === "video");

/** A terv típusa a pakliban: `video`, `kep`, minden más (üres, ismeretlen) `html` — a kirakat is iframe-ben mutatja. */
export function tervTipus(sor) {
  return sor?.tipus === "video" || sor?.tipus === "kep" ? sor.tipus : "html";
}

/** Az ügyfélnél előforduló típusok kulcsai (`TIPUSOK` sorrendjében). */
export function elerhetoTipusok(sorok) {
  const van = new Set((sorok ?? []).filter(Boolean).map(tervTipus));
  return TIPUS_KULCSOK.filter((k) => van.has(k));
}

/**
 * Az alapértelmezett típus-válogatás: „ami az ügyfélnél van” — de ha van videó, CSAK a videók (így a videós ügyfél
 * pakliját a weboldal-swipe megjelenése nem változtatja meg; a többi típus a ⚙-ban bekapcsolható).
 */
export function alapTipusok(sorok) {
  const elerheto = elerhetoTipusok(sorok);
  return elerheto.includes("video") ? ["video"] : elerheto;
}

/** A beállítás típusai az ügyfélnél létezőkre szűkítve; ha így semmi sem marad (vagy nincs beállítva) → az alap. */
export function ervenyesTipusok(tipusok, sorok) {
  const elerheto = elerhetoTipusok(sorok);
  const kert = Array.isArray(tipusok) ? elerheto.filter((k) => tipusok.includes(k)) : [];
  return kert.length ? kert : alapTipusok(sorok);
}

/** A választott típusok tervei (katalógus-sorrendben). */
export function tipusSorok(sorok, tipusok) {
  const ervenyes = ervenyesTipusok(tipusok, sorok);
  return (sorok ?? []).filter((s) => s && ervenyes.includes(tervTipus(s)));
}

/** Szöveg a felülethez: egy típusnál annak a neve („videó” / „videók”), vegyesen „terv” / „tervek”. */
export function tipusFonev(tipusok, { tobbes = false } = {}) {
  const t = Array.isArray(tipusok) && tipusok.length === 1 ? TIPUSOK.find((x) => x.kulcs === tipusok[0]) : null;
  if (!t) return tobbes ? "tervek" : "terv";
  return tobbes ? t.tobbes : t.fonev;
}

/** Kimenő terv (publikus és nem rejtett — a `katalogus.ugyfelhez_megy` tükre a böngészőben): ettől van Swipe-nézet. */
export function kimeno(terv) {
  return Boolean(terv?.publikus) && !terv?.rejtett;
}

/**
 * A pakli: a választott típusú tervek (`ervenyesTipusok` — alapból videós ügyfélnél csak a videók) a beállítás
 * szerinti sorrendben, a dátum- és címke-szűrővel (ugyanaz a logika, mint a kártyás nézet szűrőié; a csoportok a
 * választott típusokból), és ha kell, csak a még nem értékeltek. Előbb rendez (a TELJES listát keveri), utána
 * szűr — így ugyanazzal a maggal a kimaradó kártyák a maradék sorrendjét nem borítják fel (folytatásnál fontos).
 * Dátum szerinti rendezésnél azonos napon a katalógus-sorrend dönt (a későbbi mappa az újabb).
 */
export function epitPakli(sorok, beallitasNyers, { ma, mag = 1 } = {}) {
  const beallitas = normalBeallitas(beallitasNyers);
  const videok = tipusSorok(sorok, beallitas.tipusok);
  let rendezett;
  if (beallitas.sorrend === "veletlen") {
    rendezett = magosKever(videok, mag);
  } else {
    const irany = beallitas.sorrend === "uj" ? -1 : 1;
    rendezett = videok
      .map((sor, i) => ({ sor, i, nap: keszultNap(sor.keszult) ?? "" }))
      .sort((a, b) => {
        // dátum nélküli mindig a végén
        if (!a.nap !== !b.nap) return a.nap ? -1 : 1;
        return (a.nap < b.nap ? -1 : a.nap > b.nap ? 1 : a.i - b.i) * irany;
      })
      .map((x) => x.sor);
  }
  const datumKulcs = ervenyesKulcs(beallitas.datum, datumCsoportok(videok, ma));
  const valasztas = ervenyesValasztas(beallitas.cimke, cimkeCsoportok(videok));
  return rendezett.filter((sor) =>
    lathato(sor, datumKulcs, ma)
    && cimkeLathato(sor, valasztas)
    && (!beallitas.csakErtekeletlen || !ertekelt(sor)));
}

/** A küszöb: a kártya szélességének negyede vízszintesen, magasságának 18%-a függőlegesen (legalább 80 px). */
export function kuszob({ szelesseg = 360, magassag = 640 } = {}) {
  return { x: Math.max(80, szelesseg * 0.25), y: Math.max(80, magassag * 0.18) };
}

/**
 * Húzás közben és elengedéskor: melyik irány felé tart (a domináns tengely, a küszöbhöz mérten), mennyire
 * (`arany` 0–1, a bélyeg átlátszósága), és elengedve döntés-e (`dont`: a küszöböt elérte).
 */
export function gesztusAllapot(dx, dy, meret) {
  const k = kuszob(meret);
  const ax = Math.abs(dx) / k.x;
  const ay = Math.abs(dy) / k.y;
  if (!ax && !ay) return { irany: null, arany: 0, dont: false };
  const vizszintes = ax >= ay;
  const irany = vizszintes ? (dx > 0 ? "jobbra" : "balra") : (dy < 0 ? "fel" : "le");
  const nyers = vizszintes ? ax : ay;
  return { irany, arany: Math.min(1, nyers), dont: nyers >= 1 };
}

/** Koppintás (hang be/ki), nem húzás: alig mozdult és rövid volt. */
export function koppintas(dx, dy, ms) {
  return Math.hypot(dx, dy) < 8 && ms < 350;
}

/** A billentyű → művelet (vagy `null`). Szóköz: lejátszás/szünet; F: teljes képernyő; Backspace/Z: vissza. */
export function billentyuMuvelet(kulcs) {
  return {
    ArrowRight: "jobbra", ArrowLeft: "balra", ArrowUp: "fel", ArrowDown: "le",
    " ": "lejatszas", f: "teljes", F: "teljes", Backspace: "vissza", z: "vissza", Z: "vissza",
  }[kulcs] ?? null;
}

/**
 * A menet: a pakli bejárása döntésekkel. A döntés a `sor.enPont`-ot állítja (a hívó menti a lépés `pont`-ját),
 * a „vissza” az utolsó lépést vonja vissza: az előző pontot adja vissza a sorra (`null`, ha nem volt — a hívó
 * ilyenkor `pont: null`-t ment, azaz törli). Az átugrás (videó vége) is lépés, pont nélkül.
 */
export function keszitMenet(pakli, { kezdo = 0 } = {}) {
  let index = Math.max(0, Math.min(pakli.length, Number.isInteger(kezdo) ? kezdo : 0));
  const tortenet = [];
  return {
    get index() { return index; },
    get hossz() { return pakli.length; },
    get tortenet() { return [...tortenet]; },
    aktualis: () => pakli[index] ?? null,
    kovetkezok: (n) => pakli.slice(index + 1, index + 1 + n),
    vege: () => index >= pakli.length,
    dont(irany, pont) {
      const sor = pakli[index];
      if (!sor || !IRANYOK.includes(irany)) return null;
      const lepes = { sor, irany, pont, elozo: sor.enPont ?? null, index };
      sor.enPont = pont;
      tortenet.push(lepes);
      index += 1;
      return lepes;
    },
    atugrik() {
      const sor = pakli[index];
      if (!sor) return null;
      const lepes = { sor, irany: null, index };
      tortenet.push(lepes);
      index += 1;
      return lepes;
    },
    vissza() {
      const lepes = tortenet.pop();
      if (!lepes) return null;
      if (lepes.irany) lepes.sor.enPont = lepes.elozo;
      index = lepes.index;
      return lepes;
    },
    /** A pakli végén: irányonként a videók (tervenként az UTOLSÓ döntés számít). */
    osszesito() {
      const utolso = new Map();
      for (const l of tortenet) if (l.irany) utolso.set(l.sor.id, l);
      const eredmeny = Object.fromEntries(IRANYOK.map((i) => [i, []]));
      for (const l of utolso.values()) eredmeny[l.irany].push(l.sor);
      return eredmeny;
    },
  };
}

/** A folytatás indexe: ha a mentett aktuális kártya benne van a pakliban, onnan; különben az elejéről. */
export function folytatasIndex(pakli, aktualisId) {
  const i = aktualisId ? pakli.findIndex((s) => s.id === aktualisId) : -1;
  return i === -1 ? 0 : i;
}

/**
 * Gyors indoklás: a chip hozzáfűzése a (belső) jegyzethez. Ha már benne van (külön tételként), nem ismétli.
 * Elválasztó: „ · ” (a meglévő szabad szöveg után is).
 */
export function jegyzetHozzafuz(jegyzet, chip) {
  const regi = String(jegyzet ?? "").trim();
  const uj = String(chip ?? "").trim();
  if (!uj) return regi;
  if (!regi) return uj;
  const tetelek = regi.split(/\s*·\s*/).map((t) => t.toLocaleLowerCase("hu"));
  if (tetelek.includes(uj.toLocaleLowerCase("hu"))) return regi;
  return `${regi} · ${uj}`;
}

/**
 * „Mi nyer?”: az ADMIN pontok átlaga és darabszáma címke-csoportonként és értékenként (a címke-szűrő
 * csoportjai), a választott típusok tervein (`ervenyesTipusok`; alapból videós ügyfélnél a videók). Csak értékelt
 * tervek számítanak; érték, amire nincs pont, kimarad. Csoporton belül átlag szerint
 * csökkenő (egyenlőnél több darab elöl). `bizonytalan`: 3-nál kevesebb pontból (a felület halványítja).
 */
export function miNyer(sorok, tipusok = null) {
  const videok = tipusSorok(sorok, tipusok);
  const csoportok = cimkeCsoportok(videok);
  return csoportok
    .map((cs) => ({
      kulcs: cs.kulcs,
      nev: cs.nev,
      ertekek: cs.ertekek
        .map((e) => {
          const pontok = videok
            .filter((s) => ertekelt(s) && cimkeLathato(s, { [cs.kulcs]: e.kulcs }))
            .map((s) => s.enPont);
          const atlag = pontok.length ? Math.round((pontok.reduce((a, b) => a + b, 0) / pontok.length) * 10) / 10 : null;
          return { kulcs: e.kulcs, felirat: e.felirat, atlag, db: pontok.length, bizonytalan: pontok.length < 3 };
        })
        .filter((e) => e.db > 0)
        .sort((a, b) => b.atlag - a.atlag || b.db - a.db || a.felirat.localeCompare(b.felirat, "hu")),
    }))
    .filter((cs) => cs.ertekek.length);
}

/**
 * „Mi nyer?” típus szerint: az admin pontok átlaga típusonként (minden típus, a válogatástól függetlenül) — címke
 * nélküli ügyfélnél ez az egyetlen összevetés. Csak a pontozott típusok; `bizonytalan` 3 pont alatt.
 */
export function tipusSzerint(sorok) {
  return TIPUSOK
    .map((t) => {
      const pontok = (sorok ?? []).filter((s) => s && tervTipus(s) === t.kulcs && ertekelt(s)).map((s) => s.enPont);
      const atlag = pontok.length ? Math.round((pontok.reduce((a, b) => a + b, 0) / pontok.length) * 10) / 10 : null;
      return { kulcs: t.kulcs, felirat: t.felirat, atlag, db: pontok.length, bizonytalan: pontok.length < 3 };
    })
    .filter((e) => e.db > 0);
}

/** Van-e bármelyik tervnek címkéje (ha nincs, a „Mi nyer?” ezt kimondja, és típus szerint ad átlagot). */
export function vanCimke(sorok) {
  return (sorok ?? []).some((s) => cimkeLista(s?.cimkek).length > 0);
}

/** Kedvencek: a „szuper” pontú tervek (a felfelé húzás pontja) a választott típusokból, katalógus-sorrendben. */
export function kedvencek(sorok, beallitasNyers) {
  const beallitas = normalBeallitas(beallitasNyers);
  return tipusSorok(sorok, beallitas.tipusok).filter((s) => s.enPont === beallitas.pontok.fel);
}

/* ------------------------------------------------------------------ Weboldal-kártya: keret, előtöltés, görgetés */

/**
 * A weboldal-kártya keretének mérete: az iframe az eszköz szélességén renderel (asztali 1280, mobil 390 px), és
 * CSS `transform: scale(arany)`-nyal fér a kártyába. Asztalin a kártya szélességét tölti ki; mobilon legfeljebb 1:1
 * (nagyítani nem nagyít), és vízszintesen középre áll (`bal`). A magasság a kártya magassága visszaszorozva — így a
 * kicsinyített keret pontosan a kártyát fedi.
 */
export function keretMeretezes({ szelesseg, magassag, eszkoz = "asztali" } = {}) {
  const w = Math.max(1, Number(szelesseg) || 0);
  const h = Math.max(1, Number(magassag) || 0);
  const mobil = eszkoz === "mobil";
  const alap = mobil ? ESZKOZOK.mobil : ESZKOZOK.asztali;
  const arany = mobil ? Math.min(1, w / alap) : w / alap;
  return {
    szelesseg: alap,
    magassag: Math.round(h / arany),
    arany,
    bal: Math.max(0, Math.round((w - alap * arany) / 2)),
  };
}

/**
 * Előtöltés: a látható kártyák (elöl + mögötte kettő) közül csak az első `n` kap élő iframe-et (alap: az aktuális és
 * a következő 1); a többi `about:blank` — 50+ élő weboldal egyszerre megölné a telefont.
 */
export const ELO_KERETEK = 2;
export function eloKeretek(lathatoIdk, n = ELO_KERETEK) {
  const lista = Array.isArray(lathatoIdk) ? lathatoIdk : [];
  return { eles: lista.slice(0, n), alvo: lista.slice(n) };
}

/** A bemutató-görgetés üteme: fent áll → egyenletesen le → lent áll → simán vissza a tetejére → újra. */
export const GORGETES = Object.freeze({ fentMs: 1200, lentMs: 1500, visszaMs: 900, minMs: 12000, maxMs: 20000, pxPerMp: 160 });

/** Egy teljes oldal legörgetésének ideje: a hosszhoz arányos, 12–20 s közé szorítva. */
export function gorgetesIdo(tavolsag) {
  const t = (Math.max(0, Number(tavolsag) || 0) / GORGETES.pxPerMp) * 1000;
  return Math.min(GORGETES.maxMs, Math.max(GORGETES.minMs, t));
}

/** Egy teljes ciklus hossza (fent + le + lent + vissza). */
export function gorgetesCiklusHossz(tavolsag) {
  return GORGETES.fentMs + gorgetesIdo(tavolsag) + GORGETES.lentMs + GORGETES.visszaMs;
}

/**
 * A bemutató-görgetés pozíciója az eltelt idő függvényében (ismétlődő ciklus). `tavolsag` = a görgethető magasság
 * (`scrollHeight − innerHeight`); ha ≤ 0, nincs mit görgetni (`y = 0`). Vissza: `{y, fazis}`.
 */
export function gorgetesCiklus(eltelt, tavolsag) {
  const d = Math.max(0, Number(tavolsag) || 0);
  if (!d) return { y: 0, fazis: "fent" };
  const le = gorgetesIdo(d);
  const t = Math.max(0, Number(eltelt) || 0) % gorgetesCiklusHossz(d);
  const { fentMs, lentMs, visszaMs } = GORGETES;
  if (t < fentMs) return { y: 0, fazis: "fent" };
  if (t < fentMs + le) return { y: Math.round(d * ((t - fentMs) / le)), fazis: "le" };
  if (t < fentMs + le + lentMs) return { y: d, fazis: "lent" };
  const p = Math.min(1, (t - fentMs - le - lentMs) / visszaMs);
  const lagy = p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2;   // ease-in-out
  return { y: Math.round(d * (1 - lagy)), fazis: "vissza" };
}

/** A ▶ folytatáshoz: a mostani `y`-hoz tartozó eltelt idő a lefelé szakaszon — onnan megy tovább, nem ugrik. */
export function elteltPoziciobol(y, tavolsag) {
  const d = Math.max(0, Number(tavolsag) || 0);
  if (!d) return 0;
  const arany = Math.min(1, Math.max(0, (Number(y) || 0) / d));
  return arany <= 0 ? 0 : GORGETES.fentMs + arany * gorgetesIdo(d);
}

/**
 * A bemutató-görgetés állapotgépe (tiszta átmenet-függvény). Állapotok:
 *  - `tolt`: az iframe még tölt;
 *  - `fut`: automatikusan görget (átlátszó takaró az iframe-en: a húzás a kártyáé);
 *  - `kezi`: a felhasználó megállította (koppintás / görgő / ⏸ / kattintás a keretben) — a takaró lekerül, az oldal
 *    kézzel görgethető; ▶ (`inditas`) → `fut`;
 *  - `statikus`: a keret nem érhető el (nem azonos eredetű, vagy a görgetés hibát dobott) — csendes visszaesés:
 *    kézi görgetés, ▶ nincs. Ebből nincs kiút (a kártya újraépülésekor újra `tolt`).
 * Események: `betoltve` (`{elerheto, mozgasCsokkentett}`), `erintes`, `inditas`, `hiba`. Ismeretlen esemény: marad.
 */
export const GORGETO_ALLAPOTOK = Object.freeze(["tolt", "fut", "kezi", "statikus"]);
export function gorgetoAtmenet(allapot, esemeny, adat = {}) {
  const most = GORGETO_ALLAPOTOK.includes(allapot) ? allapot : "tolt";
  if (most === "statikus" || esemeny === "hiba") return "statikus";
  if (esemeny === "betoltve") {
    if (!adat.elerheto) return "statikus";
    return most === "kezi" || adat.mozgasCsokkentett ? "kezi" : "fut";
  }
  if (esemeny === "erintes") return most === "fut" || most === "tolt" ? "kezi" : most;
  if (esemeny === "inditas") return most === "kezi" ? "fut" : most;
  return most;
}

/* ------------------------------------------------------------------ Párbaj (Elo) */

export const ELO_ALAP = 1500;
export const ELO_K = 32;

/** Egy párbaj után: a győztes és a vesztes új Elo-száma (a bemenetet nem módosítja). */
export function eloFrissit(gyoztes, vesztes, k = ELO_K) {
  const varhato = 1 / (1 + 10 ** ((vesztes - gyoztes) / 400));
  const valtozas = k * (1 - varhato);
  return { gyoztes: gyoztes + valtozas, vesztes: vesztes - valtozas };
}

/** A tárolt párbaj-állapot: `{ <tervId>: {elo, db} }`; hibás bejegyzés kimarad. */
export function parbajBetolt(tarhely, azonosito) {
  const nyers = jsonBetolt(tarhely, PARBAJ_KULCS_ELOTAG + azonosito);
  const eredmeny = {};
  if (!nyers || typeof nyers !== "object" || Array.isArray(nyers)) return eredmeny;
  for (const [id, e] of Object.entries(nyers)) {
    if (Number.isFinite(e?.elo) && Number.isInteger(e?.db) && e.db >= 0) eredmeny[id] = { elo: e.elo, db: e.db };
  }
  return eredmeny;
}
export function parbajMent(tarhely, azonosito, allapot) {
  return jsonMent(tarhely, PARBAJ_KULCS_ELOTAG + azonosito, allapot);
}

/** Egy párbaj eredménye az állapotban (új objektum). */
export function parbajEredmeny(allapot, gyoztesId, vesztesId) {
  const gy = allapot[gyoztesId] ?? { elo: ELO_ALAP, db: 0 };
  const ve = allapot[vesztesId] ?? { elo: ELO_ALAP, db: 0 };
  const uj = eloFrissit(gy.elo, ve.elo);
  return { ...allapot, [gyoztesId]: { elo: uj.gyoztes, db: gy.db + 1 }, [vesztesId]: { elo: uj.vesztes, db: ve.db + 1 } };
}

function cimkeErtek(sor, csoport) {
  for (const c of cimkeLista(sor?.cimkek)) {
    const hely = c.indexOf(":");
    if (hely > 0 && c.slice(0, hely).trim().toLocaleLowerCase("hu") === csoport) {
      return c.slice(hely + 1).trim().toLocaleLowerCase("hu") || null;
    }
  }
  return null;
}

/**
 * A következő pár (a hívó a választott típusú terveket adja): az első a legkevesebbet párbajozott terv (egyenlőnél véletlen); a párja lehetőleg azonos
 * „Termék:”, ennek híján azonos „Stílus:” címkéjű, ennek híján bármelyik másik — a jelöltek közül a
 * legkevesebbet párbajozott, a legközelebbi Elo-jú. Kevesebb mint két videónál `null`.
 */
export function parValaszt(videok, allapot, veletlen = Math.random) {
  if (!Array.isArray(videok) || videok.length < 2) return null;
  const db = (s) => allapot?.[s.id]?.db ?? 0;
  const elo = (s) => allapot?.[s.id]?.elo ?? ELO_ALAP;
  const legkevesebb = Math.min(...videok.map(db));
  const elsoJeloltek = videok.filter((s) => db(s) === legkevesebb);
  const elso = elsoJeloltek[Math.floor(veletlen() * elsoJeloltek.length)] ?? elsoJeloltek[0];
  const tobbi = videok.filter((s) => s !== elso);
  let jeloltek = tobbi;
  for (const csoport of ["termék", "stílus"]) {
    const ertek = cimkeErtek(elso, csoport);
    const azonos = ertek ? tobbi.filter((s) => cimkeErtek(s, csoport) === ertek) : [];
    if (azonos.length) { jeloltek = azonos; break; }
  }
  const masodik = [...jeloltek].sort((a, b) => db(a) - db(b) || Math.abs(elo(a) - elo(elso)) - Math.abs(elo(b) - elo(elso)))[0];
  return [elso, masodik];
}

/** Az Elo-lista: a párbajozott videók Elo szerint csökkenő sorrendben. */
export function eloLista(videok, allapot) {
  return videok
    .filter((s) => allapot?.[s.id])
    .map((s) => ({ sor: s, elo: allapot[s.id].elo, db: allapot[s.id].db }))
    .sort((a, b) => b.elo - a.elo || b.db - a.db);
}
