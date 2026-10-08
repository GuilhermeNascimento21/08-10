import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ClientPortal } from './components/client/ClientPortal';
import { Sidebar } from './components/layout/Sidebar';
import { Navbar } from './components/layout/Navbar';
import { DashboardView } from './components/admin/DashboardView';
import { CustomersView } from './components/admin/CustomersView';
import { PaymentsView } from './components/admin/PaymentsView';
import { PlansView } from './components/admin/PlansView';
import { ExpirationsView } from './components/admin/ExpirationsView';
import { AutomationView } from './components/admin/AutomationView';
import { SettingsView } from './components/admin/SettingsView';
import { AdminLogin } from './components/admin/AdminLogin';
import { DashboardStats } from './types';
import { api } from './lib/api';

const MainApp: React.FC = () => {
  const { portal, admin } = useAuth();
  const [activeAdminTab, setActiveAdminTab] = useState<string>('dashboard');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      setLoadingStats(true);
      const data = await api.getDashboardStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch dashboard stats:', err);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    if (admin && portal === 'ADMIN') {
      fetchStats();
    }
  }, [admin, portal, fetchStats]);

  // If Client Portal is active, show the Subscriber Portal
  if (portal === 'CLIENT') {
    return (
      <div className="relative min-h-screen bg-zinc-950">
        <ClientPortal />
      </div>
    );
  }

  // Admin Portal: if not authenticated as Admin, show AdminLogin
  if (!admin) {
    return <AdminLogin />;
  }

  // Admin Portal layout
  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans selection:bg-indigo-600 selection:text-white">
      {/* Admin Sidebar */}
      <Sidebar
        activeTab={activeAdminTab}
        setActiveTab={setActiveAdminTab}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Admin Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-zinc-950">
        <Navbar
          activeTab={activeAdminTab}
          onNavigateTab={setActiveAdminTab}
          onToggleMobileMenu={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {activeAdminTab === 'dashboard' && (
            <DashboardView
              stats={stats}
              loading={loadingStats}
              onRefresh={fetchStats}
              onNavigateTab={setActiveAdminTab}
            />
          )}
          {activeAdminTab === 'customers' && <CustomersView />}
          {activeAdminTab === 'plans' && <PlansView />}
          {activeAdminTab === 'expirations' && <ExpirationsView />}
          {activeAdminTab === 'automation' && <AutomationView />}
          {activeAdminTab === 'settings' && <SettingsView />}
          {activeAdminTab === 'payments' && <PaymentsView />}
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
