import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  DoorOpen,
  LayoutGrid,
  List,
  Maximize,
  Minus,
  Monitor,
  Plus,
  Search,
  SlidersHorizontal,
  Users,
  Wifi,
  Wrench,
  X,
} from 'lucide-react';
import { api, qs } from '../lib/api';
import { Booking, equipmentLabels, Floor, Space, stateLabels } from '../lib/types';
import { dayRange, defaultSlot, formatTime, isoTime, localDate } from '../lib/time';
import { useUser } from '../lib/session';
import { Badge, Empty, ErrorState, Loading, PageTitle } from '../components/shared';
import { Button } from '../components/ui/button';
import { BlockModal, BookingModal, TicketModal } from '../components/forms';
export const spaceStatus = (s: Pick<Space, 'blocked' | 'occupied'>) =>
  s.blocked ? 'blocked' : s.occupied ? 'booked' : 'available';
const statusLabels = { available: 'Available', booked: 'Booked', blocked: 'Unavailable' };
export function FloorPage() {
  const user = useUser();
  const [floorId, setFloorId] = useState(''),
    [slot, setSlot] = useState(defaultSlot),
    [nowMode, setNowMode] = useState(false),
    [tick, setTick] = useState(Date.now()),
    [view, setView] = useState<'plan' | 'list'>(() =>
      window.matchMedia('(max-width: 900px)').matches ? 'list' : 'plan',
    );
  const [type, setType] = useState('all'),
    [capacity, setCapacity] = useState('1'),
    [equipment, setEquipment] = useState(''),
    [search, setSearch] = useState(''),
    [selectedId, setSelectedId] = useState(''),
    [zoom, setZoom] = useState(1),
    [modal, setModal] = useState<'booking' | 'ticket' | 'block' | null>(null),
    [newBooking, setNewBooking] = useState(false);
  useEffect(() => {
    const i = setInterval(() => setTick(Date.now()), 30000);
    return () => clearInterval(i);
  }, []);
  const range = useMemo(
    () =>
      nowMode
        ? { from: new Date(tick).toISOString(), to: new Date(tick + 1).toISOString() }
        : { from: isoTime(slot.date, slot.start), to: isoTime(slot.date, slot.end) },
    [nowMode, tick, slot],
  );
  const valid = !!range.from && !!range.to && range.to > range.from;
  const floors = useQuery({ queryKey: ['floors'], queryFn: () => api<Floor[]>('/floors') });
  const activeFloor = floorId || floors.data?.[0]?.id;
  const plan = useQuery({
    queryKey: ['plan', activeFloor, range],
    queryFn: () => api<{ spaces: Space[] }>(`/floors/${activeFloor}/plan` + qs(range)),
    enabled: !!activeFloor && valid,
  });
  useEffect(() => {
    setSelectedId('');
    setZoom(1);
  }, [activeFloor]);
  const spaces = plan.data?.spaces ?? [];
  const selected = spaces.find((s) => s.id === selectedId);
  const scheduleRange = dayRange(nowMode ? localDate().toISODate()! : slot.date);
  const schedule = useQuery({
    queryKey: ['bookings', 'schedule', selectedId, scheduleRange],
    queryFn: () =>
      api<Booking[]>(
        '/bookings' + qs({ ...scheduleRange, space_id: selectedId, status: 'active', limit: 100 }),
      ),
    enabled: !!selectedId,
  });
  const filtered = spaces.filter(
    (s) =>
      (type === 'all' || s.type === type) &&
      s.capacity >= Number(capacity) &&
      s.name.toLowerCase().includes(search.toLowerCase()) &&
      (!equipment || s.equipment.some((e) => e.category === equipment && e.state === 'working')),
  );
  const filterIds = new Set(filtered.map((s) => s.id));
  const free = spaces.filter((s) => spaceStatus(s) === 'available').length;
  const updateSlot = (v: Partial<typeof slot>) => {
    setNowMode(false);
    setSlot({ ...slot, ...v });
  };
  return (
    <>
      <PageTitle
        eyebrow="YOUR WORKSPACE, AT A GLANCE"
        title="Floor plan"
        description="Browse availability and book a room or desk."
      >
        <Button onClick={() => setNewBooking(true)}>
          <Plus size={17} />
          Book a space
        </Button>
      </PageTitle>
      <div className="summary-strip">
        <div className="summary-availability">
          <span className="status-dot" />
          <strong>
            {plan.data ? free : '—'}
            <small> / {spaces.length}</small>
          </strong>
          <span>available</span>
        </div>
        <div>
          <DoorOpen size={15} />
          <span>
            <strong>{spaces.filter((s) => s.type === 'room').length || '—'}</strong> meeting rooms
          </span>
        </div>
        <div>
          <Monitor size={15} />
          <span>
            <strong>{spaces.filter((s) => s.type === 'desk').length || '—'}</strong> desks
          </span>
        </div>
        <div className="summary-note">
          <span>{nowMode ? 'Current availability' : 'Availability for selected interval'}</span>
        </div>
      </div>
      <div className="floor-toolbar">
        <div className="floor-tabs" aria-label="Select floor">
          {floors.data?.map((f) => (
            <button
              key={f.id}
              className={activeFloor === f.id ? 'selected' : ''}
              onClick={() => setFloorId(f.id)}
            >
              Floor {String(f.number).padStart(2, '0')}
            </button>
          ))}
        </div>
        <div className="time-controls">
          <button
            className={'now-button ' + (nowMode ? 'selected' : '')}
            onClick={() => {
              setNowMode(true);
              setTick(Date.now());
            }}
          >
            <span className="status-dot" />
            Now
          </button>
          <label className="date-input">
            <CalendarDays size={15} />
            <input
              aria-label="Plan date"
              type="date"
              value={slot.date}
              onChange={(e) => updateSlot({ date: e.target.value })}
            />
          </label>
          <div className="time-inputs">
            <input
              aria-label="Time slot start"
              type="time"
              step="900"
              value={slot.start}
              onChange={(e) => updateSlot({ start: e.target.value })}
            />
            <span>—</span>
            <input
              aria-label="Time slot end"
              type="time"
              step="900"
              value={slot.end}
              onChange={(e) => updateSlot({ end: e.target.value })}
            />
          </div>
        </div>
      </div>
      <div className="filter-bar">
        <label className="search-input">
          <Search size={16} />
          <input
            aria-label="Find a space"
            placeholder="Find a space…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="filter-select">
          <SlidersHorizontal size={15} />
          <select aria-label="Space type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All spaces</option>
            <option value="room">Meeting rooms</option>
            <option value="desk">Desks</option>
          </select>
        </div>
        <select
          aria-label="Capacity"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
        >
          <option value="1">Any capacity</option>
          <option value="4">4+ people</option>
          <option value="6">6+ people</option>
          <option value="8">8+ people</option>
        </select>
        <select
          aria-label="Required equipment"
          value={equipment}
          onChange={(e) => setEquipment(e.target.value)}
        >
          <option value="">Equipment</option>
          {Object.entries(equipmentLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <div className="view-toggle">
          <button
            aria-label="Show floor plan"
            className={view === 'plan' ? 'selected' : ''}
            onClick={() => setView('plan')}
          >
            <LayoutGrid size={17} />
          </button>
          <button
            aria-label="Show list"
            className={view === 'list' ? 'selected' : ''}
            onClick={() => setView('list')}
          >
            <List size={18} />
          </button>
        </div>
      </div>
      {floors.error ? (
        <ErrorState error={floors.error} retry={floors.refetch} />
      ) : !valid ? (
        <div className="form-error">Choose a date and a time slot that ends after it starts.</div>
      ) : (
        <div className={'floor-workspace ' + (!selected ? 'without-selection' : '')}>
          <section className="map-card">
            <div className="map-heading">
              <div>
                <h3>{floors.data?.find((f) => f.id === activeFloor)?.name ?? 'Floor plan'}</h3>
                <span className="map-subtitle">
                  {filtered.length} spaces · select a room or desk
                </span>
              </div>
              <span className="map-mode-label">
                {view === 'plan' ? <LayoutGrid size={14} /> : <List size={14} />}{' '}
                {view === 'plan' ? 'Floor plan' : 'List'}
              </span>
            </div>
            {plan.isPending ? (
              <Loading />
            ) : plan.error ? (
              <ErrorState error={plan.error} retry={plan.refetch} />
            ) : !filtered.length ? (
              <Empty title="No spaces found">Try adjusting your filters.</Empty>
            ) : view === 'plan' ? (
              <div className="plan-container">
                <svg
                  viewBox={`${500 - 500 / zoom} ${310 - 310 / zoom} ${1000 / zoom} ${620 / zoom}`}
                  role="group"
                  aria-label="Floor plan. Select a meeting room or a desk."
                >
                  <defs>
                    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                      <circle cx="1" cy="1" r=".7" fill="#e6e8ed" />
                    </pattern>
                  </defs>
                  <rect width="1000" height="620" fill="url(#grid)" />
                  <path
                    d="M24 27H976V592H24Z"
                    fill="#fff"
                    stroke="#c9cfd8"
                    strokeWidth="4"
                    rx="12"
                  />
                  <path d="M28 255H972" stroke="#eff1f4" strokeWidth="2" />
                  <text x="42" y="277" className="svg-area-label">
                    MEETING ROOMS
                  </text>
                  <text x="380" y="291" className="svg-area-label">
                    OPEN SPACE / DESKS
                  </text>
                  <rect x="42" y="320" width="270" height="232" rx="14" fill="#f3f4f6" />
                  <rect x="66" y="347" width="70" height="28" rx="8" fill="#e0e3e9" />
                  <rect x="66" y="385" width="70" height="28" rx="8" fill="#e0e3e9" />
                  <rect x="152" y="347" width="55" height="66" rx="20" fill="#e5e8ee" />
                  <circle cx="241" cy="363" r="24" fill="#e0e4eb" />
                  <circle cx="241" cy="425" r="24" fill="#e0e4eb" />
                  <text x="68" y="465" fontSize="17" fontWeight="600" fill="#525a68">
                    Lounge area
                  </text>
                  <text x="68" y="489" fontSize="12" fill="#7a8290">
                    Shared seating & coffee
                  </text>
                  <text x="68" y="525" fontSize="12" fill="#9298a3">
                    LOUNGE
                  </text>
                  <text x="42" y="575" className="svg-area-label">
                    ENTRANCE
                  </text>
                  <text x="902" y="574" className="svg-area-label">
                    N
                  </text>
                  {spaces.map((s) => {
                    const g = s.geometry,
                      status = spaceStatus(s),
                      selected = s.id === selectedId;
                    return (
                      <g
                        key={s.id}
                        role="button"
                        tabIndex={filterIds.has(s.id) ? 0 : -1}
                        aria-label={`${s.name}, ${statusLabels[status]}, ${s.capacity} ${s.capacity === 1 ? 'seat' : 'seats'}`}
                        aria-pressed={selected}
                        className={`svg-space ${status} ${selected ? 'selected' : ''} ${!filterIds.has(s.id) ? 'dimmed' : ''}`}
                        onClick={() => {
                          if (filterIds.has(s.id)) setSelectedId(s.id);
                        }}
                        onKeyDown={(e) => {
                          if ((e.key === 'Enter' || e.key === ' ') && filterIds.has(s.id)) {
                            e.preventDefault();
                            setSelectedId(s.id);
                          }
                        }}
                        transform={`translate(${g.x},${g.y})`}
                      >
                        {s.type === 'room' ? (
                          <>
                            <polygon
                              className="space-shape"
                              points={`0,0 ${g.width},0 ${g.width},${g.height} 0,${g.height}`}
                              strokeLinejoin="round"
                            />
                            <path
                              d={`M${g.width / 2 - 16} ${g.height}h32`}
                              stroke="#fff"
                              strokeWidth="7"
                            />
                            <text x="16" y="29" className="svg-room-name">
                              {s.name}
                            </text>
                            <text x={g.width - 16} y="28" textAnchor="end" className="svg-capacity">
                              {s.capacity} people
                            </text>
                            <rect
                              x={g.width / 2 - 42}
                              y="65"
                              width="84"
                              height="47"
                              rx="8"
                              className="svg-table"
                            />
                            {[0, 1, 2].map((i) => (
                              <g key={i}>
                                <rect
                                  x={g.width / 2 - 32 + i * 25}
                                  y="54"
                                  width="16"
                                  height="7"
                                  rx="3"
                                  className="svg-chair"
                                />
                                <rect
                                  x={g.width / 2 - 32 + i * 25}
                                  y="116"
                                  width="16"
                                  height="7"
                                  rx="3"
                                  className="svg-chair"
                                />
                              </g>
                            ))}
                            <circle cx="20" cy={g.height - 24} r="4" className="svg-status-dot" />
                            <text x="31" y={g.height - 20} className="svg-status-text">
                              {statusLabels[status]}
                            </text>
                            {s.open_tickets > 0 && (
                              <g transform={`translate(${g.width - 28},${g.height - 34})`}>
                                <rect width="18" height="18" rx="5" fill="#ffe6a5" />
                                <text
                                  x="9"
                                  y="13"
                                  textAnchor="middle"
                                  fill="#946408"
                                  fontWeight="700"
                                >
                                  !
                                </text>
                              </g>
                            )}
                          </>
                        ) : (
                          <>
                            <rect
                              x="24"
                              y="-12"
                              width="28"
                              height="8"
                              rx="4"
                              className="svg-chair"
                            />
                            <rect
                              className="space-shape"
                              width={g.width}
                              height={g.height}
                              rx="6"
                            />
                            <rect x="24" y="8" width="28" height="4" rx="1" className="svg-table" />
                            <text
                              x={g.width / 2}
                              y="35"
                              textAnchor="middle"
                              className="svg-desk-name"
                            >
                              {s.name.replace('Desk ', 'D')}
                            </text>
                            <g
                              transform={`translate(${g.width - 13},7)`}
                              aria-hidden="true"
                              stroke="#738978"
                              strokeWidth="1.3"
                              strokeLinecap="round"
                              fill="none"
                            >
                              {status === 'available' ? (
                                <path d="M0 4L3 7L8 0" />
                              ) : status === 'booked' ? (
                                <circle cx="4" cy="4" r="3" fill="#8b9fc5" stroke="none" />
                              ) : (
                                <path d="M1 1L7 7M7 1L1 7" />
                              )}
                            </g>
                            {s.open_tickets > 0 && (
                              <circle cx={g.width - 6} cy="6" r="5" fill="#e9b73c" />
                            )}
                          </>
                        )}
                      </g>
                    );
                  })}
                </svg>
                <div className="zoom-controls">
                  <button
                    aria-label="Zoom out"
                    disabled={zoom <= 1}
                    onClick={() => setZoom(Math.max(1, zoom - 0.25))}
                  >
                    <Minus size={16} />
                  </button>
                  <span>{Math.round(zoom * 100)}%</span>
                  <button
                    aria-label="Zoom in"
                    disabled={zoom >= 2}
                    onClick={() => setZoom(Math.min(2, zoom + 0.25))}
                  >
                    <Plus size={16} />
                  </button>
                  <button aria-label="Reset zoom" onClick={() => setZoom(1)}>
                    <Maximize size={15} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-list">
                {filtered.map((s) => (
                  <button
                    className={'space-list-item ' + (s.id === selectedId ? 'selected' : '')}
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                  >
                    <span className={'room-symbol ' + spaceStatus(s)}>
                      {s.type === 'room' ? <DoorOpen size={22} /> : <Monitor size={22} />}
                    </span>
                    <span>
                      <strong>{s.name}</strong>
                      <small>
                        {s.type === 'room' ? 'Meeting room' : 'Desk'} · {s.capacity}{' '}
                        {s.capacity === 1 ? 'seat' : 'seats'}
                      </small>
                    </span>
                    <Badge kind={spaceStatus(s)}>{statusLabels[spaceStatus(s)]}</Badge>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            )}
            <div className="map-legend">
              <span>
                <i className="available" />
                Available
              </span>
              <span>
                <i className="booked" />
                Booked
              </span>
              <span>
                <i className="blocked" />
                Unavailable
              </span>
              <span>
                <i className="issue">!</i>Open ticket
              </span>
              <CircleHelp size={15} className="legend-help" />
            </div>
          </section>
          <aside className="detail-panel">
            {selected ? (
              <>
                <div className="detail-cover">
                  <span className="detail-type-icon">
                    {selected.type === 'room' ? <DoorOpen size={19} /> : <Monitor size={19} />}
                  </span>
                  <span>Space details</span>
                  <button
                    className="icon-button"
                    aria-label="Close details"
                    onClick={() => setSelectedId('')}
                  >
                    <X size={17} />
                  </button>
                </div>
                <div className="detail-body">
                  <div className="eyebrow">
                    {selected.type === 'room' ? 'MEETING ROOM' : 'DESK'}
                  </div>
                  <div className="detail-title-row">
                    <h2>{selected.name}</h2>
                    <Badge kind={spaceStatus(selected)}>
                      {statusLabels[spaceStatus(selected)]}
                    </Badge>
                  </div>
                  <p className="muted">
                    Floor {floors.data?.find((f) => f.id === activeFloor)?.number}{' '}
                    <span className="separator">·</span> <Users size={14} /> {selected.capacity}{' '}
                    {selected.capacity === 1 ? 'seat' : 'seats'}
                  </p>
                  <div className="detail-divider" />
                  <h4>Equipment</h4>
                  <div className="equipment-chips">
                    {selected.equipment.length ? (
                      selected.equipment.map((e) => (
                        <span key={e.id} className={e.state === 'working' ? '' : 'faulty'}>
                          <Monitor size={14} />
                          {equipmentLabels[e.category] ?? e.name}
                          {e.state !== 'working' && <small>{stateLabels[e.state]}</small>}
                        </span>
                      ))
                    ) : (
                      <span>
                        <Wifi size={14} />
                        Wi-Fi and power
                      </span>
                    )}
                  </div>
                  {selected.open_tickets > 0 && (
                    <div className="warning-note">
                      <Wrench size={16} />
                      Open tickets: {selected.open_tickets}
                    </div>
                  )}
                  <div className="detail-divider" />
                  <div className="section-title">
                    <h4>Daily schedule</h4>
                    <CalendarDays size={15} />
                  </div>
                  {schedule.isPending ? (
                    <Loading />
                  ) : schedule.error ? (
                    <ErrorState error={schedule.error} retry={schedule.refetch} />
                  ) : !schedule.data?.length ? (
                    <div className="schedule-empty">
                      <Check size={16} />
                      No bookings on this day
                    </div>
                  ) : (
                    <div className="schedule-list">
                      {schedule.data.map((b) => (
                        <div key={b.id}>
                          <span>
                            {formatTime(b.starts_at)}
                            <small>{formatTime(b.ends_at)}</small>
                          </span>
                          <section>
                            <strong>{b.title}</strong>
                            <small>{b.needs_relocation ? 'Relocation needed' : 'Booked'}</small>
                          </section>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button
                    className="full"
                    disabled={spaceStatus(selected) !== 'available'}
                    onClick={() => setModal('booking')}
                  >
                    <Plus size={16} />
                    Book this {selected.type === 'desk' ? 'desk' : 'room'}
                  </Button>
                  <Button className="full" variant="ghost" onClick={() => setModal('ticket')}>
                    Report an issue <ArrowUpRight size={15} />
                  </Button>
                  {user.role !== 'employee' && (
                    <Button variant="outline" className="full" onClick={() => setModal('block')}>
                      <Wrench size={15} />
                      Restrict availability
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <div className="detail-placeholder">
                <DoorOpen size={24} />
                <h3>Select a space</h3>
                <p>Choose a room or desk to view its equipment, schedule and booking options.</p>
              </div>
            )}
          </aside>
        </div>
      )}
      <div className="page-footnote">
        <Check size={14} /> Availability is checked again when you book.
      </div>
      {newBooking && (
        <BookingModal onClose={() => setNewBooking(false)} slot={nowMode ? defaultSlot() : slot} />
      )}{' '}
      {selected && modal === 'booking' && (
        <BookingModal
          space={selected}
          slot={nowMode ? defaultSlot() : slot}
          onClose={() => setModal(null)}
        />
      )}{' '}
      {selected && modal === 'ticket' && (
        <TicketModal space={selected} onClose={() => setModal(null)} />
      )}{' '}
      {selected && modal === 'block' && (
        <BlockModal
          space={selected}
          slot={nowMode ? defaultSlot() : slot}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
