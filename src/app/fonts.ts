/**
 * All ten font families used by the five font palettes, loaded via next/font
 * for self-hosting, automatic subsetting, and zero layout shift.
 *
 * Performance note: `preload` is enabled only for the default-palette families
 * (Fraunces + Inter). The other families are still defined as @font-face rules
 * but their glyph files are fetched lazily by the browser only when the active
 * palette references them — so switching palettes works instantly without
 * forcing every visitor to download all ten families up front.
 */
import {
  Fraunces,
  Inter,
  Newsreader,
  IBM_Plex_Sans,
  Spectral,
  Public_Sans,
  Libre_Caslon_Display,
  Figtree,
  Source_Serif_4,
  Inter_Tight,
} from "next/font/google";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz", "SOFT", "WONK"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
  preload: false,
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
  preload: false,
});

const spectral = Spectral({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-spectral",
  display: "swap",
  preload: false,
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
  display: "swap",
  preload: false,
});

const caslon = Libre_Caslon_Display({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-caslon",
  display: "swap",
  preload: false,
});

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
  preload: false,
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
  preload: false,
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
  preload: false,
});

/** Concatenated className applying every font variable to <html>. */
export const fontVariables = [
  fraunces.variable,
  inter.variable,
  newsreader.variable,
  plexSans.variable,
  spectral.variable,
  publicSans.variable,
  caslon.variable,
  figtree.variable,
  sourceSerif.variable,
  interTight.variable,
].join(" ");
