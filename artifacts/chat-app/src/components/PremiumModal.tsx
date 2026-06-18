import { useState } from "react";
import { Crown, Check, X, Copy, CheckCheck, Zap, Infinity, Shield, Sparkles } from "lucide-react";

const WALLETS = [
  {
    id: "erc20",
    label: "ERC20",
    network: "Ethereum / ERC20",
    address: "0xb1584a0e0ea8b01e57d6caa238ac76512ef87fd7",
    color: "#627EEA",
    badge: "ETH",
  },
  {
    id: "trc20",
    label: "TRC20",
    network: "Tron / TRC20",
    address: "TFRDatJUdNQLYiF7BqQKQi8YFKQ1FBuAGn",
    color: "#FF0013",
    badge: "TRX",
  },
  {
    id: "bep20",
    label: "BEP20",
    network: "BNB Smart Chain / BEP20",
    address: "0xb1584a0e0ea8b01e57d6caa238ac76512ef87fd7",
    color: "#F0B90B",
    badge: "BSC",
  },
];

const FEATURES = [
  { icon: Infinity, text: "Unlimited questions — no 20-message cap" },
  { icon: Sparkles, text: "Full access to all AI models (Flash & Pro)" },
  { icon: Zap, text: "Priority response speed" },
  { icon: Shield, text: "Unfiltered, complete AI capabilities" },
];

function CopyAddr({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-all active:scale-95 flex-shrink-0"
      style={{
        background: copied ? "hsl(142 62% 52% / 0.15)" : "hsl(var(--muted))",
        border: `1px solid ${copied ? "hsl(142 62% 52% / 0.35)" : "hsl(var(--border))"}`,
        color: copied ? "hsl(142 62% 45%)" : "hsl(var(--muted-foreground))",
      }}
    >
      {copied ? <CheckCheck size={12} /> : <Copy size={12} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

interface PremiumModalProps {
  onClose: () => void;
  clientId: string;
  onClaimSubmitted: () => void;
  claimStatus?: "idle" | "pending" | "submitted";
}

export default function PremiumModal({ onClose, clientId, onClaimSubmitted, claimStatus = "idle" }: PremiumModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "lifetime">("monthly");
  const [selectedWallet, setSelectedWallet] = useState(0);
  const [txHash, setTxHash] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(claimStatus === "pending");

  const wallet = WALLETS[selectedWallet];

  const handleSubmit = async () => {
    if (!txHash.trim()) { setSubmitError("Enter your transaction hash"); return; }
    setSubmitting(true);
    setSubmitError("");
    try {
      const apiBase = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${apiBase}/api/subscription/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-ID": clientId },
        body: JSON.stringify({ plan: selectedPlan, txHash: txHash.trim(), network: wallet.id }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setSubmitError(d.error ?? "Submission failed");
      } else {
        setSubmitted(true);
        onClaimSubmitted();
      }
    } catch {
      setSubmitError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-lg max-h-[95dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl"
        style={{
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px hsl(252 82% 68% / 0.15)",
        }}
      >
        {/* Header */}
        <div className="relative px-5 pt-6 pb-4" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
          <button
            onClick={onClose}
            className="absolute right-4 top-4 w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90"
            style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}
          >
            <X size={15} />
          </button>
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, hsl(45 90% 50%), hsl(35 95% 55%))", boxShadow: "0 4px 16px hsl(45 90% 50% / 0.4)" }}
            >
              <Crown size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight" style={{ color: "hsl(var(--foreground))" }}>Upgrade to Premium</h2>
              <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>You've used your 20 free questions</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 flex flex-col gap-5">

          {/* Features */}
          <div className="grid grid-cols-2 gap-2">
            {FEATURES.map(({ icon: Icon, text }) => (
              <div
                key={text}
                className="flex items-start gap-2 p-3 rounded-2xl"
                style={{ background: "hsl(252 82% 68% / 0.06)", border: "1px solid hsl(252 82% 68% / 0.12)" }}
              >
                <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: "hsl(252 82% 68% / 0.15)" }}>
                  <Icon size={12} style={{ color: "hsl(var(--primary))" }} />
                </div>
                <p className="text-[11px] leading-tight font-medium" style={{ color: "hsl(var(--foreground))" }}>{text}</p>
              </div>
            ))}
          </div>

          {/* Plan selector */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2.5" style={{ color: "hsl(var(--muted-foreground))" }}>Choose your plan</p>
            <div className="grid grid-cols-2 gap-3">
              {(["monthly", "lifetime"] as const).map(plan => {
                const active = selectedPlan === plan;
                return (
                  <button
                    key={plan}
                    onClick={() => setSelectedPlan(plan)}
                    className="relative p-4 rounded-2xl text-left transition-all active:scale-95"
                    style={{
                      background: active ? "linear-gradient(135deg, hsl(252 82% 68% / 0.15), hsl(198 80% 56% / 0.08))" : "hsl(var(--muted))",
                      border: `2px solid ${active ? "hsl(252 82% 68%)" : "hsl(var(--border))"}`,
                      boxShadow: active ? "0 4px 20px hsl(252 82% 68% / 0.2)" : "none",
                    }}
                  >
                    {plan === "lifetime" && (
                      <span
                        className="absolute -top-2 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: "linear-gradient(135deg, hsl(45 90% 50%), hsl(35 95% 55%))", color: "white" }}
                      >
                        BEST VALUE
                      </span>
                    )}
                    <p className="text-xs font-medium mb-1 capitalize" style={{ color: "hsl(var(--muted-foreground))" }}>{plan}</p>
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-2xl font-bold" style={{ color: active ? "hsl(var(--primary))" : "hsl(var(--foreground))" }}>
                        ${plan === "monthly" ? "29" : "199"}
                      </span>
                      <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {plan === "monthly" ? "/mo" : " once"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Wallet + QR */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2.5" style={{ color: "hsl(var(--muted-foreground))" }}>Send USDT to</p>

            {/* Network tabs */}
            <div className="flex gap-1.5 mb-3">
              {WALLETS.map((w, i) => (
                <button
                  key={w.id}
                  onClick={() => setSelectedWallet(i)}
                  className="flex-1 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95"
                  style={{
                    background: selectedWallet === i ? w.color + "22" : "hsl(var(--muted))",
                    border: `1px solid ${selectedWallet === i ? w.color + "66" : "hsl(var(--border))"}`,
                    color: selectedWallet === i ? w.color : "hsl(var(--muted-foreground))",
                  }}
                >
                  {w.label}
                </button>
              ))}
            </div>

            {/* Wallet card */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{ border: "1px solid hsl(var(--border))", background: "hsl(var(--background))" }}
            >
              <div className="flex gap-3 p-4 items-start">
                {/* QR */}
                <div
                  className="flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden flex items-center justify-center"
                  style={{ background: "white", padding: "6px" }}
                >
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(wallet.address)}&margin=2`}
                    alt={`QR code for ${wallet.network}`}
                    className="w-full h-full"
                    style={{ imageRendering: "pixelated" }}
                  />
                </div>
                {/* Address info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: wallet.color + "22", color: wallet.color }}
                    >
                      {wallet.badge}
                    </span>
                    <span className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>{wallet.network}</span>
                  </div>
                  <p
                    className="text-[11px] font-mono leading-relaxed break-all mb-2"
                    style={{ color: "hsl(var(--foreground))" }}
                  >
                    {wallet.address}
                  </p>
                  <CopyAddr address={wallet.address} />
                </div>
              </div>
              <div className="px-4 pb-3">
                <div
                  className="text-[11px] px-3 py-2 rounded-xl flex items-center gap-2"
                  style={{ background: "hsl(45 90% 50% / 0.08)", border: "1px solid hsl(45 90% 50% / 0.2)", color: "hsl(45 90% 45%)" }}
                >
                  ⚠️ Send <strong>USDT only</strong> on the {wallet.label} network. Wrong network = lost funds.
                </div>
              </div>
            </div>
          </div>

          {/* Submit TX hash */}
          {!submitted ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2.5" style={{ color: "hsl(var(--muted-foreground))" }}>After paying — submit your TX hash</p>
              <div className="flex flex-col gap-2">
                <div
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                  style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}
                >
                  <input
                    value={txHash}
                    onChange={e => setTxHash(e.target.value)}
                    placeholder="Paste transaction hash (0x... or TXID)"
                    className="flex-1 bg-transparent text-xs outline-none"
                    style={{ color: "hsl(var(--foreground))", fontFamily: "monospace" }}
                  />
                </div>
                {submitError && (
                  <p className="text-[11px] px-1" style={{ color: "hsl(var(--destructive))" }}>{submitError}</p>
                )}
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full py-3 rounded-xl text-sm font-semibold transition-all active:scale-95"
                  style={{
                    background: submitting ? "hsl(var(--muted))" : "linear-gradient(135deg, hsl(252 82% 68%), hsl(252 75% 60%))",
                    color: submitting ? "hsl(var(--muted-foreground))" : "white",
                    boxShadow: submitting ? "none" : "0 4px 20px hsl(252 82% 68% / 0.4)",
                  }}
                >
                  {submitting ? "Submitting…" : `Submit Payment Claim — ${selectedPlan === "monthly" ? "$29/mo" : "$199 Lifetime"}`}
                </button>
              </div>
            </div>
          ) : (
            <div
              className="flex flex-col items-center gap-3 py-5 px-4 rounded-2xl"
              style={{ background: "hsl(142 62% 52% / 0.08)", border: "1px solid hsl(142 62% 52% / 0.25)" }}
            >
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "hsl(142 62% 52% / 0.15)" }}>
                <Check size={22} style={{ color: "hsl(142 62% 45%)" }} />
              </div>
              <div className="text-center">
                <p className="font-bold text-sm mb-1" style={{ color: "hsl(142 62% 40%)" }}>Payment claim submitted!</p>
                <p className="text-xs leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Your payment is being reviewed. You'll receive access within minutes once approved. Check back soon.
                </p>
              </div>
            </div>
          )}

          {/* Steps */}
          <div className="flex items-center gap-2 text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
            {["Choose plan", "Send USDT", "Submit TX hash", "Get approved"].map((step, i) => (
              <div key={step} className="flex items-center gap-1.5 flex-1 min-w-0">
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                  style={{ background: "hsl(var(--primary) / 0.15)", color: "hsl(var(--primary))" }}
                >
                  {i + 1}
                </span>
                <span className="truncate">{step}</span>
                {i < 3 && <span className="flex-shrink-0 opacity-30">›</span>}
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
