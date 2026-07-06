// ============================================================================
// App.jsx — Attendance AI (interface finale)
// Sidebar + 5 pages : Tableau de bord / Enrôler / Pointer / Statistiques / Paramètres
// Fonctionnalités : mode auto, option photo, multi-visages, vocal opt-in,
// thème jour/nuit, langue FR/EN, caméra IP, export CSV quotidien/mensuel.
//
// Documentation officielle :
//   React hooks        : https://react.dev/reference/react
//   getUserMedia       : https://developer.mozilla.org/docs/Web/API/MediaDevices/getUserMedia
//   speechSynthesis    : https://developer.mozilla.org/docs/Web/API/SpeechSynthesis
//   localStorage       : https://developer.mozilla.org/docs/Web/API/Window/localStorage
// ============================================================================
import { useState, useRef, useEffect } from "react";
import "./App.css";

const AUTO_INTERVAL_MS = 2500;

// ---- i18n : un simple dictionnaire, t(clé) selon la langue active ----------
const TR = {
  fr: {
    dashboard: "Tableau de bord", enroll: "Enrôler", attend: "Pointer",
    stats: "Statistiques", settings: "Paramètres",
    welcome: "Bienvenue dans Attendance AI",
    intro: "Pointage automatique par reconnaissance faciale — 100 % hors ligne, aucune photo stockée (seulement les signatures mathématiques).",
    enrolled: "personnes enrôlées", presentToday: "présents aujourd'hui",
    absentToday: "absents aujourd'hui",
    namePlaceholder: "Nom de la personne", enrollCam: "Enrôler (webcam)",
    enrollPhoto: "Enrôler depuis une photo", attendCam: "Pointer (webcam)",
    attendPhoto: "Pointer depuis une photo", attendIp: "Pointer (caméra IP)",
    autoMode: "Mode automatique", voice: "Annonce vocale",
    presencesToday: "Présences du jour", daily: "Bilan quotidien",
    monthly: "Bilan mensuel", presents: "Présents", absents: "Absents",
    exportCsv: "Exporter CSV", perDay: "Présences par jour",
    perPerson: "Jours de présence par personne",
    theme: "Thème", light: "Jour", dark: "Nuit", language: "Langue",
    ipCam: "Caméra IP (URL du flux, ex. rtsp://... )",
    ipHint: "Laisser vide si vous utilisez la webcam. Le flux est lu par le serveur (OpenCV).",
    nameFirst: "Entre un nom d'abord", noFace: "aucun visage détecté",
    hey: "Hey", unknown: "inconnu", firstToday: "présence du jour enregistrée",
    camRefused: "Caméra refusée : ",
  },
  en: {
    dashboard: "Dashboard", enroll: "Enroll", attend: "Check in",
    stats: "Statistics", settings: "Settings",
    welcome: "Welcome to Attendance AI",
    intro: "Automatic attendance by facial recognition — 100% offline, no photos stored (only mathematical signatures).",
    enrolled: "people enrolled", presentToday: "present today",
    absentToday: "absent today",
    namePlaceholder: "Person's name", enrollCam: "Enroll (webcam)",
    enrollPhoto: "Enroll from a photo", attendCam: "Check in (webcam)",
    attendPhoto: "Check in from a photo", attendIp: "Check in (IP camera)",
    autoMode: "Automatic mode", voice: "Voice announcement",
    presencesToday: "Today's attendance", daily: "Daily report",
    monthly: "Monthly report", presents: "Present", absents: "Absent",
    exportCsv: "Export CSV", perDay: "Attendance per day",
    perPerson: "Days present per person",
    theme: "Theme", light: "Light", dark: "Dark", language: "Language",
    ipCam: "IP camera (stream URL, e.g. rtsp://... )",
    ipHint: "Leave empty if using the webcam. The stream is read by the server (OpenCV).",
    nameFirst: "Enter a name first", noFace: "no face detected",
    hey: "Hey", unknown: "unknown", firstToday: "today's presence recorded",
    camRefused: "Camera refused: ",
  },
};

export default function App() {
  const videoRef = useRef(null);
  const announced = useRef(new Set());

  // Préférences persistées dans localStorage (survivent au rechargement).
  const [lang, setLang] = useState(localStorage.getItem("lang") || "fr");
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");
  const [ipUrl, setIpUrl] = useState(localStorage.getItem("ipUrl") || "");

  const [page, setPage] = useState("dashboard");
  const [name, setName] = useState("");
  const [result, setResult] = useState(null);
  const [faces, setFaces] = useState([]);
  const [voice, setVoice] = useState(false);   // opt-in, off par défaut
  const [auto, setAuto] = useState(false);
  const [daily, setDaily] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const t = k => TR[lang][k] || k;

  // Thème : on pose data-theme sur <html>, le CSS fait le reste (variables).
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);
  useEffect(() => { localStorage.setItem("lang", lang); }, [lang]);
  useEffect(() => { localStorage.setItem("ipUrl", ipUrl); }, [ipUrl]);

  // Caméra au chargement + stats du tableau de bord.
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(s => { if (videoRef.current) videoRef.current.srcObject = s; })
      .catch(e => setResult({ ok: false, msg: t("camRefused") + e.message }));
    loadDaily(day);
  }, []);

  // Mode automatique (nettoyé quand on décoche ou quitte la page).
  useEffect(() => {
    if (!auto || page !== "attend") { announced.current.clear(); return; }
    const id = setInterval(() => recognize(null, true), AUTO_INTERVAL_MS);
    return () => clearInterval(id);
  }, [auto, voice, page]);

  // Notification : disparaît après 5 s. Le "return" nettoie le timer si une
  // nouvelle notification arrive avant (sinon l'ancien timer effacerait la nouvelle).
  useEffect(() => {
    if (!result) return;
    const id = setTimeout(() => setResult(null), 5000);
    return () => clearTimeout(id);
  }, [result]);

  function capture() {
    const v = videoRef.current;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    return new Promise(res => c.toBlob(res, "image/jpeg", 0.9));
  }

  async function post(url, file, extra) {
    const fd = new FormData();
    if (url !== "/recognize_ip") fd.append("file", file || (await capture()), "img.jpg");
    for (const k in (extra || {})) fd.append(k, extra[k]);
    return (await fetch(url, { method: "POST", body: fd })).json();
  }

  async function enroll(file = null) {
    if (!name.trim()) return setResult({ ok: false, msg: t("nameFirst"), page: "enroll" });
    const d = await post("/enroll", file, { name });
    setResult(d.ok ? { ok: true, msg: `${d.name} ✔`, page: "enroll" } : { ok: false, msg: d.error, page: "enroll" });
    if (d.ok) setName("");
    loadDaily(day);
  }

  async function recognize(file = null, isAuto = false, useIp = false) {
    const d = useIp
      ? await post("/recognize_ip", null, { url: ipUrl })
      : await post("/recognize", file, null);
    if (d.error) {
      if (!isAuto) setResult({ ok: false, msg: d.error, page: "attend" });
      setFaces([]); return;
    }
    setFaces(d.faces);
    const msg = d.faces.map(f =>
      f.known ? `${t("hey")} ${f.name} ! (${f.similarity})`
              : `${t("hey")} ${t("unknown")} ! (${f.similarity})`).join(" — ");
    setResult({ ok: d.faces.some(f => f.known), msg, page: "attend" });
    if (voice) {
      for (const f of d.faces) {
        const label = f.known ? f.name : "unknown";
        if (!isAuto || !announced.current.has(label)) {
          speechSynthesis.speak(new SpeechSynthesisUtterance(
            f.known ? `${t("hey")} ${f.name} !` : `${t("hey")} ${t("unknown")} !`));
          announced.current.add(label);
        }
      }
    }
    loadDaily(day);
  }

  async function loadDaily(d) {
    setDaily(await (await fetch("/stats/daily?day=" + d)).json());
  }
  async function loadMonthly(m) {
    setMonthly(await (await fetch("/stats/monthly?month=" + m)).json());
  }

  function PhotoButton({ onFile, label }) {
    return (
      <label className="photo-btn">{label}
        <input type="file" accept="image/*" hidden
               onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = ""; }} />
      </label>
    );
  }

  const MENU = [["dashboard", "🏠"], ["enroll", "👤"], ["attend", "📸"],
                ["stats", "📊"], ["settings", "⚙️"]];

  return (
    <div className="layout">
      {/* ---------------- Sidebar ---------------- */}
      <aside>
        <h2 className="logo">Attendance&nbsp;AI</h2>
        {MENU.map(([p, icon]) => (
          <button key={p} className={page === p ? "nav active" : "nav"}
                  onClick={() => { setPage(p); if (p === "stats") { loadDaily(day); loadMonthly(month); } }}>
            <span>{icon}</span> {t(p === "dashboard" ? "dashboard" : p)}
          </button>
        ))}
      </aside>

      {/* ---------------- Contenu ---------------- */}
      <main>
        {/* La vidéo reste montée en permanence (le flux caméra survit aux
            changements de page) ; on la cache hors Enrôler/Pointer. */}
        <video ref={videoRef} autoPlay playsInline
               style={{ display: (page === "enroll" || page === "attend") ? "block" : "none" }} />

        {page === "dashboard" && daily && (
          <div>
            <h1>{t("welcome")}</h1>
            <p>{t("intro")}</p>
            <div className="cards">
              <div className="stat"><b>{daily.total}</b><span>{t("enrolled")}</span></div>
              <div className="stat ok"><b>{daily.presents.length}</b><span>{t("presentToday")}</span></div>
              <div className="stat ko"><b>{daily.absents.length}</b><span>{t("absentToday")}</span></div>
            </div>
            <h3>{t("presencesToday")}</h3>
            <ul>{daily.presents.map((p, i) => <li key={i}>{p.name} — {p.timestamp}</li>)}</ul>
          </div>
        )}

        {page === "enroll" && (
          <div className="card">
            <input placeholder={t("namePlaceholder")} value={name}
                   onChange={e => setName(e.target.value)} />
            <button onClick={() => enroll()}>{t("enrollCam")}</button>
            <PhotoButton label={t("enrollPhoto")} onFile={f => enroll(f)} />
          </div>
        )}

        {page === "attend" && (
          <div className="card">
            <button onClick={() => recognize()}>{t("attendCam")}</button>
            <PhotoButton label={t("attendPhoto")} onFile={f => recognize(f)} />
            {ipUrl && <button onClick={() => recognize(null, false, true)}>{t("attendIp")}</button>}
            <label><input type="checkbox" checked={auto}
                          onChange={e => setAuto(e.target.checked)} /> {t("autoMode")}</label>
            <label><input type="checkbox" checked={voice}
                          onChange={e => setVoice(e.target.checked)} /> {t("voice")}</label>
            {faces.length > 0 && (
              <ul className="faces">
                {faces.map((f, i) => (
                  <li key={i}>{f.known ? `✔ ${f.name}` : `✖ ${t("unknown")}`} — {f.similarity}
                    {f.first_today ? ` — ${t("firstToday")}` : ""}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {page === "stats" && (
          <div>
            <div className="card">
              <h3>{t("daily")}</h3>
              <input type="date" value={day}
                     onChange={e => { setDay(e.target.value); loadDaily(e.target.value); }} />
              <a className="photo-btn" href={"/export/daily?day=" + day}>{t("exportCsv")}</a>
              {daily && (
                <div className="cols">
                  <div><h4>{t("presents")} ({daily.presents.length})</h4>
                    <ul>{daily.presents.map((p, i) => <li key={i}>{p.name} — {p.timestamp}</li>)}</ul></div>
                  <div><h4>{t("absents")} ({daily.absents.length})</h4>
                    <ul>{daily.absents.map((n, i) => <li key={i}>{n}</li>)}</ul></div>
                </div>
              )}
            </div>
            <div className="card">
              <h3>{t("monthly")}</h3>
              <input type="month" value={month}
                     onChange={e => { setMonth(e.target.value); loadMonthly(e.target.value); }} />
              <a className="photo-btn" href={"/export/monthly?month=" + month}>{t("exportCsv")}</a>
              {monthly && (
                <div className="cols">
                  <div><h4>{t("perDay")}</h4>
                    <ul>{monthly.by_day.map((d, i) =>
                      <li key={i}>{d.date} — {d.count}/{monthly.total_persons}</li>)}</ul></div>
                  <div><h4>{t("perPerson")}</h4>
                    <ul>{monthly.by_person.map((p, i) =>
                      <li key={i}>{p.name} — {p.count}</li>)}</ul></div>
                </div>
              )}
            </div>
          </div>
        )}

        {page === "settings" && (
          <div className="card">
            <h3>{t("settings")}</h3>
            <p>{t("theme")} :
              <button onClick={() => setTheme("light")}>{t("light")} ☀️</button>
              <button onClick={() => setTheme("dark")}>{t("dark")} 🌙</button>
            </p>
            <p>{t("language")} :
              <select value={lang} onChange={e => setLang(e.target.value)}>
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </p>
            <p>{t("ipCam")}<br />
              <input style={{ width: "100%" }} value={ipUrl}
                     onChange={e => setIpUrl(e.target.value)}
                     placeholder="rtsp://user:pass@192.168.1.50:554/stream" />
              <small>{t("ipHint")}</small>
            </p>
          </div>
        )}
        
        {//rendu filtre et croix de fermeture
        result && (!result.page || result.page === page) && (<div className={"res " + (result.ok ? "ok" : "ko")}> {result.msg}<button className="close" onClick={() => setResult(null)}>✕</button></div>)
        }
      </main>
    </div>
  );
}
