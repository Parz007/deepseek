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
    size: 3 + Math.random() * 8,
    duration: 2.5 + Math.random() * 3.5,
    delay: Math.random() * 4,
    opacity: 0.2 + Math.random() * 0.4,
  }));
}

const BUBBLES = makeBubbles(22);

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"in" | "hold" | "dive" | "out">("in");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), 500);
    const t2 = setTimeout(() => setPhase("dive"), 2200);
    const t3 = setTimeout(() => setPhase("out"), 3000);
    const t4 = setTimeout(onDone, 3600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [onDone]);

  const isDiving = phase === "dive" || phase === "out";

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
        background: "linear-gradient(180deg, #010b15 0%, #021628 25%, #042840 55%, #063d63 100%)",
        opacity: phase === "in" ? 0 : phase === "out" ? 0 : 1,
        transition: phase === "in"
          ? "opacity 0.5s ease-out"
          : phase === "out"
          ? "opacity 0.6s ease-in"
          : "none",
      }}
    >
      {/* Deep water depth gradient at bottom */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: "40%",
        background: "linear-gradient(0deg, rgba(0,0,0,0.6) 0%, transparent 100%)",
        pointerEvents: "none",
      }} />

      {/* Caustic light rays from surface */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "60%", pointerEvents: "none" }}>
        {[...Array(8)].map((_, i) => (
          <div key={i} style={{
            position: "absolute",
            top: 0,
            left: `${8 + i * 11}%`,
            width: `${1.5 + (i % 3) * 0.8}%`,
            height: "100%",
            background: "linear-gradient(180deg, rgba(80,180,255,0.09) 0%, transparent 100%)",
            transform: `rotate(${-14 + i * 4.5}deg)`,
            transformOrigin: "top center",
            animation: `ray-sway ${2.8 + i * 0.35}s ease-in-out ${i * 0.25}s infinite alternate`,
          }} />
        ))}
      </div>

      {/* Ambient particles */}
      {BUBBLES.map(b => (
        <div key={b.id} style={{
          position: "absolute",
          bottom: "-20px",
          left: b.left,
          width: b.size,
          height: b.size,
          borderRadius: "50%",
          background: "transparent",
          border: `1px solid rgba(100,190,255,${b.opacity})`,
          animation: `bubble-rise ${b.duration}s ease-in ${b.delay}s infinite`,
        }} />
      ))}

      {/* Dive trail bubbles — appear when whale dives */}
      {isDiving && [...Array(8)].map((_, i) => (
        <div key={`dive-${i}`} style={{
          position: "absolute",
          top: "50%",
          left: `${42 + Math.random() * 16}%`,
          width: 4 + i * 1.5,
          height: 4 + i * 1.5,
          borderRadius: "50%",
          background: "transparent",
          border: "1px solid rgba(140,210,255,0.6)",
          animation: `dive-bubble ${0.8 + i * 0.15}s ease-out ${i * 0.07}s both`,
        }} />
      ))}

      {/* Glow halo */}
      <div style={{
        position: "absolute",
        width: "280px", height: "280px",
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,120,255,0.16) 0%, transparent 70%)",
        animation: isDiving ? "halo-fade 0.8s ease-in forwards" : "halo-pulse 2.8s ease-in-out infinite",
        transition: "opacity 0.4s",
      }} />

      {/* Whale */}
      <div style={{
        position: "relative",
        width: "200px", height: "200px",
        filter: "drop-shadow(0 6px 28px rgba(0,150,255,0.5))",
        animation: isDiving
          ? "whale-dive 0.9s cubic-bezier(0.4, 0, 1, 1) forwards"
          : "whale-float 3s ease-in-out infinite",
      }}>
        <img
          src={WHALE_URL}
          alt="Whale"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            // mix-blend-mode screen removes black backgrounds naturally
            mixBlendMode: "screen",
            filter: "brightness(1.1) contrast(1.05)",
          }}
        />
        {/* Subtle shimmer on whale */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 55%)",
          pointerEvents: "none",
          animation: "shimmer 3s ease-in-out infinite",
        }} />
      </div>

      {/* Title + tagline */}
      <div style={{
        marginTop: "36px",
        textAlign: "center",
        animation: isDiving ? "text-fade 0.5s ease-in forwards" : "fade-up 0.8s ease-out 0.35s both",
      }}>
        <p style={{
          fontSize: "28px", fontWeight: 800, letterSpacing: "-0.5px",
          background: "linear-gradient(135deg, #5bc8ff 0%, #a78bfa 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          marginBottom: "6px", fontFamily: "Inter, system-ui, sans-serif",
        }}>
          DeepSeek
        </p>
        <p style={{
          fontSize: "11px", color: "rgba(150,210,255,0.55)",
          letterSpacing: "3px", textTransform: "uppercase",
          fontFamily: "Inter, system-ui, sans-serif", fontWeight: 500,
        }}>
          Uncensored AI
        </p>
      </div>

      {/* Loading dots */}
      <div style={{
        display: "flex", gap: "7px", marginTop: "30px",
        animation: isDiving ? "text-fade 0.4s ease-in forwards" : "fade-up 0.8s ease-out 0.55s both",
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: "5px", height: "5px", borderRadius: "50%",
            background: "rgba(90,170,255,0.65)",
            animation: `dot-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>

      <style>{`
        @keyframes whale-float {
          0%   { transform: translateY(0px) rotate(-4deg); }
          25%  { transform: translateY(-12px) rotate(-2deg) scaleX(1.02); }
          50%  { transform: translateY(-6px) rotate(-5deg); }
          75%  { transform: translateY(-15px) rotate(-3deg) scaleX(0.99); }
          100% { transform: translateY(0px) rotate(-4deg); }
        }
        @keyframes whale-dive {
          0%   { transform: translateY(0) rotate(-4deg); opacity: 1; }
          20%  { transform: translateY(-18px) rotate(-18deg); opacity: 1; }
          55%  { transform: translateY(80px) rotate(25deg); opacity: 0.8; }
          100% { transform: translateY(520px) rotate(35deg); opacity: 0; }
        }
        @keyframes shimmer {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 1; }
        }
        @keyframes halo-pulse {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50%       { transform: scale(1.15); opacity: 1; }
        }
        @keyframes halo-fade {
          to { opacity: 0; transform: scale(0.6); }
        }
        @keyframes bubble-rise {
          0%   { transform: translateY(0) scale(1); opacity: 1; }
          80%  { opacity: 0.5; }
          100% { transform: translateY(-105vh) scale(1.4); opacity: 0; }
        }
        @keyframes dive-bubble {
          0%   { transform: translateY(0) scale(1); opacity: 0.9; }
          100% { transform: translateY(-120px) scale(0.4); opacity: 0; }
        }
        @keyframes ray-sway {
          from { opacity: 0.5; transform-origin: top center; }
          to   { opacity: 1; }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes text-fade {
          to { opacity: 0; transform: translateY(-8px); }
        }
        @keyframes dot-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
          30%            { transform: translateY(-7px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
