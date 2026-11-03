import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import luxonPlugin from '@fullcalendar/luxon3';
import enLocale from '@fullcalendar/core/locales/en-gb';
import {
  ArrowRight,
  CalendarDays,
  History as HistoryIcon,
  List,
  Pencil,
  Plus,
  X,
} from 'lucide-react';
import { api, qs, useCommand } from '../lib/api';
import { Booking, Proposal } from '../lib/types';
import { defaultSlot, formatDay, formatTime, localDate, TZ } from '../lib/time';
import { useUser } from '../lib/session';
import {
  Badge,
  Empty,
  ErrorState,
  FormError,
  Loading,
  NextButton,
  PageTitle,
} from '../components/shared';
import { Button } from '../components/ui/button';
import { Modal } from '../components/ui/dialog';
import { BookingModal, HistoryModal, RelocationModal } from '../components/forms';
export function ProposalCards() {
  const user = useUser();
  const command = useCommand();
  const query = useQuery({
    queryKey: ['proposals'],
    queryFn: () => api<Proposal[]>('/relocation-proposals'),
  });
  if (query.error) return <ErrorState error={query.error} retry={query.refetch} />;
  return (
    <>
      {query.data
        ?.filter((p) => p.user_id === user.id)
        .map((p) => (
          <div className="proposal-card" key={p.id}>
            <span className="proposal-icon">
              <ArrowRight size={22} />
            </span>
            <div>
              <div className="eyebrow">YOUR RESPONSE IS NEEDED</div>
              <h3>Meeting relocation «{p.title}»</h3>
              <p>
                {p.original_space_name} <ArrowRight size={12} /> <strong>{p.space_name}</strong> ·{' '}
                {formatDay(p.starts_at)}, {formatTime(p.starts_at)}–{formatTime(p.ends_at)}
              </p>
            </div>
            <div className="proposal-actions">
              <Button
                variant="outline"
                size="sm"
                disabled={command.isPending}
                onClick={() => command.mutate({ path: `/relocation-proposals/${p.id}/reject` })}
              >
                Decline
              </Button>
              <Button
                size="sm"
                disabled={command.isPending}
                onClick={() => command.mutate({ path: `/relocation-proposals/${p.id}/accept` })}
              >
                Accept relocation
              </Button>
            </div>
          </div>
        ))}
      <FormError error={command.error} />
    </>
  );
}
export function BookingsPage() {
  const user = useUser();
  const [view, setView] = useState<'list' | 'calendar'>('list'),
    [page, setPage] = useState(1),
    [date, setDate] = useState(defaultSlot().date),
    [includeCancelled, setIncludeCancelled] = useState(false),
    [newBooking, setNewBooking] = useState(false),
    [edit, setEdit] = useState<Booking | null>(null),
    [cancel, setCancel] = useState<Booking | null>(null),
    [history, setHistory] = useState<Booking | null>(null),
    [relocation, setRelocation] = useState<Booking | null>(null);
  const [calendarRange, setCalendarRange] = useState({
    from: localDate().startOf('week').toISO()!,
    to: localDate().startOf('week').plus({ weeks: 1 }).toISO()!,
  });
  const d = DateTime.fromISO(date, { zone: TZ }).startOf('day');
  const listRange = { from: d.toISO()!, to: d.plus({ days: 31 }).toISO()! };
  const query = useQuery({
    placeholderData: keepPreviousData,
    queryKey: ['bookings', 'page', view, page, listRange, calendarRange, includeCancelled],
    queryFn: async () => {
      if (view === 'list')
        return api<Booking[]>(
          '/bookings' +
            qs({
              ...listRange,
              mine: true,
              ...(!includeCancelled ? { status: 'active' } : {}),
              page,
            }),
        );
      const rows: Booking[] = [];
      let p = 1;
      while (p <= 20) {
        const next = await api<Booking[]>(
          '/bookings' + qs({ ...calendarRange, status: 'active', limit: 100, page: p++ }),
        );
        rows.push(...next);
        if (next.length < 100) break;
      }
      return rows;
    },
  });
  const command = useCommand();
  return (
    <>
      <PageTitle
        eyebrow="MAKE TIME FOR WHAT MATTERS"
        title="Bookings"
        description="Your meetings, focus time and team plans."
      >
        <Button onClick={() => setNewBooking(true)}>
          <Plus size={17} />
          New booking
        </Button>
      </PageTitle>
      <ProposalCards />
      <div className="section-toolbar">
        <div className="segmented">
          <button className={view === 'list' ? 'selected' : ''} onClick={() => setView('list')}>
            <List size={16} />
            My bookings
          </button>
          <button
            className={view === 'calendar' ? 'selected' : ''}
            onClick={() => setView('calendar')}
          >
            <CalendarDays size={16} />
            Calendar
          </button>
        </div>
        {view === 'list' && (
          <div className="inline-controls">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={includeCancelled}
                onChange={(e) => {
                  setIncludeCancelled(e.target.checked);
                  setPage(1);
                }}
              />
              Show cancelled
            </label>
            <input
              aria-label="Bookings from date"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setPage(1);
              }}
            />
          </div>
        )}
      </div>
      <div className="content-card">
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} retry={query.refetch} />
        ) : view === 'calendar' ? (
          <div className="calendar-wrap">
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, luxonPlugin]}
              initialView="timeGridWeek"
              initialDate={date}
              locale={enLocale}
              timeZone={TZ}
              firstDay={1}
              allDaySlot={false}
              slotMinTime="08:00:00"
              slotMaxTime="22:00:00"
              slotDuration="00:15:00"
              height="auto"
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'timeGridDay,timeGridWeek,dayGridMonth',
              }}
              datesSet={(info) =>
                setCalendarRange({ from: info.start.toISOString(), to: info.end.toISOString() })
              }
              events={query.data?.map((b) => ({
                id: b.id,
                title: `${b.space_name} · ${b.title}`,
                start: b.starts_at,
                end: b.ends_at,
                color: b.needs_relocation
                  ? '#c79431'
                  : b.user_id === user.id
                    ? '#5e6ad2'
                    : '#708ab9',
              }))}
              eventClick={(info) => {
                const b = query.data?.find((b) => b.id === info.event.id);
                if (b && b.user_id === user.id) setEdit(b);
              }}
            />
          </div>
        ) : !query.data?.length ? (
          <Empty title="Your schedule is clear">
            No bookings in the 31 days from this date. Create your first one.
          </Empty>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Meeting</th>
                    <th>Space</th>
                    <th>Date & time</th>
                    <th>Status</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <strong>{b.title}</strong>
                        <small>{b.attendees} people</small>
                      </td>
                      <td>
                        <span className="table-room">{b.space_name}</span>
                        <small>Floor {b.floor_number}</small>
                      </td>
                      <td>
                        <strong>{formatDay(b.starts_at)}</strong>
                        <small>
                          {formatTime(b.starts_at)}–{formatTime(b.ends_at)}
                        </small>
                      </td>
                      <td>
                        <Badge
                          kind={
                            b.status === 'cancelled'
                              ? 'neutral'
                              : b.needs_relocation
                                ? 'warning'
                                : 'available'
                          }
                        >
                          {b.status === 'cancelled'
                            ? 'Cancelled'
                            : b.needs_relocation
                              ? 'Relocation needed'
                              : 'Confirmed'}
                        </Badge>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-button"
                            aria-label={'History ' + b.title}
                            onClick={() => setHistory(b)}
                          >
                            <HistoryIcon size={17} />
                          </button>
                          {b.status === 'active' && (
                            <>
                              <button
                                className="icon-button"
                                aria-label={'Edit ' + b.title}
                                onClick={() => setEdit(b)}
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                className="icon-button"
                                aria-label={'Cancel ' + b.title}
                                onClick={() => setCancel(b)}
                              >
                                <X size={17} />
                              </button>
                              {user.role !== 'employee' && b.needs_relocation && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setRelocation(b)}
                                >
                                  Relocation
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <NextButton page={page} setPage={setPage} count={query.data.length} />
          </>
        )}
      </div>
      {newBooking && <BookingModal onClose={() => setNewBooking(false)} />}{' '}
      {edit && <BookingModal booking={edit} onClose={() => setEdit(null)} />}{' '}
      {history && <HistoryModal booking={history} onClose={() => setHistory(null)} />}{' '}
      {relocation && <RelocationModal booking={relocation} onClose={() => setRelocation(null)} />}{' '}
      {cancel && (
        <Modal
          open
          title="Cancel this booking?"
          description={`${cancel.title} · ${cancel.space_name}`}
          onClose={() => setCancel(null)}
        >
          <p>
            Meeting {formatDay(cancel.starts_at)}, {formatTime(cancel.starts_at)}–
            {formatTime(cancel.ends_at)} will remain in your history as cancelled.
          </p>
          <FormError error={command.error} />
          <div className="form-actions">
            <Button variant="outline" onClick={() => setCancel(null)}>
              Keep booking
            </Button>
            <Button
              variant="destructive"
              disabled={command.isPending}
              onClick={async () => {
                try {
                  await command.mutateAsync({
                    path: `/bookings/${cancel.id}/cancel`,
                    body: { version: cancel.version },
                  });
                  setCancel(null);
                } catch {
                  /* displayed */
                }
              }}
            >
              Cancel meeting
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
