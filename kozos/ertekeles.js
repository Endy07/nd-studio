/**
 * Értékelés-logika. Tiszta függvények: se hálózat, se DOM.
 * Ugyanezt használja az admin összefoglaló és az ügyfél-nézet.
 */

export const VALASZ_PONT = { tetszik: 10, talan: 5, nem: 1 };

export function valaszPont(valasz) {
  return VALASZ_PONT[valasz] ?? null;
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
    // "kész" állapotot adna. Az érvénytelen választ sem számoljuk: a null
    // nullaként torzítaná az átlagot.
    if (!terv.publikus) continue;
    const oPont = valaszPont(ove?.valasz);
    if (oPont !== null) {
      oPontok.push(oPont);
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
