/**
 * Tároló-réteg. Ma GitHub-adapter; ha a token elhal, EZT az egy fájlt kell
 * lecserélni, a felületek és az adatmodell változatlanul maradnak.
 *
 * Két szabály, amitől az ügyfél véleménye nem veszhet el:
 *  1. minden mentés ELŐSZÖR a helyi tárba megy, és csak utána a hálózatra;
 *  2. hálózati hiba sosem dob kivételt, csak `mentve: false`-t ad vissza.
 */

import { osszefesul } from "./ertekeles.js";

const API = "https://api.github.com/repos";
const MAX_PROBALKOZAS = 3;

function base64Kodol(szoveg) {
  const bajtok = new TextEncoder().encode(szoveg);
  return btoa(String.fromCharCode(...bajtok));
}

function base64Dekodol(base64) {
  const nyers = atob(base64.replace(/\n/g, ""));
  const bajtok = Uint8Array.from(nyers, (karakter) => karakter.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bajtok);
}

export function keszitTarolo({ repo, token, fetchImpl = fetch, tarhely = localStorage }) {
  const shaCache = new Map();

  const helyiKulcs = (fajlnev) => `nd-studio:${fajlnev}`;

  function helyiOlvas(fajlnev) {
    try {
      return JSON.parse(tarhely.getItem(helyiKulcs(fajlnev)) ?? "{}");
    } catch {
      return {};
    }
  }

  function helyiIr(fajlnev, adat) {
    tarhely.setItem(helyiKulcs(fajlnev), JSON.stringify(adat));
  }

  async function tavoliOlvas(fajlnev) {
    let valasz;
    try {
      valasz = await fetchImpl(`${API}/${repo}/contents/adat/ertekelesek/${fajlnev}`, {
        headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json" },
        cache: "no-store",
      });
    } catch {
      // Hálózati hiba: nincs távoli adat. Kivétel SOHA nem juthat a hívóig —
      // enélkül az ügyfél offline oldala be sem töltődne.
      return {};
    }
    if (!valasz.ok) return {};

    try {
      const torzs = await valasz.json();
      if (torzs?.sha) shaCache.set(fajlnev, torzs.sha);
      return JSON.parse(base64Dekodol(torzs.content));
    } catch {
      return {};
    }
  }

  async function tavoliIr(fajlnev, adat) {
    const torzs = {
      message: `Ertekeles: ${fajlnev}`,
      content: base64Kodol(JSON.stringify(adat, null, 2)),
    };
    const sha = shaCache.get(fajlnev);
    if (sha) torzs.sha = sha;

    const valasz = await fetchImpl(`${API}/${repo}/contents/adat/ertekelesek/${fajlnev}`, {
      method: "PUT",
      headers: { Authorization: `token ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(torzs),
    });
    if (valasz.ok) {
      let ujSha;
      try {
        ujSha = (await valasz.json())?.content?.sha;
      } catch {
        ujSha = undefined;
      }
      // Csak valódi sha-t jegyzünk meg. Ismeretlen sha esetén inkább töröljük,
      // hogy a következő mentés újraolvasson, mint hogy elavult sha-val írjunk.
      if (ujSha) shaCache.set(fajlnev, ujSha);
      else shaCache.delete(fajlnev);
    }
    return valasz;
  }

  async function betolt(fajlnev) {
    const tavoli = await tavoliOlvas(fajlnev);
    return osszefesul(helyiOlvas(fajlnev), tavoli);
  }

  async function feltolt(fajlnev, adat) {
    for (let probalkozas = 0; probalkozas < MAX_PROBALKOZAS; probalkozas += 1) {
      try {
        const valasz = await tavoliIr(fajlnev, adat);
        if (valasz.ok) return { mentve: true, adat };
        if (valasz.status === 409) {
          adat = osszefesul(adat, await tavoliOlvas(fajlnev));
          helyiIr(fajlnev, adat);
          continue;
        }
        return { mentve: false, adat };
      } catch {
        return { mentve: false, adat };
      }
    }
    return { mentve: false, adat };
  }

  async function ment(fajlnev, tervId, ertekeles) {
    let adat = helyiOlvas(fajlnev);
    adat[tervId] = { ...adat[tervId], ...ertekeles, modositva: new Date().toISOString() };
    helyiIr(fajlnev, adat);

    if (!shaCache.has(fajlnev)) {
      adat = osszefesul(adat, await tavoliOlvas(fajlnev));
      helyiIr(fajlnev, adat);
    }

    return feltolt(fajlnev, adat);
  }

  /**
   * Feltölti a helyi tárban ragadt, még fel nem küldött értékeléseket.
   * Oldalbetöltéskor fut: enélkül egy net nélkül adott válasz soha nem jutna el.
   */
  async function ujraprobal(fajlnev) {
    const helyi = helyiOlvas(fajlnev);
    if (!Object.keys(helyi).length) return { mentve: true, adat: helyi };

    const tavoli = await tavoliOlvas(fajlnev);
    const egyesitett = osszefesul(helyi, tavoli);
    if (JSON.stringify(egyesitett) === JSON.stringify(tavoli)) {
      return { mentve: true, adat: egyesitett };
    }
    helyiIr(fajlnev, egyesitett);
    return feltolt(fajlnev, egyesitett);
  }

  /**
   * Több bejegyzés EGY feltöltéssel. A `ment` tervenként hívna API-t; 88 tervnél
   * az a GitHub rate limitjébe futna.
   */
  async function mentTobb(fajlnev, bejegyzesek) {
    let adat = helyiOlvas(fajlnev);
    const most = new Date().toISOString();
    for (const [tervId, ertekeles] of Object.entries(bejegyzesek)) {
      adat[tervId] = { ...adat[tervId], ...ertekeles, modositva: ertekeles.modositva || most };
    }
    helyiIr(fajlnev, adat);

    if (!shaCache.has(fajlnev)) {
      adat = osszefesul(adat, await tavoliOlvas(fajlnev));
      helyiIr(fajlnev, adat);
    }
    return feltolt(fajlnev, adat);
  }

  return { betolt, ment, mentTobb, ujraprobal };
}
