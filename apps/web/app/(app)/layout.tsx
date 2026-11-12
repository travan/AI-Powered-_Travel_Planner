import { BottomNav } from "../../components/layout/BottomNav";
import { NotificationProvider } from "../../components/layout/NotificationProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <NotificationProvider>
      {children}
      <BottomNav />
    </NotificationProvider>
  );
}
