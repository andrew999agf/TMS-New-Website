"use client";

import { useEffect, useState } from "react";
import { media } from "@/lib/media";

/**
 * Brief, classy phone-only landing animation: a navy field with the centered
 * logo that fades away to reveal the page. It is rendered in the initial HTML
 * (starts visible) so it already covers the screen on first paint — there is no
 * flash of the home page before the fade begins. CSS limits it to phones and
 * disables it under reduced-motion; this effect only removes it from the DOM
 * after it has played, and skips replaying it within the same session.
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
  const [show, setShow] = useState(true);

  useEffect(() => {
    const isPhone = window.matchMedia("(max-width: 767px)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Not a phone, reduced-motion, or already seen this session → drop it.
    if (!isPhone || reduced || sessionStorage.getItem("tms_intro_seen")) {
      setShow(false);
      return;
    }
    sessionStorage.setItem("tms_intro_seen", "1");
    const t = setTimeout(() => setShow(false), 1800);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  const whiteLogo = logoLight; // an explicit white logo, if provided
  const colorLogo = logoDark; // otherwise the main logo, recolored white

  return (
    <div
      className="home-intro fixed inset-0 z-[200] bg-[var(--c-dark-bg)] pointer-events-none"
      aria-hidden="true"
    >
      <div className="home-intro-logo">
        {whiteLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media(whiteLogo)} alt="" className="h-24 sm:h-32 w-auto max-w-[80vw] object-contain" />
        ) : colorLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media(colorLogo)}
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
