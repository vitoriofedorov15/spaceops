import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { App } from './App';
import { User } from './lib/types';

const employee: User = {
  id: 'employee',
  name: 'Anna Smirnova',
  email: 'anna@spaceops.demo',
  role: 'employee',
};
const dispatcher: User = {
  id: 'dispatcher',
  name: 'Mark Volkov',
  email: 'mark@spaceops.demo',
  role: 'dispatcher',
};
let session: User | null;
let rejectLogout = false;
let client: QueryClient;
function response(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => body } as Response;
}
function renderApp(initialSession: User | null = null) {
  session = initialSession;
  rejectLogout = false;
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, options) => {
    const url = String(path).replace('/api/v1', '');
    if (url === '/auth/me')
      return session
        ? response(session)
        : response({ code: 'UNAUTHORIZED', message: 'Sign in to your account' }, 401);
    if (url === '/auth/login') {
      const body = JSON.parse(options?.body as string);
      if (body.password !== 'correct-password')
        return response(
          { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password' },
          401,
        );
      session = body.email.startsWith('mark') ? dispatcher : employee;
      return response(session, 201);
    }
    if (url === '/auth/logout') {
      if (rejectLogout)
        return response({ code: 'INTERNAL_ERROR', message: 'Unable to sign out' }, 500);
      session = null;
      return response({ ok: true });
    }
    if (url === '/site') return response({ name: 'Praktika', timezone: 'Europe/Vienna' });
    if (url.startsWith('/notifications')) return response({ unread: 0, items: [] });
    return response([]);
  });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 15000 }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/plan']}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  client?.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('signs in from a protected route and clears the session when signing out', async () => {
  renderApp();
  await screen.findByRole('heading', { name: 'Sign in to your workspace' });
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), {
    target: { value: 'correct-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Floor plan', level: 1 })).toBeInTheDocument(),
  );
  expect(screen.queryByRole('link', { name: 'Operations' })).not.toBeInTheDocument();
  client.setQueryData(['bookings', 'mine'], [{ title: 'Private meeting' }]);
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  // Logout can remount the login route while React Query and the router settle.
  // Resolve the current element on each check instead of retaining a detached node.
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Sign in to your workspace' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bookings' })).not.toBeInTheDocument();
    expect(client.getQueryData(['bookings', 'mine'])).toBeUndefined();
  });
});

it('keeps the login form and explains rejected credentials', async () => {
  renderApp();
  await screen.findByRole('heading', { name: 'Sign in to your workspace' });
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), {
    target: { value: 'wrong-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password');
  expect(screen.getByLabelText('Work email')).toHaveValue('anna@spaceops.demo');
});

it('shows the operations workspace for a dispatcher session', async () => {
  renderApp(dispatcher);
  await screen.findByRole('heading', { name: 'Floor plan', level: 1 });
  expect(screen.getByRole('link', { name: 'Operations' })).toBeInTheDocument();
});

it('keeps the current session visible when sign-out fails', async () => {
  renderApp(employee);
  rejectLogout = true;
  await screen.findByRole('heading', { name: 'Floor plan', level: 1 });
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to sign out');
  expect(screen.getByRole('heading', { name: 'Floor plan', level: 1 })).toBeInTheDocument();
  expect(client.getQueryData(['me'])).toEqual(employee);
});

it('returns to sign-in when a cached session expires during a background refresh', async () => {
  renderApp(employee);
  await screen.findByRole('heading', { name: 'Floor plan', level: 1 });
  session = null;
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['me'] });
  });
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Sign in to your workspace' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });
});
