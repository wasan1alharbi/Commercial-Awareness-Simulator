import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, ReferenceLine } from 'recharts';

export default function KPIDashboard({ sessionId }: { sessionId: Id<'quizSessions'> }) {
  const kpiSnapshot = useQuery(api.simulator.index.getKpiSnapshotPublic, { sessionId });

  if (kpiSnapshot === undefined) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="font-body text-brown-400 text-sm">Loading KPIs...</p>
      </div>
    );
  }

  if (kpiSnapshot === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="font-body text-brown-400 text-sm">No KPI data yet.</p>
      </div>
    );
  }

  const kpis = [
    { name: 'Profit', value: kpiSnapshot.profit },
    { name: 'Market Share', value: kpiSnapshot.marketShare },
    { name: 'Liquidity', value: kpiSnapshot.liquidity },
    { name: 'Trust', value: kpiSnapshot.trust },
    { name: 'Compliance', value: kpiSnapshot.compliance },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full px-6">
      <h2 className="font-display text-2xl text-white mb-6">KPI Dashboard</h2>
      <div className="w-full" aria-label={'KPI scores: ' + kpis.map((d) => d.name + ' ' + d.value).join(', ')} role="img">
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={kpis} layout="vertical" margin={{ top: 10, right: 40, bottom: 10, left: 10 }}>
            <XAxis type="number" domain={[-100, 100]} tick={{ fill: '#a89070', fontSize: 13 }} />
            <YAxis type="category" dataKey="name" tick={{ fill: '#d6cfc4', fontSize: 14 }} width={100} />
            <ReferenceLine x={0} stroke="#78716c" />
            <Bar dataKey="value" barSize={28} radius={[6, 6, 6, 6]}>
              {kpis.map((d, i) => {
                let color = '#a8a29e';
                if (d.value > 0) color = '#22c55e';
                if (d.value < 0) color = '#ef4444';
                return <Cell key={i} fill={color} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
