/**
 * Az ügyfél felülete. Nem lát modellnevet, fájlnevet, beállítást és belső jegyzetet.
 *
 * Pontot ad (0–10) és hibajelzést — ugyanazt a nyelvet, mint a tulajdonos —, és látja
 * a tulajdonos értékelését is. A belső jegyzet SOHA nem kerül ide: azt a
 * publikusErtekeles fehérlistája szűri ki már a mentésnél.
 */

import { keszitTarolo } from "./tarolo.js";
import {
  HIBAJELZESEK,
  SZEKCIO_SLOTOK,
  TOKEN_SLOTOK,
  kellMegerosites,
  megerositoSzoveg,
  slotAthelyez,
  slotokTervhez,
} from "./ertekeles.js";

const HIBAJELZES_FELIRAT = Object.fromEntries(
  HIBAJELZESEK.map((jelzes) => [jelzes.kulcs, jelzes.felirat]),
);

export function kartyaAdat(terv, sajatErtekeles, adminErtekeles) {
  const enyem = sajatErtekeles ?? {};
  const ove = adminErtekeles ?? {};
  return {
    cim: terv.cim,
    utvonal: terv.utvonal,
    pont: enyem.pont ?? null,
    hibajelzes: enyem.hibajelzes ?? "",
    megjegyzes: enyem.megjegyzes ?? "",
    valasztott: Boolean(enyem.valasztott),
    tipus: terv.tipus ?? "",
    slotok: slotokTervhez(enyem),
    adminPont: ove.pont ?? null,
    adminHibajelzes: ove.hibajelzes ?? "",
    adminMegjegyzes: ove.megjegyzes ?? "",
    adminElfogadva: Boolean(ove.elfogadva),
  };
}

/**
 * Kép-terven nincs mit szekciózni: a mockup egészében választható, részleteiben
 * nem. A `tipus` mező a 3a-ból jön (`terv.json` → katalógus).
 */
export function vanSlotValaszto(adat) {
  return (adat?.tipus ?? "") !== "kep";
}

/**
 * A slot-állapot a kártyák FÖLÖTT él: egy slot egy tervé, tehát egy kattintás a
 * többi kártya gombjait is átrajzolja.
 *
 * A mentés KÖTEGELT (`mentTobb`), és ez nem optimalizálás: egy áthelyezés KÉT
 * tervet ír (levétel + felvétel), a `ment` pedig olvas-módosít-ír ciklusban
 * dolgozik egy hálózati kör körül. Két párhuzamos `ment` közül a második a
 * REGI pillanatképet írja vissza — az élő próbán így veszett el az egyik terv
 * mentése, miközben a képernyőn minden helyesnek látszott.
 *
 * DOM nélkül tesztelhető: a rajzolást és a mentést is a hívó adja.
 */
export function keszitSlotVezerlo(kezdoErtekelesek, mentKoteg) {
  let allapot = kezdoErtekelesek ?? {};
  const rajzolok = new Map();

  return {
    figyel(tervId, rajzol) {
      rajzolok.set(tervId, rajzol);
    },
    kattint(tervId, slot) {
      const { ertekelesek, valtozasok } = slotAthelyez(allapot, tervId, slot);
      allapot = ertekelesek;
      for (const [azonosito, rajzol] of rajzolok) {
        rajzol(slotokTervhez(allapot[azonosito]));
      }
      if (!valtozasok.length) return;
      mentKoteg(Object.fromEntries(valtozasok.map((v) => [v.tervId, v.mezok])));
    },
    allapot: () => allapot,
  };
}

/**
 * Betölti az ügyfél adatait. Hiba esetén `null`-t ad — SOHA nem dob.
 * Külön függvény, hogy DOM nélkül tesztelhető legyen.
 */
export async function betoltAdat(lekero) {
  try {
    const valasz = await lekero("./adat.json");
    if (!valasz.ok) return null;
    return await valasz.json();
  } catch {
    return null;
  }
}

/**
 * A slot-gombsor a kártyán (D1): az ügyfél itt mondja meg, melyik részt kéri
 * EBBŐL a tervből. Nem a terv HTML-jébe kattint: az iframe `allow-same-origin`
 * nélkül fut, oda a kattintás csak postMessage-híddal jutna el — az minden
 * terv-HTML-t új konvencióhoz kötne.
 *
 * A `slotVezerlo` a kártyák FÖLÖTT él, mert egy slot egy tervé: egy kattintás
 * a többi kártya gombjait is elsötétíti.
 */
function keszitSlotSor(adat, tervId, slotVezerlo) {
  const sor = document.createElement("div");
  sor.className = "slotok";
  sor.innerHTML = `<p class="slot-sugo">Melyik részt kéred ebből a tervből?</p>`;

  const gombok = new Map();
  for (const [csoport, slotok] of [
    ["szekcio", SZEKCIO_SLOTOK],
    ["token", TOKEN_SLOTOK],
  ]) {
    const csoportElem = document.createElement("div");
    csoportElem.className = `slot-csoport ${csoport}`;
    for (const slot of slotok) {
      const gomb = document.createElement("button");
      gomb.type = "button";
      gomb.className = "slot";
      gomb.textContent = slot.felirat;
      gomb.addEventListener("click", () => slotVezerlo.kattint(tervId, slot.kulcs));
      gombok.set(slot.kulcs, gomb);
      csoportElem.append(gomb);
    }
    sor.append(csoportElem);
  }

  const rajzol = (aktivak) => {
    for (const [kulcs, gomb] of gombok) {
      gomb.classList.toggle("aktiv", aktivak.has(kulcs));
    }
  };
  rajzol(adat.slotok);
  slotVezerlo.figyel(tervId, rajzol);
  return sor;
}

function keszitKartya(adat, tervId, mentes, slotVezerlo) {
  const kartya = document.createElement("article");
  kartya.className = "kartya" + (adat.adminElfogadva ? " elfogadott" : "");
  kartya.innerHTML = `
    <div class="miniatur"><iframe loading="lazy" title=""></iframe></div>
    <h2></h2>
    <a class="megnezem" target="_blank" rel="noopener">Megnézem</a>
    <div class="pontok"></div>
    <div class="hibajelzesek"></div>
    <button type="button" class="valasztom">⭐ Ezt választom</button>
    <textarea class="megjegyzes" placeholder="Ha van megjegyzésed, ide írhatod…"></textarea>
    <div class="admin-velemeny"></div>`;

  kartya.querySelector("h2").textContent = adat.cim;
  const keret = kartya.querySelector("iframe");
  // allow-scripts ONMAGABAN, allow-same-origin NELKUL: az iframe igy egyedi
  // origint kap. A terv szkriptjei futnak (a kinezet megmarad), de a szulo
  // oldal localStorage-at nem erik el.
  keret.setAttribute("sandbox", "allow-scripts");
  keret.src = adat.utvonal;
  keret.title = adat.cim;
  kartya.querySelector(".megnezem").href = adat.utvonal;

  const pontok = kartya.querySelector(".pontok");
  for (let pont = 0; pont <= 10; pont += 1) {
    const gomb = document.createElement("button");
    gomb.type = "button";
    gomb.className = "pont" + (adat.pont === pont ? " aktiv" : "");
    gomb.textContent = pont;
    gomb.addEventListener("click", () => {
      if (kellMegerosites(adat.pont, pont)
          && !confirm(megerositoSzoveg("Pont", adat.pont, pont))) return;
      adat.pont = pont;
      pontok.querySelectorAll("button").forEach((g) => g.classList.remove("aktiv"));
      gomb.classList.add("aktiv");
      mentes(tervId, { pont });
    });
    pontok.append(gomb);
  }

  const jelzesek = kartya.querySelector(".hibajelzesek");
  for (const jelzes of HIBAJELZESEK) {
    const gomb = document.createElement("button");
    gomb.type = "button";
    gomb.className = adat.hibajelzes === jelzes.kulcs ? "aktiv" : "";
    gomb.textContent = jelzes.felirat;
    gomb.addEventListener("click", () => {
      const regiFelirat = HIBAJELZES_FELIRAT[adat.hibajelzes] ?? "";
      if (kellMegerosites(regiFelirat, jelzes.felirat)
          && !confirm(megerositoSzoveg("Hibajelzés", regiFelirat, jelzes.felirat))) return;
      adat.hibajelzes = jelzes.kulcs;
      jelzesek.querySelectorAll("button").forEach((g) => g.classList.remove("aktiv"));
      gomb.classList.add("aktiv");
      mentes(tervId, { hibajelzes: jelzes.kulcs });
    });
    jelzesek.append(gomb);
  }

  const valasztom = kartya.querySelector(".valasztom");
  valasztom.classList.toggle("aktiv", adat.valasztott);
  valasztom.addEventListener("click", () => {
    if (adat.valasztott && !confirm("Visszavonod a választásod?")) return;
    adat.valasztott = !adat.valasztott;
    valasztom.classList.toggle("aktiv", adat.valasztott);
    mentes(tervId, { valasztott: adat.valasztott });
  });

  if (slotVezerlo && vanSlotValaszto(adat)) {
    valasztom.after(keszitSlotSor(adat, tervId, slotVezerlo));
  }

  const megjegyzes = kartya.querySelector(".megjegyzes");
  megjegyzes.value = adat.megjegyzes;
  let idozito = null;
  megjegyzes.addEventListener("input", () => {
    clearTimeout(idozito);
    idozito = setTimeout(() => mentes(tervId, { megjegyzes: megjegyzes.value }), 800);
  });

  const velemeny = kartya.querySelector(".admin-velemeny");
  const reszek = [];
  if (adat.adminElfogadva) reszek.push("⭐ Ezt fogadtam el");
  if (adat.adminPont !== null) reszek.push(`${adat.adminPont}/10`);
  if (adat.adminHibajelzes) reszek.push(HIBAJELZES_FELIRAT[adat.adminHibajelzes]);
  if (adat.adminMegjegyzes) reszek.push(`„${adat.adminMegjegyzes}”`);
  velemeny.textContent = reszek.length ? `A tervező: ${reszek.join(" · ")}` : "";

  return { kartya, megjegyzes };
}

export async function inditUgyfelNezet(beallitas, kornyezet = {}) {
  const gyoker = kornyezet.gyoker ?? document;
  const lekero = kornyezet.fetchImpl ?? fetch;
  const jelzo = gyoker.getElementById("mentes-jelzo");
  const tarolo = keszitTarolo({
    repo: beallitas.repo,
    token: beallitas.darabok.join(""),
    fetchImpl: lekero,
    tarhely: kornyezet.tarhely ?? localStorage,
  });

  const tervekElem = gyoker.getElementById("tervek");
  const adat = await betoltAdat(lekero);
  if (!adat) {
    gyoker.getElementById("megszolitas").textContent =
      "Most nem sikerült betölteni a terveket";
    tervekElem.textContent =
      "Kérlek frissítsd az oldalt egy kicsit később. Ha továbbra sem működik, szólj nekem.";
    return;
  }
  const fajlnev = `${beallitas.utvonalNev}.json`;
  const ertekelesek = await tarolo.betolt(fajlnev);
  // Csak OLVASSUK: ebbe a fajlba a tulajdonos ir. A "csak a sajatodat modosithatod"
  // nem felületi feltétel, hanem abbol kovetkezik, ki melyik fajlba ir.
  const adminErtekelesek = await tarolo.betolt(`${beallitas.utvonalNev}-admin.json`);

  gyoker.getElementById("megszolitas").textContent = `Szia! Elkészültek a tervek — ${adat.megjelenes}`;

  // MENTÉSI SOR. A `tarolo.ment`/`mentTobb` olvas-módosít-ír ciklusa egy hálózati
  // kör KÖRÜL zajlik: két egyszerre futó mentés közül a később visszatérő a saját,
  // indításkori pillanatképét írja vissza a helyi tárba — a közben mentett másik
  // terv így elveszik. Élő próbán mérve: hat gyors slot-kattintásból egy terv
  // maradt a tárolóban, miközben a képernyőn minden helyesnek látszott.
  //
  // A slot-válogatás az első felület, ahol gyors, sorozatos kattintás a szokás,
  // ezért itt jött elő. A sor MINDEN mentésre vonatkozik (pont, hibajelzés,
  // választás, megjegyzés, slot), nem csak a slotokra: ugyanabba a fájlba írnak.
  let mentesiSor = Promise.resolve();

  function sorbaTesz(muvelet) {
    mentesiSor = mentesiSor.then(async () => {
      jelzo.textContent = "Mentés…";
      const eredmeny = await muvelet();
      jelzo.textContent = eredmeny.mentve ? "Elmentve ✓" : "Mentés folyamatban…";
    });
    return mentesiSor;
  }

  function mentes(tervId, valtozas) {
    return sorbaTesz(() => tarolo.ment(fajlnev, tervId, valtozas));
  }

  function mentesKoteg(koteg) {
    return sorbaTesz(() => tarolo.mentTobb(fajlnev, koteg));
  }

  const slotVezerlo = keszitSlotVezerlo(ertekelesek, mentesKoteg);

  tervekElem.replaceChildren();
  for (const terv of adat.tervek) {
    const { kartya, megjegyzes } = keszitKartya(
      kartyaAdat(terv, ertekelesek[terv.id], adminErtekelesek[terv.id]),
      terv.id,
      mentes,
      slotVezerlo,
    );
    megjegyzes.value = ertekelesek[terv.id]?.megjegyzes ?? "";
    tervekElem.append(kartya);
  }

  if (!adat.tervek.length) {
    tervekElem.textContent = "Még nincs kész terv. Hamarosan!";
  }

  // Offline sor: ami legutóbb net nélkül maradt a helyi tárban, most felmegy.
  const potlas = await tarolo.ujraprobal(fajlnev);
  if (!potlas.mentve) {
    jelzo.textContent = "Mentés folyamatban…";
  }
}
