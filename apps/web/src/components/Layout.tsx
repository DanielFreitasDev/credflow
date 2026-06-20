import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  LayoutDashboard,
  Users,
  FileText,
  ScrollText,
  Wallet,
  PhoneCall,
  ShieldCheck,
  History,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { roleLabel } from '../lib/format';
import { Role } from '../lib/types';
import { Badge } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Role[];
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/customers', label: 'Clientes', icon: Users },
  { to: '/proposals', label: 'Propostas', icon: FileText },
  { to: '/contracts', label: 'Contratos', icon: ScrollText },
  { to: '/payments', label: 'Pagamentos', icon: Wallet },
  { to: '/collections', label: 'Cobrança', icon: PhoneCall },
  { to: '/users', label: 'Usuários', icon: ShieldCheck, roles: ['ADMIN'] },
  { to: '/audit', label: 'Auditoria', icon: History, roles: ['ADMIN', 'MANAGER', 'AUDITOR'] },
];

export function Layout() {
  const { user, logout, hasRole } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const items = NAV.filter((n) => !n.roles || hasRole(...n.roles));

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-30 w-64 transform border-r border-slate-200 bg-white transition-transform dark:border-slate-800 dark:bg-slate-900 lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-slate-100 px-6 dark:border-slate-800">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white font-bold">
            C
          </div>
          <span className="text-lg font-bold text-slate-900 dark:text-slate-50">CredFlow</span>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                    isActive
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100',
                  )
                }
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </aside>

      {open && (
        <div className="fixed inset-0 z-20 bg-slate-900/30 dark:bg-black/50 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 lg:px-8">
          <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden" onClick={() => setOpen((o) => !o)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex flex-1 items-center justify-end gap-4">
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{user?.name}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">{user?.email}</p>
            </div>
            <Badge tone="indigo">{user ? roleLabel[user.role] : ''}</Badge>
            <button
              onClick={toggleTheme}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
              aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              title="Sair"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
