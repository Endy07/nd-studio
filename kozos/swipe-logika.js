/**
 * Swipe-értékelés (Tinder-szerű videó-pakli az ADMIN ügyféloldalon) — a tiszta logika: se DOM, se hálózat.
 * A felhasználó kérése (2026-10-16): „ugyanígy kártyaszerűen feljönnek az elkészített videók, csak úgy, mint a
 * Tinderen … jobbra vagy balra kell húznom, vagy esetleg felfelé, ha szuperlájkolom, lefelé, ha nullást adok neki”.
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

export const SWIPE_ALAP = Object.freeze({
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
  return {
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

/**
 * A pakli: a videók a beállítás szerinti sorrendben, a dátum- és címke-szűrővel (ugyanaz a logika, mint a
 * kártyás nézet szűrőié), és ha kell, csak a még nem értékeltek. Előbb rendez (a TELJES listát keveri), utána
 * szűr — így ugyanazzal a maggal a kimaradó kártyák a maradék sorrendjét nem borítják fel (folytatásnál fontos).
 * Dátum szerinti rendezésnél azonos napon a katalógus-sorrend dönt (a későbbi mappa az újabb).
 */
export function epitPakli(sorok, beallitasNyers, { ma, mag = 1 } = {}) {
  const beallitas = normalBeallitas(beallitasNyers);
  const videok = videoSorok(sorok);
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
 * csoportjai). Csak értékelt videók számítanak; érték, amire nincs pont, kimarad. Csoporton belül átlag szerint
 * csökkenő (egyenlőnél több darab elöl). `bizonytalan`: 3-nál kevesebb pontból (a felület halványítja).
 */
export function miNyer(sorok) {
  const videok = videoSorok(sorok);
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

/** Kedvencek: a „szuper” pontú videók (a beállításban a felfelé húzás pontja), katalógus-sorrendben. */
export function kedvencek(sorok, beallitasNyers) {
  const szuper = normalBeallitas(beallitasNyers).pontok.fel;
  return videoSorok(sorok).filter((s) => s.enPont === szuper);
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
 * A következő pár: az első a legkevesebbet párbajozott videó (egyenlőnél véletlen); a párja lehetőleg azonos
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
