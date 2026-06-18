'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  GitCompareArrows,
  FileBarChart,
  Store,
  TrendingUp,
  X,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/restaurants', label: 'Restaurants', icon: Store },
  { href: '/compare', label: 'Compare', icon: GitCompareArrows },
  { href: '/reports', label: 'Reports', icon: FileBarChart },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={cn('sidebar', isOpen && 'open')}>
        {/* Logo */}
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--accent-gradient)' }}
            >
              <TrendingUp size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                ZomatoPulse
              </h1>
              <p className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                Analytics Dashboard
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded-lg hover:bg-black/5"
          >
            <X size={18} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4">
          <p className="px-4 mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Navigation
          </p>
          <div className="flex flex-col gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || 
                (item.href !== '/' && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={cn('nav-item', isActive && 'active')}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="p-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div className="glass-card p-3 text-center mb-2">
            <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Zomato Data Only
            </p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
              32 Restaurants • Internal Use
            </p>
          </div>
          <Link
            href="/admin"
            onClick={onClose}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors w-full',
              pathname === '/admin'
                ? 'text-amber-400 bg-amber-400/10'
                : 'hover:bg-white/5'
            )}
            style={{ color: pathname === '/admin' ? undefined : 'var(--text-muted)' }}
          >
            <ShieldCheck size={14} />
            <span>Admin</span>
          </Link>
        </div>
      </aside>
    </>
  );
}
