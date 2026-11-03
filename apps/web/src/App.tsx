import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  LayoutGrid,
  CalendarDays,
  LifeBuoy,
  Monitor,
  ChartNoAxesCombined,
  Settings,
  LogOut,
  ArrowUpRight,
  Menu,
  X,
  Layers,
  Command,
  ShieldCheck,
} from 'lucide-react';
import { api, ApiError, useCommand } from './lib/api';
import { Notification, roleLabels, User } from './lib/types';
import { UserContext } from './lib/session';
import { formatDay, formatTime } from './lib/time';
import { Button } from './components/ui/button';
import { Modal } from './components/ui/dialog';
import { Empty, ErrorState, FormError, Loading } from './components/shared';
import { FloorPage } from './pages/FloorPage';
import { BookingsPage } from './pages/BookingsPage';
import { TicketsPage } from './pages/TicketsPage';
import { EquipmentPage } from './pages/EquipmentPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SettingsPage } from './pages/SettingsPage';
import { OperationsPage } from './pages/OperationsPage';
const links = [
  { to: '/plan', label: 'Floor plan', icon: LayoutGrid },
  { to: '/bookings', label: 'Bookings', icon: CalendarDays },
  { to: '/tickets', label: 'Support tickets', icon: LifeBuoy },
  { to: '/equipment', label: 'Equipment', icon: Monitor },
  { to: '/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
];
function Login() {
  const [email, setEmail] = useState('anna@spaceops.demo');
  const [password, setPassword] = useState('');
  const command = useCommand<User>({ invalidate: false });
  const client = useQueryClient();
  const navigate = useNavigate();
  return (
    <div className="login-page">
      <div className="login-brand">
        <div className="wordmark">
          <span className="brand-icon">
            <Layers size={22} />
          </span>
          SpaceOps
        </div>
        <p className="login-product">Workspace management</p>
      </div>
      <main className="login-form-area">
        <form
          className="login-form"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const user = await command.mutateAsync({
                path: '/auth/login',
                body: { email, password },
              });
              await client.cancelQueries();
              client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
              client.setQueryData(['me'], user);
              navigate('/plan', { replace: true });
            } catch {
              /* displayed below */
            }
          }}
        >
          <h2>Sign in to your workspace</h2>
          <p className="muted">Use your work account to continue.</p>
          <label className="field">
            <span>Work email</span>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
            />
          </label>
          <FormError error={command.error} />
          <Button type="submit" disabled={command.isPending} className="full">
            {command.isPending ? 'Signing in…' : 'Sign in'} <ArrowUpRight size={17} />
          </Button>
          <div className="demo-accounts">
            <small>Try a demo account</small>
            <div>
              {[
                ['anna', 'Employee'],
                ['mark', 'Dispatcher'],
                ['alex', 'Administrator'],
              ].map(([name, label]) => (
                <button
                  type="button"
                  className={email.startsWith(name) ? 'selected' : ''}
                  key={name}
                  onClick={() => setEmail(name + '@spaceops.demo')}
                >
                  {label}
                </button>
              ))}
            </div>
            <p>
              Password is set in the project README or <code>DEMO_PASSWORD</code>.
            </p>
          </div>
          <div className="secure-note">
            <ShieldCheck size={14} /> Secure session · Just for your team
          </div>
        </form>
      </main>
    </div>
  );
}
function Shell({ user }: { user: User }) {
  const [menu, setMenu] = useState(false),
    [notifications, setNotifications] = useState(false);
  const command = useCommand();
  const logoutCommand = useCommand({ invalidate: false });
  const client = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const sectionLabel =
    links.find((item) => item.to === location.pathname)?.label ??
    (location.pathname === '/operations'
      ? 'Operations'
      : location.pathname === '/settings'
        ? 'Settings'
        : 'Workspace');
  const site = useQuery({
    queryKey: ['site'],
    queryFn: () => api<{ name: string; timezone: string }>('/site'),
  });
  const notices = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ unread: number; items: Notification[] }>('/notifications'),
  });
  return (
    <UserContext.Provider value={user}>
      <div className="app-layout">
        <aside className={'sidebar ' + (menu ? 'mobile-open' : '')}>
          <NavLink className="wordmark" to="/plan">
            <span className="brand-icon">
              <Layers size={21} />
            </span>
            SpaceOps
          </NavLink>
          <Button
            className="mobile-close"
            variant="ghost"
            size="icon"
            aria-label="Close menu"
            onClick={() => setMenu(false)}
          >
            <X size={20} />
          </Button>
          <div className="workspace-label">WORKSPACE</div>
          <nav>
            {links.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMenu(false)}
                className={({ isActive }) => 'nav-item ' + (isActive ? 'active' : '')}
              >
                <item.icon size={18} />
                {item.label}
                {item.to === '/tickets' && <ArrowUpRight className="nav-hint" size={14} />}
              </NavLink>
            ))}
            {user.role !== 'employee' && (
              <NavLink to="/operations" className="nav-item" onClick={() => setMenu(false)}>
                <Command size={18} />
                Operations
              </NavLink>
            )}
          </nav>
          <div className="sidebar-bottom">
            <div className="site-note">
              <span className="status-dot" />
              <span>
                Office hours<small>Every day, 08:00–22:00</small>
              </span>
            </div>
            <NavLink to="/settings" className="nav-item" onClick={() => setMenu(false)}>
              <Settings size={18} />
              Settings
            </NavLink>
            <div className="user-card">
              <div className="avatar">
                {user.name
                  .split(' ')
                  .map((s) => s[0])
                  .join('')}
              </div>
              <div>
                <strong>{user.name}</strong>
                <small>{roleLabels[user.role]}</small>
              </div>
              <button
                className="icon-button"
                aria-label="Sign out"
                disabled={logoutCommand.isPending}
                onClick={async () => {
                  try {
                    await logoutCommand.mutateAsync({ path: '/auth/logout' });
                    await client.cancelQueries();
                    client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
                    client.setQueryData(['me'], null);
                    navigate('/login', { replace: true });
                  } catch {
                    /* displayed */
                  }
                }}
              >
                <LogOut size={16} />
              </button>
            </div>
            <FormError error={logoutCommand.error ?? command.error} />
          </div>
        </aside>
        {menu && (
          <button className="nav-backdrop" aria-label="Close menu" onClick={() => setMenu(false)} />
        )}
        <div className="workspace">
          <header className="topbar">
            <button
              className="icon-button mobile-menu"
              aria-label="Open menu"
              onClick={() => setMenu(true)}
            >
              <Menu />
            </button>
            <div className="site-title">
              <span className="site-logo">P</span>
              <strong>{site.data?.name ?? 'Praktika'}</strong>
              <span className="breadcrumb-divider">/</span>
              <span className="current-section">{sectionLabel}</span>
            </div>
            <div className="topbar-right">
              <span className="live-label">
                <span className="status-dot" /> Updates every 30 sec.
              </span>
              <button
                className="notification-button"
                aria-label="Notifications"
                onClick={() => setNotifications(true)}
              >
                <Bell size={20} />
                {!!notices.data?.unread && <span>{notices.data.unread}</span>}
              </button>
              <NavLink to="/settings" className="avatar avatar-small" aria-label="Profile settings">
                {user.name[0]}
              </NavLink>
            </div>
          </header>
          <main className="main-content" key={location.pathname}>
            <Routes>
              <Route path="/plan" element={<FloorPage />} />
              <Route path="/bookings" element={<BookingsPage />} />
              <Route path="/tickets" element={<TicketsPage />} />
              <Route path="/equipment" element={<EquipmentPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route
                path="/operations"
                element={
                  user.role === 'employee' ? <Navigate to="/plan" replace /> : <OperationsPage />
                }
              />
              <Route path="*" element={<Navigate to="/plan" replace />} />
            </Routes>
          </main>
          <footer className="app-footer">
            <span>SpaceOps</span>
            <span>{site.data?.timezone ?? 'Europe/Vienna'} / 08:00–22:00</span>
          </footer>
        </div>
      </div>
      <Modal
        open={notifications}
        onClose={() => setNotifications(false)}
        title="Notifications"
        description="Booking updates and support tickets"
      >
        <div className="notice-actions">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => command.mutate({ path: '/notifications/read-all' })}
          >
            Mark all as read
          </Button>
        </div>
        {notices.isPending ? (
          <Loading />
        ) : notices.error ? (
          <ErrorState error={notices.error} retry={notices.refetch} />
        ) : !notices.data?.items.length ? (
          <Empty title="You’re all caught up" />
        ) : (
          notices.data.items.map((n) => (
            <button
              key={n.id}
              className={'notice ' + (!n.read_at ? 'unread' : '')}
              onClick={() => {
                command.mutate({ path: `/notifications/${n.id}/read` });
                setNotifications(false);
                navigate(n.type.startsWith('ticket') ? '/tickets' : '/bookings');
              }}
            >
              <span className="notice-dot" />
              <div>
                <p>{n.message}</p>
                <small>
                  {formatDay(n.created_at)} · {formatTime(n.created_at)}
                </small>
              </div>
              <ArrowUpRight size={16} />
            </button>
          ))
        )}
        <FormError error={command.error} />
      </Modal>
    </UserContext.Provider>
  );
}
export function App() {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<User | null>('/auth/me'),
    retry: false,
  });
  if (me.isPending) return <Loading />;
  if (me.error && !(me.error instanceof ApiError && me.error.status === 401))
    return <ErrorState error={me.error} retry={me.refetch} />;
  if (!me.data || (me.error instanceof ApiError && me.error.status === 401))
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  return <Shell user={me.data} />;
}
