import { useState } from "react";
import {
  Crown, Check, X, Copy, CheckCheck, Zap, Infinity, Shield,
  Sparkles, Clock, ChevronRight, ChevronLeft, Wallet, Send,
} from "lucide-react";

// ── Data ──────────────────────────────────────────────────────────────────────

const WALLETS = [
  {
    id: "erc20",
    label: "ERC20",
    network: "Ethereum / ERC20",
    address: "0xb1584a0e0ea8b01e57d6caa238ac76512ef87fd7",
    color: "#627EEA",
    badge: "ETH",
    hint: "Ethereum, Polygon, Arbitrum, Optimism…",
  },
  {
    id: "trc20",
    label: "TRC20",
    network: "Tron / TRC20",
    address: "TFRDatJUdNQLYiF7BqQKQi8YFKQ1FBuAGn",
    color: "#FF0013",
    badge: "TRX",
    hint: "Tron network — lowest fees",
  },
  {
    id: "bep20",
    label: "BEP20",
    network: "BNB Smart Chain / BEP20",
    address: "0xb1584a0e0ea8b01e57d6caa238ac76512ef87fd7",
    color: "#F0B90B",
    badge: "BSC",
    hint: "Binance Smart Chain",
  },
];

const FEATURES = [
  { icon: Infinity, text: "Unlimited messages", sub: "No daily cap, ever" },
  { icon: Sparkles, text: "All AI models", sub: "Flash, Pro & Vision" },
  { icon: Zap, text: "Priority speed", sub: "Faster responses" },
  { icon: Shield, text: "Fully unfiltered", sub: "No content restrictions" },
];

const PLAN_PRICES: Record<"monthly" | "lifetime", number> = { monthly: 29, lifetime: 199 };

// ── Helpers ───────────────────────────────────────────────────────────────────

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
      style={{
        background: copied ? "hsl(142 62% 52% / 0.15)" : "hsl(var(--primary) / 0.1)",
        border: `1px solid ${copied ? "hsl(142 62% 52% / 0.35)" : "hsl(var(--primary) / 0.25)"}`,
        color: copied ? "hsl(142 62% 45%)" : "hsl(var(--primary))",
      }}
    >
      {copied ? <CheckCheck size={12} /> : <Copy size={12} />}
      {copied ? "Copied!" : label}
    </button>
  );
}

// ── Step progress bar ─────────────────────────────────────────────────────────

const STEP_LABELS = ["Plan", "Payment", "Confirm", "Done"];

function StepBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 px-1">
      {STEP_LABELS.slice(0, total).map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={label} className="flex items-center gap-1.5 flex-1 min-w-0">
            <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300"
                style={{
                  background: done
                    ? "hsl(142 62% 45%)"
                    : active
                      ? "hsl(var(--primary))"
                      : "hsl(var(--muted))",
                  color: done || active ? "white" : "hsl(var(--muted-foreground))",
                  boxShadow: active ? "0 0 0 3px hsl(var(--primary) / 0.2)" : "none",
                }}
              >
                {done ? <Check size={11} strokeWidth={3} /> : i + 1}
              </div>
              <span
                className="text-[9px] font-semibold uppercase tracking-wide leading-none"
                style={{ color: active ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}
              >
                {label}
              </span>
            </div>
            {i < total - 1 && (
              <div
                className="flex-1 h-0.5 rounded-full mb-3 transition-all duration-500"
                style={{ background: done ? "hsl(142 62% 45%)" : "hsl(var(--border))" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Plan picker ───────────────────────────────────────────────────────

function StepPlan({
  selected,
  onSelect,
  onNext,
  triggeredByLimit,
}: {
  selected: "monthly" | "lifetime";
  onSelect: (p: "monthly" | "lifetime") => void;
  onNext: () => void;
  triggeredByLimit: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      {/* Feature grid */}
      <div className="grid grid-cols-2 gap-2">
        {FEATURES.map(({ icon: Icon, text, sub }) => (
          <div
            key={text}
            className="flex items-center gap-2.5 p-3 rounded-xl"
            style={{ background: "hsl(252 82% 68% / 0.06)", border: "1px solid hsl(252 82% 68% / 0.12)" }}
          >
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "hsl(252 82% 68% / 0.15)" }}
            >
              <Icon size={13} style={{ color: "hsl(var(--primary))" }} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold leading-tight" style={{ color: "hsl(var(--foreground))" }}>{text}</p>
              <p className="text-[10px] leading-tight mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-2 gap-3">
        {(["monthly", "lifetime"] as const).map(plan => {
          const active = selected === plan;
          return (
            <button
              key={plan}
              onClick={() => onSelect(plan)}
              className="relative p-4 rounded-2xl text-left transition-all active:scale-[0.97]"
              style={{
                background: active
                  ? "linear-gradient(135deg, hsl(252 82% 68% / 0.15), hsl(198 80% 56% / 0.08))"
                  : "hsl(var(--muted))",
                border: `2px solid ${active ? "hsl(252 82% 68%)" : "hsl(var(--border))"}`,
                boxShadow: active ? "0 4px 24px hsl(252 82% 68% / 0.22)" : "none",
              }}
            >
              {plan === "lifetime" && (
                <span
                  className="absolute -top-2.5 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: "linear-gradient(135deg, hsl(45 90% 50%), hsl(35 95% 55%))", color: "white" }}
                >
                  BEST VALUE
                </span>
              )}
              {active && (
                <div
                  className="absolute top-3 right-3 w-4 h-4 rounded-full flex items-center justify-center"
                  style={{ background: "hsl(var(--primary))" }}
                >
                  <Check size={9} strokeWidth={3} className="text-white" />
                </div>
              )}
              <p
                className="text-[11px] font-bold uppercase tracking-wider mb-2"
                style={{ color: active ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}
              >
                {plan === "monthly" ? "Monthly" : "Lifetime"}
              </p>
              <div className="flex items-baseline gap-0.5">
                <span className="text-3xl font-extrabold tracking-tight" style={{ color: "hsl(var(--foreground))" }}>
                  ${PLAN_PRICES[plan]}
                </span>
                <span className="text-xs mb-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {plan === "monthly" ? " /mo" : ""}
                </span>
              </div>
              <p
                className="text-[10px] mt-1.5 leading-snug"
                style={{ color: plan === "lifetime" ? "hsl(142 62% 45%)" : "hsl(var(--muted-foreground))" }}
              >
                {plan === "monthly" ? "Cancel anytime" : "Pay once, yours forever"}
              </p>
            </button>
          );
        })}
      </div>

      {triggeredByLimit && (
        <p className="text-center text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
          Free tier: 20 messages/day · Premium is unlimited
        </p>
      )}

      <button
        onClick={onNext}
        className="w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
        style={{
          background: "linear-gradient(135deg, hsl(252 82% 68%), hsl(252 75% 60%))",
          color: "white",
          boxShadow: "0 4px 20px hsl(252 82% 68% / 0.45)",
        }}
      >
        Continue — ${PLAN_PRICES[selected]} {selected === "monthly" ? "/ month" : "lifetime"}
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

// ── Step 2: Payment (network + wallet + QR) ───────────────────────────────────

function StepPayment({
  plan,
  selectedWallet,
  onSelectWallet,
  onBack,
  onNext,
}: {
  plan: "monthly" | "lifetime";
  selectedWallet: number;
  onSelectWallet: (i: number) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const wallet = WALLETS[selectedWallet];
  const amount = PLAN_PRICES[plan];

  return (
    <div className="flex flex-col gap-4">
      {/* Amount banner */}
      <div
        className="flex items-center justify-between px-4 py-3 rounded-xl"
        style={{ background: "hsl(252 82% 68% / 0.08)", border: "1px solid hsl(252 82% 68% / 0.2)" }}
      >
        <div>
          <p className="text-[11px] font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>
            {plan === "monthly" ? "Monthly Plan" : "Lifetime Plan"}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "hsl(var(--foreground))" }}>Send exactly this amount</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold" style={{ color: "hsl(var(--primary))" }}>${amount}</p>
          <p className="text-[10px] font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>USDT</p>
        </div>
      </div>

      {/* Network selector */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "hsl(var(--muted-foreground))" }}>
          Choose Network
        </p>
        <div className="flex gap-2">
          {WALLETS.map((w, i) => (
            <button
              key={w.id}
              onClick={() => onSelectWallet(i)}
              className="flex-1 py-2.5 px-2 rounded-xl text-xs font-bold transition-all active:scale-95 flex flex-col items-center gap-0.5"
              style={{
                background: selectedWallet === i ? w.color + "18" : "hsl(var(--muted))",
                border: `2px solid ${selectedWallet === i ? w.color + "90" : "hsl(var(--border))"}`,
                color: selectedWallet === i ? w.color : "hsl(var(--muted-foreground))",
              }}
            >
              <span className="text-[13px] font-extrabold">{w.badge}</span>
              <span className="text-[9px] font-semibold opacity-80">{w.label}</span>
            </button>
          ))}
        </div>
        <p className="text-[10px] mt-1.5 px-1" style={{ color: "hsl(var(--muted-foreground))" }}>
          {wallet.hint}
        </p>
      </div>

      {/* Wallet card */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }}
      >
        <div className="flex gap-4 p-4 items-start">
          {/* QR code */}
          <div
            className="flex-shrink-0 w-[88px] h-[88px] rounded-xl overflow-hidden flex items-center justify-center"
            style={{ background: "white", padding: "5px" }}
          >
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(wallet.address)}&margin=2`}
              alt={`QR ${wallet.network}`}
              className="w-full h-full"
              style={{ imageRendering: "pixelated" }}
            />
          </div>

          {/* Address */}
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: wallet.color + "22", color: wallet.color }}
              >
                {wallet.badge}
              </span>
              <span className="text-[11px] font-medium truncate" style={{ color: "hsl(var(--muted-foreground))" }}>
                {wallet.network}
              </span>
            </div>
            <p
              className="text-[11px] font-mono leading-relaxed break-all"
              style={{ color: "hsl(var(--foreground))" }}
            >
              {wallet.address}
            </p>
            <CopyButton text={wallet.address} label="Copy Address" />
          </div>
        </div>

        {/* Warning */}
        <div
          className="mx-4 mb-4 text-[11px] px-3 py-2.5 rounded-xl flex items-start gap-2"
          style={{ background: "hsl(38 92% 50% / 0.08)", border: "1px solid hsl(38 92% 50% / 0.25)", color: "hsl(38 82% 38%)" }}
        >
          <span className="flex-shrink-0 mt-px">⚠️</span>
          <span>Send <strong>USDT only</strong> on the <strong>{wallet.label}</strong> network. Sending any other token or using the wrong network will result in permanent loss of funds.</span>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-2.5 pt-1">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95"
          style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }}
        >
          <ChevronLeft size={15} />
          Back
        </button>
        <button
          onClick={onNext}
          className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg, hsl(252 82% 68%), hsl(252 75% 60%))",
            color: "white",
            boxShadow: "0 4px 16px hsl(252 82% 68% / 0.4)",
          }}
        >
          I've sent the payment
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

// ── Step 3: Submit TX hash ────────────────────────────────────────────────────

function StepConfirm({
  plan,
  walletIndex,
  txHash,
  onTxHash,
  onBack,
  onSubmit,
  submitting,
  submitError,
}: {
  plan: "monthly" | "lifetime";
  walletIndex: number;
  txHash: string;
  onTxHash: (v: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  submitError: string;
}) {
  const wallet = WALLETS[walletIndex];

  return (
    <div className="flex flex-col gap-4">
      {/* Summary card */}
      <div
        className="rounded-xl px-4 py-3 flex flex-col gap-2"
        style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}
      >
        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>
          Payment Summary
        </p>
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Plan</span>
          <span className="text-xs font-semibold capitalize" style={{ color: "hsl(var(--foreground))" }}>
            {plan === "monthly" ? "Monthly ($29/mo)" : "Lifetime ($199)"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Network</span>
          <span
            className="text-xs font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: wallet.color + "22", color: wallet.color }}
          >
            {wallet.label} ({wallet.badge})
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Amount</span>
          <span className="text-sm font-extrabold" style={{ color: "hsl(var(--primary))" }}>
            ${PLAN_PRICES[plan]} USDT
          </span>
        </div>
      </div>

      {/* TX hash input */}
      <div className="flex flex-col gap-2">
        <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>
          Transaction Hash
        </label>
        <p className="text-xs leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
          After sending, find the transaction ID (TXID or TX Hash) in your wallet or exchange and paste it below.
        </p>
        <div
          className="flex items-center gap-2 rounded-xl px-3.5 py-3 transition-all"
          style={{ background: "hsl(var(--muted))", border: "1.5px solid hsl(var(--border))" }}
          onFocusCapture={e => { e.currentTarget.style.borderColor = "hsl(252 82% 68% / 0.5)"; }}
          onBlurCapture={e => { e.currentTarget.style.borderColor = "hsl(var(--border))"; }}
        >
          <Wallet size={13} style={{ color: "hsl(var(--muted-foreground))", flexShrink: 0 }} />
          <input
            value={txHash}
            onChange={e => onTxHash(e.target.value)}
            placeholder="0x... or TXID"
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: "hsl(var(--foreground))", fontFamily: "monospace" }}
          />
          {txHash && (
            <button onClick={() => onTxHash("")} style={{ color: "hsl(var(--muted-foreground))", flexShrink: 0 }}>
              <X size={13} />
            </button>
          )}
        </div>

        {submitError && (
          <p className="text-[11px] px-1 flex items-center gap-1" style={{ color: "hsl(var(--destructive))" }}>
            ⚠️ {submitError}
          </p>
        )}
      </div>

      {/* Review note */}
      <div
        className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs"
        style={{ background: "hsl(252 82% 68% / 0.06)", border: "1px solid hsl(252 82% 68% / 0.15)" }}
      >
        <Clock size={13} style={{ color: "hsl(var(--primary))", flexShrink: 0 }} />
        <span style={{ color: "hsl(var(--muted-foreground))" }}>
          Reviewed manually — access typically granted within <strong style={{ color: "hsl(var(--foreground))" }}>10–30 minutes</strong>
        </span>
      </div>

      {/* Navigation */}
      <div className="flex gap-2.5">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95"
          style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }}
        >
          <ChevronLeft size={15} />
          Back
        </button>
        <button
          onClick={onSubmit}
          disabled={submitting || !txHash.trim()}
          className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          style={{
            background: submitting || !txHash.trim()
              ? "hsl(var(--muted))"
              : "linear-gradient(135deg, hsl(252 82% 68%), hsl(252 75% 60%))",
            color: submitting || !txHash.trim() ? "hsl(var(--muted-foreground))" : "white",
            boxShadow: submitting || !txHash.trim() ? "none" : "0 4px 16px hsl(252 82% 68% / 0.4)",
          }}
        >
          {submitting ? (
            "Submitting…"
          ) : (
            <>
              Submit Claim
              <Send size={14} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Step 4: Success ───────────────────────────────────────────────────────────

function StepSuccess({ plan, onClose }: { plan: "monthly" | "lifetime"; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      {/* Icon */}
      <div className="relative">
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, hsl(142 62% 52% / 0.2), hsl(142 62% 52% / 0.08))",
            border: "1.5px solid hsl(142 62% 52% / 0.35)",
          }}
        >
          <Check size={36} style={{ color: "hsl(142 62% 42%)" }} strokeWidth={2.5} />
        </div>
        <div
          className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, hsl(45 90% 50%), hsl(35 95% 55%))" }}
        >
          <Crown size={13} className="text-white" />
        </div>
      </div>

      {/* Text */}
      <div className="flex flex-col gap-2">
        <h3 className="text-xl font-extrabold tracking-tight" style={{ color: "hsl(var(--foreground))" }}>
          Payment submitted!
        </h3>
        <p className="text-sm leading-relaxed px-2" style={{ color: "hsl(var(--muted-foreground))" }}>
          Your{" "}
          <span style={{ color: "hsl(var(--foreground))", fontWeight: 600 }}>
            {plan === "monthly" ? "Monthly" : "Lifetime"}
          </span>{" "}
          claim is being reviewed. Access will activate once your transaction is confirmed.
        </p>
      </div>

      {/* Timeline */}
      <div
        className="w-full flex flex-col gap-2.5 rounded-xl p-3.5"
        style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}
      >
        {[
          { icon: "✅", label: "Payment claimed", done: true },
          { icon: "🔍", label: "Transaction review (10–30 min)", done: false },
          { icon: "🚀", label: "Full access activated", done: false },
        ].map(({ icon, label, done }) => (
          <div key={label} className="flex items-center gap-2.5">
            <span className="text-base leading-none">{icon}</span>
            <span
              className="text-xs font-medium"
              style={{ color: done ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}
            >
              {label}
            </span>
            {done && (
              <Check size={12} style={{ color: "hsl(142 62% 45%)", marginLeft: "auto" }} strokeWidth={2.5} />
            )}
          </div>
        ))}
      </div>

      <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
        Re-open this app after 30 minutes to check your status
      </p>

      <button
        onClick={onClose}
        className="w-full py-3.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
        style={{
          background: "linear-gradient(135deg, hsl(252 82% 68%), hsl(252 75% 60%))",
          color: "white",
          boxShadow: "0 4px 16px hsl(252 82% 68% / 0.35)",
        }}
      >
        Got it — close
      </button>
    </div>
  );
}

// ── Modal shell ───────────────────────────────────────────────────────────────

interface PremiumModalProps {
  onClose: () => void;
  clientId: string;
  onClaimSubmitted: () => void;
  claimStatus?: "idle" | "pending" | "submitted";
  triggeredByLimit?: boolean;
}

export default function PremiumModal({
  onClose,
  clientId,
  onClaimSubmitted,
  claimStatus = "idle",
  triggeredByLimit = false,
}: PremiumModalProps) {
  const alreadySubmitted = claimStatus === "pending";

  const [step, setStep] = useState(alreadySubmitted ? 3 : 0);
  const [plan, setPlan] = useState<"monthly" | "lifetime">("monthly");
  const [walletIdx, setWalletIdx] = useState(0);
  const [txHash, setTxHash] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const STEP_TITLES = ["Choose your plan", "Send payment", "Submit transaction", "You're all set"];

  const handleSubmit = async () => {
    if (!txHash.trim()) { setSubmitError("Paste your transaction hash first"); return; }
    setSubmitting(true);
    setSubmitError("");
    try {
      const apiBase = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${apiBase}/api/subscription/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-ID": clientId },
        body: JSON.stringify({ plan, txHash: txHash.trim(), network: WALLETS[walletIdx].id }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setSubmitError(d.error ?? "Submission failed. Try again.");
      } else {
        onClaimSubmitted();
        setStep(3);
      }
    } catch {
      setSubmitError("Network error. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(12px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl flex flex-col"
        style={{
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          boxShadow: "0 28px 90px rgba(0,0,0,0.75), 0 0 0 1px hsl(252 82% 68% / 0.18)",
          maxHeight: "94dvh",
        }}
      >
        {/* ── Modal header ── */}
        <div
          className="flex-shrink-0 px-5 pt-5 pb-4"
          style={{ borderBottom: "1px solid hsl(var(--border))" }}
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: "linear-gradient(135deg, hsl(45 90% 50%), hsl(35 95% 55%))",
                  boxShadow: "0 3px 12px hsl(45 90% 50% / 0.4)",
                }}
              >
                <Crown size={18} className="text-white" />
              </div>
              <div>
                <h2 className="text-base font-extrabold tracking-tight" style={{ color: "hsl(var(--foreground))" }}>
                  {step === 3 ? "Payment Submitted" : "Upgrade to Premium"}
                </h2>
                <p className="text-[11px] mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {step === 3 ? "Your claim is under review" : STEP_TITLES[step]}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90 flex-shrink-0"
              style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}
            >
              <X size={15} />
            </button>
          </div>

          {/* Step bar — hide on success screen */}
          {step < 3 && <StepBar step={step} total={3} />}
        </div>

        {/* ── Step content ── */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {step === 0 && (
            <StepPlan
              selected={plan}
              onSelect={setPlan}
              onNext={() => setStep(1)}
              triggeredByLimit={triggeredByLimit}
            />
          )}
          {step === 1 && (
            <StepPayment
              plan={plan}
              selectedWallet={walletIdx}
              onSelectWallet={setWalletIdx}
              onBack={() => setStep(0)}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <StepConfirm
              plan={plan}
              walletIndex={walletIdx}
              txHash={txHash}
              onTxHash={setTxHash}
              onBack={() => setStep(1)}
              onSubmit={handleSubmit}
              submitting={submitting}
              submitError={submitError}
            />
          )}
          {step === 3 && (
            <StepSuccess plan={plan} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}
