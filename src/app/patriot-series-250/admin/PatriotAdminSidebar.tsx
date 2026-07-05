"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Radio, ImageIcon, Images, Users, UserRound, Building2, Eye, ExternalLink, Newspaper } from "lucide-react";

const ITEMS = [
  { key: "switchboard", label: "Switchboard", href: "/admin", icon: Radio },
  { key: "news", label: "News", href: "/admin/news", icon: Newspaper },
  { key: "branding", label: "Branding & Media", href: "/admin/branding", icon: ImageIcon },
  { key: "banners", label: "Banners", href: "/admin/banners", icon: Images },
  { key: "teams", label: "Teams", href: "/admin/teams", icon: Users },
  { key: "players", label: "Players", href: "/admin/players", icon: UserRound },
  { key: "stadium", label: "Stadium", href: "/admin/stadium", icon: Building2 },
  { key: "visibility", label: "Visibility", href: "/admin/visibility", icon: Eye },
];

function activeKey(pathname: string): string {
  if (pathname.includes("/branding")) return "branding";
  if (pathname.includes("/banners")) return "banners";
  if (pathname.includes("/players")) return "players";
  if (pathname.includes("/stadium")) return "stadium";
  if (pathname.includes("/visibility")) return "visibility";
  if (pathname.includes("/teams")) return "teams";
  return "switchboard";
}

export function PatriotAdminSidebar({ name, logo }: { name: string; logo?: string }) {
  const active = activeKey(usePathname() ?? "");
  return (
    <aside className="shrink-0 border-b border-white/10 bg-black/20 lg:w-60 lg:border-b-0 lg:border-r">
      <div className="flex items-center gap-2.5 px-5 py-4">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-9 w-9 shrink-0 rounded-md object-contain" />
        ) : null}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/80">Patriot Series</p>
          <p className="text-[11px] text-white/45">Admin</p>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
        {ITEMS.map((it) => {
          const Icon = it.icon;
          const on = active === it.key;
          return (
            <Link
              key={it.key}
              href={it.href}
              className={`flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${on ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/5 hover:text-white"}`}
            >
              <Icon size={16} /> {it.label}
            </Link>
          );
        })}
      </nav>
      <div className="hidden border-t border-white/10 px-3 py-3 lg:block">
        <Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-white/50 transition-colors hover:text-white">
          <ExternalLink size={14} /> View site
        </Link>
        <p className="mt-2 px-3 text-[11px] text-white/40">Signed in as {name}</p>
      </div>
    </aside>
  );
}
