/** Az ügyfél felülete. Nem lát modellnevet, fájlnevet, pontskálát, beállítást. */

import { keszitTarolo } from "./tarolo.js";

const VALASZOK = [
  { kulcs: "tetszik", felirat: "👍 Tetszik" },
  { kulcs: "talan", felirat: "🤔 Talán" },
  { kulcs: "nem", felirat: "👎 Nem" },
];

export function kartyaAdat(terv, ertekeles) {
  return { cim: terv.cim, utvonal: terv.utvonal, valasz: ertekeles?.valasz ?? "" };
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

function keszitKartya(adat, tervId, mentes) {
  const kartya = document.createElement("article");
  kartya.className = "kartya";
  kartya.innerHTML = `
    <div class="miniatur"><iframe loading="lazy" title=""></iframe></div>
    <h2></h2>
    <a class="megnezem" target="_blank" rel="noopener">Megnézem</a>
    <div class="valaszok"></div>
    <textarea class="megjegyzes" placeholder="Ha van megjegyzésed, ide írhatod…"></textarea>`;

  kartya.querySelector("h2").textContent = adat.cim;
  const keret = kartya.querySelector("iframe");
  // allow-scripts ONMAGABAN, allow-same-origin NELKUL: az iframe igy egyedi
  // origint kap. A terv szkriptjei futnak (a kinezet megmarad), de a szulo
  // oldal localStorage-at - benne az admin tokennel - nem erik el.
  keret.setAttribute("sandbox", "allow-scripts");
  keret.src = adat.utvonal;
  keret.title = adat.cim;
  const link = kartya.querySelector(".megnezem");
  link.href = adat.utvonal;

  const gombsor = kartya.querySelector(".valaszok");
  for (const valasz of VALASZOK) {
    const gomb = document.createElement("button");
    gomb.type = "button";
    gomb.textContent = valasz.felirat;
    gomb.classList.toggle("aktiv", adat.valasz === valasz.kulcs);
    gomb.addEventListener("click", () => {
      gombsor.querySelectorAll("button").forEach((g) => g.classList.remove("aktiv"));
      gomb.classList.add("aktiv");
      mentes(tervId, { valasz: valasz.kulcs });
    });
    gombsor.append(gomb);
  }

  const megjegyzes = kartya.querySelector(".megjegyzes");
  let idozito = null;
  megjegyzes.addEventListener("input", () => {
    clearTimeout(idozito);
    idozito = setTimeout(() => mentes(tervId, { megjegyzes: megjegyzes.value }), 800);
  });

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

  gyoker.getElementById("megszolitas").textContent = `Szia! Elkészültek a tervek — ${adat.megjelenes}`;

  async function mentes(tervId, valtozas) {
    jelzo.textContent = "Mentés…";
    const eredmeny = await tarolo.ment(fajlnev, tervId, valtozas);
    jelzo.textContent = eredmeny.mentve ? "Elmentve ✓" : "Mentés folyamatban…";
  }

  tervekElem.replaceChildren();
  for (const terv of adat.tervek) {
    const { kartya, megjegyzes } = keszitKartya(
      kartyaAdat(terv, ertekelesek[terv.id]), terv.id, mentes
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
