import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ArrowUpRight, Check, Wrench } from 'lucide-react';
import { api, qs, useCommand } from '../lib/api';
import { Block, Booking, Proposal, Ticket } from '../lib/types';
import { useUser } from '../lib/session';
import { formatDay, formatTime, localDate } from '../lib/time';
import { Badge, Empty, ErrorState, FormError, Loading, PageTitle } from '../components/shared';
import { Button } from '../components/ui/button';
import { Modal } from '../components/ui/dialog';
import { HistoryModal, RelocationModal } from '../components/forms';
import { TicketDetails } from './TicketsPage';
export function OperationsPage() {
  const [relocation, setRelocation] = useState<Booking | null>(null),
    [ticketId, setTicketId] = useState(''),
    [history, setHistory] = useState<Booking | null>(null),
    [cancel, setCancel] = useState<Booking | null>(null);
  const command = useCommand();
  const user = useUser();
  const range = {
    from: localDate().startOf('day').toISO()!,
    to: localDate().startOf('day').plus({ days: 90 }).toISO()!,
  };
  const query = useQuery({
    queryKey: ['operations', range],
    queryFn: async () => {
      const [blocks, bookings, tickets, proposals] = await Promise.all([
        api<Block[]>('/blocks?limit=100'),
        api<Booking[]>(
          '/bookings' + qs({ ...range, status: 'active', needs_relocation: true, limit: 100 }),
        ),
        api<Ticket[]>('/tickets?status=new&limit=100'),
        api<Proposal[]>('/relocation-proposals?limit=100'),
      ]);
      return { blocks, bookings, tickets, proposals };
    },
  });
  const data = query.data;
  return (
    <>
      <PageTitle
        eyebrow="KEEP THINGS RUNNING SMOOTHLY"
        title="Operations"
        description="Help your team work without interruptions."
      >
        <Badge kind="available">
          <Check size={13} /> {user.name}
        </Badge>
      </PageTitle>
      <FormError error={command.error} />
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : (
        data && (
          <>
            <div className="metrics-grid compact">
              {[
                [data.tickets.length, 'New tickets'],
                [data.blocks.length, 'Active restrictions'],
                [data.bookings.length, 'Meetings need relocation'],
                [data.proposals.length, 'Proposals awaiting a response'],
              ].map(([n, label]) => (
                <div className="metric" key={label}>
                  <span>{label}</span>
                  <strong>{n}</strong>
                </div>
              ))}
            </div>
            <div className="content-card">
              <div className="card-heading">
                <div>
                  <div className="eyebrow">PRIORITY ACTIONS</div>
                  <h3>Meetings that need a new space</h3>
                </div>
                <Badge kind="warning">Next 90 days</Badge>
              </div>
              {!data.bookings.length ? (
                <Empty title="Every meeting has its place" />
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Meeting</th>
                        <th>Space</th>
                        <th>Time</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.bookings.map((b) => (
                        <tr key={b.id}>
                          <td>
                            <button className="table-link" onClick={() => setHistory(b)}>
                              <strong>{b.title}</strong>
                              <ArrowUpRight size={14} />
                            </button>
                          </td>
                          <td>{b.space_name}</td>
                          <td>
                            {formatDay(b.starts_at)}
                            <small>
                              {formatTime(b.starts_at)}–{formatTime(b.ends_at)}
                            </small>
                          </td>
                          <td>
                            <div className="row-actions">
                              <Button size="sm" onClick={() => setRelocation(b)}>
                                Find an alternative <ArrowRight size={14} />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setCancel(b)}>
                                Cancel
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="operations-grid">
              <div className="content-card">
                <div className="card-heading">
                  <h3>Availability restrictions</h3>
                  <Wrench size={17} />
                </div>
                {!data.blocks.length ? (
                  <Empty title="No restrictions" />
                ) : (
                  data.blocks.map((b) => (
                    <div className="operation-row" key={b.id}>
                      <div>
                        <strong>{b.space_name}</strong>
                        <p>{b.reason}</p>
                        <small>
                          Until {formatDay(b.ends_at)}, {formatTime(b.ends_at)}
                        </small>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={command.isPending}
                        onClick={() => command.mutate({ path: `/blocks/${b.id}/release` })}
                      >
                        Release
                      </Button>
                    </div>
                  ))
                )}
              </div>
              <div className="content-card">
                <div className="card-heading">
                  <h3>New tickets</h3>
                  <Badge>{data.tickets.length}</Badge>
                </div>
                {!data.tickets.length ? (
                  <Empty title="No new tickets" />
                ) : (
                  data.tickets.map((t) => (
                    <button
                      key={t.id}
                      className="operation-row clickable"
                      onClick={() => setTicketId(t.id)}
                    >
                      <div>
                        <strong>{t.title}</strong>
                        <p>
                          {t.space_name} · {t.author_name}
                        </p>
                      </div>
                      <ArrowUpRight size={17} />
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="content-card">
              <div className="card-heading">
                <h3>Awaiting confirmation</h3>
              </div>
              {!data.proposals.length ? (
                <Empty title="No pending proposals" />
              ) : (
                data.proposals.map((p) => (
                  <div key={p.id} className="operation-row">
                    <div>
                      <strong>{p.title}</strong>
                      <p>
                        {p.original_space_name} → {p.space_name} · {formatDay(p.starts_at)}
                      </p>
                    </div>
                    <Badge kind="warning">Waiting for the owner</Badge>
                  </div>
                ))
              )}
            </div>
            <p className="page-footnote">
              Up to 100 records per section. Create restrictions from space details on the floor
              plan.
            </p>
          </>
        )
      )}
      {relocation && <RelocationModal booking={relocation} onClose={() => setRelocation(null)} />}{' '}
      {ticketId && <TicketDetails id={ticketId} onClose={() => setTicketId('')} />}{' '}
      {history && <HistoryModal booking={history} onClose={() => setHistory(null)} />}{' '}
      {cancel && (
        <Modal
          open
          onClose={() => setCancel(null)}
          title="Cancel this meeting?"
          description={cancel.title}
        >
          <p>The owner will receive a cancellation notification.</p>
          <FormError error={command.error} />
          <div className="form-actions">
            <Button variant="outline" onClick={() => setCancel(null)}>
              Back
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
