"use client";

import { useEffect, useState } from "react";

/**
 * Brief, classy landing animation: the logo fades in centered on a navy field,
 * then the whole overlay fades away to reveal the page. Shows once per session,
 * and is skipped entirely under prefers-reduced-motion. Never blocks clicks.
 */
export function HomeIntro({
  logoLight,
  logoDark,
  firmName,
}: {
  logoLight?: string;
  logoDark?: string;
  firmName: string;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Phones only — not desktop/laptop.
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    if (sessionStorage.getItem("tms_intro_seen")) return;
    sessionStorage.setItem("tms_intro_seen", "1");
    setShow(true);
    const t = setTimeout(() => setShow(false), 1700);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  const whiteLogo = logoLight; // an explicit white logo, if provided
  const colorLogo = logoDark; // otherwise the main logo, recolored white

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--c-dark-bg)] pointer-events-none home-intro"
      aria-hidden="true"
    >
      <div className="home-intro-logo">
        {whiteLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={whiteLogo} alt="" className="h-24 sm:h-32 w-auto max-w-[80vw] object-contain" />
        ) : colorLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={colorLogo}
            alt=""
            className="h-24 sm:h-32 w-auto max-w-[80vw] object-contain"
            style={{ filter: "brightness(0) invert(1)" }}
          />
        ) : (
          <span className="font-[family-name:var(--font-display)] text-3xl sm:text-5xl text-[var(--c-dark-ink)] text-center px-6">
            {firmName}
          </span>
        )}
      </div>
    </div>
  );
}
