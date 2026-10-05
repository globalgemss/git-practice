import { NavLink, Route, Routes } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Truck,
  BriefcaseBusiness,
  UserRound,
  HardHat,
  WalletCards,
  BookOpen,
  ReceiptText,
  Settings,
} from 'lucide-react';

const navItems = [
  ['/', 'Dashboard', LayoutDashboard],
  ['/leads', 'Leads', Users],
  ['/orders', 'Orders', ClipboardList],
  ['/dispatch', 'Dispatch', Truck],
  ['/jobs', 'Jobs', BriefcaseBusiness],
  ['/drivers', 'Drivers', UserRound],
  ['/labour', 'Labour', HardHat],
  ['/accounts', 'Receive & Pay', WalletCards],
  ['/day-book', 'Day Book', BookOpen],
  ['/slips', 'Slips', ReceiptText],
  ['/settings', 'Settings', Settings],
];

function Placeholder({ title }) {
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">RikshaMS</p>
          <h1>{title}</h1>
        </div>
      </div>
      <div className="empty-card">
        <strong>{title}</strong>
        <p>This module is scaffolded and will be connected to Supabase during migration.</p>
      </div>
    </section>
  );
}

function Dashboard() {
  const cards = [
    ['Total Leads', '—'],
    ['Active Orders', '—'],
    ['Dispatches', '—'],
    ['Jobs', '—'],
    ['Available Vehicles', '—'],
    ['Receivables', '—'],
    ['Payables', '—'],
    ['Revenue', '—'],
  ];

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Transport + Labour Management</p>
          <h1>Dashboard</h1>
        </div>
        <span className="status-pill">React migration branch</span>
      </div>
      <div className="stats-grid">
        {cards.map(([label, value]) => (
          <article className="stat-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <div className="panel">
        <h2>Migration status</h2>
        <p>
          The modern React shell is ready. Business modules will be migrated without replacing the approved RikshaMS workflow.
        </p>
      </div>
    </section>
  );
}

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">R</div>
          <div>
            <strong>RikshaMS</strong>
            <small>Transport + Labour</small>
          </div>
        </div>
        <nav>
          {navItems.map(([to, label, Icon]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <strong>RikshaMS</strong>
            <span>Production migration workspace</span>
          </div>
        </header>

        <Routes>
          <Route path="/" element={<Dashboard />} />
          {navItems.slice(1).map(([to, label]) => (
            <Route key={to} path={to} element={<Placeholder title={label} />} />
          ))}
        </Routes>
      </main>
    </div>
  );
}
