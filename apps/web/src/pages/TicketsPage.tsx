import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, LifeBuoy, MessageCircle, Plus } from 'lucide-react';
import { api, qs, useCommand } from '../lib/api';
import { auditLabels, Ticket, ticketLabels, User } from '../lib/types';
import { useUser } from '../lib/session';
import { formatDay, formatTime } from '../lib/time';
import {
  Badge,
  Empty,
  ErrorState,
  Field,
  FormError,
  Loading,
  NextButton,
  PageTitle,
} from '../components/shared';
import { Button } from '../components/ui/button';
import { Modal } from '../components/ui/dialog';
import { TicketModal } from '../components/forms';
export function TicketDetails({ id, onClose }: { id: string; onClose: () => void }) {
  const user = useUser();
  const isManager = user.role !== 'employee';
  const [comment, setComment] = useState(''),
    [reopen, setReopen] = useState('');
  const command = useCommand();
  const query = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => api<Ticket>(`/tickets/${id}`),
  });
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api<User[]>('/users?limit=100'),
    enabled: isManager,
  });
  const t = query.data;
  const patch = (body: unknown) =>
    command.mutate({ path: `/tickets/${id}`, method: 'PATCH', body });
  return (
    <Modal
      open
      onClose={onClose}
      title={t?.title ?? 'Ticket'}
      description={
        t
          ? `Ticket created on ${formatDay(t.created_at)} · ${ticketLabels[t.status]}`
          : 'Loading ticket'
      }
      wide
    >
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : (
        t && (
          <>
            <div className="ticket-meta">
              <Badge
                kind={
                  t.status === 'resolved' ? 'available' : t.status === 'new' ? 'warning' : 'neutral'
                }
              >
                {ticketLabels[t.status]}
              </Badge>
              <span>
                Priority: {t.priority === 'high' ? 'high' : t.priority === 'low' ? 'low' : 'normal'}
              </span>
            </div>
            <p className="ticket-description">{t.description}</p>
            {isManager && (
              <div className="ticket-manage">
                <Field label="Assignee">
                  <select
                    value={t.assignee_id ?? ''}
                    disabled={command.isPending}
                    onChange={(e) => patch({ assignee_id: e.target.value || null })}
                  >
                    <option value="">Unassigned</option>
                    {users.data
                      ?.filter((u) => u.role !== 'employee')
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </Field>
                {users.error && <ErrorState error={users.error} retry={users.refetch} />}
                <div className="form-actions">
                  {t.status === 'new' && (
                    <Button
                      disabled={command.isPending}
                      onClick={() =>
                        patch({ status: 'in_progress', assignee_id: t.assignee_id ?? user.id })
                      }
                    >
                      Start work
                    </Button>
                  )}
                  {t.status === 'in_progress' && (
                    <Button
                      disabled={command.isPending}
                      onClick={() => patch({ status: 'resolved' })}
                    >
                      Mark as resolved
                    </Button>
                  )}
                  {t.status === 'resolved' && (
                    <Button
                      disabled={command.isPending}
                      onClick={() => patch({ status: 'closed' })}
                    >
                      Close ticket
                    </Button>
                  )}
                </div>
                {t.status === 'closed' && (
                  <form
                    className="inline-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      patch({
                        status: 'in_progress',
                        assignee_id: t.assignee_id ?? user.id,
                        comment: reopen,
                      });
                    }}
                  >
                    <input
                      required
                      minLength={3}
                      value={reopen}
                      onChange={(e) => setReopen(e.target.value)}
                      placeholder="Reason for reopening"
                      aria-label="Reason for reopening"
                    />
                    <Button disabled={command.isPending}>Reopen ticket</Button>
                  </form>
                )}
              </div>
            )}
            <FormError error={command.error} />
            <h4 className="section-heading">
              <MessageCircle size={17} />
              Discussion
            </h4>
            <div className="comments">
              {!t.comments?.length ? (
                <p className="muted">No comments yet.</p>
              ) : (
                t.comments.map((c) => (
                  <div className="comment" key={c.id}>
                    <strong>{c.author_name}</strong>
                    <small>
                      {formatDay(c.created_at)} · {formatTime(c.created_at)}
                    </small>
                    <p>{c.body}</p>
                  </div>
                ))
              )}
            </div>
            <form
              className="inline-form"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await command.mutateAsync({
                    path: `/tickets/${id}/comments`,
                    body: { body: comment },
                  });
                  setComment('');
                } catch {
                  /* displayed */
                }
              }}
            >
              <input
                aria-label="Comment"
                required
                maxLength={3000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment…"
              />
              <Button disabled={command.isPending}>Send</Button>
            </form>
            <h4 className="section-heading">Change history</h4>
            <div className="timeline">
              {t.history?.map((h) => (
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
          </>
        )
      )}
    </Modal>
  );
}
export function TicketsPage() {
  const user = useUser();
  const [status, setStatus] = useState(''),
    [page, setPage] = useState(1),
    [create, setCreate] = useState(false),
    [selected, setSelected] = useState('');
  const query = useQuery({
    queryKey: ['tickets', status, page],
    queryFn: () => api<Ticket[]>('/tickets' + qs({ status: status || undefined, page })),
  });
  return (
    <>
      <PageTitle
        eyebrow="TAKING CARE OF YOUR WORKSPACE"
        title="Support tickets"
        description={
          user.role === 'employee'
            ? 'Tell us what’s wrong. We’ll take care of the rest.'
            : 'A shared queue for workplace issues and team support.'
        }
      >
        <Button onClick={() => setCreate(true)}>
          <Plus size={17} />
          Create a ticket
        </Button>
      </PageTitle>
      <div className="section-toolbar">
        <div className="segmented wrap">
          {[['', 'All tickets'], ...Object.entries(ticketLabels)].map(([key, label]) => (
            <button
              key={key}
              className={status === key ? 'selected' : ''}
              onClick={() => {
                setStatus(key);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="muted">
          <LifeBuoy size={15} /> {user.role === 'employee' ? 'My tickets' : 'Dispatcher queue'}
        </span>
      </div>
      <div className="content-card">
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} retry={query.refetch} />
        ) : !query.data?.length ? (
          <Empty title="Everything is looking good">No tickets with this status.</Empty>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>Location</th>
                    <th>Status</th>
                    <th>Assignee</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <button className="table-link" onClick={() => setSelected(t.id)}>
                          <strong>{t.title}</strong>
                          <ArrowUpRight size={14} />
                        </button>
                        <small>
                          {t.author_name} ·{' '}
                          {t.priority === 'high'
                            ? 'High priority'
                            : t.priority === 'low'
                              ? 'Low priority'
                              : 'Normal priority'}
                        </small>
                      </td>
                      <td>
                        <strong>{t.space_name}</strong>
                        <small>{t.equipment_name ?? 'Space'}</small>
                      </td>
                      <td>
                        <Badge
                          kind={
                            t.status === 'new'
                              ? 'warning'
                              : t.status === 'resolved'
                                ? 'available'
                                : 'neutral'
                          }
                        >
                          {ticketLabels[t.status]}
                        </Badge>
                      </td>
                      <td>{t.assignee_name ?? 'Unassigned'}</td>
                      <td>
                        {formatDay(t.created_at)}
                        <small>{formatTime(t.created_at)}</small>
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
      {create && <TicketModal onClose={() => setCreate(false)} />}{' '}
      {selected && <TicketDetails id={selected} onClose={() => setSelected('')} />}
    </>
  );
}
