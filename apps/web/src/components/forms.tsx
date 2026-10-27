import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, Check, Users } from 'lucide-react';
import { api, qs, useCommand } from '../lib/api';
import { Booking, equipmentLabels, History, Space, auditLabels } from '../lib/types';
import { defaultSlot, formatDay, formatTime, isoTime, localDate } from '../lib/time';
import { Modal } from './ui/dialog';
import { Button } from './ui/button';
import { Empty, ErrorState, Field, FormError, Loading } from './shared';
const formSchema = z
  .object({
    space_id: z.string().min(1, 'Select a space'),
    title: z.string().trim().min(1, 'Enter a title').max(140),
    date: z.string().min(1, 'Choose a date'),
    start: z.string().min(1, 'Choose a start time'),
    end: z.string().min(1, 'Choose an end time'),
    attendees: z.number().int().min(1).max(100),
    requirements: z.array(z.string()),
    comment: z.string().max(2000),
  })
  .refine((v) => v.end > v.start, { message: 'End time must be after start time', path: ['end'] });
type FormValues = z.infer<typeof formSchema>;
export function BookingModal({
  onClose,
  space,
  slot,
  booking,
}: {
  onClose: () => void;
  space?: Space;
  slot?: ReturnType<typeof defaultSlot>;
  booking?: Booking;
}) {
  const initial =
    slot ??
    (booking
      ? {
          date: localDate(booking.starts_at).toISODate()!,
          start: formatTime(booking.starts_at),
          end: formatTime(booking.ends_at),
        }
      : defaultSlot());
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      space_id: booking?.space_id ?? space?.id ?? '',
      title: booking?.title ?? '',
      ...initial,
      attendees: booking?.attendees ?? 1,
      requirements: booking?.requirements ?? [],
      comment: booking?.comment ?? '',
    },
  });
  const [confirm, setConfirm] = useState<FormValues | null>(null);
  const command = useCommand();
  const spaces = useQuery({
    queryKey: ['spaces', 'all'],
    queryFn: () => api<Space[]>('/spaces?limit=100'),
  });
  const selected = spaces.data?.find((s) => s.id === form.watch('space_id'));
  useEffect(() => {
    if (selected?.type === 'desk') form.setValue('attendees', 1);
  }, [selected?.id, form]);
  const send = async (v: FormValues) => {
    try {
      await command.mutateAsync({
        path: booking ? `/bookings/${booking.id}` : '/bookings',
        method: booking ? 'PATCH' : 'POST',
        body: {
          space_id: v.space_id,
          title: v.title,
          starts_at: isoTime(v.date, v.start),
          ends_at: isoTime(v.date, v.end),
          attendees: v.attendees,
          requirements: v.requirements,
          comment: v.comment,
          ...(booking ? { version: booking.version } : {}),
        },
      });
      onClose();
    } catch {
      setConfirm(null);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={confirm ? 'Review your booking' : booking ? 'Edit booking' : 'New booking'}
      description="Site time · Europe/Vienna"
    >
      <FormError error={command.error} />
      {confirm ? (
        <div className="confirmation">
          <div className="confirmation-icon">
            <CalendarDays size={30} />
          </div>
          <h2>{confirm.title}</h2>
          <p>
            {selected?.name} · {confirm.date}
          </p>
          <strong>
            {confirm.start} — {confirm.end}
          </strong>
          <p>
            <Users size={16} /> {confirm.attendees} people
          </p>
          <div className="form-actions">
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Back
            </Button>
            <Button disabled={command.isPending} onClick={() => void send(confirm)}>
              <Check size={16} />
              {command.isPending ? 'Saving…' : 'Confirm booking'}
            </Button>
          </div>
        </div>
      ) : spaces.isPending ? (
        <Loading />
      ) : spaces.error ? (
        <ErrorState error={spaces.error} retry={spaces.refetch} />
      ) : (
        <form onSubmit={form.handleSubmit((v) => setConfirm(v))} className="form-stack">
          <Field label="Space" error={form.formState.errors.space_id?.message}>
            <select
              {...form.register('space_id', { onChange: () => form.setValue('requirements', []) })}
            >
              <option value="">Select a space</option>
              {spaces.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.capacity} seats · floor {s.floor_number}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Meeting title" error={form.formState.errors.title?.message}>
            <input
              autoFocus
              placeholder="For example, sprint planning"
              {...form.register('title')}
            />
          </Field>
          <div className="form-grid three">
            <Field label="Date" error={form.formState.errors.date?.message}>
              <input type="date" {...form.register('date')} />
            </Field>
            <Field label="Start time" error={form.formState.errors.start?.message}>
              <input type="time" step="900" {...form.register('start')} />
            </Field>
            <Field label="End time" error={form.formState.errors.end?.message}>
              <input type="time" step="900" {...form.register('end')} />
            </Field>
          </div>
          <Field label="Number of attendees" error={form.formState.errors.attendees?.message}>
            <input
              type="number"
              min="1"
              max={selected?.capacity ?? 100}
              readOnly={selected?.type === 'desk'}
              {...form.register('attendees', { valueAsNumber: true })}
            />
          </Field>
          {selected?.equipment.length ? (
            <fieldset className="checkbox-group">
              <legend>Required equipment</legend>
              {[
                ...new Set(
                  selected.equipment.filter((e) => e.state === 'working').map((e) => e.category),
                ),
              ].map((category) => (
                <label key={category}>
                  <input type="checkbox" value={category} {...form.register('requirements')} />
                  {equipmentLabels[category] ?? category}
                </label>
              ))}
            </fieldset>
          ) : null}
          <Field label="Comment">
            <textarea rows={2} placeholder="Optional" {...form.register('comment')} />
          </Field>
          <p className="form-hint">15 minutes to 8 hours, between 08:00 and 22:00.</p>
          <div className="form-actions">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              Continue <ArrowRight size={16} />
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
const ticketSchema = z.object({
  space_id: z.string().min(1, 'Select a space'),
  equipment_id: z.string(),
  title: z.string().trim().min(3, 'At least 3 characters').max(140),
  description: z.string().trim().min(3, 'Describe the issue').max(5000),
  category: z.enum(['equipment', 'climate', 'cleaning', 'other']),
  priority: z.enum(['low', 'normal', 'high']),
});
type TicketValues = z.infer<typeof ticketSchema>;
export function TicketModal({ onClose, space }: { onClose: () => void; space?: Space }) {
  const command = useCommand();
  const form = useForm<TicketValues>({
    resolver: zodResolver(ticketSchema),
    defaultValues: {
      space_id: space?.id ?? '',
      equipment_id: '',
      title: '',
      description: '',
      category: 'equipment',
      priority: 'normal',
    },
  });
  const spaces = useQuery({
    queryKey: ['spaces', 'all'],
    queryFn: () => api<Space[]>('/spaces?limit=100'),
  });
  const selected = spaces.data?.find((s) => s.id === form.watch('space_id'));
  return (
    <Modal
      open
      onClose={onClose}
      title="Report an issue"
      description="Your ticket goes to the dispatcher. It does not block the space."
    >
      <form
        className="form-stack"
        onSubmit={form.handleSubmit(async ({ equipment_id, ...v }) => {
          try {
            await command.mutateAsync({
              path: '/tickets',
              body: { ...v, ...(equipment_id ? { equipment_id } : {}) },
            });
            onClose();
          } catch {
            /* displayed */
          }
        })}
      >
        <Field label="Space" error={form.formState.errors.space_id?.message}>
          <select
            {...form.register('space_id')}
            onChange={(e) => {
              form.setValue('space_id', e.target.value);
              form.setValue('equipment_id', '');
            }}
          >
            <option value="">Select a space</option>
            {spaces.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        {spaces.error && <ErrorState error={spaces.error} retry={spaces.refetch} />}
        <Field label="Subject" error={form.formState.errors.title?.message}>
          <input placeholder="What happened?" {...form.register('title')} />
        </Field>
        <Field label="Description" error={form.formState.errors.description?.message}>
          <textarea rows={3} {...form.register('description')} />
        </Field>
        <div className="form-grid">
          <Field label="Category">
            <select {...form.register('category')}>
              <option value="equipment">Equipment</option>
              <option value="climate">Climate</option>
              <option value="cleaning">Cleaning</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Priority">
            <select {...form.register('priority')}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </Field>
        </div>
        <Field label="Equipment">
          <select {...form.register('equipment_id')}>
            <option value="">No specific equipment</option>
            {selected?.equipment.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
        <FormError error={command.error} />
        <div className="form-actions">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={command.isPending}>Submit ticket</Button>
        </div>
      </form>
    </Modal>
  );
}
export function BlockModal({
  space,
  slot,
  onClose,
}: {
  space: Space;
  slot: ReturnType<typeof defaultSlot>;
  onClose: () => void;
}) {
  const command = useCommand();
  const [date, setDate] = useState(slot.date),
    [endDate, setEndDate] = useState(slot.date),
    [start, setStart] = useState(slot.start),
    [end, setEnd] = useState(slot.end),
    [reason, setReason] = useState('');
  return (
    <Modal
      open
      onClose={onClose}
      title={'Restrict availability · ' + space.name}
      description="Affected meetings will be marked as needing relocation."
    >
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await command.mutateAsync({
              path: `/spaces/${space.id}/blocks`,
              body: { starts_at: isoTime(date, start), ends_at: isoTime(endDate, end), reason },
            });
            onClose();
          } catch {
            /* displayed */
          }
        }}
      >
        <div className="form-grid">
          <Field label="Start date">
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Start time">
            <input type="time" required value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="End date">
            <input
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
          <Field label="End time">
            <input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <Field label="Reason">
          <textarea
            required
            minLength={3}
            maxLength={1000}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="For example, ventilation repairs"
          />
        </Field>
        <FormError error={command.error} />
        <div className="form-actions">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={command.isPending}>Restrict availability</Button>
        </div>
      </form>
    </Modal>
  );
}
export function RelocationModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const alternatives = useQuery({
    queryKey: ['alternatives', booking.id, booking.version],
    queryFn: () => api<Space[]>(`/bookings/${booking.id}/alternatives`),
  });
  const command = useCommand();
  const [selected, setSelected] = useState('');
  return (
    <Modal
      open
      onClose={onClose}
      title="Find an alternative"
      description={`${booking.title} · ${formatDay(booking.starts_at)} · ${formatTime(booking.starts_at)}–${formatTime(booking.ends_at)}`}
    >
      <p className="info-note">
        The meeting owner must confirm the relocation. A proposal does not reserve the room.
      </p>
      {alternatives.isPending ? (
        <Loading />
      ) : alternatives.error ? (
        <ErrorState error={alternatives.error} retry={alternatives.refetch} />
      ) : !alternatives.data?.length ? (
        <Empty title="No suitable spaces available">
          Adjust the meeting details or cancel the booking.
        </Empty>
      ) : (
        <div className="alternative-list">
          {alternatives.data.map((s) => (
            <label key={s.id} className={'alternative ' + (selected === s.id ? 'selected' : '')}>
              <input
                type="radio"
                name="alternative"
                value={s.id}
                onChange={() => setSelected(s.id)}
              />
              <strong>{s.name}</strong>
              <span>
                Floor {s.floor_number} · {s.capacity} seats
              </span>
            </label>
          ))}
        </div>
      )}
      <FormError error={command.error} />
      <div className="form-actions">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button
          disabled={!selected || command.isPending}
          onClick={async () => {
            try {
              await command.mutateAsync({
                path: `/bookings/${booking.id}/relocation-proposals`,
                body: { space_id: selected, version: booking.version },
              });
              onClose();
            } catch {
              /* displayed */
            }
          }}
        >
          Propose relocation
        </Button>
      </div>
    </Modal>
  );
}
export function HistoryModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const history = useQuery({
    queryKey: ['history', booking.id],
    queryFn: () => api<History[]>(`/bookings/${booking.id}/history`),
  });
  return (
    <Modal open onClose={onClose} title="Booking history" description={booking.title}>
      {history.isPending ? (
        <Loading />
      ) : history.error ? (
        <ErrorState error={history.error} retry={history.refetch} />
      ) : (
        <div className="timeline">
          {history.data?.map((h) => (
            <div key={h.id}>
              <span />
              <section>
                <strong>{auditLabels[h.action] ?? h.action}</strong>
                <p>
                  {h.actor} · {formatDay(h.created_at)}, {formatTime(h.created_at)}
                </p>
              </section>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
