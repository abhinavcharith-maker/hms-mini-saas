"use client";

import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  BubblyButton,
  SkeletonBox,
  SpringCard,
} from "@/components/ui/MotionPrimitives";
import { useToast } from "@/components/providers/AppProviders";
import { formatAccurateDateTime } from "@/lib/datetime";

interface AiConfigView {
  configured: boolean;
  maskedKey: string | null;
  model: string;
  source: "DATABASE" | "ENV" | "NONE";
  updatedAt: string | null;
  updatedByUsername: string | null;
}

export function GeminiApiKeyCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [config, setConfig] = useState<AiConfigView | null>(null);

  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [modelInput, setModelInput] = useState("gemini-3.8-flash");

  useEffect(() => {
    let active = true;
    fetch("/api/super-admin/ai-settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((d: AiConfigView | null) => {
        if (!active || !d) return;
        setConfig(d);
        setModelInput(d.model || "gemini-3.8-flash");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyInput.trim() && !config?.configured) {
      toast({
        type: "warning",
        title: "Paste API Key",
        message: "Enter your Gemini 3.8 Flash API key before saving.",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/super-admin/ai-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(apiKeyInput.trim() ? { apiKey: apiKeyInput.trim() } : {}),
          model: modelInput.trim() || "gemini-3.8-flash",
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({
          type: "error",
          title: "Save Failed",
          message: d.error || "Unable to save Gemini API settings.",
        });
        return;
      }

      setConfig(d);
      setApiKeyInput("");
      setShowKey(false);
      toast({
        type: "success",
        title: "Gemini API Key Saved",
        message: `Encrypted and active platform-wide using ${d.model}.`,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      const res = await fetch("/api/super-admin/ai-settings", {
        method: "DELETE",
      });
      const d = await res.json();
      if (!res.ok) {
        toast({ type: "error", title: "Remove Failed", message: d.error });
        return;
      }
      setConfig(d);
      setApiKeyInput("");
      toast({
        type: "info",
        title: "API Key Removed",
        message: "Stored Gemini API key has been cleared.",
      });
    } finally {
      setClearing(false);
    }
  };

  if (loading) {
    return <SkeletonBox className="h-56" />;
  }

  return (
    <SpringCard className="p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e2f0e8] pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0d4a38] to-[#059669] text-white shadow-md shadow-emerald-900/15">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-extrabold text-[#0f241d]">
              Platform Gemini AI Configuration
            </h2>
            <p className="text-xs text-[#466356]">
              Save once here to power AI features (such as Pharmacy Purchase Bill Scanning) across all hospitals.
            </p>
          </div>
        </div>

        {config?.configured ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 w-fit">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            Active · Encrypted
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 w-fit">
            Not Configured
          </span>
        )}
      </div>

      {config?.configured ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#cfe2d6] bg-[#f4faf6] px-4 py-3 text-xs">
          <div className="space-y-0.5">
            <p className="font-semibold text-[#0f241d]">
              Stored Key:{" "}
              <span className="font-mono-id font-bold text-[#0d4a38]">
                {config.maskedKey}
              </span>
            </p>
            <p className="text-[11px] text-[#5b796b]">
              Active Model: <strong className="font-mono-id">{config.model}</strong>
              {config.updatedAt
                ? ` · Last updated ${formatAccurateDateTime(config.updatedAt)}${
                    config.updatedByUsername ? ` by @${config.updatedByUsername}` : ""
                  }`
                : ""}
            </p>
          </div>

          {config.source === "DATABASE" ? (
            <BubblyButton
              type="button"
              variant="outline"
              disabled={clearing}
              onClick={handleClear}
              className="px-3 py-1.5 text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {clearing ? "Removing..." : "Remove Key"}
            </BubblyButton>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
              <KeyRound className="h-3.5 w-3.5 text-emerald-700" />
              {config?.configured
                ? "Replace Gemini API Key (leave blank to keep current key)"
                : "Gemini API Key *"}
            </label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={
                  config?.configured
                    ? "Paste new key to replace stored key"
                    : "Paste your Gemini 3.8 Flash API key"
                }
                className="w-full rounded-xl border border-[#cfe2d6] bg-white py-2.5 pl-3.5 pr-10 text-sm font-mono-id text-[#0f241d] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200/70"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                aria-label={showKey ? "Hide API key" : "Show API key"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[#5b796b] hover:bg-emerald-50 hover:text-[#0d4a38] cursor-pointer"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#0f241d]">
              <Sparkles className="h-3.5 w-3.5 text-emerald-700" />
              Gemini Model ID
            </label>
            <input
              required
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm font-mono-id font-semibold text-[#0f241d] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200/70"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <p className="inline-flex items-center gap-1.5 text-[11px] text-[#5b796b]">
            <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0" />
            Encrypted with AES-256-GCM on the server. Hospital admins, receptionists, and pharmacies can never view this key.
          </p>

          <BubblyButton type="submit" disabled={saving} className="px-5 py-2.5 shrink-0">
            <KeyRound className="h-4 w-4" />
            {saving ? "Saving..." : "Save API Configuration"}
          </BubblyButton>
        </div>
      </form>
    </SpringCard>
  );
}
