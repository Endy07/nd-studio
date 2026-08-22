/** Az admin nyitóoldal: ügyfelenként egy kártya, számolt állapottal. */

import { statusz, ugyfelOsszesito } from "./ertekeles.js";
import { keszitTarolo } from "./tarolo.js";

export const STATUSZ_FELIRAT = {
  ures: "nincs terv",
  var_ram: "vár rám",
  var_ra: "vár rá",
  kesz: "kész",
};

export function osszesitoSav(kartyak) {
  return {
    ugyfelek: kartyak.length,
    tervek: kartyak.reduce((osszeg, k) => osszeg + k.osszesito.osszes, 0),
    varRam: kartyak.filter((k) => k.statusz === "var_ram").length,
    megjegyzesek: kartyak.reduce((osszeg, k) => osszeg + k.osszesito.ugyfelMegjegyzesek, 0),
  };
}

export const ADMIN_TOKEN_KULCS = "nd-studio:admin-token";

/** Bekéri az admin tokent, ha még nincs. Üres stringet ad, ha a felhasználó elutasítja. */
export function adminToken(tarhely) {
  let token = tarhely.getItem(ADMIN_TOKEN_KULCS);
  if (!token) {
    token = prompt("Add meg az admin GitHub tokened (csak ezen a gépen tárolódik):") ?? "";
    tarhely.setItem(ADMIN_TOKEN_KULCS, token);
  }
  return token;
}

/**
 * Betölti az admin katalógust. Hiba esetén `null`-t ad — SOHA nem dob.
 * Külön függvény, hogy DOM nélkül tesztelhető legyen.
 */
export async function betoltKatalogus(lekero) {
  try {
    const valasz = await lekero("./katalogus.json");
    if (!valasz.ok) return null;
    return await valasz.json();
  } catch {
    return null;
  }
}

function szam(ertek) {
  return ertek === null || ertek === undefined ? "–" : String(ertek);
}

function keszitKartya(kartya) {
  const { ugyfel, osszesito } = kartya;
  const elem = document.createElement("article");
  elem.className = `ugyfel-kartya statusz-${kartya.statusz}`;
  elem.innerHTML = `
    <div class="fejlec"><h2></h2><span class="cimke"></span></div>
    <p class="szamok"></p>
    <p class="legjobb"></p>
    <div class="gombok">
      <a class="reszletek">Részletek</a>
      <button type="button" class="masol">Link másolása</button>
      <a class="ovele" target="_blank" rel="noopener">Az ő szemével</a>
    </div>`;

  elem.querySelector("h2").textContent = ugyfel.nev;
  elem.querySelector(".cimke").textContent = STATUSZ_FELIRAT[kartya.statusz];
  // A rejtett tervek nincsenek benne a katalógusban — csak a darabszámuk jön át,
  // hogy lásd, mennyit tettél félre. Ha nincs rejtett, a szöveg változatlan.
  const rejtett = ugyfel.rejtett_szam ? ` · ${ugyfel.rejtett_szam} rejtett` : "";
  elem.querySelector(".szamok").textContent =
    `${osszesito.osszes} terv · Én: ${osszesito.enErtekeltem}/${osszesito.osszes} ` +
    `(átlag ${szam(osszesito.enAtlag)}) · Ő: ${osszesito.oErtekelte}/${osszesito.publikus} ` +
    `(átlag ${szam(osszesito.oAtlag)}) · ${osszesito.ugyfelMegjegyzesek} megjegyzés` +
    rejtett;
  elem.querySelector(".legjobb").textContent = osszesito.legjobb
    ? `Legjobb: „${osszesito.legjobb.cim}" — ${osszesito.legjobb.pont} pont`
    : "Még nincs pontozott terv.";

  const ugyfelUt = `../u/${ugyfel.utvonal_nev}/`;
  elem.querySelector(".reszletek").href = `./ugyfel.html?slug=${encodeURIComponent(ugyfel.slug)}`;
  elem.querySelector(".ovele").href = ugyfelUt;
  elem.querySelector(".masol").addEventListener("click", () => {
    navigator.clipboard.writeText(new URL(ugyfelUt, location.href).href);
  });
  return elem;
}

export async function inditAdminOsszefoglalo(beallitas, kornyezet = {}) {
  const gyoker = kornyezet.gyoker ?? document;
  const lekero = kornyezet.fetchImpl ?? fetch;
  const tarhely = kornyezet.tarhely ?? localStorage;

  const token = adminToken(tarhely);
  const tarolo = keszitTarolo({ repo: beallitas.repo, token, fetchImpl: lekero, tarhely });

  const lista = gyoker.getElementById("ugyfelek");

  // A token-csere gomb a katalógus betöltése ELŐTT kap kezelőt: pont akkor kell
  // menekülőútnak lennie, amikor a betöltés elhasal és a korai `return` fut.
  gyoker.getElementById("token-csere").addEventListener("click", () => {
    // Üres tokent mentünk: a következő betöltéskor újra kérdez.
    tarhely.setItem(ADMIN_TOKEN_KULCS, "");
    location.reload();
  });

  const katalogus = await betoltKatalogus(lekero);
  if (!katalogus) {
    gyoker.getElementById("sav").textContent = "Nem sikerült betölteni a katalógust";
    lista.textContent =
      "Frissítsd az oldalt. Ha nem múlik el, futtass egy új publikálást a Műhelyből.";
    return;
  }

  const adminErtekelesek = await tarolo.betolt(`admin-${beallitas.adminHash}.json`);

  // Párhuzamosan töltjük az ügyfelek értékeléseit: sorosan futva minden ügyfél
  // egy külön hálózati kört jelentene, ami telefonon érezhetően lassú.
  const kartyak = await Promise.all(
    katalogus.ugyfelek.map(async (ugyfel) => {
      const ugyfelErtekelesek = await tarolo.betolt(`${ugyfel.utvonal_nev}.json`);
      const osszesito = ugyfelOsszesito(ugyfel.tervek, adminErtekelesek, ugyfelErtekelesek);
      return { ugyfel, osszesito, statusz: statusz(osszesito) };
    }),
  );

  const sav = osszesitoSav(kartyak);
  gyoker.getElementById("sav").textContent =
    `${sav.ugyfelek} ügyfél · ${sav.tervek} terv · ${sav.varRam} vár rám · ${sav.megjegyzesek} megjegyzés`;

  lista.replaceChildren(...kartyak.map(keszitKartya));
  if (!kartyak.length) lista.textContent = "Még nincs egy ügyfél sem.";
}
