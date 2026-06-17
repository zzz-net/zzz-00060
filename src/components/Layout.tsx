import { NavLink, Outlet } from 'react-router-dom';
import { Upload, Settings, Shield, FileText, Zap, ClipboardCheck } from 'lucide-react';

const navItems = [
  { to: '/', label: '交付自检', icon: ClipboardCheck },
  { to: '/import', label: '批次导入', icon: Upload },
  { to: '/rules', label: '规则配置', icon: Settings },
  { to: '/review', label: '异常复核', icon: Shield },
  { to: '/report', label: '复核报告', icon: FileText },
];

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-60 bg-slate-900 text-white flex flex-col shrink-0">
        <div className="px-5 py-6 flex items-center gap-2.5 border-b border-slate-700">
          <Zap className="w-6 h-6 text-amber-400" />
          <h1 className="text-lg font-bold tracking-wide">抄表异常复核台</h1>
        </div>
        <nav className="flex-1 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors relative ${
                  isActive
                    ? 'text-amber-400 bg-slate-800/60'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/40'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400 rounded-r" />
                  )}
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-slate-700 text-xs text-slate-500">
          v1.0.0
        </div>
      </aside>
      <main className="flex-1 bg-slate-50 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
