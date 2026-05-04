import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "tf360 AI Hub",
  description: "Directors-only control panel for the tf360 AI agent.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#f8fafc",
          color: "#0f172a",
          minHeight: "100vh",
        }}
      >
        {children}
      </body>
    </html>
  );
}
