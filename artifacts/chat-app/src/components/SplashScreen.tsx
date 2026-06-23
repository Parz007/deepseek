import { useEffect, useMemo } from "react";

const WHALE_URL =
  "https://i.8upload.com/image/8f4c7cf580d96c9b/3039-removebg-preview.png";

// Actual whale PNG dimensions (640×365)
const IMG_W   = 640;
const IMG_H   = 365;
const N       = 28;
const STRIP_W = IMG_W / N; // ≈ 22.857 px per strip

// Wave amplitude (left → right, decreasing) from original design
const AMP = [
  11.00, 10.36, 9.73, 9.11, 8.51, 7.93, 7.36, 6.81,
   6.27,  5.75, 5.25, 4.76, 4.29, 3.85, 3.42, 3.01,
   2.61,  2.24, 1.90, 1.57, 1.27, 0.99, 0.74, 0.52,
   0.33,  0.17, 0.06, 0.00,
];
const DELAY = [
  -0.4200, -0.3954, -0.3713, -0.3479, -0.3250, -0.3027, -0.2809, -0.2598,
  -0.2394, -0.2195, -0.2003, -0.1818, -0.1640, -0.1468, -0.1304, -0.1148,
  -0.0998, -0.0857, -0.0724, -0.0600, -0.0484, -0.0379, -0.0283, -0.0198,
  -0.0125, -0.0065, -0.0022, -0.0000,
];

interface Props { onDone: () => void; }

export default function SplashScreen({ onDone }: Props) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone]);

  const bubbles = useMemo(() =>
    Array.from({ length: 16 }, (_, i) => ({
      id: i,
      left:     Math.random() * 100,
      size:     3 + Math.random() * 7,
      duration: 4 + Math.random() * 5,
      delay:    -(Math.random() * 9),
      drift:    Math.round(Math.random() * 40 - 20),
    })), []);

  const bands = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => ({
      id: i,
      top:      Math.random() * 90 + 5,
      delay:    -(Math.random() * 6),
      duration: 4.5 + Math.random() * 3,
    })), []);

  return (
    <>
      <style>{`
        .ds-splash {
          position:fixed; inset:0; z-index:9999; overflow:hidden;
          background: radial-gradient(ellipse 120% 60% at 50% 0%,
            #123A66 0%, #0A1A33 45%, #02060F 100%);
        }
        /* caustics */
        .ds-caustics {
          position:absolute; inset:0; z-index:2; opacity:.22;
          mix-blend-mode:screen;
          background-image: repeating-linear-gradient(
            115deg, transparent 0 18px, rgba(159,216,255,.5) 19px 21px, transparent 22px 60px);
          animation: ds-causticDrift 5s linear infinite;
          filter: blur(2px);
        }
        @keyframes ds-causticDrift {
          0%   { background-position: 0 0; }
          100% { background-position: 140px 220px; }
        }
        /* light shafts */
        .ds-shaft {
          position:absolute; top:-10%; height:140%;
          background: linear-gradient(180deg, rgba(159,216,255,.16), rgba(159,216,255,0) 70%);
          z-index:1; filter:blur(2px);
          animation: ds-swayShaft 9s ease-in-out infinite;
        }
        @keyframes ds-swayShaft {
          0%,100% { transform: skewX(-10deg) translateX(0); }
          50%     { transform: skewX(-6deg) translateX(2.5%); }
        }
        /* depth bands */
        .ds-band {
          position:absolute; left:-10%; width:120%; height:2px;
          background: linear-gradient(90deg,transparent,#9FD8FF,transparent);
          opacity:0; animation: ds-riseBand linear infinite; filter:blur(1px);
          mix-blend-mode:screen;
        }
        @keyframes ds-riseBand {
          0%   { transform:translateY(0) scaleX(1); opacity:0; }
          8%   { opacity:.35; }
          85%  { opacity:.18; }
          100% { transform:translateY(-115vh) scaleX(1.15); opacity:0; }
        }
        /* bubbles */
        .ds-bubble {
          position:absolute; bottom:-5%; border-radius:50%;
          background: radial-gradient(circle at 30% 30%,
            rgba(255,255,255,.95), rgba(159,216,255,.25) 60%, transparent);
          animation: ds-riseBubble linear infinite; opacity:0;
        }
        @keyframes ds-riseBubble {
          0%   { transform:translateY(0) translateX(0) scale(1); opacity:0; }
          10%  { opacity:.85; }
          90%  { opacity:.5; }
          100% { transform:translateY(-105vh) translateX(var(--drift,18px)) scale(.4); opacity:0; }
        }
        /* whale bob */
        .ds-whale-sink {
          position:absolute; top:50%; left:50%;
          width:54vw; max-width:380px; min-width:220px; z-index:4;
          animation: ds-sinkDrift 7s ease-in-out infinite;
        }
        @keyframes ds-sinkDrift {
          0%   { transform:translate(-50%,-50%) translateY(-14px) rotate(-3deg); }
          50%  { transform:translate(-50%,-50%) translateY(14px) rotate(2deg); }
          100% { transform:translate(-50%,-50%) translateY(-14px) rotate(-3deg); }
        }
        /* whale strip row */
        .ds-whale-row {
          display:flex; width:100%;
          filter: drop-shadow(0 18px 34px rgba(5,15,35,.65));
        }
        /* strip keyframes */
        ${AMP.map((a, i) => `
          @keyframes ds-wv${i} {
            0%   { transform: translateY(0); }
            50%  { transform: translateY(${a}px); }
            100% { transform: translateY(0); }
          }
        `).join("")}
        /* vignette */
        .ds-vignette {
          position:absolute; inset:0; z-index:5; pointer-events:none;
          background: radial-gradient(ellipse 90% 70% at 50% 50%,
            transparent 55%, rgba(0,3,10,.55) 100%);
        }
        /* brand */
        .ds-brand {
          position:absolute; left:0; right:0; bottom:9%;
          z-index:6; text-align:center;
          animation: ds-fadeUp 1.2s ease-out .3s both;
        }
        @keyframes ds-fadeUp {
          0%   { opacity:0; transform:translateY(10px); }
          100% { opacity:1; transform:translateY(0); }
        }
        .ds-brand-name {
          font-size:1.5rem; font-weight:700; letter-spacing:.14em;
          text-transform:uppercase;
          background: linear-gradient(90deg, #9FD8FF, #E8F4FF);
          -webkit-background-clip:text; background-clip:text; color:transparent;
          font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
        }
        .ds-brand-sub {
          margin-top:6px; font-size:.78rem; letter-spacing:.08em;
          color: rgba(232,244,255,.55);
          font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
        }
        .ds-loader {
          margin:22px auto 0; width:120px; height:3px; border-radius:3px;
          background:rgba(159,216,255,.15); overflow:hidden;
        }
        .ds-loader-fill {
          height:100%; width:40%; border-radius:3px;
          background: linear-gradient(90deg, #2F6FBE, #9FD8FF);
          animation: ds-loaderSweep 1.6s ease-in-out infinite;
        }
        @keyframes ds-loaderSweep {
          0%   { transform:translateX(-100%); }
          100% { transform:translateX(250%); }
        }
      `}</style>

      <div className="ds-splash">

        <div className="ds-caustics" />

        {/* light shafts */}
        <div className="ds-shaft" style={{ left:"8%",  width:"38%", animationDelay:"0s" }} />
        <div className="ds-shaft" style={{ left:"38%", width:"26%", animationDelay:"-3s", opacity:.7 }} />
        <div className="ds-shaft" style={{ left:"66%", width:"30%", animationDelay:"-6s", opacity:.6 }} />

        {/* depth bands */}
        <div style={{ position:"absolute", inset:0, zIndex:1, overflow:"hidden",
                      mixBlendMode:"screen" as const, opacity:.5 }}>
          {bands.map(b => (
            <div key={b.id} className="ds-band" style={{
              top: `${b.top}%`,
              animationDelay: `${b.delay}s`,
              animationDuration: `${b.duration}s`,
            }} />
          ))}
        </div>

        {/* whale — horizontal flex of 28 background-image slices */}
        <div className="ds-whale-sink">
          <div className="ds-whale-row">
            {AMP.map((amp, i) => (
              <div
                key={i}
                style={{
                  flex: "none",
                  width: `${100 / N}%`,
                  aspectRatio: `${STRIP_W} / ${IMG_H}`,
                  backgroundImage: `url(${WHALE_URL})`,
                  backgroundRepeat: "no-repeat",
                  backgroundSize: `${N * 100}% 100%`,
                  backgroundPosition: `${(i / (N - 1)) * 100}% 0`,
                  animation: `ds-wv${i} 2.4s ease-in-out infinite`,
                  animationDelay: `${DELAY[i]}s`,
                }}
              />
            ))}
          </div>
        </div>

        {/* bubbles */}
        <div style={{ position:"absolute", inset:0, zIndex:3, pointerEvents:"none" }}>
          {bubbles.map(b => (
            <div key={b.id} className="ds-bubble" style={{
              left: `${b.left}%`,
              width: b.size, height: b.size,
              animationDuration: `${b.duration}s`,
              animationDelay: `${b.delay}s`,
              ["--drift" as any]: `${b.drift}px`,
            }} />
          ))}
        </div>

        <div className="ds-vignette" />

        <div className="ds-brand">
          <div className="ds-brand-name">DeepSeek</div>
          <div className="ds-brand-sub">AI that actually answers</div>
          <div className="ds-loader"><div className="ds-loader-fill" /></div>
        </div>

      </div>
    </>
  );
}
