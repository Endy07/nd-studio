/** Admin részletes nézet egy ügyfélre: minden terv, minden adat, pontozás. */

import { keszitTarolo } from "./tarolo.js";
import { ADMIN_TOKEN_KULCS, adminToken, betoltKatalogus } from "./admin-osszefoglalo.js";
import {
  HIBAJELZESEK,
  kellMegerosites,
  megerositoSzoveg,
  publikusErtekeles,
  regibolOlvas,
} from "./ertekeles.js";

const HIBAJELZES_FELIRAT = Object.fromEntries(
  HIBAJELZESEK.map((jelzes) => [jelzes.kulcs, jelzes.felirat]),
);

/** Az ügyfél böngészője is letölti — az admin hash nem kerülhet a nevébe. */
export function ugyfelFajlnev(utvonalNev) {
  return `${utvonalNev}-admin.json`;
}

export function sorAdat(terv, adminErtekeles, ugyfelErtekeles) {
  const enyem = regibolOlvas(adminErtekeles);
  const ove = ugyfelErtekeles ?? {};
  return {
    id: terv.id,
    cim: terv.cim,
    utvonal: terv.utvonal,
    modell: terv.modell ?? "–",
    prompt: terv.prompt ?? "–",
    // Csak a benchmarkbol beemelt terveknel van: a kliens teljes valasza a mereskor.
    // A tobbi tervnel ures, es ilyenkor a gomb meg sem jelenik.
    valasz: terv.valasz ?? "",
    publikus: Boolean(terv.publikus),
    enPont: enyem.pont,
    enHibajelzes: enyem.hibajelzes,
    enMegjegyzes: enyem.megjegyzes,
    enElfogadva: enyem.elfogadva,
    enJegyzet: adminErtekeles?.jegyzet ?? "",
    oPont: ove.pont ?? null,
    oHibajelzes: ove.hibajelzes ?? "",
    oMegjegyzes: ove.megjegyzes ?? "",
    oValasztott: Boolean(ove.valasztott),
  };
}

/**
 * A lenyíló doboz igazítása a látható sávhoz.
 *
 * A táblázat vízszintesen görgethető, a gyereksor cellája viszont a TELJES
 * táblaszélességet kapja — a szöveg így a látótéren túl törne, és jobb oldalt
 * levágódna. A `position: sticky` a bal szélhez ragasztja; a szélességet innen
 * mérjük rá, mert a látható sáv szélessége CSS-ből nem ismerhető.
 */
function igazitLathatoSavhoz(doboz) {
  let szulo = doboz.parentElement;
  while (szulo && szulo !== document.body) {
    const stilus = getComputedStyle(szulo);
    const gorget = stilus.overflowX === "auto" || stilus.overflowX === "scroll";
    if (gorget && szulo.clientWidth) {
      doboz.style.width = `${Math.max(320, szulo.clientWidth - 24)}px`;
      return;
    }
    szulo = szulo.parentElement;
  }
}

/**
 * A benchmark-kliens válasza, a tervsor alatt kinyitva.
 *
 * Csak az admin oldalon van rá szükség; az ügyfél katalógusa fehérlistás
 * (`UGYFEL_FEHERLISTA`), oda a `valasz` mező eleve nem jut el.
 */
function valaszNyito(sorElem, valasz) {
  const gomb = document.createElement("button");
  gomb.type = "button";
  gomb.className = "valasz-gomb";
  gomb.textContent = "Válasz ▾";
  gomb.addEventListener("click", () => {
    const kovetkezo = sorElem.nextElementSibling;
    if (kovetkezo && kovetkezo.classList.contains("valasz-sor")) {
      kovetkezo.remove();
      gomb.textContent = "Válasz ▾";
      return;
    }
    const reszletSor = document.createElement("tr");
    reszletSor.className = "valasz-sor";
    const cella = document.createElement("td");
    // A fejléc oszlopszámát olvassuk, nem beégetett számot.
    cella.colSpan = sorElem.children.length;
    const doboz = document.createElement("div");
    doboz.className = "valasz-reszlet";
    // textContent, nem innerHTML: a válasz a modelltől jön, nem megbízható tartalom.
    doboz.textContent = valasz;
    cella.append(doboz);
    reszletSor.append(cella);
    sorElem.after(reszletSor);
    igazitLathatoSavhoz(doboz);
    gomb.textContent = "Válasz ▴";
  });
  return gomb;
}

function keszitSor(sor, ugyfelUt, mentes) {
  const elem = document.createElement("tr");
  elem.innerHTML = `
    <td class="cim"><strong></strong><br><a target="_blank" rel="noopener">Megnyitás</a></td>
    <td class="meta"></td>
    <td class="pontok"></td>
    <td class="statuszok"></td>
    <td><textarea class="en-megjegyzes" placeholder="Megjegyzés — az ügyfél is látja"></textarea>
        <textarea class="en-jegyzet" placeholder="Belső jegyzet — csak te látod"></textarea></td>
    <td class="ovalasz"></td>`;

  elem.querySelector("strong").textContent = sor.cim;
  elem.querySelector("a").href = ugyfelUt + sor.utvonal;
  const meta = elem.querySelector(".meta");
  meta.textContent = `${sor.modell} · ${sor.prompt}`;
  if (sor.valasz) meta.append(valaszNyito(elem, sor.valasz));

  const pontok = elem.querySelector(".pontok");
  for (let pont = 0; pont <= 10; pont += 1) {
    const gomb = document.createElement("button");
    gomb.type = "button";
    gomb.className = "pont" + (sor.enPont === pont ? " aktiv" : "");
    gomb.textContent = pont;
    gomb.addEventListener("click", () => {
      if (kellMegerosites(sor.enPont, pont)
          && !confirm(megerositoSzoveg("Pont", sor.enPont, pont))) return;
      sor.enPont = pont;
      pontok.querySelectorAll("button").forEach((g) => g.classList.remove("aktiv"));
      gomb.classList.add("aktiv");
      mentes(sor.id, { pont }, "publikus");
    });
    pontok.append(gomb);
  }

  const statuszok = elem.querySelector(".statuszok");
  for (const jelzes of HIBAJELZESEK) {
    const gomb = document.createElement("button");
    gomb.type = "button";
    gomb.className = sor.enHibajelzes === jelzes.kulcs ? "aktiv" : "";
    gomb.textContent = jelzes.felirat;
    gomb.addEventListener("click", () => {
      const regiFelirat = HIBAJELZES_FELIRAT[sor.enHibajelzes] ?? "";
      if (kellMegerosites(regiFelirat, jelzes.felirat)
          && !confirm(megerositoSzoveg("Hibajelzés", regiFelirat, jelzes.felirat))) return;
      sor.enHibajelzes = jelzes.kulcs;
      statuszok.querySelectorAll("button").forEach((g) => g.classList.remove("aktiv"));
      gomb.classList.add("aktiv");
      mentes(sor.id, { hibajelzes: jelzes.kulcs }, "publikus");
    });
    statuszok.append(gomb);
  }

  const elfogad = document.createElement("button");
  elfogad.type = "button";
  elfogad.className = "elfogad" + (sor.enElfogadva ? " aktiv" : "");
  elfogad.textContent = "⭐ Elfogadva";
  elfogad.addEventListener("click", () => {
    if (sor.enElfogadva && !confirm("Visszavonod az elfogadást?")) return;
    sor.enElfogadva = !sor.enElfogadva;
    elfogad.classList.toggle("aktiv", sor.enElfogadva);
    mentes(sor.id, { elfogadva: sor.enElfogadva }, "publikus");
  });
  statuszok.append(elfogad);

  // A publikus/nem publikus állapot itt CSAK látszik. Átállítani a Műhelyben lehet:
  // ez az oldal a GitHub Pages-en fut, onnan nincs elérése a lokális kiszolgálóhoz.
  const jelzo = document.createElement("span");
  jelzo.className = "kapcsolo";
  jelzo.textContent = sor.publikus ? "Publikus ✓" : "Nem publikus";
  statuszok.append(jelzo);

  const megjegyzes = elem.querySelector(".en-megjegyzes");
  megjegyzes.value = sor.enMegjegyzes;
  let idozito = null;
  megjegyzes.addEventListener("input", () => {
    clearTimeout(idozito);
    idozito = setTimeout(() => mentes(sor.id, { megjegyzes: megjegyzes.value }, "publikus"), 800);
  });

  const jegyzet = elem.querySelector(".en-jegyzet");
  jegyzet.value = sor.enJegyzet;
  let jegyzetIdozito = null;
  jegyzet.addEventListener("input", () => {
    clearTimeout(jegyzetIdozito);
    jegyzetIdozito = setTimeout(() => mentes(sor.id, { jegyzet: jegyzet.value }, "belso"), 800);
  });

  const oveCella = elem.querySelector(".ovalasz");
  const reszek = [];
  if (sor.oPont !== null) reszek.push(`${sor.oPont}/10`);
  if (sor.oHibajelzes) reszek.push(HIBAJELZES_FELIRAT[sor.oHibajelzes]);
  if (sor.oValasztott) reszek.push("⭐ Ezt választja");
  if (sor.oMegjegyzes) reszek.push(`„${sor.oMegjegyzes}”`);
  oveCella.textContent = reszek.length ? reszek.join(" · ") : "–";
  return elem;
}

export async function inditAdminUgyfel(beallitas, kornyezet = {}) {
  const gyoker = kornyezet.gyoker ?? document;
  const lekero = kornyezet.fetchImpl ?? fetch;
  const tarhely = kornyezet.tarhely ?? localStorage;
  const slug = new URLSearchParams(location.search).get("slug");

  // Ugyanaz a token-bekérés, mint az összefoglalón: könyvjelzőből nyitva is
  // legyen tokenünk. Enélkül üres tokennel indulnánk, minden mentés némán
  // elbukna, és a pontok csak ebben a böngészőben maradnának meg.
  const tarolo = keszitTarolo({
    repo: beallitas.repo,
    token: adminToken(tarhely),
    fetchImpl: lekero,
    tarhely,
  });

  const cimElem = gyoker.getElementById("cim");
  const jelzo = gyoker.getElementById("mentes-jelzo");
  const sorokElem = gyoker.getElementById("sorok");

  // Menekülőút, ha rossz tokent adtunk meg — a korai visszatérések ELŐTT.
  const tokenGomb = document.createElement("button");
  tokenGomb.type = "button";
  tokenGomb.textContent = "Token cseréje";
  tokenGomb.addEventListener("click", () => {
    tarhely.setItem(ADMIN_TOKEN_KULCS, "");
    location.reload();
  });
  jelzo.after(tokenGomb);

  const katalogus = await betoltKatalogus(lekero);
  if (!katalogus) {
    cimElem.textContent = "Nem sikerült betölteni a katalógust";
    jelzo.textContent = "Frissítsd az oldalt. Ha nem múlik el, futtass egy új publikálást a Műhelyből.";
    return;
  }

  const ugyfel = katalogus.ugyfelek.find((u) => u.slug === slug);
  if (!ugyfel) {
    cimElem.textContent = "Nincs ilyen ügyfél";
    jelzo.textContent = "Lehet, hogy elavult a link. Menj vissza az összefoglalóra.";
    return;
  }
  cimElem.textContent = ugyfel.nev;

  // KET fajl: a belso jegyzet a titkos nevu adminfajlban marad, a kimeno mezok
  // az ugyfel altal is olvashato fajlba kerulnek. Az admin hash igy sosem jut ki.
  const belsoFajlnev = `admin-${beallitas.adminHash}.json`;
  const publikusFajlnev = ugyfelFajlnev(ugyfel.utvonal_nev);
  const belsoErtekelesek = await tarolo.betolt(belsoFajlnev);
  const sajatPublikus = await tarolo.betolt(publikusFajlnev);
  const ugyfelErtekelesek = await tarolo.betolt(`${ugyfel.utvonal_nev}.json`);

  // A ket forras egyesitese: a publikus fajl nyer, mert az az uj hely. Ami meg csak
  // a regi belso fajlban van, azt onnan olvassuk — igy a korabbi pontjaid nem
  // tunnek el az atallaskor.
  const sajatOsszes = {};
  for (const tervId of new Set([
    ...Object.keys(belsoErtekelesek),
    ...Object.keys(sajatPublikus),
  ])) {
    sajatOsszes[tervId] = { ...belsoErtekelesek[tervId], ...sajatPublikus[tervId] };
  }

  async function mentes(tervId, valtozas, hova) {
    jelzo.textContent = "Mentés…";
    const fajl = hova === "belso" ? belsoFajlnev : publikusFajlnev;
    const adat = hova === "belso" ? valtozas : publikusErtekeles(valtozas);
    const eredmeny = await tarolo.ment(fajl, tervId, adat);
    jelzo.textContent = eredmeny.mentve ? "Elmentve ✓" : "Mentés folyamatban…";
  }

  keszitMegosztoGomb(tarolo, sajatOsszes, sajatPublikus, publikusFajlnev, jelzo);

  const ugyfelUt = `../u/${ugyfel.utvonal_nev}/`;
  sorokElem.replaceChildren(
    ...ugyfel.tervek.map((terv) =>
      keszitSor(sorAdat(terv, sajatOsszes[terv.id], ugyfelErtekelesek[terv.id]), ugyfelUt, mentes)
    )
  );
}

/**
 * A regi ertekelesek egyszeri megosztasa. Gomb es nem automatikus: a velemenyed
 * egyszerre jelenne meg az ugyfelnel, legyen a te dontesed, mikor.
 * Kotegelt iras: tervenkenti mentes 88 tervnel a GitHub rate limitjebe futna.
 */
function keszitMegosztoGomb(tarolo, sajatOsszes, sajatPublikus, publikusFajlnev, jelzo) {
  const megosztando = {};
  for (const [tervId, ertekeles] of Object.entries(sajatOsszes)) {
    if (sajatPublikus[tervId]) continue;
    const publikus = publikusErtekeles(regibolOlvas(ertekeles));
    if (publikus.pont !== null || publikus.hibajelzes || publikus.elfogadva) {
      megosztando[tervId] = publikus;
    }
  }

  const darab = Object.keys(megosztando).length;
  if (!darab) return;

  const gomb = document.createElement("button");
  gomb.type = "button";
  gomb.className = "megosztas";
  gomb.textContent = `Korábbi értékeléseim megosztása az ügyféllel (${darab} terv)`;
  gomb.addEventListener("click", async () => {
    gomb.disabled = true;
    gomb.textContent = "Megosztás…";
    const eredmeny = await tarolo.mentTobb(publikusFajlnev, megosztando);
    gomb.textContent = eredmeny.mentve
      ? "Megosztva."
      : "Nem sikerült feltölteni — a következő betöltéskor újrapróbáljuk.";
  });
  jelzo.after(gomb);
}
