"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./AppHeader.module.css";

/** 끝 슬래시를 제거해 비교한다(`/history/` → `/history`, 루트는 `/` 유지). 경로 문자열은 화면에 출력하지 않는다. */
export function normalizePath(pathname: string | null): string {
  if (!pathname) return "/";
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") || "/" : pathname;
}

const LINKS = [
  { href: "/", label: "게임" },
  { href: "/history", label: "기록 · 통계" },
] as const;

export default function AppHeader() {
  const current = normalizePath(usePathname());
  return (
    <header className={styles.top}>
      <div className={styles.brand}>
        <h1>가위바위보</h1>
        <small>RPS Lab v2</small>
      </div>
      <nav className={styles.nav} aria-label="페이지">
        {LINKS.map(({ href, label }) => (
          <Link key={href} href={href} prefetch={false} aria-current={current === href ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
