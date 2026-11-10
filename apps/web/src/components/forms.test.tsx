import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BookingModal } from './forms';
import { vi } from 'vitest';
const space = {
  id: '00000000-0000-4000-0004-000000000001',
  name: 'Orbit',
  type: 'room',
  capacity: 8,
  floor_number: 1,
  equipment: [],
};
const slot = { date: '2030-07-10', start: '10:00', end: '11:00' };
function renderForm() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BookingModal slot={slot} space={space as any} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}
afterEach(() => vi.restoreAllMocks());
it('keeps entered booking details after a server conflict', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async (_url, opts) =>
      ({
        ok: !opts?.method,
        status: opts?.method ? 409 : 200,
        json: async () =>
          opts?.method
            ? { code: 'SPACE_UNAVAILABLE', message: 'This space is already booked' }
            : [space],
      }) as Response,
  );
  renderForm();
  const title = await screen.findByPlaceholderText('For example, sprint planning');
  fireEvent.change(title, { target: { value: 'Design review' } });
  fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm booking' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This space is already booked');
  expect(await screen.findByPlaceholderText('For example, sprint planning')).toHaveValue(
    'Design review',
  );
});
it('shows a recoverable error when spaces cannot be loaded', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network unavailable'));
  renderForm();
  expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable');
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
});
it('requires a title before the confirmation step', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => [space],
  } as Response);
  renderForm();
  fireEvent.click(await screen.findByRole('button', { name: /Continue/ }));
  expect(await screen.findByText('Enter a title')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Confirm booking' })).not.toBeInTheDocument();
});
