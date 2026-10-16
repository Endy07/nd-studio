/**
 * Dátum-szűrő a kirakat kártyái fölött (2026-10-16, a felhasználó kérése: „amik a mai napon készültek,
 * amik régebben … két adag volt már régebben”).
 *
 * A tervek `keszult` mezője alapján (ISO dátum, egy régi tervnél dátum-idő) egy gombsor: „Mind (N)”,
 * „Mai (N)”, és minden korábbi készítési nap külön gombként, legújabb elöl („okt. 14. (7)”).
 * CSAK a megjelenítést szűri (a kártya `hidden`); adatot nem módosít, a pontozás és az összevetés a
 * látható kártyákon ugyanúgy működik. A választás böngészőnként, ügyfelenként külön kulcson marad meg.
 *
 * A „ma” mindig paraméter (a hívó a böngésző HELYI dátumát adja, `helyiNap()`), így a logika valódi óra
 * nélkül tesztelhető. A „Mai” gomb csak akkor van, ha ma készült valami: egy letiltott gomb mellett is
 * külön kellene magyarázni, miért nem nyomható — a hiánya egyértelműbb, és nincs külön állapota.
 */

export const SZURO_KULCS_ELOTAG = "nd-studio:datum-szuro:";

const HONAPOK = ["jan.", "febr.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec."];
const NAP_MINTA = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(?:$|T)/;

/** A `keszult` napja (`ÉÉÉÉ-HH-NN`), vagy `null`, ha nincs / nem értelmezhető. */
export function keszultNap(keszult) {
  if (typeof keszult !== "string") return null;
  const talalat = NAP_MINTA.exec(keszult);
  return talalat ? `${talalat[1]}-${talalat[2]}-${talalat[3]}` : null;
}

/** A böngésző HELYI naptári napja — nem a `toISOString` UTC-je (éjfél körül az egy nappal eltérne). */
export function helyiNap(datum = new Date()) {
  const ketjegy = (n) => String(n).padStart(2, "0");
  return `${datum.getFullYear()}-${ketjegy(datum.getMonth() + 1)}-${ketjegy(datum.getDate())}`;
}

/** „okt. 14.”; ha nem az idei év, elé az évszám: „2025. dec. 24.”. */
export function napFelirat(nap, ma) {
  const [ev, honap, napSzam] = nap.split("-");
  const rovid = `${HONAPOK[Number(honap) - 1]} ${Number(napSzam)}.`;
  return ev === String(ma).slice(0, 4) ? rovid : `${ev}. ${rovid}`;
}

/**
 * A gombsor csoportjai: `[{kulcs, felirat, db}]` — „mind”, (ha van) „mai”, a korábbi napok legújabb elöl,
 * végül (ha van) „datum-nelkul”. A darabszámot a gomb írja ki a felirat után.
 */
export function datumCsoportok(tervek, ma) {
  const napok = new Map();
  let datumNelkul = 0;
  for (const terv of tervek) {
    const nap = keszultNap(terv?.keszult);
    if (nap === null) datumNelkul += 1;
    else napok.set(nap, (napok.get(nap) ?? 0) + 1);
  }
  const csoportok = [{ kulcs: "mind", felirat: "Mind", db: tervek.length }];
  if (napok.has(ma)) csoportok.push({ kulcs: "mai", felirat: "Mai", db: napok.get(ma) });
  for (const nap of [...napok.keys()].filter((n) => n !== ma).sort().reverse()) {
    csoportok.push({ kulcs: nap, felirat: napFelirat(nap, ma), db: napok.get(nap) });
  }
  if (datumNelkul) csoportok.push({ kulcs: "datum-nelkul", felirat: "Dátum nélkül", db: datumNelkul });
  return csoportok;
}

/** Legalább két különböző nap (a „Mind”-on kívül két csoport) kell, különben a szűrő semmit nem választana szét. */
export function kellSzuro(csoportok) {
  return csoportok.length - 1 >= 2;
}

export function lathato(terv, kulcs, ma) {
  const nap = keszultNap(terv?.keszult);
  if (kulcs === "mind") return true;
  if (kulcs === "mai") return nap === ma;
  if (kulcs === "datum-nelkul") return nap === null;
  return nap === kulcs;
}

/** A mentett szűrő csak akkor él, ha most is van ilyen csoport (a „Mai” másnap üres lehet) — különben „Mind”. */
export function ervenyesKulcs(kulcs, csoportok) {
  return csoportok.some((c) => c.kulcs === kulcs) ? kulcs : "mind";
}

/**
 * A kártyák KÖZÖS láthatósága, ha több szűrő is van (dátum + címke, `cimke-szuro.js`): minden szűrő a saját
 * állítmányát állítja be a nevén, és a kártya akkor látszik, ha MINDEGYIK igaz (ÉS kapcsolat). Így egyik szűrő
 * sem írja felül a másik `hidden`-jét. A `parok` = `[[terv, kartyaElem], …]`; adatot nem módosít.
 */
export function keszitLathatosag(parok) {
  const allitmanyok = new Map();
  const frissit = () => {
    for (const [terv, kartya] of parok) kartya.hidden = ![...allitmanyok.values()].every((allitmany) => allitmany(terv));
  };
  return {
    beallit(nev, allitmany) {
      allitmanyok.set(nev, allitmany);
      frissit();
    },
  };
}

/** A tár hibája (privát ablak, tiltott tár) sosem dob: a szűrő csak kényelmi beállítás. */
export function szuroBetolt(tarhely, azonosito) {
  try {
    return tarhely?.getItem(SZURO_KULCS_ELOTAG + azonosito) ?? null;
  } catch {
    return null;
  }
}

export function szuroMent(tarhely, azonosito, kulcs) {
  try {
    tarhely?.setItem(SZURO_KULCS_ELOTAG + azonosito, kulcs);
  } catch {
    // ha nem menthető, a következő betöltés „Mind”-dal indul
  }
}

/**
 * A gombsor (vagy `null`, ha nem kell szűrő). A `parok` = `[[terv, kartyaElem], …]`; a szűrő a kártyák
 * `hidden`-jét állítja, semmi mást. Az elején a mentett (érvényes) szűrőt alkalmazza. Ha a címke-szűrő is
 * ugyanazokon a kártyákon dolgozik, a hívó egy közös `lathatosag`-ot ad mindkettőnek (`keszitLathatosag`).
 */
export function keszitDatumSzuro({
  parok, ma = helyiNap(), tarhely, azonosito, dok = globalThis.document, lathatosag = keszitLathatosag(parok),
}) {
  const csoportok = datumCsoportok(parok.map(([terv]) => terv), ma);
  if (!kellSzuro(csoportok)) return null;

  const sor = dok.createElement("nav");
  sor.className = "datum-szuro";
  sor.setAttribute("aria-label", "Szűrés készítési nap szerint");
  const gombok = new Map();

  const alkalmaz = (kulcs) => {
    lathatosag.beallit("datum", (terv) => lathato(terv, kulcs, ma));
    for (const [k, gomb] of gombok) {
      gomb.classList.toggle("aktiv", k === kulcs);
      gomb.setAttribute("aria-pressed", String(k === kulcs));
    }
  };

  for (const csoport of csoportok) {
    const gomb = dok.createElement("button");
    gomb.type = "button";
    gomb.textContent = `${csoport.felirat} (${csoport.db})`;
    gomb.addEventListener("click", () => {
      szuroMent(tarhely, azonosito, csoport.kulcs);
      alkalmaz(csoport.kulcs);
    });
    gombok.set(csoport.kulcs, gomb);
    sor.append(gomb);
  }
  alkalmaz(ervenyesKulcs(szuroBetolt(tarhely, azonosito), csoportok));
  return sor;
}
