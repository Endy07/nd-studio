/**
 * Videó-terv az ügyfél kirakatában: a kártyán kicsiben lejátszható, teljes képernyőre nagyítható,
 * és több videó kijelölhető egymás melletti összevetésre (egyszerre vagy egyenként indítva).
 *
 * A tiszta függvények (`videoUtak`, `osszevetesValt`, `osszevetesOszlopok`) DOM nélkül tesztelhetők;
 * a többi a böngészőben épít. Az ügyfél itt sem lát fájlnevet a terv mappáján kívül: a videó és a
 * poszter neve fix (`mag/build.py` `VIDEO_FAJLOK`).
 */

export const OSSZEVETES_MAX = 6;

/** A terv `leiras` mezője megjeleníthető alakban: levágott szöveg, minden más (hiány, nem szöveg) üres. */
export function leirasSzoveg(ertek) {
  return typeof ertek === "string" ? ertek.trim() : "";
}

/**
 * A kártyán a cím alatt álló, ügyfélnek szóló leírás (`terv.json` `leiras`, 2026-10-16) — pl. hogy egy
 * motion-videó milyen technikával készült. Üres leírásra `null`: üres elem nem kerül a kártyára.
 * CSAK `textContent`: a leírás szabad szöveg, jelölésként soha nem értelmezzük. A honlap-kártya, a
 * videó-kártya, az összevetés és az admin nézet is ezt használja (ezért él itt, ahová mind importál).
 */
export function keszitLeiras(szoveg, dok = globalThis.document, cimke = "p") {
  const tiszta = leirasSzoveg(szoveg);
  if (!tiszta) return null;
  const elem = dok.createElement(cimke);
  elem.className = "leiras";
  elem.textContent = tiszta;
  return elem;
}

/** A build a videót és a posztert a terv `index.html`-je mellé, az `assets/` alá másolja. */
export function videoUtak(utvonal) {
  const mappa = String(utvonal ?? "").replace(/index\.html$/, "").replace(/\/?$/, "/");
  return { mp4: `${mappa}assets/video.mp4`, poszter: `${mappa}assets/poszter.jpg` };
}

/** Ki/bekapcsol egy videót az összevetésben. A korlát fölött nem vesz fel újat (`tele: true`). */
export function osszevetesValt(kijeloltek, id) {
  if (kijeloltek.includes(id)) return { kijeloltek: kijeloltek.filter((k) => k !== id), tele: false };
  if (kijeloltek.length >= OSSZEVETES_MAX) return { kijeloltek: [...kijeloltek], tele: true };
  return { kijeloltek: [...kijeloltek, id], tele: false };
}

/** Egy sorban legfeljebb négy (állóképes videónál így marad elég magas); 5–6 videó két sorban, hármasával. */
export function osszevetesOszlopok(n) {
  return n <= 4 ? Math.max(1, n) : 3;
}

function teljesKepernyo(elem) {
  const kerd = elem.requestFullscreen ?? elem.webkitRequestFullscreen ?? elem.webkitEnterFullscreen;
  if (kerd) kerd.call(elem);
}

/**
 * A videó-kártya miniatúrája: a valódi videó, poszterrel; a kártyán kicsiben indul (a honlap-kártyák
 * élő előnézetének megfelelője), a ⛶ gombbal teljes képernyőre vált.
 */
export function keszitVideoMiniatur(adat, tervId, osszevetes) {
  const { mp4, poszter } = videoUtak(adat.utvonal);
  const doboz = document.createElement("div");
  doboz.className = "miniatur video";
  const video = document.createElement("video");
  video.src = mp4;
  video.poster = poszter;
  video.preload = "none";
  video.controls = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.title = adat.cim;
  const nagyit = document.createElement("button");
  nagyit.type = "button";
  nagyit.className = "nagyit";
  nagyit.title = "Teljes képernyő";
  nagyit.textContent = "⛶";
  nagyit.addEventListener("click", () => teljesKepernyo(video));
  doboz.append(video, nagyit);

  const jelolo = document.createElement("label");
  jelolo.className = "osszevet-jelolo";
  jelolo.innerHTML = `<input type="checkbox"> Összehasonlítom`;
  const doboz2 = jelolo.querySelector("input");
  doboz2.checked = osszevetes.kijelolt(tervId);
  doboz2.addEventListener("change", () => {
    if (!osszevetes.valt(tervId)) doboz2.checked = false;
  });
  osszevetes.figyel(tervId, (be) => { doboz2.checked = be; });
  return { doboz, jelolo };
}

/**
 * Az összevetés: alul egy sáv a kijelölt videók számával, és egy teljes ablakos nézet, ahol a kijelölt
 * videók egymás mellett állnak. Mindegyik a saját vezérlőjével is indítható; a fejléc gombjai egyszerre
 * vezérlik őket. Hang: alapból csak az első szól (a többi néma), egyenként átállítható.
 */
export function keszitOsszevetes(gyoker, tervek) {
  let kijeloltek = [];
  const figyelok = new Map();
  const cimek = new Map(tervek.map((t) => [t.id, t]));

  const sav = document.createElement("div");
  sav.className = "osszevetes-sav";
  sav.hidden = true;
  sav.innerHTML = `<span class="szam"></span>
    <button type="button" class="mutat">Egymás mellett ▶</button>
    <button type="button" class="torol">Kijelölés törlése</button>`;

  const nezet = document.createElement("div");
  nezet.className = "osszevetes";
  nezet.hidden = true;
  nezet.innerHTML = `<div class="osszevetes-fej">
      <button type="button" data-m="indit">▶ Mind indul</button>
      <button type="button" data-m="megall">❚❚ Mind megáll</button>
      <button type="button" data-m="elejere">⟲ Mind az elejére</button>
      <button type="button" data-m="egyutt">⟲▶ Együtt az elejéről</button>
      <button type="button" data-m="teljes">⛶ Teljes képernyő</button>
      <button type="button" data-m="bezar" class="bezar">✕ Bezárás</button>
    </div><div class="osszevetes-racs"></div>`;
  const racs = nezet.querySelector(".osszevetes-racs");
  gyoker.body.append(sav, nezet);

  const videok = () => [...racs.querySelectorAll("video")];
  const muveletek = {
    indit: () => videok().forEach((v) => v.play().catch(() => {})),
    megall: () => videok().forEach((v) => v.pause()),
    elejere: () => videok().forEach((v) => { v.currentTime = 0; }),
    egyutt: () => { muveletek.megall(); muveletek.elejere(); muveletek.indit(); },
    teljes: () => teljesKepernyo(nezet),
    bezar: () => bezar(),
  };
  nezet.querySelector(".osszevetes-fej").addEventListener("click", (e) => {
    const m = e.target.closest("button")?.dataset.m;
    if (m) muveletek[m]();
  });

  function frissitSav() {
    sav.hidden = kijeloltek.length === 0;
    sav.querySelector(".szam").textContent =
      `${kijeloltek.length} videó kijelölve` + (kijeloltek.length < 2 ? " — jelölj ki még legalább egyet" : "");
    sav.querySelector(".mutat").disabled = kijeloltek.length < 2;
  }

  function mutat() {
    racs.replaceChildren();
    racs.style.setProperty("--oszlop", osszevetesOszlopok(kijeloltek.length));
    racs.style.setProperty("--sor", Math.ceil(kijeloltek.length / osszevetesOszlopok(kijeloltek.length)));
    kijeloltek.forEach((id, i) => {
      const terv = cimek.get(id);
      const cella = document.createElement("figure");
      const { mp4, poszter } = videoUtak(terv.utvonal);
      const v = document.createElement("video");
      Object.assign(v, { src: mp4, poster: poszter, controls: true, preload: "auto", muted: i > 0, playsInline: true });
      v.setAttribute("playsinline", "");
      const felirat = document.createElement("figcaption");
      felirat.textContent = terv.cim;
      const leiras = keszitLeiras(terv.leiras, document, "small");
      if (leiras) felirat.append(leiras);
      cella.append(v, felirat);
      racs.append(cella);
    });
    nezet.hidden = false;
    gyoker.body.classList.add("osszevetes-nyitva");
  }

  function bezar() {
    muveletek.megall();
    nezet.hidden = true;
    gyoker.body.classList.remove("osszevetes-nyitva");
    if (gyoker.fullscreenElement) gyoker.exitFullscreen?.();
  }

  sav.querySelector(".mutat").addEventListener("click", mutat);
  sav.querySelector(".torol").addEventListener("click", () => {
    kijeloltek = [];
    for (const f of figyelok.values()) f(false);
    frissitSav();
  });
  gyoker.addEventListener("keydown", (e) => { if (e.key === "Escape" && !nezet.hidden) bezar(); });

  return {
    kijelolt: (id) => kijeloltek.includes(id),
    figyel: (id, f) => figyelok.set(id, f),
    /** Igaz, ha az állapot a kért irányba változott; a korlát fölött hamis (a jelölő visszaugrik). */
    valt(id) {
      const e = osszevetesValt(kijeloltek, id);
      kijeloltek = e.kijeloltek;
      frissitSav();
      if (e.tele) sav.querySelector(".szam").textContent = `Legfeljebb ${OSSZEVETES_MAX} videó vethető össze egyszerre.`;
      return !e.tele;
    },
  };
}
