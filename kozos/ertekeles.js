/**
 * Értékelés-logika. Tiszta függvények: se hálózat, se DOM.
 * Ugyanezt használja az admin összefoglaló és az ügyfél-nézet.
 */

export const HIBAJELZESEK = [
  { kulcs: "hibas", felirat: "❌ Hibás oldal" },
  { kulcs: "reszben", felirat: "⚠️ Részben hibás" },
  { kulcs: "jo", felirat: "✅ Nincs hiba" },
];

/**
 * Ami kimehet az ügyfélhez. FEHÉRLISTA, nem feketelista: ha később új belső mező
 * születik, az alapértelmezésben NEM szivárog ki. Ugyanaz az elv, mint a
 * mag/katalogus.py UGYFEL_FEHERLISTA-jánál.
 */
export const PUBLIKUS_MEZOK = ["pont", "hibajelzes", "megjegyzes", "elfogadva", "modositva"];

export function publikusErtekeles(ertekeles) {
  const forras = ertekeles ?? {};
  const eredmeny = {};
  for (const mezo of PUBLIKUS_MEZOK) {
    if (forras[mezo] !== undefined) eredmeny[mezo] = forras[mezo];
  }
  return eredmeny;
}

const REGI_ELFOGADVA = "elfogadva";
const REGI_HIBAJELZESEK = ["hibas", "reszben", "jo"];

/**
 * A régi `statusz` mező egyszerre hordozta a hibajelzést és az elfogadást.
 * Ez a függvény szétválasztja őket. Nem ír semmit, csak olvas.
 */
export function regibolOlvas(ertekeles) {
  const forras = ertekeles ?? {};
  const regi = forras.statusz ?? "";
  return {
    pont: forras.pont ?? null,
    hibajelzes: forras.hibajelzes ?? (REGI_HIBAJELZESEK.includes(regi) ? regi : ""),
    megjegyzes: forras.megjegyzes ?? "",
    elfogadva: forras.elfogadva ?? regi === REGI_ELFOGADVA,
    modositva: forras.modositva ?? "",
  };
}

/** Két értékelés-halmazt fésül össze: kulcsonként az újabb módosítás nyer. */
export function osszefesul(sajat, tavoli) {
  const eredmeny = { ...tavoli };
  for (const [kulcs, sajatErtek] of Object.entries(sajat)) {
    const tavoliErtek = tavoli[kulcs];
    // Időbélyeg nélküli saját rekordot NEM dobunk el. Inkább maradjon meg egy
    // fölösleges érték, mint hogy valakinek a válasza némán elvesszen.
    const sajatNyer =
      !tavoliErtek ||
      !sajatErtek?.modositva ||
      sajatErtek.modositva >= (tavoliErtek.modositva ?? "");
    if (sajatNyer) eredmeny[kulcs] = sajatErtek;
  }
  return eredmeny;
}

function atlag(szamok) {
  if (!szamok.length) return null;
  const osszeg = szamok.reduce((a, b) => a + b, 0);
  return Math.round((osszeg / szamok.length) * 10) / 10;
}

export function ugyfelOsszesito(tervek, adminErtekelesek, ugyfelErtekelesek) {
  const enPontok = [];
  const oPontok = [];
  let legjobb = null;
  let ugyfelMegjegyzesek = 0;
  let elfogadva = false;
  let oErtekelte = 0;

  for (const terv of tervek) {
    const enyem = adminErtekelesek[terv.id];
    const ove = ugyfelErtekelesek[terv.id];

    if (enyem?.statusz === "elfogadva") elfogadva = true;
    if (typeof enyem?.pont === "number") {
      enPontok.push(enyem.pont);
      if (!legjobb || enyem.pont > legjobb.pont) {
        legjobb = { cim: terv.cim, pont: enyem.pont };
      }
    }
    if (ove?.megjegyzes) ugyfelMegjegyzesek += 1;

    // Az ügyfél csak a publikus terveket látja, ezért csak azok számítanak az ő
    // haladásába. Egy visszavont terven maradt régi értékelés különben hamis
    // "kész" állapotot adna. A nem szám értékű pontot sem számoljuk: az
    // nullaként torzítaná az átlagot.
    if (!terv.publikus) continue;
    if (typeof ove?.pont === "number") {
      oPontok.push(ove.pont);
      oErtekelte += 1;
    }
  }

  return {
    osszes: tervek.length,
    publikus: tervek.filter((terv) => terv.publikus).length,
    enErtekeltem: tervek.filter((terv) => adminErtekelesek[terv.id]).length,
    oErtekelte,
    enAtlag: atlag(enPontok),
    oAtlag: atlag(oPontok),
    legjobb,
    ugyfelMegjegyzesek,
    elfogadva,
  };
}

/** A kártya számolt állapota — sosem kézzel karbantartott mező. */
export function statusz(osszesito) {
  if (osszesito.osszes === 0) return "ures";
  // Az elfogadás mindent felülír: ha egy tervet elfogadtál, a projekt kész,
  // akkor is, ha maradtak nem pontozott változatok.
  if (osszesito.elfogadva) return "kesz";
  if (osszesito.enErtekeltem < osszesito.osszes) return "var_ram";
  if (osszesito.oErtekelte < osszesito.publikus) return "var_ra";
  return "kesz";
}

/**
 * Csak MEGLÉVŐ érték felülírásakor kérdezünk. Az első értékelésnél nincs mit
 * elrontani, és ami mindig felugrik, azt egy idő után senki nem olvassa el.
 *
 * A 0 pont létező érték, a `false` elfogadva viszont a "még nem döntöttem"
 * állapot, nem felülírandó érték.
 */
export function kellMegerosites(regiErtek, ujErtek) {
  if (regiErtek === null || regiErtek === undefined) return false;
  if (regiErtek === "" || regiErtek === false) return false;
  return regiErtek !== ujErtek;
}

export function megerositoSzoveg(mezoFelirat, regiErtek, ujErtek) {
  return `Módosítod a korábbi értékelésed?\n\n${mezoFelirat}: ${regiErtek} → ${ujErtek}`;
}
