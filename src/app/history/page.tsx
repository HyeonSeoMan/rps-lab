import type { Metadata } from "next";
import History from "@/components/history/History";

export const metadata: Metadata = {
  title: "기록 · 통계 | 가위바위보",
};

export default function HistoryPage() {
  return <History />;
}
