import type { Metadata } from "next";
import "./globals.css";
import AppHeader from "@/components/AppHeader";
import styles from "./app-shell.module.css";

export const metadata: Metadata = {
  title: "가위바위보",
  description: "컴퓨터와 즐기는 가위바위보",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <div className={styles.shell}>
          <div className={styles.app}>
            <AppHeader />
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
