import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "InboxFlow — Good things happen in the inbox",
    template: "%s · InboxFlow",
  },
  description:
    "Build interactive commerce emails with a visual editor, secure recipient actions, and meaningful analytics.",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
