"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Leaf, ShieldCheck } from "lucide-react";
import {
  BubblyButton,
  FloatingOrb,
  SpringCard,
} from "@/components/ui/MotionPrimitives";
import { useToast } from "@/components/providers/AppProviders";

export default function SetupPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [checking, setChecking] = useState(true);
  const [locked, setLocked] = useState(false);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/setup")
      .then((r) => r.json())
      .then((d) => {
        if (!d.needsSetup) {
          setLocked(true);
        }
      })
      .finally(() => setChecking(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, username, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Setup failed.");
        return;
      }
      toast({
        type: "success",
        title: "Platform Initialized",
        message: "Super Admin account created. Welcome to HospitalPro by Zeronnn Technologies.",
      });
      router.push(data.redirectTo || "/super-admin");
      router.refresh();
    } catch {
      setErrorMsg("Network error during setup.");
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-[#466356]">
        Checking platform initialization state...
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <FloatingOrb className="left-[-80px] top-[-60px] h-96 w-96 bg-emerald-300/30" />
      <FloatingOrb className="right-[-80px] bottom-[-60px] h-96 w-96 bg-teal-200/30" />

      <div className="relative z-10 w-full max-w-lg">
        <div className="mb-5 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-[#cfe2d6] bg-white/80 px-3.5 py-2 text-xs font-semibold text-[#0d4a38]"
          >
            <ArrowLeft className="h-4 w-4" />
            Home
          </Link>
          <div className="flex items-center gap-2">
            <Leaf className="h-4 w-4 text-emerald-700" />
            <div className="leading-tight text-right">
              <span className="block font-display text-sm font-bold">HospitalPro</span>
              <span className="block text-[10px] font-medium text-[#5b796b]">
                by Zeronnn Technologies
              </span>
            </div>
          </div>
        </div>

        <SpringCard className="p-6 sm:p-8">
          {locked ? (
            <div className="text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-[#0d4a38]">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h1 className="font-display text-xl font-bold text-[#0f241d]">
                Platform Already Initialized
              </h1>
              <p className="text-sm text-[#466356]">
                A Super Admin account already exists. This setup wizard is permanently locked for security.
              </p>
              <Link
                href="/login?portal=super-admin"
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#0d4a38] to-[#059669] px-5 py-2.5 text-sm font-semibold text-white"
              >
                Go to Portal Sign In
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0d4a38] to-[#059669] text-white">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="font-display text-xl font-extrabold text-[#0f241d]">
                    Initialize Super Admin
                  </h1>
                  <p className="text-xs text-[#466356]">
                    One-time setup to establish the platform owner account.
                  </p>
                </div>
              </div>

              {errorMsg ? (
                <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
                  {errorMsg}
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Dr. Priya Menon"
                    className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                    Super Admin Username
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. superadmin"
                    className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                    Email (optional)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@yourhospitalnetwork.com"
                    className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#314c40]">
                    Strong Password (min 8 characters)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <BubblyButton type="submit" disabled={submitting} className="w-full py-3">
                  {submitting ? "Creating Super Admin..." : "Create Super Admin & Enter Portal"}
                </BubblyButton>
              </form>
            </>
          )}
        </SpringCard>
      </div>
    </div>
  );
}
