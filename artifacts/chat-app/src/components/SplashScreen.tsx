import { useEffect, useState, useRef } from "react";

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
    delay: Math.random() * 1.2,
    opacity: 0.15 + Math.random() * 0.55,
  }));
}

interface Props {
  onDone: () => void;
}

export default function SplashScreen({ onDone }: Props) {
  const [phase, setPhase] = useState<"in" | "hold" | "dive" | "out">("in");
  const [bubbles] = useState(() => makeBubbles(18));
  const calledRef = useRef(false);

  useEffect(() => {
    // FIX: Skip splash for returning users — instant load after first visit.
    let hasVisited = false;
    try {
      hasVisited = !!localStorage.getItem("hasVisited");
      if (!hasVisited) localStorage.setItem("hasVisited", "1");
    } catch {
      // localStorage unavailable — treat as first visit
    }

    if (hasVisited) {
      // Returning user: skip entirely, no delay
      if (!calledRef.current) {
        calledRef.current = true;
        onDone();
      }
      return;
    }

    // First visit: show a trimmed 1.5s splash (down from 3.6s)
    const t1 = setTimeout(() => setPhase("hold"), 300);
    const t2 = setTimeout(() => setPhase("dive"), 900);
    const t3 = setTimeout(() => setPhase("out"), 1200);
    const t4 = setTimeout(() => {
      if (!calledRef.current) {
        calledRef.current = true;
        onDone();
      }
    }, 1500);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [onDone]);

  if (phase === "out" && calledRef.current) return null;

  const isVisible = phase !== "out";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "hsl(230 18% 6%)",
        overflow: "hidden",
        opacity: phase === "out" ? 0 : 1,
        transform: phase === "dive" || phase === "out" ? "scale(1.04)" : "scale(1)",
        transition: "opacity 0.3s ease, transform 0.3s ease",
        pointerEvents: isVisible ? "auto" : "none",
      }}
    >
      {/* Bubbles */}
      {bubbles.map(b => (
        <div
          key={b.id}
          style={{
            position: "absolute",
            bottom: "-20px",
            left: b.left,
            width: `${b.size}px`,
            height: `${b.size}px`,
            borderRadius: "50%",
            background: `hsla(252, 82%, 68%, ${b.opacity})`,
            animation: `bubble-rise ${b.duration}s ${b.delay}s infinite ease-in`,
          }}
        />
      ))}

      {/* Logo / image */}
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: 28,
          overflow: "hidden",
          boxShadow: "0 8px 40px hsla(252,82%,68%,0.35)",
          transform: phase === "in" ? "scale(0.88) translateY(12px)" : "scale(1) translateY(0)",
          opacity: phase === "in" ? 0 : 1,
          transition: "transform 0.4s cubic-bezier(.34,1.56,.64,1), opacity 0.4s ease",
          marginBottom: 20,
        }}
      >
        <img src={WHALE_URL} alt="DeepSeek" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>

      {/* Title */}
      <p
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "hsl(220 18% 93%)",
          letterSpacing: "-0.3px",
          opacity: phase === "in" ? 0 : 1,
          transform: phase === "in" ? "translateY(8px)" : "translateY(0)",
          transition: "opacity 0.4s 0.1s ease, transform 0.4s 0.1s ease",
          margin: 0,
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        DeepSeek
      </p>
      <p
        style={{
          fontSize: 13,
          color: "hsl(220 10% 48%)",
          marginTop: 6,
          opacity: phase === "in" ? 0 : 1,
          transition: "opacity 0.4s 0.18s ease",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        AI that actually answers
      </p>

      <style>{`
        @keyframes bubble-rise {
          0%   { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-100vh) scale(0.4); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
