/** Admin részletes nézet egy ügyfélre: minden terv, minden adat, pontozás. */

import { keszitTarolo } from "./tarolo.js";
import { ADMIN_TOKEN_KULCS, adminToken, betoltKatalogus } from "./admin-osszefoglalo.js";

const STATUSZOK = [
  { kulcs: "hibas", felirat: "❌ Hibás" },
  { kulcs: "reszben", felirat: "⚠️ Részben" },
  { kulcs: "jo", felirat: "✅ Jó" },
  { kulcs: "elfogadva", felirat: "⭐ Elfogadva" },
];

const VALASZ_FELIRAT = { tetszik: "👍 Tetszik", talan: "🤔 Talán", nem: "👎 Nem", "": "–" };

export function sorAdat(terv, adminErtekeles, ugyfelErtekeles) {
  return {
    id: terv.id,
    cim: terv.cim,
    utvonal: terv.utvonal,
    modell: terv.modell ?? "–",
    prompt: terv.prompt ?? "–",
    publikus: Boolean(terv.publikus),
    enPont: adminErtekeles?.pont ?? null,
    enStatusz: adminErtekeles?.statusz ?? "",
    enMegjegyzes: adminErtekeles?.megjegyzes ?? "",
    oValasz: ugyfelErtekeles?.valasz ?? "",
    oMegjegyzes: ugyfelErtekeles?.megjegyzes ?? "",
  };
}

function keszitSor(sor, ugyfelUt, mentes) {
  const elem = document.createElement("tr");
  elem.innerHTML = `
    <td class="cim"><strong></strong><br><a target="_blank" rel="noopener">Megnyitás</a></td>
    <td class="meta"></td>
    <td class="pontok"></td>
    <td class="statuszok"></td>
    <td><textarea class="en-megjegyzes"></textarea></td>
    <td class="ovalasz"></td>`;

  elem.querySelector("strong").textContent = sor.cim;
  elem.querySelector("a").href = ugyfelUt + sor.utvonal;
  elem.querySelector(".meta").textContent = `${sor.modell} · ${sor.prompt}`;

  const pontok = elem.querySelector(".pontok");
  for (let pont = 0; pont <= 10; pont += 1) {
    const gomb = document.createElement("button");
    gomb.type = "button";
    gomb.className = "pont" + (sor.enPont === pont ? " aktiv" : "");
    gomb.textContent = pont;
    gomb.addEventListener("click", () => {
      pontok.querySelectorAll("button").forEach((g) => g.classList.remove("aktiv"));
      gomb.classList.add("aktiv");
      mentes(sor.id, { pont });
    });
    pontok.append(gomb);
  }

  const statuszok = elem.querySelector(".statuszok");
  for (const statusz of STATUSZOK) {
    const gomb = document.createElement("button");
    gomb.type = "button";
    gomb.className = sor.enStatusz === statusz.kulcs ? "aktiv" : "";
    gomb.textContent = statusz.felirat;
    gomb.addEventListener("click", () => {
      statuszok.querySelectorAll("button").forEach((g) => g.classList.remove("aktiv"));
      gomb.classList.add("aktiv");
      mentes(sor.id, { statusz: statusz.kulcs });
    });
    statuszok.append(gomb);
  }

  // A publikus/nem publikus állapot itt CSAK látszik. Átállítani a Műhelyben lehet:
  // ez az oldal a GitHub Pages-en fut, onnan nincs elérése a lokális kiszolgálóhoz.
  const jelzes = document.createElement("span");
  jelzes.className = "kapcsolo";
  jelzes.textContent = sor.publikus ? "Publikus ✓" : "Nem publikus";
  statuszok.append(jelzes);

  const megjegyzes = elem.querySelector(".en-megjegyzes");
  megjegyzes.value = sor.enMegjegyzes;
  let idozito = null;
  megjegyzes.addEventListener("input", () => {
    clearTimeout(idozito);
    idozito = setTimeout(() => mentes(sor.id, { megjegyzes: megjegyzes.value }), 800);
  });

  elem.querySelector(".ovalasz").textContent =
    `${VALASZ_FELIRAT[sor.oValasz] ?? "–"}${sor.oMegjegyzes ? " — " + sor.oMegjegyzes : ""}`;
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

  const fajlnev = `admin-${beallitas.adminHash}.json`;
  const adminErtekelesek = await tarolo.betolt(fajlnev);
  const ugyfelErtekelesek = await tarolo.betolt(`${ugyfel.utvonal_nev}.json`);

  async function mentes(tervId, valtozas) {
    jelzo.textContent = "Mentés…";
    const eredmeny = await tarolo.ment(fajlnev, tervId, valtozas);
    jelzo.textContent = eredmeny.mentve ? "Elmentve ✓" : "Mentés folyamatban…";
  }

  const ugyfelUt = `../u/${ugyfel.utvonal_nev}/`;
  sorokElem.replaceChildren(
    ...ugyfel.tervek.map((terv) =>
      keszitSor(sorAdat(terv, adminErtekelesek[terv.id], ugyfelErtekelesek[terv.id]), ugyfelUt, mentes)
    )
  );
}
