"use client";

import React, { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { BubblyButton, SpringCard } from "@/components/ui/MotionPrimitives";
import { useToast } from "@/components/providers/AppProviders";
import { getRoleLabel } from "@/lib/constants";

export function ChangePasswordCard({
  user,
  extraInfo,
}: {
  user: {
    username: string;
    fullName: string;
    role: string;
    passwordChangedAt?: string | Date | null;
  };
  extraInfo?: Array<{ label: string; value: string }>;
}) {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          type: "error",
          title: "Password update failed",
          message: data.error ?? "Unable to update password",
        });
        return;
      }
      toast({
        type: "success",
        title: "Password updated",
        message: data.message,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast({
        type: "error",
        title: "Network error",
        message: "Could not reach server.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SpringCard className="p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-[#0d4a38]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-display text-base font-bold text-[#0f241d]">
              Assigned Account Information
            </h3>
            <p className="text-xs text-[#466356]">
              Usernames and portal permissions are managed by your administrator.
            </p>
          </div>
        </div>

        <dl className="space-y-3 rounded-2xl border border-[#dcece2] bg-[#f7fbf8] p-4 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-[#5b796b]">Full Name</dt>
            <dd className="font-semibold text-[#0f241d]">{user.fullName}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-[#5b796b]">Assigned Username</dt>
            <dd className="font-mono-id rounded-lg bg-white px-2.5 py-0.5 text-xs font-semibold text-[#0d4a38] border border-[#cfe2d6]">
              @{user.username}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-[#5b796b]">Portal Role</dt>
            <dd className="font-semibold text-[#0f241d]">
              {getRoleLabel(user.role)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-[#5b796b]">Last Password Change</dt>
            <dd className="text-xs text-[#466356]">
              {user.passwordChangedAt
                ? new Date(user.passwordChangedAt).toLocaleString()
                : "Initial credentials"}
            </dd>
          </div>
          {extraInfo?.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4">
              <dt className="text-[#5b796b]">{row.label}</dt>
              <dd className="font-medium text-[#0f241d] text-right">{row.value}</dd>
            </div>
          ))}
        </dl>
      </SpringCard>

      <SpringCard delay={0.05} className="p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#dff2e7] text-[#0d4a38]">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-display text-base font-bold text-[#0f241d]">
              Change Password
            </h3>
            <p className="text-xs text-[#466356]">
              Verify your current password before setting a new one (min 8 characters).
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[#314c40]">
              Current Password
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[#314c40]">
              New Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[#314c40]">
              Confirm New Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-xl border border-[#cfe2d6] bg-white px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <BubblyButton type="submit" disabled={saving} className="w-full">
            {saving ? "Updating Password..." : "Update Account Password"}
          </BubblyButton>
        </form>
      </SpringCard>
    </div>
  );
}
