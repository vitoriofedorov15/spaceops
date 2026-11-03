import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Monitor, Plus, Search } from 'lucide-react';
import { api, qs, useCommand } from '../lib/api';
import { Equipment, equipmentLabels, Space, stateLabels } from '../lib/types';
import { useUser } from '../lib/session';
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
function AddEquipment({ onClose }: { onClose: () => void }) {
  const command = useCommand();
  const spaces = useQuery({
    queryKey: ['spaces', 'all'],
    queryFn: () => api<Space[]>('/spaces?limit=100'),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Add equipment"
      description="Equipment is assigned to a space."
    >
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await command.mutateAsync({ path: '/equipment', body: Object.fromEntries(f) });
            onClose();
          } catch {
            /* displayed */
          }
        }}
      >
        <Field label="Name">
          <input name="name" required maxLength={100} placeholder="For example, Epson projector" />
        </Field>
        <Field label="Asset number">
          <input name="inventory_number" required maxLength={50} placeholder="SP-0001" />
        </Field>
        <Field label="Category">
          <select name="category">
            {Object.entries(equipmentLabels).map(([k, v]) => (
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Space">
          <select name="space_id" required>
            <option value="">Select a space</option>
            {spaces.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        {spaces.error && <ErrorState error={spaces.error} retry={spaces.refetch} />}
        <FormError error={command.error} />
        <div className="form-actions">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={command.isPending}>Add</Button>
        </div>
      </form>
    </Modal>
  );
}
export function EquipmentPage() {
  const user = useUser();
  const [search, setSearch] = useState(''),
    [state, setState] = useState(''),
    [category, setCategory] = useState(''),
    [page, setPage] = useState(1),
    [create, setCreate] = useState(false);
  const command = useCommand();
  const query = useQuery({
    queryKey: ['equipment', search, state, category, page],
    queryFn: () =>
      api<Equipment[]>(
        '/equipment' +
          qs({ search, state: state || undefined, category: category || undefined, page }),
      ),
  });
  return (
    <>
      <PageTitle
        eyebrow="TOOLS FOR YOUR IDEAS"
        title="Equipment"
        description="Everything you need, with a clear status and location."
      >
        {user.role !== 'employee' && (
          <Button onClick={() => setCreate(true)}>
            <Plus size={17} />
            Add equipment
          </Button>
        )}
      </PageTitle>
      <div className="section-toolbar">
        <label className="search-input">
          <Search size={16} />
          <input
            aria-label="Search equipment"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Name or asset number"
          />
        </label>
        <div className="inline-controls">
          <select
            aria-label="Equipment category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            {Object.entries(equipmentLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            aria-label="Equipment status"
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Any status</option>
            {Object.entries(stateLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
      <FormError error={command.error} />
      <div className="content-card">
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} retry={query.refetch} />
        ) : !query.data?.length ? (
          <Empty title="No equipment found">Try changing your search filters.</Empty>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Equipment</th>
                    <th>Asset number</th>
                    <th>Location</th>
                    <th>Condition</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <div className="equipment-name">
                          <span className="stat-icon lavender">
                            <Monitor size={18} />
                          </span>
                          <div>
                            <strong>{e.name}</strong>
                            <small>{equipmentLabels[e.category] ?? e.category}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <code>{e.inventory_number}</code>
                      </td>
                      <td>
                        <strong>{e.space_name}</strong>
                        <small>Floor {e.floor_number}</small>
                      </td>
                      <td>
                        {user.role === 'employee' ? (
                          <Badge
                            kind={
                              e.state === 'working'
                                ? 'available'
                                : e.state === 'broken'
                                  ? 'danger'
                                  : 'warning'
                            }
                          >
                            {stateLabels[e.state]}
                          </Badge>
                        ) : (
                          <select
                            aria-label={'Condition ' + e.inventory_number}
                            value={e.state}
                            disabled={command.isPending}
                            onChange={(v) =>
                              command.mutate({
                                path: `/equipment/${e.id}`,
                                method: 'PATCH',
                                body: { state: v.target.value },
                              })
                            }
                          >
                            {Object.entries(stateLabels).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        )}
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
      {create && <AddEquipment onClose={() => setCreate(false)} />}
    </>
  );
}
