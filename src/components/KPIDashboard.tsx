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

  const profitValue = kpiSnapshot.profit;
  const marketShareValue = kpiSnapshot.marketShare;
  const liquidityValue = kpiSnapshot.liquidity;
  const trustValue = kpiSnapshot.trust;
  const complianceValue = kpiSnapshot.compliance;

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      <h2 className="font-display text-lg text-white text-center">KPI Dashboard</h2>

      <KPIBar label="Profit" value={profitValue} />
      <KPIBar label="Market Share" value={marketShareValue} />
      <KPIBar label="Liquidity" value={liquidityValue} />
      <KPIBar label="Trust" value={trustValue} />
      <KPIBar label="Compliance" value={complianceValue} />
    </div>
  );
}

function KPIBar({ label, value }: { label: string; value: number }) {
  let barColor = '#a8a29e';
  if (value > 0) {
    barColor = '#22c55e';
  } else if (value < 0) {
    barColor = '#ef4444';
  }

  let valueColor = 'text-white';
  if (value > 0) {
    valueColor = 'text-green-400';
  } else if (value < 0) {
    valueColor = 'text-red-400';
  }

  const chartData = [{ name: label, value: value }];

  return (
    <div className="bg-brown-800 rounded-lg p-3">
      <p className="font-body text-xs text-brown-400 mb-1">{label}</p>
      <div aria-label={label + ': ' + value} role="img">
        <ResponsiveContainer width="100%" height={60}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 30, bottom: 0, left: 0 }}
          >
            <XAxis type="number" domain={[-100, 100]} hide />
            <YAxis type="category" dataKey="name" hide />
            <ReferenceLine x={0} stroke="#78716c" />
            <Bar dataKey="value" barSize={24} radius={[4, 4, 4, 4]}>
              <Cell fill={barColor} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className={'font-display text-center text-lg ' + valueColor}>
        {value > 0 ? '+' : ''}{value}
      </p>
    </div>
  );
}
