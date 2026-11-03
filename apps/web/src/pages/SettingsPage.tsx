import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Pencil, ShieldCheck } from 'lucide-react';
import { api, useCommand } from '../lib/api';
import { roleLabels, Space, User } from '../lib/types';
import { useUser } from '../lib/session';
import { Badge, ErrorState, Field, FormError, Loading, PageTitle } from '../components/shared';
import { Button } from '../components/ui/button';
import { Modal } from '../components/ui/dialog';
function EditSpace({ space, onClose }: { space: Space; onClose: () => void }) {
  const command = useCommand();
  return (
    <Modal open onClose={onClose} title="Space settings" description={space.name}>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await command.mutateAsync({
              path: `/spaces/${space.id}`,
              method: 'PATCH',
              body: {
                name: f.get('name'),
                capacity: Number(f.get('capacity')),
                archived: f.get('archived') === 'on',
              },
            });
            onClose();
          } catch {
            /* displayed */
          }
        }}
      >
        <Field label="Name">
          <input name="name" defaultValue={space.name} required maxLength={100} />
        </Field>
        <Field label="Capacity">
          <input
            name="capacity"
            type="number"
            min="1"
            max="100"
            defaultValue={space.capacity}
            readOnly={space.type === 'desk'}
            required
          />
        </Field>
        <label className="checkbox-label">
          <input type="checkbox" name="archived" defaultChecked={space.archived} />
          Archive this space
        </label>
        <p className="form-hint">
          Move affected meetings before archiving or reducing capacity. History is preserved.
        </p>
        <FormError error={command.error} />
        <div className="form-actions">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={command.isPending}>Save changes</Button>
        </div>
      </form>
    </Modal>
  );
}
export function SettingsPage() {
  const user = useUser();
  const [edit, setEdit] = useState<Space | null>(null);
  const command = useCommand();
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api<User[]>('/users?limit=100'),
    enabled: user.role === 'admin',
  });
  const spaces = useQuery({
    queryKey: ['spaces', 'settings'],
    queryFn: () => api<Space[]>('/spaces?limit=100&include_archived=true'),
    enabled: user.role !== 'employee',
  });
  const site = useQuery({
    queryKey: ['site'],
    queryFn: () =>
      api<{ name: string; timezone: string; opens_at: string; closes_at: string }>('/site'),
  });
  return (
    <>
      <PageTitle
        eyebrow="YOUR WORKSPACE"
        title="Settings"
        description="Your profile, site details and access management."
      />
      <div className="operations-grid">
        <section className="content-card">
          <div className="card-heading">
            <h3>My profile</h3>
            <ShieldCheck size={18} />
          </div>
          <div className="settings-body">
            <div className="profile-heading">
              <div className="avatar large">
                {user.name
                  .split(' ')
                  .map((s) => s[0])
                  .join('')}
              </div>
              <div>
                <h3>{user.name}</h3>
                <p>{user.email}</p>
                <Badge>{roleLabels[user.role]}</Badge>
              </div>
            </div>
            <p className="muted">
              Accounts are created by the administrator. Permissions are checked by the server on
              every request.
            </p>
          </div>
        </section>
        <section className="content-card">
          <div className="card-heading">
            <h3>Site</h3>
            <Building2 size={18} />
          </div>
          <div className="settings-body">
            {site.isPending ? (
              <Loading />
            ) : site.error ? (
              <ErrorState error={site.error} retry={site.refetch} />
            ) : (
              <dl className="definition-list">
                <div>
                  <dt>Name</dt>
                  <dd>{site.data?.name}</dd>
                </div>
                <div>
                  <dt>Time zone</dt>
                  <dd>{site.data?.timezone}</dd>
                </div>
                <div>
                  <dt>Opening hours</dt>
                  <dd>
                    {site.data?.opens_at.slice(0, 5)}–{site.data?.closes_at.slice(0, 5)}, every day
                  </dd>
                </div>
                <div>
                  <dt>Data refresh</dt>
                  <dd>Every 30 seconds</dd>
                </div>
              </dl>
            )}
          </div>
        </section>
      </div>
      <FormError error={command.error} />
      {user.role === 'admin' && (
        <section className="content-card">
          <div className="card-heading">
            <h3>Users & roles</h3>
          </div>
          {users.isPending ? (
            <Loading />
          ) : users.error ? (
            <ErrorState error={users.error} retry={users.refetch} />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {users.data?.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.name}</strong>
                      </td>
                      <td>{u.email}</td>
                      <td>
                        <select
                          aria-label={'Role ' + u.name}
                          value={u.role}
                          disabled={command.isPending}
                          onChange={(e) =>
                            command.mutate({
                              path: `/users/${u.id}/role`,
                              method: 'PATCH',
                              body: { role: e.target.value },
                            })
                          }
                        >
                          {Object.entries(roleLabels).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {user.role !== 'employee' && (
        <section className="content-card">
          <div className="card-heading">
            <h3>Spaces</h3>
            <Badge>History is preserved</Badge>
          </div>
          {spaces.isPending ? (
            <Loading />
          ) : spaces.error ? (
            <ErrorState error={spaces.error} retry={spaces.refetch} />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Floor</th>
                    <th>Capacity</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {spaces.data?.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.name}</strong>
                      </td>
                      <td>{s.type === 'room' ? 'Meeting room' : 'Desk'}</td>
                      <td>{s.floor_number}</td>
                      <td>{s.capacity}</td>
                      <td>
                        <Badge kind={s.archived ? 'neutral' : 'available'}>
                          {s.archived ? 'Archived' : 'Active'}
                        </Badge>
                      </td>
                      <td>
                        <Button variant="ghost" size="sm" onClick={() => setEdit(s)}>
                          <Pencil size={15} />
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {edit && <EditSpace space={edit} onClose={() => setEdit(null)} />}
    </>
  );
}
