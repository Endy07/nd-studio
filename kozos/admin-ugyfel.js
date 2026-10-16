/** Admin részletes nézet egy ügyfélre: minden terv, minden adat, pontozás. */

import { keszitTarolo } from "./tarolo.js";
import { keszitDatumSzuro, keszitLathatosag } from "./datum-szuro.js";
import { cimkeLista, keszitCimkeSzuro, keszitCimkek } from "./cimke-szuro.js";
import { keszitLeiras, keszitOsszevetes, keszitVideoMiniatur, leirasSzoveg, videoUtak } from "./ugyfel-video.js";
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
    leiras: leirasSzoveg(terv.leiras),
    // A kártyás nézet dátum-szűrőjéhez (`datum-szuro.js`); hiányában üres → „Dátum nélkül”.
    keszult: terv.keszult ?? "",
    // A kártyán a leírás alatt, és a kártyás nézet címke-szűrőjéhez (`cimke-szuro.js`).
    cimkek: cimkeLista(terv.cimkek),
    utvonal: terv.utvonal,
    tipus: terv.tipus ?? "",
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
  // A táblában a leírás kis szürke sor a cím alatt (és a cím súgója) — ugyanaz, amit az ügyfél a kártyán lát.
  const leiras = keszitLeiras(sor.leiras, document, "small");
  if (leiras) {
    elem.querySelector("strong").title = sor.leiras;
    elem.querySelector(".cim a").before(leiras);   // a <br> után: blokkszintű sor a cím és a link között
  }
  elem.querySelector("a").href = ugyfelUt + sor.utvonal;
  const meta = elem.querySelector(".meta");
  meta.textContent = sor.tipus === "video" ? "videó" : `${sor.modell} · ${sor.prompt}`;
  if (sor.tipus === "video") {
    // A videó-tervet itt helyben is meg lehet nézni (kicsiben, ⛶ teljes képernyő) — ugyanaz a fájl, mint az ügyfélnél.
    const { mp4, poszter } = videoUtak(ugyfelUt + sor.utvonal);
    const doboz = document.createElement("div");
    doboz.className = "admin-video";
    const video = document.createElement("video");
    Object.assign(video, { src: mp4, poster: poszter, preload: "none", controls: true, playsInline: true });
    const nagyit = document.createElement("button");
    nagyit.type = "button";
    nagyit.textContent = "⛶";
    nagyit.title = "Teljes képernyő";
    nagyit.addEventListener("click", () => (video.requestFullscreen ?? video.webkitEnterFullscreen)?.call(video));
    doboz.append(video, nagyit);
    elem.querySelector(".cim").append(doboz);
  }
  if (sor.valasz) meta.append(valaszNyito(elem, sor.valasz));

  toltPontok(elem.querySelector(".pontok"), sor, mentes);
  toltStatuszok(elem.querySelector(".statuszok"), sor, mentes);
  kotJegyzetek(elem.querySelector(".en-megjegyzes"), elem.querySelector(".en-jegyzet"), sor, mentes);
  elem.querySelector(".ovalasz").textContent = ovalaszSzoveg(sor);
  return elem;
}

/** Az ügyfél válasza egy sorban (a tábla „Az ő válasza” oszlopa és a kártya „Az ügyfél” doboza). */
export function ovalaszSzoveg(sor) {
  const reszek = [];
  if (sor.oPont !== null) reszek.push(`${sor.oPont}/10`);
  if (sor.oHibajelzes) reszek.push(HIBAJELZES_FELIRAT[sor.oHibajelzes]);
  if (sor.oValasztott) reszek.push("⭐ Ezt választja");
  if (sor.oMegjegyzes) reszek.push(`„${sor.oMegjegyzes}”`);
  return reszek.length ? reszek.join(" · ") : "–";
}

/** Kártya vagy tábla — böngészőnként megjegyezve; a tár hibája (privát ablak) sosem dob. */
export const NEZET_KULCS = "nd-studio:admin-nezet";
export function nezetBetolt(tarhely) {
  try {
    return tarhely?.getItem(NEZET_KULCS) === "tabla" ? "tabla" : "kartya";
  } catch {
    return "kartya";
  }
}
export function nezetMent(tarhely, nezet) {
  try {
    tarhely?.setItem(NEZET_KULCS, nezet);
  } catch {
    // csak kényelmi beállítás: ha nem menthető, a következő betöltés kártyával indul
  }
}

/**
 * Kártyás nézet: ugyanaz a kártya, mint az ügyfélnél (élő miniatúra, illetve kicsiben lejátszható videó,
 * ⛶, összevetés), de a TE értékelőiddel, alattuk az ügyfél válaszával. A mentés ugyanaz, mint a táblában.
 */
function keszitAdminKartya(sor, ugyfelUt, mentes, osszevetes) {
  const kartya = document.createElement("article");
  kartya.className = "kartya" + (sor.enElfogadva ? " elfogadott" : "");
  kartya.innerHTML = `
    <div class="miniatur"><iframe loading="lazy" title=""></iframe></div>
    <h2></h2>
    <p class="kartya-meta"></p>
    <a class="megnezem" target="_blank" rel="noopener">Megnézem</a>
    <div class="pontok"></div>
    <div class="statuszok kartya-statuszok"></div>
    <textarea class="megjegyzes en-megjegyzes" placeholder="Megjegyzés — az ügyfél is látja"></textarea>
    <textarea class="megjegyzes en-jegyzet" placeholder="Belső jegyzet — csak te látod"></textarea>
    <div class="admin-velemeny ugyfel-valasz"></div>`;
  const ut = ugyfelUt + sor.utvonal;
  kartya.querySelector("h2").textContent = sor.cim;
  kartya.querySelector(".kartya-meta").textContent = sor.tipus === "video" ? "videó" : `${sor.modell} · ${sor.prompt}`;
  kartya.querySelector(".megnezem").href = ut;
  if (sor.tipus === "video" && osszevetes) {
    const { doboz, jelolo } = keszitVideoMiniatur({ cim: sor.cim, utvonal: ut }, sor.id, osszevetes);
    kartya.querySelector(".miniatur").replaceWith(doboz);
    kartya.querySelector("h2").after(jelolo);
  } else {
    const keret = kartya.querySelector("iframe");
    keret.setAttribute("sandbox", "allow-scripts");   // ugyanaz az elszigetelés, mint az ügyfélnél
    keret.src = ut;
    keret.title = sor.cim;
  }
  const leiras = keszitLeiras(sor.leiras);
  if (leiras) kartya.querySelector("h2").after(leiras);
  const cimkek = keszitCimkek(sor.cimkek);
  if (cimkek) (leiras ?? kartya.querySelector("h2")).after(cimkek);
  toltPontok(kartya.querySelector(".pontok"), sor, mentes);
  toltStatuszok(kartya.querySelector(".statuszok"), sor, mentes, (be) => kartya.classList.toggle("elfogadott", be));
  kotJegyzetek(kartya.querySelector(".en-megjegyzes"), kartya.querySelector(".en-jegyzet"), sor, mentes);
  kartya.querySelector(".ugyfel-valasz").textContent = `Az ügyfél: ${ovalaszSzoveg(sor)}`;
  return kartya;
}

function toltPontok(pontok, sor, mentes) {
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
}

function toltStatuszok(statuszok, sor, mentes, elfogadasValtozott = () => {}) {
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
    elfogadasValtozott(sor.enElfogadva);
    mentes(sor.id, { elfogadva: sor.enElfogadva }, "publikus");
  });
  statuszok.append(elfogad);

  // A publikus/nem publikus állapot itt CSAK látszik. Átállítani a Műhelyben lehet:
  // ez az oldal a GitHub Pages-en fut, onnan nincs elérése a lokális kiszolgálóhoz.
  const jelzo = document.createElement("span");
  jelzo.className = "kapcsolo";
  jelzo.textContent = sor.publikus ? "Publikus ✓" : "Nem publikus";
  statuszok.append(jelzo);
}

function kotJegyzetek(megjegyzes, jegyzet, sor, mentes) {
  megjegyzes.value = sor.enMegjegyzes;
  let idozito = null;
  megjegyzes.addEventListener("input", () => {
    clearTimeout(idozito);
    idozito = setTimeout(() => mentes(sor.id, { megjegyzes: megjegyzes.value }, "publikus"), 800);
  });

  jegyzet.value = sor.enJegyzet;
  let jegyzetIdozito = null;
  jegyzet.addEventListener("input", () => {
    clearTimeout(jegyzetIdozito);
    jegyzetIdozito = setTimeout(() => mentes(sor.id, { jegyzet: jegyzet.value }, "belso"), 800);
  });
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
  const sorok = ugyfel.tervek.map((terv) => sorAdat(terv, sajatOsszes[terv.id], ugyfelErtekelesek[terv.id]));
  sorokElem.replaceChildren(...sorok.map((sor) => keszitSor(sor, ugyfelUt, mentes)));

  // Kártyás nézet (alapból ez látszik): az összevetés az ügyféloldal moduljával, a videók útja az ügyfél mappájából.
  const kartyakElem = gyoker.getElementById("kartyak");
  const videok = sorok.filter((s) => s.tipus === "video").map((s) => ({ id: s.id, cim: s.cim, leiras: s.leiras, utvonal: ugyfelUt + s.utvonal }));
  const osszevetes = videok.length ? keszitOsszevetes(gyoker, videok) : null;
  const kartyaParok = sorok.map((sor) => [sor, keszitAdminKartya(sor, ugyfelUt, mentes, osszevetes)]);
  kartyakElem.replaceChildren(...kartyaParok.map(([, kartya]) => kartya));
  // Ugyanaz a dátum- és címke-szűrő, mint az ügyfélnél (közös láthatóság, ÉS) — külön kulccsal (`admin:<slug>`),
  // csak a kártyás nézetben.
  const lathatosag = keszitLathatosag(kartyaParok);
  const datumSzuro = keszitDatumSzuro({ parok: kartyaParok, tarhely, azonosito: `admin:${ugyfel.slug}`, lathatosag });
  if (datumSzuro) kartyakElem.before(datumSzuro);
  const cimkeSzuro = keszitCimkeSzuro({ parok: kartyaParok, tarhely, azonosito: `admin:${ugyfel.slug}`, lathatosag });
  if (cimkeSzuro) kartyakElem.before(cimkeSzuro);

  const nezetGombok = [...gyoker.querySelectorAll("[data-nezet]")];
  const mutat = (nezet) => {
    kartyakElem.hidden = nezet !== "kartya";
    if (datumSzuro) datumSzuro.hidden = nezet !== "kartya";
    if (cimkeSzuro) cimkeSzuro.hidden = nezet !== "kartya";
    gyoker.getElementById("tabla-keret").hidden = nezet !== "tabla";
    for (const g of nezetGombok) g.classList.toggle("aktiv", g.dataset.nezet === nezet);
  };
  for (const g of nezetGombok) g.addEventListener("click", () => { nezetMent(tarhely, g.dataset.nezet); mutat(g.dataset.nezet); });
  mutat(nezetBetolt(tarhely));
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
