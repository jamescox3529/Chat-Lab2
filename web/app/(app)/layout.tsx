import AuthProvider from "@/components/AuthProvider";
import { NavContextProvider } from "@/context/NavContext";
import AppShell from "@/components/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthProvider />
      <NavContextProvider>
        <AppShell>
          {children}
        </AppShell>
      </NavContextProvider>
    </>
  );
}
