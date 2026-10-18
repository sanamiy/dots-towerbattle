import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "DOTSタワーバトル",
  description:
    "自分のdotと会話して遊ぶ、最大4人のオンラインタワーバトル。合言葉で集まって、左、右、回転、落として。",
  icons: { icon: "/favicon.svg" },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
