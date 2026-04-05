import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import AuthProvider from "@/components/AuthProvider";
import { NavContextProvider } from "@/context/NavContext";
import AppShell from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roundtable",
  description: "Your expert panel, on demand.",
};

const themeScript = `
(function() {
  try {
    var saved = localStorage.getItem('theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === 'dark' || (!saved && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
    var zoom = localStorage.getItem('zoom');
    if (zoom === 'large')  document.documentElement.classList.add('zoom-large');
    if (zoom === 'larger') document.documentElement.classList.add('zoom-larger');
  } catch(e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" className="h-full" suppressHydrationWarning>
        <head>
          <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        </head>
        <body className="h-full bg-white dark:bg-dark-chat text-gray-900 dark:text-gray-100 antialiased">
          <AuthProvider />
          <NavContextProvider>
            <AppShell>
              {children}
            </AppShell>
          </NavContextProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
