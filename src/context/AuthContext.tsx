import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Customer } from '../types';
import { api } from '../lib/api';

interface AuthContextType {
  user: User | null;
  admin: User | null;
  customerProfile: Customer | null;
  currentCustomer: Customer | null;
  portal: 'ADMIN' | 'CLIENT';
  setPortal: (portal: 'ADMIN' | 'CLIENT') => void;
  loginAdmin: (adminUser?: User | null) => void;
  loginAsAdmin: (adminUser?: User | null) => void;
  logoutAdmin: () => void;
  loginCustomer: (customer: Customer, token?: string) => void;
  loginAsCustomer: (customer: Customer, token?: string) => void;
  logoutCustomer: () => void;
  logout: () => void;
  refreshCustomer: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [portal, setPortal] = useState<'ADMIN' | 'CLIENT'>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const portalParam = urlParams.get('portal');
      if (portalParam?.toUpperCase() === 'ADMIN') return 'ADMIN';
      if (portalParam?.toUpperCase() === 'CLIENT') return 'CLIENT';
    }
    const saved = localStorage.getItem('iptv_active_portal');
    if (saved === 'ADMIN' || saved === 'CLIENT') return saved;
    if (typeof window !== 'undefined' && localStorage.getItem('iptv_admin_token')) {
      return 'ADMIN';
    }
    return 'CLIENT';
  });
  const [adminUser, setAdminUser] = useState<User | null>(() => {
    if (typeof window === 'undefined') return null;
    const token = localStorage.getItem('iptv_admin_token');
    const savedUserStr = localStorage.getItem('iptv_admin_user');
    if (token) {
      if (savedUserStr) {
        try {
          return JSON.parse(savedUserStr);
        } catch {
          // ignore
        }
      }
      return {
        id: 'usr-admin-1',
        name: 'Administrador Master',
        email: 'admin@painel.com',
        role: 'ADMIN',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    return null;
  });
  const [customerProfile, setCustomerProfile] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Attempt auto-restore on boot if token exists
  useEffect(() => {
    const restoreSession = async () => {
      const savedPortal = localStorage.getItem('iptv_active_portal');
      const adminToken = localStorage.getItem('iptv_admin_token');
      if (adminToken && savedPortal === 'ADMIN') {
        setPortal('ADMIN');
      }

      const clientToken = localStorage.getItem('iptv_client_token');
      if (clientToken) {
        try {
          const cust = await api.getClientMe();
          setCustomerProfile(cust);
          if (savedPortal === 'CLIENT') {
            setPortal('CLIENT');
          }
        } catch {
          localStorage.removeItem('iptv_client_token');
          setCustomerProfile(null);
        }
      }
      setIsLoading(false);
    };

    restoreSession();
  }, []);

  const handleSetPortal = (newPortal: 'ADMIN' | 'CLIENT') => {
    setPortal(newPortal);
    localStorage.setItem('iptv_active_portal', newPortal);
  };

  const loginAdmin = (adminUserObj?: User | null) => {
    const userObj: User = adminUserObj || {
      id: 'usr-admin-1',
      name: 'Administrador Master',
      email: 'admin@painel.com',
      role: 'ADMIN',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem('iptv_admin_token', 'admin_active_session_' + Date.now());
    localStorage.setItem('iptv_admin_user', JSON.stringify(userObj));
    setAdminUser(userObj);
    handleSetPortal('ADMIN');
  };

  const loginAsAdmin = loginAdmin;

  const logoutAdmin = () => {
    localStorage.removeItem('iptv_admin_token');
    localStorage.removeItem('iptv_admin_user');
    setAdminUser(null);
  };

  const loginCustomer = (customer: Customer, token?: string) => {
    if (token) {
      localStorage.setItem('iptv_client_token', token);
    }
    setCustomerProfile(customer);
    handleSetPortal('CLIENT');
  };

  const loginAsCustomer = loginCustomer;

  const logoutCustomer = () => {
    localStorage.removeItem('iptv_client_token');
    setCustomerProfile(null);
  };

  const logout = () => {
    if (portal === 'ADMIN') {
      logoutAdmin();
    } else {
      logoutCustomer();
    }
  };

  const refreshCustomer = async () => {
    try {
      const updated = await api.getClientMe();
      setCustomerProfile(updated);
    } catch {
      // ignore
    }
  };

  const currentUser =
    portal === 'ADMIN'
      ? adminUser
      : customerProfile
      ? {
          id: customerProfile.id,
          name: customerProfile.name,
          email: customerProfile.email,
          role: 'CUSTOMER' as const,
          createdAt: customerProfile.createdAt,
          updatedAt: customerProfile.updatedAt,
        }
      : null;

  return (
    <AuthContext.Provider
      value={{
        user: currentUser,
        admin: adminUser,
        customerProfile,
        currentCustomer: customerProfile,
        portal,
        setPortal: handleSetPortal,
        loginAdmin,
        loginAsAdmin,
        logoutAdmin,
        loginCustomer,
        loginAsCustomer,
        logoutCustomer,
        logout,
        refreshCustomer,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
