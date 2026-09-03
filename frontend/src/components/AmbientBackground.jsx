import React from "react";

export default function AmbientBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden="true"
    >
      {/* Top center bloom - main purple gradient */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-full blur-[60px]"
        style={{
          top: "-8%",
          width: "min(900px, 90vw)",
          height: "360px",
          background: `radial-gradient(circle at center, color-mix(in srgb, var(--gold) 28%, transparent) 0%, color-mix(in srgb, var(--gold) 10%, transparent) 40%, transparent 70%)`,
          opacity: 0.7,
        }}
      />
      {/* Secondary bloom - wider, softer */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-full blur-[70px]"
        style={{
          top: "-20%",
          width: "min(1100px, 120vw)",
          height: "680px",
          background: `radial-gradient(circle at center, color-mix(in srgb, var(--gold) 18%, transparent) 0%, color-mix(in srgb, var(--gold) 6%, transparent) 38%, transparent 66%)`,
          opacity: 0.55,
        }}
      />
      {/* Bottom right subtle bloom */}
      <div
        className="absolute rounded-full blur-[70px]"
        style={{
          bottom: "10%",
          right: "-8%",
          width: "min(600px, 70vw)",
          height: "500px",
          background: `radial-gradient(circle at center, color-mix(in srgb, var(--gold) 14%, transparent) 0%, transparent 64%)`,
          opacity: 0.3,
        }}
      />
      {/* Grain texture overlay */}
      <div
        className="absolute inset-0 mix-blend-multiply"
        style={{
          opacity: 0.03,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}
