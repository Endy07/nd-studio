/**
 * Címke-szűrő a kirakat kártyái fölött, a dátum-szűrő alatt (2026-10-16, a felhasználó kérése: „tedd be az
 * elkészült videókat a netre, mindet, akár külön intro, outro szűrési lehetőséggel”).
 *
 * A tervek `cimkek` mezője (fehérlistás, `mag/katalogus.py`) rövid szövegek listája. A „Kulcs: érték” alakú
 * címkék a kulcs szerint csoportosulnak („Nyitás: dátum-csapás” → Nyitás csoport, „dátum-csapás” érték); az
 * ismert csoportok elöl, rögzített sorrendben (Stílus · Nyitás · Outró · Termék), utánuk a többi kulcs ábécében,
 * a kettőspont nélküli címkék a végén, „Egyéb” néven. Csoportonként egy sor gomb: „Mind (N)” + az értékek
 * darabszámmal. Csoporton belül EGY érték választható (vagy „Mind”), a csoportok között ÉS kapcsolat, és a
 * dátum-szűrővel is ÉS (közös `keszitLathatosag`). Egy csoport csak akkor jelenik meg, ha legalább két
 * különböző értéke van — egyetlen értékkel semmit nem választana szét.
 *
 * CSAK megjelenítés (a kártya `hidden`-je); a címke szabad szöveg, ezért mindenhol `textContent`. A választás
 * böngészőnként, ügyfelenként külön kulcson marad meg; a tár hibája sosem dob; a már nem létező mentett
 * érték „Mind”-ra áll.
 */

import { keszitLathatosag } from "./datum-szuro.js";

export const CIMKE_SZURO_KULCS_ELOTAG = "nd-studio:cimke-szuro:";
/** A rögzített sorrendű, ismert csoportok (a kulcs kis- és nagybetűtől függetlenül illeszkedik). */
export const ISMERT_CSOPORTOK = ["Stílus", "Nyitás", "Outró", "Termék"];
export const EGYEB = "Egyéb";

const kis = (szoveg) => szoveg.toLocaleLowerCase("hu");
const abc = (a, b) => a.localeCompare(b, "hu");

/** A terv `cimkek` mezője megjeleníthető alakban: levágott, nem üres, ismétlés nélküli szövegek; minden más → []. */
export function cimkeLista(ertek) {
  if (!Array.isArray(ertek)) return [];
  const latott = new Set();
  const lista = [];
  for (const cimke of ertek) {
    if (typeof cimke !== "string") continue;
    const tiszta = cimke.trim();
    if (!tiszta || latott.has(kis(tiszta))) continue;
    latott.add(kis(tiszta));
    lista.push(tiszta);
  }
  return lista;
}

/** „Nyitás: dátum-csapás” → `{csoport: "Nyitás", ertek: "dátum-csapás"}`; kettőspont (vagy kulcs / érték) nélkül „Egyéb”. */
export function cimkeBontas(cimke) {
  const tiszta = String(cimke).trim();
  const hely = tiszta.indexOf(":");
  const kulcs = hely > 0 ? tiszta.slice(0, hely).trim() : "";
  const ertek = hely > 0 ? tiszta.slice(hely + 1).trim() : "";
  if (!kulcs || !ertek) return { csoport: EGYEB, ertek: tiszta };
  return { csoport: ISMERT_CSOPORTOK.find((nev) => kis(nev) === kis(kulcs)) ?? kulcs, ertek };
}

/** Egy terv címkéi `csoportKulcs → Set(ertekKulcs)` alakban (a kulcsok kisbetűsek). */
function tervCimkei(terv) {
  const terkep = new Map();
  for (const cimke of cimkeLista(terv?.cimkek)) {
    const { csoport, ertek } = cimkeBontas(cimke);
    if (!terkep.has(kis(csoport))) terkep.set(kis(csoport), new Set());
    terkep.get(kis(csoport)).add(kis(ertek));
  }
  return terkep;
}

function csoportSorrend(a, b) {
  const hely = (cs) => {
    if (cs.kulcs === kis(EGYEB)) return ISMERT_CSOPORTOK.length + 1;
    const ismert = ISMERT_CSOPORTOK.findIndex((nev) => kis(nev) === cs.kulcs);
    return ismert === -1 ? ISMERT_CSOPORTOK.length : ismert;
  };
  return hely(a) - hely(b) || abc(a.nev, b.nev);
}

/**
 * A megjelenő csoportok: `[{kulcs, nev, mind, ertekek: [{kulcs, felirat, db}]}]`. A `mind` az összes terv száma
 * (a „Mind” gomb), az értékek a legtöbbször előforduló elöl (egyenlőségnél ábécében). Csak a legalább két
 * különböző értékű csoport kerül bele. A kulcsok kisbetűsek (a felirat az első előfordulás írásmódja).
 */
export function cimkeCsoportok(tervek) {
  const csoportok = new Map();
  for (const terv of tervek) {
    for (const cimke of cimkeLista(terv?.cimkek)) {
      const { csoport, ertek } = cimkeBontas(cimke);
      if (!csoportok.has(kis(csoport))) csoportok.set(kis(csoport), { kulcs: kis(csoport), nev: csoport, ertekek: new Map() });
      const ertekek = csoportok.get(kis(csoport)).ertekek;
      if (!ertekek.has(kis(ertek))) ertekek.set(kis(ertek), { kulcs: kis(ertek), felirat: ertek, tervek: new Set() });
      ertekek.get(kis(ertek)).tervek.add(terv);   // egy terv egy értéket egyszer számít
    }
  }
  return [...csoportok.values()]
    .filter((cs) => cs.ertekek.size >= 2)
    .map((cs) => ({
      kulcs: cs.kulcs,
      nev: cs.nev,
      mind: tervek.length,
      ertekek: [...cs.ertekek.values()]
        .map((e) => ({ kulcs: e.kulcs, felirat: e.felirat, db: e.tervek.size }))
        .sort((a, b) => b.db - a.db || abc(a.felirat, b.felirat)),
    }))
    .sort(csoportSorrend);
}

/** Látszik-e a terv a választás mellett: `{csoportKulcs: ertekKulcs}` — minden választott csoportban megvan-e az érték. */
export function cimkeLathato(terv, valasztas) {
  const sajat = tervCimkei(terv);
  return Object.entries(valasztas ?? {}).every(([csoport, ertek]) => sajat.get(csoport)?.has(ertek) ?? false);
}

/** A mentett választásból csak az marad, ami most is létező csoport létező értéke — minden más „Mind”. */
export function ervenyesValasztas(mentett, csoportok) {
  const valasztas = {};
  if (!mentett || typeof mentett !== "object" || Array.isArray(mentett)) return valasztas;
  for (const csoport of csoportok) {
    const ertek = Object.hasOwn(mentett, csoport.kulcs) ? mentett[csoport.kulcs] : undefined;
    if (typeof ertek === "string" && csoport.ertekek.some((e) => e.kulcs === ertek)) valasztas[csoport.kulcs] = ertek;
  }
  return valasztas;
}

/** A tár hibája (privát ablak, tiltott tár, sérült JSON) sosem dob: a szűrő csak kényelmi beállítás. */
export function cimkeBetolt(tarhely, azonosito) {
  try {
    const nyers = tarhely?.getItem(CIMKE_SZURO_KULCS_ELOTAG + azonosito);
    return nyers ? JSON.parse(nyers) : null;
  } catch {
    return null;
  }
}

export function cimkeMent(tarhely, azonosito, valasztas) {
  try {
    tarhely?.setItem(CIMKE_SZURO_KULCS_ELOTAG + azonosito, JSON.stringify(valasztas));
  } catch {
    // ha nem menthető, a következő betöltés „Mind”-dal indul
  }
}

/** A kártyán a leírás alatt: a címkék kis „chip”-ként (`<ul class="cimkek">`); üresen `null`. CSAK `textContent`. */
export function keszitCimkek(cimkek, dok = globalThis.document) {
  const lista = cimkeLista(cimkek);
  if (!lista.length) return null;
  const elem = dok.createElement("ul");
  elem.className = "cimkek";
  elem.setAttribute("aria-label", "Címkék");
  for (const cimke of lista) {
    const chip = dok.createElement("li");
    chip.className = "cimke";
    chip.textContent = cimke;
    elem.append(chip);
  }
  return elem;
}

/**
 * A címke-szűrő (vagy `null`, ha egyetlen csoportnak sincs két különböző értéke). A `parok` =
 * `[[terv, kartyaElem], …]`; a kártyák `hidden`-jét a közös `lathatosag`-on át állítja (a dátum-szűrővel ÉS).
 */
export function keszitCimkeSzuro({ parok, tarhely, azonosito, dok = globalThis.document, lathatosag = keszitLathatosag(parok) }) {
  const csoportok = cimkeCsoportok(parok.map(([terv]) => terv));
  if (!csoportok.length) return null;

  const doboz = dok.createElement("div");
  doboz.className = "cimke-szuro";
  doboz.setAttribute("aria-label", "Szűrés címke szerint");
  let valasztas = ervenyesValasztas(cimkeBetolt(tarhely, azonosito), csoportok);
  const gombok = [];   // [csoportKulcs, ertekKulcs | null („Mind”), gomb]

  const alkalmaz = () => {
    const most = valasztas;
    lathatosag.beallit("cimke", (terv) => cimkeLathato(terv, most));
    for (const [csoport, ertek, gomb] of gombok) {
      const aktiv = (most[csoport] ?? null) === ertek;
      gomb.classList.toggle("aktiv", aktiv);
      gomb.setAttribute("aria-pressed", String(aktiv));
    }
  };

  const valaszt = (csoport, ertek) => {
    const uj = { ...valasztas };
    // A már aktív érték újbóli kattintása visszaáll „Mind”-ra.
    if (ertek === null || uj[csoport] === ertek) delete uj[csoport];
    else uj[csoport] = ertek;
    valasztas = uj;
    cimkeMent(tarhely, azonosito, valasztas);
    alkalmaz();
  };

  for (const csoport of csoportok) {
    const sor = dok.createElement("div");
    sor.className = "cimke-csoport";
    sor.setAttribute("role", "group");
    sor.setAttribute("aria-label", csoport.nev);
    const nev = dok.createElement("span");
    nev.className = "cimke-csoport-nev";
    nev.textContent = csoport.nev;
    sor.append(nev);
    for (const [ertek, felirat, db] of [[null, "Mind", csoport.mind], ...csoport.ertekek.map((e) => [e.kulcs, e.felirat, e.db])]) {
      const gomb = dok.createElement("button");
      gomb.type = "button";
      gomb.textContent = `${felirat} (${db})`;
      gomb.addEventListener("click", () => valaszt(csoport.kulcs, ertek));
      gombok.push([csoport.kulcs, ertek, gomb]);
      sor.append(gomb);
    }
    doboz.append(sor);
  }
  alkalmaz();
  return doboz;
}
