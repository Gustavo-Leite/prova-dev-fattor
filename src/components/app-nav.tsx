"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface AppNavLink {
  readonly href: string;
  readonly label: string;
}

export interface AppNavProps {
  readonly label: string;
  readonly links: readonly AppNavLink[];
}

export function AppNav({ label, links }: AppNavProps) {
  const pathname = usePathname();

  return (
    <nav aria-label={label}>
      <ul className="flex items-center gap-1">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className="inline-flex h-8 items-center rounded-md px-2 text-xs font-semibold text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card aria-[current=page]:text-foreground aria-[current=page]:underline aria-[current=page]:decoration-ring aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-4"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
