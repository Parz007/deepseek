import { useEffect, useState } from "react";

const WHALE_URL = "https://i.8upload.com/image/754e4deaa6081d6b/img-20260619-170814-703.jpg";

interface Bubble {
  id: number;
  left: string;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
}

function makeBubbles(count: number): Bubble[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${8 + Math.random() * 84}%`,
    size: 4 + Math.random() * 10,
    duration: 3 + Math.random() * 4,
    delay: Math.random() * 3,
    opacity: 0.15 + Math.random() * 0.35,
  }));
}

const BUBBLES = makeBubbles(18);

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), 400);
    const t2 = setTimeout(() => setPhase("out"), 2600);
    const t3 = setTimeout(onDone, 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
        background: "linear-gradient(180deg, #020d1a 0%, #041d35 30%, #063050 60%, #0a4a78 100%)",
        opacity: phase === "in" ? 0 : phase === "out" ? 0 : 1,
        transition: phase === "in" ? "opacity 0.4s ease-out" : phase === "out" ? "opacity 0.6s ease-in" : "none",
      }}
    >
      {/* caustic light rays from top */}
      <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "100%", height: "55%", pointerEvents: "none" }}>
        {[...Array(7)].map((_, i) => (
          <div key={i} style={{
            position: "absolute",
            top: 0,
            left: `${12 + i * 12}%`,
            width: `${2 + i % 3}%`,
            height: "100%",
            background: "linear-gradient(180deg, rgba(100,200,255,0.07) 0%, transparent 100%)",
            transform: `rotate(${-12 + i * 4}deg)`,
            transformOrigin: "top center",
            animation: `ray-sway ${3 + i * 0.4}s ease-in-out ${i * 0.3}s infinite alternate`,
          }} />
        ))}
      </div>

      {/* animated bubbles */}
      {BUBBLES.map(b => (
        <div key={b.id} style={{
          position: "absolute",
          bottom: "-20px",
          left: b.left,
          width: b.size,
          height: b.size,
          borderRadius: "50%",
          background: "transparent",
          border: `1.5px solid rgba(130,210,255,${b.opacity})`,
          animation: `bubble-rise ${b.duration}s ease-in ${b.delay}s infinite`,
        }} />
      ))}

      {/* glow halo behind whale */}
      <div style={{
        position: "absolute",
        width: "260px", height: "260px",
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,130,255,0.18) 0%, transparent 70%)",
        animation: "halo-pulse 3s ease-in-out infinite",
      }} />

      {/* whale image — swimming animation */}
      <div style={{
        position: "relative",
        width: "220px", height: "220px",
        animation: "whale-swim 4s ease-in-out infinite",
        filter: "drop-shadow(0 8px 32px rgba(0,160,255,0.45))",
      }}>
        <img
          src={WHALE_URL}
          alt="Whale"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            borderRadius: "50%",
            animation: "whale-tilt 4s ease-in-out infinite",
          }}
        />
        {/* shimmer overlay */}
        <div style={{
          position: "absolute", inset: 0,
          borderRadius: "50%",
          background: "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 60%)",
          animation: "shimmer 4s ease-in-out infinite",
        }} />
      </div>

      {/* title */}
      <div style={{ marginTop: "32px", textAlign: "center", animation: "fade-up 0.7s ease-out 0.3s both" }}>
        <p style={{
          fontSize: "26px", fontWeight: 800, letterSpacing: "-0.5px",
          background: "linear-gradient(135deg, #60c8ff, #a78bfa)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          marginBottom: "6px", fontFamily: "Inter, sans-serif",
        }}>
          DeepSeek
        </p>
        <p style={{
          fontSize: "13px", color: "rgba(160,220,255,0.65)",
          letterSpacing: "2.5px", textTransform: "uppercase",
          fontFamily: "Inter, sans-serif", fontWeight: 500,
        }}>
          Uncensored AI
        </p>
      </div>

      {/* loading dots */}
      <div style={{ display: "flex", gap: "6px", marginTop: "28px", animation: "fade-up 0.7s ease-out 0.5s both" }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: "6px", height: "6px", borderRadius: "50%",
            background: "rgba(100,180,255,0.7)",
            animation: `dot-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>

      <style>{`
        @keyframes whale-swim {
          0%   { transform: translateY(0px) translateX(0px); }
          25%  { transform: translateY(-14px) translateX(5px); }
          50%  { transform: translateY(-8px) translateX(10px); }
          75%  { transform: translateY(-18px) translateX(4px); }
          100% { transform: translateY(0px) translateX(0px); }
        }
        @keyframes whale-tilt {
          0%   { transform: rotate(-3deg) scaleX(1); }
          30%  { transform: rotate(3deg) scaleX(1.02); }
          60%  { transform: rotate(-2deg) scaleX(0.99); }
          100% { transform: rotate(-3deg) scaleX(1); }
        }
        @keyframes shimmer {
          0%   { opacity: 0.6; }
          50%  { opacity: 1; }
          100% { opacity: 0.6; }
        }
        @keyframes halo-pulse {
          0%   { transform: scale(1); opacity: 0.7; }
          50%  { transform: scale(1.18); opacity: 1; }
          100% { transform: scale(1); opacity: 0.7; }
        }
        @keyframes bubble-rise {
          0%   { transform: translateY(0) scale(1); opacity: 1; }
          80%  { opacity: 0.6; }
          100% { transform: translateY(-100vh) scale(1.3); opacity: 0; }
        }
        @keyframes ray-sway {
          from { opacity: 0.6; }
          to   { opacity: 1; }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes dot-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30%            { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
