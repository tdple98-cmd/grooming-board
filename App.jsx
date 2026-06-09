import React, { useState, useEffect } from "react";
import { useAuth } from "./contexts/AuthContext.jsx";
import Login from "./components/Login.jsx";
import SetPassword from "./components/SetPassword.jsx";

// ─────────────────────────────────────────────────────────────
// The Poodle Specialist — GROOMING BOARD (prototype v4, foolproof)
// Phone-first. Sample data only. Built to be easy to learn:
// plain labels, big taps, one clear action per dog, guided steps.
// ─────────────────────────────────────────────────────────────

const C = {
  cream: "#F4EFE7", paper: "#FCFAF6", brown: "#2A2420", ink: "#3D362F",
  gold: "#B8956A", goldDeep: "#9C7B52", line: "#E7DECF",
  green: "#5E7C5A", amber: "#C68A3E", slate: "#9A9087", rose: "#C98B7A", blue: "#6E8299",
};

// The four steps a dog moves through, in order. Plain words.
const STEPS = [
  { key: "booked", label: "Not arrived", color: C.slate, dot: "#B4ACA2" },
  { key: "checkedin", label: "Checked in", color: C.blue, dot: C.blue },
  { key: "grooming", label: "Grooming", color: C.amber, dot: C.amber },
  { key: "ready", label: "Ready", color: C.green, dot: C.green },
  { key: "noshow", label: "No-show", color: C.rose, dot: C.rose },
];
const stepOf = (k) => STEPS.find((s) => s.key === k) || STEPS[0];

const GROOMERS = ["Thanh", "Wendy", "Trang", "Michelle", "Lynn", "Sandy", "Fei", "Claire"];

const TABS = [{ k: "today", l: "Today" }, { k: "specs", l: "Groom Specs" }, { k: "checkin", l: "Check-in" }, { k: "pickup", l: "Pickup" }];

const ago = (min) => Date.now() - min * 60000;

const SEED = [
  {
    id: "1", band: 1, dropTime: "9:00", pickTime: "11:30", owner: "Adam Mach", phone: "0423 831 102",
    dog: "Pumpkin", weight: "1.8kg", service: "Wash & Tidy",
    status: "ready", avatar: "🐩", bg: "#E9D9C6", groomPhoto: true, collected: false,
    groomer: "Wendy", checkedInAt: ago(140), depositPaid: true, late: false,
    specs: { cut: "Teddy bear face, 4mm body", coat: "Curly, fine", temperament: "Calm, easy", health: "None" },
    today: { cut: "", watch: "", svc: "" },
    lastVisit: { date: "21 Apr 2026", groomer: "Wendy", service: "Wash & Tidy", did: "Teddy face, #4 body, light tidy on legs. Nails done.", took: "1h 50m", note: "Very settled. No issues.", photo: true },
  },
  {
    id: "2", band: 2, dropTime: "9:00", pickTime: "12:00", owner: "Sarah Nguyen", phone: "0412 555 901",
    dog: "Luna", weight: "4.5kg", service: "Full Groom",
    status: "grooming", avatar: "🐕", bg: "#DBCBB6", groomPhoto: false, collected: false,
    groomer: "Trang", checkedInAt: ago(95), depositPaid: true, late: false,
    specs: { cut: "Short all over, 6mm", coat: "Wavy, thick", temperament: "Nervous at dryer", health: "Sensitive skin — gentle wash" },
    today: { cut: "Shorter than usual — owner away", watch: "Extra nervous today", svc: "" },
    lastVisit: { date: "28 Apr 2026", groomer: "Trang", service: "Full Groom", did: "#6 all over, rounded face, sanitary trim. Hypoallergenic wash.", took: "2h 30m", note: "Shaky at the dryer — used low heat. Treats helped.", photo: true },
  },
  {
    id: "3", band: 3, dropTime: "9:15", pickTime: "12:15", owner: "James Park", phone: "0431 220 887",
    dog: "Teddy", weight: "8kg", service: "Full Groom",
    status: "grooming", avatar: "🐶", bg: "#CDBB9E", groomPhoto: false, collected: false,
    groomer: "Fei", checkedInAt: ago(80), depositPaid: false, late: false,
    specs: { cut: "", coat: "", temperament: "", health: "" },
    today: { cut: "", watch: "Bites during nails — muzzle", svc: "+ Teeth clean" },
  },
  {
    id: "4", band: 4, dropTime: "9:15", pickTime: "11:00", owner: "Mai Tran", phone: "0400 119 332",
    dog: "Coco", weight: "2.5kg", service: "Wash & Tidy",
    status: "checkedin", avatar: "🦮", bg: "#E4D5C0", groomPhoto: false, collected: false,
    groomer: "", checkedInAt: ago(20), depositPaid: true, late: false,
    specs: { cut: "Leave ears long", coat: "Curly", temperament: "Friendly, wriggly", health: "None" },
    today: { cut: "", watch: "", svc: "" },
  },
  {
    id: "5a", band: 5, dropTime: "9:30", pickTime: "13:00", owner: "David Lee", phone: "0466 778 210",
    dog: "Oreo", weight: "6kg", service: "Full Groom", litterId: "lee-2dogs", litterMates: "Eli",
    status: "booked", avatar: "🐕", bg: "#DCCDB8", groomPhoto: false, collected: false,
    groomer: "", checkedInAt: null, depositPaid: false, late: true,
    specs: { cut: "", coat: "", temperament: "", health: "" },
    today: { cut: "Keep short", watch: "Litter mate — don't mix up with Eli", svc: "" },
  },
  {
    id: "5b", band: 5, dropTime: "9:30", pickTime: "13:00", owner: "David Lee", phone: "0466 778 210",
    dog: "Eli", weight: "5kg", service: "Full Groom", litterId: "lee-2dogs", litterMates: "Oreo",
    status: "booked", avatar: "🐩", bg: "#D6C4AE", groomPhoto: false, collected: false,
    groomer: "", checkedInAt: null, depositPaid: false, late: true,
    specs: { cut: "", coat: "", temperament: "", health: "" },
    today: { cut: "Keep fluffy", watch: "Litter mate — don't mix up with Oreo", svc: "" },
  },
];

const TAGS = [
  { key: "cut", label: "Cut", hint: "Today's change to the cut", color: C.gold },
  { key: "watch", label: "Watch", hint: "Anything to be careful of", color: C.rose },
  { key: "svc", label: "Service", hint: "Add-on or change", color: C.green },
];

const SPECS = [
  { key: "cut", label: "Usual cut / style" },
  { key: "coat", label: "Coat type" },
  { key: "temperament", label: "Temperament" },
  { key: "health", label: "Health / allergy" },
];

const PRESETS = {
  today: {
    cut: ["Teddy bear face", "Poodle face", "Puppy cut", "Shorter than usual", "Longer than usual", "Face short", "Ears long", "Shave - matted", "Tidy only"],
    watch: ["Muzzle for nails", "Nervous / anxious", "Bites / snappy", "Senior - gentle", "Matted", "Skin irritation", "Two dogs - don't mix"],
    svc: ["Full Groom", "Wash & Tidy", "Wednesday W&T", "+ Teeth clean", "+ Nail grind", "+ De-shed", "+ Sanitary trim", "Upgrade to Full", "Downgrade to W&T"],
  },
  specs: {
    coat: ["Curly", "Wavy", "Straight", "Wool", "Fleece", "Fine / thin", "Thick / dense", "Double coat"],
    temperament: ["Calm / easy", "Friendly, wriggly", "Nervous", "Anxious at dryer", "Snappy - care", "Senior", "Food motivated"],
  },
};

function toggleChip(current, chip) {
  const parts = (current || "").split(",").map((s) => s.trim()).filter(Boolean);
  const i = parts.findIndex((p) => p.toLowerCase() === chip.toLowerCase());
  if (i >= 0) parts.splice(i, 1); else parts.push(chip);
  return parts.join(", ");
}
const chipActive = (cur, chip) =>
  (cur || "").split(",").map((s) => s.trim().toLowerCase()).includes(chip.toLowerCase());

const telHref = (p) => "tel:" + (p || "").replace(/\s+/g, "");
const smsHref = (p, body) => "sms:" + (p || "").replace(/\s+/g, "") + "?&body=" + encodeURIComponent(body);
const thirtyText = (d) =>
  "Hi " + d.owner.split(" ")[0] + " - " + d.dog + " will be ready in about 30 mins. Feel free to come now and collect your pup! - The Poodle Specialist";
const pickupText = (d) =>
  "Hi " + d.owner.split(" ")[0] + " - " + d.dog + " is all done and ready for pickup. Come collect your pup whenever suits! - The Poodle Specialist";
const photoText = (d) =>
  d.dog + " is all done and looking gorgeous! See the photo here: [link] - The Poodle Specialist";

function elapsed(since) {
  if (!since) return null;
  const m = Math.max(0, Math.floor((Date.now() - since) / 60000));
  const h = Math.floor(m / 60);
  return h > 0 ? h + "h " + (m % 60) + "m" : m + "m";
}

export default function App() {
  const { session, profile, loading, needsPassword, signOut } = useAuth();
  const [dogs, setDogs] = useState(SEED);
  const [openId, setOpenId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [presets, setPresets] = useState(PRESETS);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [tab, setTab] = useState("today");
  const [menuId, setMenuId] = useState(null);
  const [now, setNow] = useState(new Date());
  const [live, setLive] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const open = dogs.find((d) => d.id === openId);
  const update = (id, patch) => setDogs((p) => p.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const setStatus = (id, v) => setDogs((p) => p.map((d) => {
    if (d.id !== id) return d;
    const patch = { status: v };
    if (v === "checkedin" && !d.checkedInAt) patch.checkedInAt = Date.now();
    return { ...d, ...patch };
  }));
  const addPreset = (g, k, c) => {
    const v = (c || "").trim(); if (!v) return;
    setPresets((p) => ({ ...p, [g]: { ...p[g], [k]: [...p[g][k], v] } }));
  };
  const removePreset = (g, k, c) =>
    setPresets((p) => ({ ...p, [g]: { ...p[g], [k]: p[g][k].filter((x) => x !== c) } }));

  const done = (d) => d.collected || d.status === "noshow";
  const visible = (filter === "all" ? dogs : dogs.filter((d) => d.status === filter && !d.collected))
    .slice()
    .sort((a, b) => (done(a) === done(b) ? 0 : done(a) ? 1 : -1));
  const count = (k) => (k === "all" ? dogs.length : dogs.filter((d) => d.status === k && !d.collected).length);

  // Simple glance numbers — all plain counts.
  const inToday = dogs.length;
  const grooming = dogs.filter((d) => d.status === "grooming").length;
  const ready = dogs.filter((d) => d.status === "ready" && !d.collected).length;
  const waiting = dogs.filter((d) => (d.status === "booked" || d.status === "checkedin")).length;

  const openSheet = (id) => { setOpenId(id); setTab("today"); };

  const goDog = (dir) => {
    const ids = visible.map((d) => d.id);
    const i = ids.indexOf(openId);
    const next = i + dir;
    if (next >= 0 && next < ids.length) { setOpenId(ids[next]); setTab("today"); }
  };
  const dogIndex = () => visible.map((d) => d.id).indexOf(openId);

  const melDate = now.toLocaleDateString("en-AU", { timeZone: "Australia/Melbourne", weekday: "long", day: "numeric", month: "long" });
  const melTime = now.toLocaleTimeString("en-AU", { timeZone: "Australia/Melbourne", hour: "numeric", minute: "2-digit", hour12: true });

  if (loading || (needsPassword && !session)) {
    return (
      <div style={{ minHeight: "100vh", background: C.cream, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Poppins, sans-serif", color: C.slate, padding: 24, textAlign: "center" }}>
        {needsPassword ? "Activating your invite…" : "Loading…"}
      </div>
    );
  }

  if (needsPassword) return <SetPassword />;
  if (!session) return <Login />;

  return (
    <div style={{ minHeight: "100vh", background: C.cream, color: C.ink, fontFamily: "Poppins, sans-serif", maxWidth: 460, margin: "0 auto", position: "relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Poppins:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; margin: 0; padding: 0; }
        button { font-family: Poppins, sans-serif; cursor: pointer; }
        input, textarea { font-family: Poppins, sans-serif; }
        @keyframes livepulse { 0%,100% { opacity: 1 } 50% { opacity: 0.45 } }
        .livedot { animation: livepulse 1.8s ease-in-out infinite; }
      `}</style>

      {/* ===== HEADER ===== */}
      <div style={{ background: C.brown, color: C.cream, padding: "20px 20px 18px", position: "sticky", top: 0, zIndex: 20, borderRadius: "0 0 20px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 9.5, letterSpacing: 3, textTransform: "uppercase", color: C.gold, fontWeight: 600 }}>The Poodle Specialist</div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 3 }}>
              <div style={{ fontFamily: "Fraunces, serif", fontSize: 28, fontWeight: 600 }}>Grooming Board</div>
              <button onClick={() => setLive((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 5, background: (live ? C.green : C.rose) + "26", border: "1px solid " + (live ? C.green : C.rose) + "66", borderRadius: 999, padding: "3px 9px 3px 8px", cursor: "pointer" }}>
                <span className={live ? "livedot" : ""} style={{ width: 8, height: 8, borderRadius: 999, background: live ? C.green : C.rose, boxShadow: live ? "0 0 0 3px " + C.green + "33" : "none" }} />
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: live ? C.green : C.rose }}>{live ? "LIVE" : "OFFLINE"}</span>
              </button>
            </div>
            <div style={{ fontSize: 12, color: "rgba(244,239,231,0.65)", marginTop: 2 }}>{melDate} · <span style={{ color: C.gold, fontWeight: 600 }}>{melTime}</span></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowHelp(true)} title="Help" style={{ background: "rgba(244,239,231,0.1)", border: "1px solid rgba(244,239,231,0.25)", color: C.cream, borderRadius: 11, width: 38, height: 38, fontSize: 16, fontWeight: 700 }}>?</button>
            <button onClick={() => setShowSettings(true)} title="Settings" style={{ background: "rgba(244,239,231,0.1)", border: "1px solid rgba(244,239,231,0.25)", color: C.cream, borderRadius: 11, width: 38, height: 38, fontSize: 16 }}>⚙</button>
          </div>
        </div>

        {/* glance: four plain counts */}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          {[
            { n: inToday, l: "In today" },
            { n: grooming, l: "Grooming" },
            { n: ready, l: "Ready" },
            { n: waiting, l: "Waiting" },
          ].map((g, i) => (
            <div key={i} style={{ flex: 1, background: "rgba(244,239,231,0.08)", border: "1px solid rgba(244,239,231,0.13)", borderRadius: 13, padding: "10px 4px", textAlign: "center" }}>
              <div style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 600 }}>{g.n}</div>
              <div style={{ fontSize: 9.5, color: "rgba(244,239,231,0.6)", letterSpacing: 0.5, marginTop: 1, textTransform: "uppercase" }}>{g.l}</div>
            </div>
          ))}
        </div>

        {/* filters */}
        <div style={{ display: "flex", gap: 6, marginTop: 13 }}>
          {[{ key: "all", label: "All" }, ...STEPS].map((f) => {
            const active = filter === f.key;
            return (
              <button key={f.key} onClick={() => setFilter(f.key)} style={{ flex: 1, background: active ? C.gold : "rgba(244,239,231,0.08)", color: active ? C.brown : "rgba(244,239,231,0.8)", border: "1px solid " + (active ? C.gold : "rgba(244,239,231,0.13)"), borderRadius: 11, padding: "7px 2px", fontSize: 10.5, fontWeight: 600, display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                <span>{f.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "Fraunces, serif" }}>{count(f.key)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== LIST ===== */}
      <div style={{ padding: "16px 14px 40px" }}>
        {visible.length === 0 && (
          <div style={{ textAlign: "center", color: C.slate, padding: "50px 20px", fontFamily: "Fraunces, serif", fontSize: 17 }}>
            No dogs here right now.
            <div style={{ fontFamily: "Poppins, sans-serif", fontSize: 13, marginTop: 6 }}>Tap “All” above to see everyone.</div>
          </div>
        )}

        {visible.map((d) => {
          const st = stepOf(d.status);
          const here = elapsed(d.checkedInAt);
          const longWait = d.checkedInAt && (Date.now() - d.checkedInAt) > 150 * 60000;
          const specsEmpty = !d.specs.cut && !d.specs.coat && !d.specs.temperament && !d.specs.health;
          const hasToday = d.today.cut || d.today.watch || d.today.svc;

          return (
            <div key={d.id} style={{ background: C.paper, borderRadius: 18, marginBottom: 12, border: "1px solid " + C.line, overflow: "hidden", boxShadow: "0 2px 10px rgba(42,36,32,0.05)", opacity: (d.collected || d.status === "noshow") ? 0.55 : 1 }}>
              {/* tap target: opens details */}
              <div onClick={() => openSheet(d.id)} style={{ padding: 15, cursor: "pointer", borderLeft: "4px solid " + st.dot }}>
                <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div style={{ width: 56, height: 56, borderRadius: 16, background: d.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>{d.avatar}</div>
                    <div style={{ position: "absolute", bottom: -5, right: -5, minWidth: 22, height: 22, padding: "0 5px", borderRadius: 8, background: C.brown, color: C.gold, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2.5px solid " + C.paper, fontFamily: "Fraunces, serif" }}>{d.band}</div>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "Fraunces, serif", fontSize: 20, fontWeight: 600 }}>{d.dog}{d.weight && <span style={{ fontSize: 13, color: C.slate, fontWeight: 400 }}> · {d.weight}</span>}</div>
                    <div style={{ fontSize: 15, color: C.ink, fontWeight: 600, marginTop: 3 }}>{d.owner}</div>
                    {d.litterMates && <div style={{ fontSize: 11, color: C.blue, fontWeight: 600, marginTop: 2, display: "inline-flex", alignItems: "center", gap: 4, background: C.blue + "14", padding: "2px 8px", borderRadius: 999 }}>🔗 With {d.litterMates} (same owner)</div>}
                    <div style={{ fontSize: 11.5, color: C.slate, marginTop: 3 }}>Drop {d.dropTime} · Pick up {d.pickTime}</div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
                    {d.collected
                      ? <span style={{ background: C.green + "1A", color: C.green, borderRadius: 999, padding: "5px 11px", fontSize: 11.5, fontWeight: 700 }}>✓ Collected</span>
                      : <span style={{ background: st.dot + "1A", color: st.color, borderRadius: 999, padding: "5px 11px", fontSize: 11.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 6.5, height: 6.5, borderRadius: 999, background: st.dot }} />{st.label}</span>}
                    {here && !d.collected && <span style={{ fontSize: 10.5, color: longWait ? C.rose : C.slate, fontWeight: longWait ? 700 : 500 }}>{longWait ? "⏱ " : ""}here {here}</span>}
                  </div>
                </div>

                {/* small info pills — groomer is tappable to claim in one tap */}
                <div style={{ display: "flex", gap: 6, marginTop: 11, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={(e) => { e.stopPropagation(); setMenuId(menuId === "g_" + d.id ? null : "g_" + d.id); }}
                      style={{ background: d.groomer ? C.gold + "1F" : C.amber + "14", color: d.groomer ? C.goldDeep : C.amber, border: "1px solid " + (d.groomer ? C.gold + "55" : C.amber + "44"), borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
                      ✂ {d.groomer || "Tap to assign me"} <span style={{ fontSize: 9, opacity: 0.8 }}>▾</span>
                    </button>
                    {menuId === "g_" + d.id && (
                      <div onClick={() => setMenuId(null)} style={{ position: "fixed", inset: 0, background: "rgba(42,36,32,0.5)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                        <div onClick={(e) => e.stopPropagation()} style={{ background: C.cream, borderRadius: 20, width: "100%", maxWidth: 320, maxHeight: "70vh", overflowY: "auto", padding: 18, boxShadow: "0 20px 50px rgba(42,36,32,0.3)" }}>
                          <div style={{ fontFamily: "Fraunces, serif", fontSize: 19, fontWeight: 600, marginBottom: 3 }}>Who’s grooming {d.dog}?</div>
                          <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 14 }}>Tap your name to claim this dog.</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {GROOMERS.map((g) => {
                              const on = d.groomer === g;
                              return <button key={g} onClick={() => { update(d.id, { groomer: on ? "" : g }); setMenuId(null); }} style={{ background: on ? C.gold : C.paper, color: on ? "#fff" : C.ink, border: "1px solid " + (on ? C.gold : C.line), borderRadius: 12, padding: "14px 16px", fontSize: 15, fontWeight: on ? 700 : 500, textAlign: "left" }}>{on ? "✓ " : ""}{g}</button>;
                            })}
                          </div>
                          {d.groomer && <button onClick={() => { update(d.id, { groomer: "" }); setMenuId(null); }} style={{ width: "100%", background: "none", border: "1px solid " + C.line, borderRadius: 12, padding: "12px", fontSize: 13.5, fontWeight: 600, color: C.slate, marginTop: 12 }}>Clear assignment</button>}
                        </div>
                      </div>
                    )}
                  </div>
                  <Pill warn={!d.depositPaid} text={d.depositPaid ? "✓ Deposit paid" : "$ Deposit due"} />
                  {d.late && <Pill warn text="! Running late" />}
                  <Pill warn={specsEmpty} text={specsEmpty ? "◇ No specs yet" : "◆ Specs saved"} />
                </div>

                {/* today notes */}
                {hasToday && (
                  <div style={{ marginTop: 11, display: "flex", flexDirection: "column", gap: 5 }}>
                    {TAGS.map((t) => d.today[t.key] ? (
                      <div key={t.key} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                        <span style={{ background: t.color + "1A", color: t.color, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", padding: "2px 8px", borderRadius: 5, flexShrink: 0 }}>{t.label}</span>
                        <span style={{ fontSize: 13.5, lineHeight: 1.35 }}>{d.today[t.key]}</span>
                      </div>
                    ) : null)}
                  </div>
                )}
              </div>

              {/* ONE big clear action per dog, based on where it is */}
              <div style={{ borderTop: "1px solid " + C.line, padding: 11, display: "flex", gap: 9, alignItems: "center" }}>
                {d.collected ? (
                  <span style={{ flex: 1, textAlign: "center", color: C.slate, fontSize: 13, fontWeight: 600 }}>All done — picked up 🐾</span>
                ) : d.status === "noshow" ? (
                  <>
                    <span style={{ flex: 1, textAlign: "center", color: C.rose, fontSize: 13, fontWeight: 700 }}>No-show — didn’t arrive</span>
                    <button onClick={() => setStatus(d.id, "booked")} style={{ flexShrink: 0, background: "transparent", border: "1.5px solid " + C.line, color: C.brown, borderRadius: 13, padding: "13px 16px", fontSize: 14, fontWeight: 700 }}>Undo</button>
                  </>
                ) : (
                  <>
                    {/* STATUS DROPDOWN — pick where the dog is */}
                    <div style={{ flex: 1, position: "relative" }}>
                      <button onClick={() => setMenuId(menuId === "s_" + d.id ? null : "s_" + d.id)} style={{ ...bigBtn(stepOf(d.status).color), display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: "rgba(255,255,255,0.85)" }} />
                        {stepOf(d.status).label} <span style={{ fontSize: 11, opacity: 0.9 }}>▾</span>
                      </button>
                      {menuId === "s_" + d.id && (
                        <>
                          <div onClick={() => setMenuId(null)} style={{ position: "fixed", inset: 0, zIndex: 29 }} />
                          <div style={{ position: "absolute", left: 0, right: 0, bottom: "calc(100% + 8px)", zIndex: 30, background: C.paper, border: "1px solid " + C.line, borderRadius: 14, boxShadow: "0 10px 30px rgba(42,36,32,0.2)", overflow: "hidden" }}>
                            {STEPS.filter((s) => s.key !== "noshow").map((s) => {
                              const on = d.status === s.key;
                              return (
                                <button key={s.key} onClick={() => { setStatus(d.id, s.key); setMenuId(null); }} style={{ ...menuRow, width: "100%", background: on ? s.color + "14" : "none", border: "none", borderBottom: "1px solid " + C.line, textAlign: "left", display: "flex", alignItems: "center", gap: 10, color: C.ink }}>
                                  <span style={{ width: 9, height: 9, borderRadius: 999, background: s.dot }} />
                                  {s.label}{on ? "  ✓" : ""}
                                </button>
                              );
                            })}
                            <button onClick={() => { setStatus(d.id, "noshow"); setMenuId(null); }} style={{ ...menuRow, width: "100%", background: "none", border: "none", textAlign: "left", display: "flex", alignItems: "center", gap: 10, color: C.rose, fontWeight: 700 }}>
                              <span style={{ width: 9, height: 9, borderRadius: 999, background: C.rose }} />
                              No-show
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    {/* When GROOMING, quick 30-min heads-up text */}
                    {d.status === "grooming" && (
                      <a href={smsHref(d.phone, thirtyText(d))} style={{ ...bigBtn(C.green), flex: "0 0 auto", textDecoration: "none", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "14px 16px" }}>⏱ 30 mins</a>
                    )}

                    {/* When READY, an extra pickup-actions dropdown */}
                    {d.status === "ready" && (
                      <div style={{ flex: 1, position: "relative" }}>
                        <button onClick={() => setMenuId(menuId === "p_" + d.id ? null : "p_" + d.id)} style={bigBtn(C.green)}>🐾 Pickup ▾</button>
                        {menuId === "p_" + d.id && (
                          <>
                            <div onClick={() => setMenuId(null)} style={{ position: "fixed", inset: 0, zIndex: 29 }} />
                            <div style={{ position: "absolute", left: 0, right: 0, bottom: "calc(100% + 8px)", zIndex: 30, background: C.paper, border: "1px solid " + C.line, borderRadius: 14, boxShadow: "0 10px 30px rgba(42,36,32,0.2)", overflow: "hidden" }}>
                              <a href={smsHref(d.phone, thirtyText(d))} onClick={() => setMenuId(null)} style={menuRow}>⏱ Text “30 mins — come now”</a>
                              <a href={smsHref(d.phone, pickupText(d))} onClick={() => setMenuId(null)} style={menuRow}>✉ Text owner “ready”</a>
                              <a href={telHref(d.phone)} onClick={() => setMenuId(null)} style={menuRow}>☎ Call owner</a>
                              <button onClick={() => { setMenuId(null); openSheet(d.id); setTab("pickup"); }} style={{ ...menuRow, width: "100%", background: "none", border: "none", textAlign: "left" }}>📷 Send finished photo</button>
                              <button onClick={() => { update(d.id, { collected: true }); setMenuId(null); }} style={{ ...menuRow, width: "100%", background: "none", border: "none", borderTop: "1px solid " + C.line, color: C.green, textAlign: "left", fontWeight: 700 }}>✓ Picked up — done</button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
                <button onClick={() => openSheet(d.id)} style={{ flexShrink: 0, background: "transparent", border: "1.5px solid " + C.line, color: C.brown, borderRadius: 13, padding: "13px 16px", fontSize: 14, fontWeight: 700 }}>Details</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ===== DETAILS SHEET ===== */}
      {open && (
        <Sheet onClose={() => setOpenId(null)}>
          {/* header — tap arrows to move between dogs */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <button onClick={() => goDog(-1)} disabled={dogIndex() <= 0} style={{ background: C.paper, border: "1px solid " + C.line, color: dogIndex() <= 0 ? C.line : C.brown, borderRadius: 11, width: 36, height: 36, fontSize: 17, fontWeight: 700, flexShrink: 0 }}>‹</button>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div style={{ width: 54, height: 54, borderRadius: 16, background: open.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>{open.avatar}</div>
              <div style={{ position: "absolute", bottom: -5, right: -5, minWidth: 22, height: 22, padding: "0 5px", borderRadius: 8, background: C.brown, color: C.gold, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2.5px solid " + C.cream, fontFamily: "Fraunces, serif" }}>{open.band}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 600 }}>{open.dog}</div>
              <div style={{ fontSize: 13, color: C.slate, marginTop: 2 }}>{open.owner} · {open.phone}</div>
            </div>
            <button onClick={() => goDog(1)} disabled={dogIndex() >= visible.length - 1} style={{ background: C.paper, border: "1px solid " + C.line, color: dogIndex() >= visible.length - 1 ? C.line : C.brown, borderRadius: 11, width: 36, height: 36, fontSize: 17, fontWeight: 700, flexShrink: 0 }}>›</button>
          </div>

          {/* where is this dog — tap to change */}
          <SectionLabel>Where is {open.dog}?</SectionLabel>
          <div style={{ display: "flex", gap: 5, background: C.paper, padding: 4, borderRadius: 13, border: "1px solid " + C.line, marginBottom: 8 }}>
            {STEPS.filter((s) => s.key !== "noshow").map((s) => {
              const active = open.status === s.key;
              return <button key={s.key} onClick={() => setStatus(open.id, s.key)} style={{ flex: 1, background: active ? s.color : "transparent", color: active ? "#fff" : C.slate, border: "none", borderRadius: 9, padding: "10px 2px", fontSize: 11, fontWeight: 700 }}>{s.label}</button>;
            })}
          </div>
          <button onClick={() => setStatus(open.id, open.status === "noshow" ? "booked" : "noshow")} style={{ width: "100%", background: open.status === "noshow" ? C.rose : "transparent", color: open.status === "noshow" ? "#fff" : C.slate, border: "1px solid " + (open.status === "noshow" ? C.rose : C.line), borderRadius: 11, padding: "9px", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{open.status === "noshow" ? "✓ Marked no-show — tap to undo" : "Mark as no-show"}</button>

          {/* tabs */}
          <div style={{ display: "flex", gap: 4, marginTop: 14, borderBottom: "1px solid " + C.line }}>
            {TABS.map((t) => {
              const active = tab === t.k;
              return <button key={t.k} onClick={() => setTab(t.k)} style={{ flex: 1, background: "none", border: "none", borderBottom: "3px solid " + (active ? C.gold : "transparent"), color: active ? C.brown : C.slate, padding: "9px 0 11px", fontSize: 13, fontWeight: active ? 700 : 500 }}>{t.l}</button>;
            })}
          </div>

          <div style={{ paddingTop: 16 }}>
            {tab === "today" && (
              <>
                <Hint>Only fill what’s different today. Empty = do {open.dog}’s usual.</Hint>
                {TAGS.map((t) => <Field key={t.key} label={t.label} accent={t.color} placeholder={t.hint} value={open.today[t.key]} onChange={(v) => update(open.id, { today: { ...open.today, [t.key]: v } })} presets={presets.today[t.key]} />)}
              </>
            )}
            {tab === "specs" && (
              <>
                {/* Last visit history */}
                {open.lastVisit ? (
                  <div style={{ background: C.paper, border: "1px solid " + C.line, borderRadius: 14, padding: 14, marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                      <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, color: C.goldDeep }}>Last visit</span>
                      <span style={{ fontSize: 12, color: C.slate }}>{open.lastVisit.date}</span>
                    </div>
                    <div style={{ display: "flex", gap: 12 }}>
                      {open.lastVisit.photo && (
                        <div style={{ width: 76, height: 76, borderRadius: 12, flexShrink: 0, background: open.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, border: "1px solid " + C.line }}>{open.avatar}</div>
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, color: C.ink, lineHeight: 1.45, fontWeight: 600 }}>{open.lastVisit.did}</div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 9 }}>
                          <span style={{ background: C.gold + "1A", color: C.goldDeep, borderRadius: 999, padding: "3px 10px", fontSize: 11.5, fontWeight: 600 }}>✂ {open.lastVisit.groomer}</span>
                          <span style={{ background: C.gold + "1A", color: C.goldDeep, borderRadius: 999, padding: "3px 10px", fontSize: 11.5, fontWeight: 600 }}>{open.lastVisit.service}</span>
                          <span style={{ background: C.gold + "1A", color: C.goldDeep, borderRadius: 999, padding: "3px 10px", fontSize: 11.5, fontWeight: 600 }}>⏱ {open.lastVisit.took}</span>
                        </div>
                      </div>
                    </div>
                    {open.lastVisit.photo && <div style={{ fontSize: 10.5, color: C.slate, fontStyle: "italic", marginTop: 7 }}>Sample photo — live build shows the real after-shot from last visit.</div>}
                    {open.lastVisit.note && <div style={{ fontSize: 13, color: C.slate, fontStyle: "italic", marginTop: 9, lineHeight: 1.4 }}>“{open.lastVisit.note}”</div>}
                  </div>
                ) : (
                  <div style={{ background: C.paper, border: "1px dashed " + C.line, borderRadius: 14, padding: 14, marginBottom: 16, textAlign: "center" }}>
                    <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, color: C.slate, marginBottom: 4 }}>Last visit</div>
                    <div style={{ fontSize: 13, color: C.slate, fontStyle: "italic" }}>First visit — no history yet. After this groom, it’ll show here next time.</div>
                  </div>
                )}
                <Hint>Fill once and it’s saved for next time.</Hint>
                {SPECS.map((s) => <Field key={s.key} label={s.label} placeholder={"Tap a chip or type…"} value={open.specs[s.key]} onChange={(v) => update(open.id, { specs: { ...open.specs, [s.key]: v } })} presets={presets.specs[s.key]} />)}
              </>
            )}
            {tab === "checkin" && (
              <>
                <SectionLabel>Arrived?</SectionLabel>
                {open.checkedInAt ? <Hint>Checked in · here {elapsed(open.checkedInAt)}.</Hint> : (
                  <button onClick={() => setStatus(open.id, "checkedin")} style={{ ...bigBtn(C.blue), width: "100%", marginBottom: 18 }}>✓ Check in now</button>
                )}
                <SectionLabel>Who’s grooming {open.dog}?</SectionLabel>
                <ChipRow items={GROOMERS} selected={open.groomer} onPick={(g) => update(open.id, { groomer: open.groomer === g ? "" : g })} />
                <SectionLabel style={{ marginTop: 18 }}>Deposit</SectionLabel>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => update(open.id, { depositPaid: true })} style={twoBtn(open.depositPaid, C.green)}>✓ Paid</button>
                  <button onClick={() => update(open.id, { depositPaid: false })} style={twoBtn(!open.depositPaid, C.amber)}>$ Due</button>
                </div>
                <SectionLabel style={{ marginTop: 18 }}>Running late?</SectionLabel>
                <button onClick={() => update(open.id, { late: !open.late })} style={{ width: "100%", background: open.late ? C.rose : C.paper, color: open.late ? "#fff" : C.ink, border: "1px solid " + (open.late ? C.rose : C.line), borderRadius: 12, padding: "13px", fontSize: 14, fontWeight: 700 }}>{open.late ? "! Flagged late — tap to clear" : "Flag as running late"}</button>
              </>
            )}
            {tab === "pickup" && (
              <>
                <SectionLabel>Tell the owner it’s ready</SectionLabel>
                <Quote>{thirtyText(open)}</Quote>
                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <a href={smsHref(open.phone, thirtyText(open))} style={{ ...bigBtn(C.green), flex: 2, textDecoration: "none", textAlign: "center" }}>⏱ Text “30 mins”</a>
                  <a href={telHref(open.phone)} style={{ flex: 1, textDecoration: "none", textAlign: "center", background: "transparent", color: C.brown, border: "1.5px solid " + C.gold, borderRadius: 13, padding: "14px", fontSize: 14, fontWeight: 700 }}>☎ Call</a>
                </div>
                <a href={smsHref(open.phone, pickupText(open))} style={{ display: "block", textDecoration: "none", textAlign: "center", background: "transparent", color: C.brown, border: "1.5px solid " + C.line, borderRadius: 13, padding: "12px", fontSize: 13.5, fontWeight: 700, marginTop: 9 }}>✉ Or text “all done — ready now”</a>
                <div style={{ height: 1, background: C.line, margin: "20px 0" }} />
                <SectionLabel>Finished photo</SectionLabel>
                <Hint>Saved to {open.dog}’s record, then texted to {open.owner.split(" ")[0]} as a link.</Hint>
                <div style={{ display: "flex", gap: 12 }}>
                  <div onClick={() => update(open.id, { groomPhoto: !open.groomPhoto })} style={{ width: 92, height: 92, borderRadius: 15, flexShrink: 0, background: open.groomPhoto ? open.bg : C.paper, border: "1.5px " + (open.groomPhoto ? "solid " + C.gold : "dashed " + C.line), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: open.groomPhoto ? 42 : 22, color: C.slate, cursor: "pointer" }}>
                    {open.groomPhoto ? open.avatar : <><span style={{ fontSize: 24 }}>📷</span><span style={{ fontSize: 10, marginTop: 3, fontWeight: 600 }}>Add</span></>}
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
                    {open.groomPhoto
                      ? <a href={smsHref(open.phone, photoText(open))} style={{ ...bigBtn(C.green), textDecoration: "none", textAlign: "center", padding: "12px" }}>✉ Send photo link</a>
                      : <span style={{ fontSize: 12.5, color: C.slate, fontStyle: "italic" }}>Tap the box to add a photo.</span>}
                  </div>
                </div>
              </>
            )}
          </div>

          <div style={{ position: "sticky", bottom: 0, margin:" 16px -20px 0", padding: "12px 20px calc(12px + env(safe-area-inset-bottom))", background: "rgba(244,239,231,0.92)", backdropFilter: "blur(8px)", borderTop: "1px solid " + C.line, display: "flex", gap: 10, zIndex: 5 }}>
            {TABS.findIndex((t) => t.k === tab) > 0 && (
              <button onClick={() => setTab(TABS[TABS.findIndex((t) => t.k === tab) - 1].k)} style={{ flexShrink: 0, background: C.paper, color: C.brown, border: "1.5px solid " + C.line, borderRadius: 14, padding: "15px 18px", fontSize: 14.5, fontWeight: 700 }}>← Back</button>
            )}
            {TABS.findIndex((t) => t.k === tab) < TABS.length - 1 ? (
              <button onClick={() => setTab(TABS[TABS.findIndex((t) => t.k === tab) + 1].k)} style={{ flex: 1, background: C.gold, color: "#fff", border: "none", borderRadius: 14, padding: "15px", fontSize: 15, fontWeight: 700 }}>Next · {TABS[TABS.findIndex((t) => t.k === tab) + 1].l} →</button>
            ) : (
              <button onClick={() => setOpenId(null)} style={{ flex: 1, background: C.brown, color: C.cream, border: "none", borderRadius: 14, padding: "15px", fontSize: 15, fontWeight: 700 }}>✓ Done</button>
            )}
          </div>
        </Sheet>
      )}

      {/* ===== HELP ===== */}
      {showHelp && (
        <Sheet onClose={() => setShowHelp(false)}>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 600 }}>How it works</div>
          <Hint>Each dog moves through four steps. The big button always shows the next thing to do.</Hint>
          {[
            ["1. Not arrived", "Dog is booked but not here yet. Tap “Check in” when they arrive."],
            ["2. Checked in", "They’re here. Tap “Start grooming” when you begin."],
            ["3. Grooming", "Being groomed. Tap “Mark ready” when done."],
            ["4. Ready", "Tap for pickup options: text owner, call, send photo, or mark picked up."],
          ].map(([h, b], i) => (
            <div key={i} style={{ background: C.paper, border: "1px solid " + C.line, borderRadius: 13, padding: 14, marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{h}</div>
              <div style={{ fontSize: 13, color: C.slate, lineHeight: 1.4 }}>{b}</div>
            </div>
          ))}
          <div style={{ background: C.paper, border: "1px solid " + C.line, borderRadius: 13, padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>Tap “Details” for everything else</div>
            <div style={{ fontSize: 13, color: C.slate, lineHeight: 1.4 }}>Today’s notes, the dog’s usual specs, who’s grooming, deposit, and pickup — all in one place, organised into tabs.</div>
          </div>
          <button onClick={() => setShowHelp(false)} style={{ width: "100%", background: C.brown, color: C.cream, border: "none", borderRadius: 14, padding: "15px", fontSize: 15, fontWeight: 700, marginTop: 18 }}>Got it</button>
        </Sheet>
      )}

      {/* ===== SETTINGS ===== */}
      {showSettings && (
        <Sheet onClose={() => setShowSettings(false)}>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 600 }}>Settings</div>
          {profile?.display_name && (
            <div style={{ fontSize: 13, color: C.slate, marginTop: 4, marginBottom: 12 }}>
              Signed in as {profile.display_name}
              {profile.groomer_name ? ` · ${profile.groomer_name}` : ""}
            </div>
          )}
          <Hint>Edit the quick-pick chips your team taps. Add the ones you say all day; remove the rest.</Hint>
          <SectionLabel>Today’s notes</SectionLabel>
          {TAGS.map((t) => <PresetEditor key={t.key} label={t.label} accent={t.color} chips={presets.today[t.key]} onAdd={(c) => addPreset("today", t.key, c)} onRemove={(c) => removePreset("today", t.key, c)} />)}
          <SectionLabel style={{ marginTop: 10 }}>Groom specs</SectionLabel>
          {["coat", "temperament"].map((k) => <PresetEditor key={k} label={SPECS.find((s) => s.key === k).label} chips={presets.specs[k]} onAdd={(c) => addPreset("specs", k, c)} onRemove={(c) => removePreset("specs", k, c)} />)}
          <button
            onClick={async () => { await signOut(); setShowSettings(false); }}
            style={{ width: "100%", background: C.paper, color: C.rose, border: "1px solid " + C.rose + "55", borderRadius: 14, padding: "15px", fontSize: 15, fontWeight: 700, marginTop: 16 }}
          >
            Sign out
          </button>
          <button onClick={() => setShowSettings(false)} style={{ width: "100%", background: C.brown, color: C.cream, border: "none", borderRadius: 14, padding: "15px", fontSize: 15, fontWeight: 700, marginTop: 10 }}>Done</button>
        </Sheet>
      )}
    </div>
  );
}

// ===== small reusable pieces =====
const bigBtn = (color) => ({ flex: 1, background: color, color: "#fff", border: "none", borderRadius: 13, padding: "14px", fontSize: 14.5, fontWeight: 700 });
const twoBtn = (active, color) => ({ flex: 1, background: active ? color : C.paper, color: active ? "#fff" : C.ink, border: "1px solid " + (active ? color : C.line), borderRadius: 12, padding: "13px", fontSize: 14, fontWeight: 700 });
const menuRow = { display: "block", padding: "14px 16px", fontSize: 14, fontWeight: 600, color: C.ink, textDecoration: "none", borderBottom: "1px solid " + C.line, fontFamily: "Poppins, sans-serif" };

function Pill({ text, warn }) {
  const col = warn ? C.amber : C.green;
  return <span style={{ background: col + "14", color: col, border: "1px solid " + col + "33", borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 600 }}>{text}</span>;
}
function SectionLabel({ children, style }) {
  return <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, color: C.goldDeep, marginBottom: 8, ...style }}>{children}</div>;
}
function Hint({ children }) {
  return <p style={{ fontSize: 13, color: C.slate, margin: "0 0 14px", lineHeight: 1.45 }}>{children}</p>;
}
function Quote({ children }) {
  return <div style={{ background: C.paper, border: "1px solid " + C.line, borderRadius: 13, padding: "12px 14px", fontSize: 13.5, lineHeight: 1.45, fontStyle: "italic" }}>“{children}”</div>;
}
function ChipRow({ items, selected, onPick }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      {items.map((it) => {
        const active = selected === it;
        return <button key={it} onClick={() => onPick(it)} style={{ background: active ? C.gold : C.paper, color: active ? "#fff" : C.ink, border: "1px solid " + (active ? C.gold : C.line), borderRadius: 999, padding: "9px 15px", fontSize: 13.5, fontWeight: active ? 700 : 500 }}>{active ? "✓ " : ""}{it}</button>;
      })}
    </div>
  );
}

function Sheet({ children, onClose }) {
  const [dragY, setDragY] = React.useState(0);
  const startY = React.useRef(null);

  const onStart = (y) => { startY.current = y; };
  const onMove = (y) => {
    if (startY.current == null) return;
    const dy = y - startY.current;
    if (dy > 0) setDragY(dy); // only allow downward drag
  };
  const onEnd = () => {
    if (dragY > 110) onClose();   // dragged far enough → dismiss
    else setDragY(0);             // snap back
    startY.current = null;
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(42,36,32,0.5)", zIndex: 40, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: C.cream, width: "100%", maxWidth: 460, borderRadius: "24px 24px 0 0", maxHeight: "94vh", overflowY: "auto", padding: "8px 20px 28px", transform: `translateY(${dragY}px)`, transition: startY.current == null ? "transform .25s cubic-bezier(.2,.8,.2,1)" : "none" }}
      >
        {/* Drag-to-dismiss handle area */}
        <div
          onTouchStart={(e) => onStart(e.touches[0].clientY)}
          onTouchMove={(e) => onMove(e.touches[0].clientY)}
          onTouchEnd={onEnd}
          onMouseDown={(e) => onStart(e.clientY)}
          onMouseMove={(e) => startY.current != null && onMove(e.clientY)}
          onMouseUp={onEnd}
          onMouseLeave={() => startY.current != null && onEnd()}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", padding: "8px 0 12px", cursor: "grab", touchAction: "none" }}
        >
          <div style={{ width: 44, height: 5, background: C.line, borderRadius: 4 }} />
          <div style={{ fontSize: 11, color: C.slate, marginTop: 6 }}>Swipe down to close</div>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, accent, presets }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        {accent && <span style={{ width: 9, height: 9, borderRadius: 3, background: accent }} />}
        <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
      </div>
      {presets && presets.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 9 }}>
          {presets.map((chip) => {
            const active = chipActive(value, chip);
            return <button key={chip} onClick={() => onChange(toggleChip(value, chip))} style={{ background: active ? (accent || C.gold) : C.paper, color: active ? "#fff" : C.ink, border: "1px solid " + (active ? (accent || C.gold) : C.line), borderRadius: 999, padding: "8px 14px", fontSize: 12.5, fontWeight: active ? 700 : 500 }}>{active ? "✓ " : ""}{chip}</button>;
          })}
        </div>
      )}
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={value && value.length > 38 ? 2 : 1} style={{ width: "100%", border: "1px solid " + C.line, borderRadius: 12, padding: "12px 14px", fontSize: 15, color: C.ink, background: "#fff", resize: "vertical", lineHeight: 1.4, outline: "none" }} />
    </div>
  );
}

function PresetEditor({ label, accent, chips, onAdd, onRemove }) {
  const [draft, setDraft] = useState("");
  const submit = () => { onAdd(draft); setDraft(""); };
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        {accent && <span style={{ width: 9, height: 9, borderRadius: 3, background: accent }} />}
        <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 9 }}>
        {chips.map((c) => (
          <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: C.paper, border: "1px solid " + C.line, borderRadius: 999, padding: "6px 7px 6px 13px", fontSize: 12.5 }}>
            {c}<button onClick={() => onRemove(c)} style={{ background: C.line, border: "none", borderRadius: 999, width: 19, height: 19, fontSize: 13, color: C.brown, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Add a chip…" style={{ flex: 1, border: "1px solid " + C.line, borderRadius: 12, padding: "10px 13px", fontSize: 14, background: "#fff", outline: "none" }} />
        <button onClick={submit} style={{ background: accent || C.gold, color: "#fff", border: "none", borderRadius: 12, padding: "0 20px", fontSize: 14, fontWeight: 700 }}>Add</button>
      </div>
    </div>
  );
}
