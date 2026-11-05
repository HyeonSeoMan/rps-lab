import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "가위바위보",
  description: "컴퓨터와 즐기는 가위바위보",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
