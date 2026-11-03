import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarCheck, ChartNoAxesCombined, Clock3, LifeBuoy } from 'lucide-react';
import { api, qs } from '../lib/api';
import { localDate, TZ } from '../lib/time';
import { DateTime } from 'luxon';
import { Empty, ErrorState, Loading, PageTitle } from '../components/shared';
interface Analytics {
  active_bookings: number;
  cancelled_bookings: number;
  open_tickets: number;
  avg_resolution_hours: number | null;
  utilization: number | null;
  spaces: {
    id: string;
    name: string;
    available_minutes: number;
    booked_minutes: number;
    utilization: number | null;
  }[];
}
export function AnalyticsPage() {
  const [period, setPeriod] = useState('week'),
    [date, setDate] = useState(localDate().toISODate()!);
  const d = DateTime.fromISO(date, { zone: TZ }).startOf(period === 'week' ? 'week' : 'month');
  const range = {
    from: d.toISO()!,
    to: d.plus(period === 'week' ? { weeks: 1 } : { months: 1 }).toISO()!,
  };
  const query = useQuery({
    queryKey: ['analytics', range],
    queryFn: () => api<Analytics>('/analytics/overview' + qs(range)),
  });
  const data = query.data;
  const metrics = [
    {
      label: 'Active bookings',
      value: data?.active_bookings ?? '—',
      note: `${data?.cancelled_bookings ?? 0} cancelled in this period`,
      icon: CalendarCheck,
      color: 'green',
    },
    {
      label: 'Meeting room utilization',
      value: data?.utilization == null ? 'No data' : data.utilization + '%',
      note: 'Booked / available minutes',
      icon: ChartNoAxesCombined,
      color: 'lavender',
    },
    {
      label: 'Open tickets',
      value: data?.open_tickets ?? '—',
      note: 'New and in progress · right now',
      icon: LifeBuoy,
      color: 'peach',
    },
    {
      label: 'Average resolution time',
      value:
        data?.avg_resolution_hours == null
          ? 'No data'
          : data.avg_resolution_hours.toFixed(1) + ' h',
      note: 'Tickets resolved in this period',
      icon: Clock3,
      color: 'sand',
    },
  ];
  return (
    <>
      <PageTitle
        eyebrow="YOUR WORKSPACE IN NUMBERS"
        title="Analytics"
        description="Understand how your team plans and uses the office."
      >
        <div className="segmented">
          <button className={period === 'week' ? 'selected' : ''} onClick={() => setPeriod('week')}>
            Week
          </button>
          <button
            className={period === 'month' ? 'selected' : ''}
            onClick={() => setPeriod('month')}
          >
            Month
          </button>
        </div>
        <input
          aria-label="Analytics period"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </PageTitle>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : (
        <>
          <div className="metrics-grid">
            {metrics.map((m) => (
              <div className="metric" key={m.label}>
                <div>
                  <span>{m.label}</span>
                  <span className={'stat-icon ' + m.color}>
                    <m.icon size={18} />
                  </span>
                </div>
                <strong>{m.value}</strong>
                <p>{m.note}</p>
              </div>
            ))}
          </div>
          <div className="content-card analytics-chart">
            <div className="card-heading">
              <div>
                <div className="eyebrow">BOOKINGS / AVAILABLE TIME</div>
                <h3>Meeting room utilization</h3>
              </div>
              <span className="muted">
                {d.setLocale('en-GB').toFormat('d MMM')} —{' '}
                {d
                  .plus(period === 'week' ? { days: 6 } : { months: 1 })
                  .minus(period === 'month' ? { days: 1 } : {})
                  .setLocale('en-GB')
                  .toFormat('d MMM yyyy')}
              </span>
            </div>
            {!data?.spaces.length ? (
              <Empty title="No data yet" />
            ) : (
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.spaces}
                    margin={{ top: 12, right: 15, left: -15, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#eaedf0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12} />
                    <YAxis
                      unit="%"
                      domain={[0, 100]}
                      axisLine={false}
                      tickLine={false}
                      fontSize={12}
                    />
                    <Tooltip
                      formatter={(value) => [
                        value == null ? 'No data' : value + '%',
                        'Utilization',
                      ]}
                      contentStyle={{ borderRadius: 12, border: '1px solid #e6e8ed' }}
                    />
                    <Bar
                      dataKey="utilization"
                      fill="#5e6ad2"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={58}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          <div className="content-card">
            <div className="card-heading">
              <h3>Space breakdown</h3>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Meeting room</th>
                    <th>Booked</th>
                    <th>Available</th>
                    <th>Utilization</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.spaces.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.name}</strong>
                      </td>
                      <td>{Math.round(s.booked_minutes)} min</td>
                      <td>{Math.round(s.available_minutes)} min</td>
                      <td>
                        <div className="utilization">
                          <div>
                            <span style={{ width: (s.utilization ?? 0) + '%' }} />
                          </div>
                          {s.utilization == null ? 'No data' : s.utilization + '%'}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="page-footnote">
            These figures describe bookings. Restricted periods are excluded from available working
            time, including overlapping restrictions.
          </p>
        </>
      )}
    </>
  );
}
