'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Shield, Home, FileText, Users, Settings, LogOut,
  Building2, BarChart3, DollarSign, TrendingUp, CreditCard, FileSignature, ShieldAlert,
  ClipboardCheck, Brain, Scale, Calculator, Activity, PieChart, Send
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn, getRoleLabel, DISCLAIMER } from '@/lib/utils';

const NAV_DEFINITIONS = {
  borrower: [
    { id: 'home',          name: 'Dashboard',         href: '/dashboard',              icon: Home,        always: true },
    { id: 'deals',         name: 'My Deals',           href: '/dashboard/deals',        icon: FileText,    always: true },
    { id: 'loan-health',   name: 'Business Dashboard', href: '/dashboard/loan-health',  icon: Activity,    always: false },
    { id: 'get-valuation', name: 'Get a Valuation',    href: '/dashboard/get-valuation',icon: DollarSign,  always: false },
    { id: 'collateral',    name: 'Collateral',         href: '/dashboard/collateral',   icon: Building2,   always: false },
    { id: 'signatures',    name: 'Signatures',         href: '/dashboard/signatures',   icon: FileSignature,always: false },
    { id: 'protection',    name: 'Default Protection', href: '/dashboard/protection',   icon: ShieldAlert, always: false },
  ],
  lender: [
    { id: 'home',            name: 'Dashboard',        href: '/dashboard',                  icon: Home,        always: true },
    { id: 'matches',         name: 'Matched Deals',    href: '/dashboard/matches',           icon: FileText,    always: true },
    { id: 'term-sheets',     name: 'Term Sheets',      href: '/dashboard/term-sheets',       icon: Send,        always: false },
    { id: 'collateral',      name: 'Collateral & LTV', href: '/dashboard/collateral',        icon: Building2,   always: false },
    { id: 'monitoring',      name: 'Portfolio',        href: '/dashboard/monitoring',        icon: Activity,    always: false },
    { id: 'origination',     name: 'Origination',      href: '/dashboard/origination',       icon: CreditCard,  always: false },
    { id: 'sba-compliance',  name: 'SBA Compliance',   href: '/dashboard/sba-compliance',    icon: Scale,       always: false },
    { id: 'ai-agent',        name: 'AI Underwriter',   href: '/dashboard/ai-agent',          icon: Brain,       always: false },
    { id: 'financials',      name: 'Financials',       href: '/dashboard/financials',        icon: DollarSign,  always: false },
    { id: 'secondary-market',name: 'Secondary Market', href: '/dashboard/secondary-market',  icon: TrendingUp,  always: false },
    { id: 'signatures',      name: 'Signatures',       href: '/dashboard/signatures',        icon: FileSignature,always: false },
    { id: 'appetite',        name: 'My Preferences',   href: '/dashboard/appetite',          icon: Settings,    always: true },
  ],
  loan_officer: [
    { id: 'home',          name: 'Dashboard',      href: '/dashboard',              icon: Home,         always: true },
    { id: 'matches',       name: 'Matched Deals',  href: '/dashboard/matches',      icon: FileText,     always: true },
    { id: 'sba-compliance',name: 'SBA Compliance', href: '/dashboard/sba-compliance',icon: Scale,       always: false },
    { id: 'verification',  name: 'Verification',   href: '/dashboard/verification', icon: ClipboardCheck,always: false },
    { id: 'signatures',    name: 'Signatures',     href: '/dashboard/signatures',   icon: FileSignature, always: false },
  ],
  credit_committee: [
    { id: 'home',          name: 'Dashboard',      href: '/dashboard',               icon: Home,         always: true },
    { id: 'matches',       name: 'Matched Deals',  href: '/dashboard/matches',       icon: FileText,     always: true },
    { id: 'term-sheets',   name: 'Term Sheets',    href: '/dashboard/term-sheets',   icon: Send,         always: false },
    { id: 'origination',   name: 'Origination',    href: '/dashboard/origination',   icon: CreditCard,   always: false },
    { id: 'sba-compliance',name: 'SBA Compliance', href: '/dashboard/sba-compliance',icon: Scale,       always: false },
    { id: 'ai-agent',      name: 'AI Underwriter', href: '/dashboard/ai-agent',      icon: Brain,        always: false },
    { id: 'financials',    name: 'Financials',     href: '/dashboard/financials',    icon: DollarSign,   always: false },
    { id: 'signatures',    name: 'Signatures',     href: '/dashboard/signatures',    icon: FileSignature, always: false },
  ],
  insurer: [
    { id: 'home',               name: 'Dashboard',          href: '/dashboard',                    icon: Home,        always: true },
    { id: 'matches',            name: 'Deal Pipeline',       href: '/dashboard/matches',             icon: FileText,    always: true },
    { id: 'actuarial-pricing',  name: 'Actuarial Pricing',   href: '/dashboard/actuarial-pricing',   icon: Calculator,  always: false },
    { id: 'portfolio-exposure', name: 'Portfolio Exposure',  href: '/dashboard/portfolio-exposure',  icon: PieChart,    always: false },
    { id: 'monitoring',         name: 'Claims & Monitoring', href: '/dashboard/monitoring',          icon: Activity,    always: false },
    { id: 'ai-agent',           name: 'AI Actuary Advisor',  href: '/dashboard/ai-agent',            icon: Brain,       always: false },
    { id: 'financials',         name: 'Financials',          href: '/dashboard/financials',          icon: DollarSign,  always: false },
    { id: 'secondary-market',   name: 'Reinsurance',         href: '/dashboard/secondary-market',    icon: TrendingUp,  always: false },
    { id: 'signatures',         name: 'Signatures',          href: '/dashboard/signatures',          icon: FileSignature,always: false },
    { id: 'appetite',           name: 'My Preferences',      href: '/dashboard/appetite',            icon: Settings,    always: true },
  ],
  admin: [
    { id: 'home',            name: 'Dashboard',      href: '/dashboard',               icon: Home,        always: true },
    { id: 'deals',           name: 'All Deals',      href: '/dashboard/deals',         icon: FileText,    always: true },
    { id: 'monitoring',      name: 'Portfolio',      href: '/dashboard/monitoring',    icon: Activity,    always: false },
    { id: 'sba-compliance',  name: 'SBA Compliance', href: '/dashboard/sba-compliance',icon: Scale,      always: false },
    { id: 'ai-agent',        name: 'AI Agent',       href: '/dashboard/ai-agent',      icon: Brain,       always: false },
    { id: 'financials',      name: 'Financials',     href: '/dashboard/financials',    icon: DollarSign,  always: false },
    { id: 'secondary-market',name: 'Secondary Market',href:'/dashboard/secondary-market',icon:TrendingUp,  always: false },
    { id: 'users',           name: 'Users',          href: '/dashboard/users',         icon: Users,       always: true },
    { id: 'assumptions',     name: 'Assumptions',    href: '/dashboard/assumptions',   icon: Settings,    always: false },
    { id: 'audit',           name: 'Audit Logs',     href: '/dashboard/audit',         icon: BarChart3,   always: false },
  ],
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, isAuthenticated, mustChangePassword, loadUser, logout } = useAuth();
  const [visibleModules, setVisibleModules] = useState<string[]>([]);

  useEffect(() => { loadUser(); }, [loadUser]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push('/login');
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (mustChangePassword) router.push('/change-password');
  }, [mustChangePassword, router]);

  // Load appetite preferences
  useEffect(() => {
    if (!user?.role) return;
    const saved = localStorage.getItem(`heradyne_modules_${user.role}`);
    const defs = NAV_DEFINITIONS[user.role as keyof typeof NAV_DEFINITIONS] || NAV_DEFINITIONS.borrower;
    if (saved) {
      try { setVisibleModules(JSON.parse(saved)); } catch { setVisibleModules(defs.map(d => d.id)); }
    } else {
      setVisibleModules(defs.map(d => d.id));
    }

    // Listen for preference updates
    const handler = () => {
      const updated = localStorage.getItem(`heradyne_modules_${user.role}`);
      if (updated) setVisibleModules(JSON.parse(updated));
    };
    window.addEventListener('appetite-updated', handler);
    return () => window.removeEventListener('appetite-updated', handler);
  }, [user?.role]);

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"/>
    </div>
  );

  if (!isAuthenticated || !user) return null;

  const allNavItems = NAV_DEFINITIONS[user.role as keyof typeof NAV_DEFINITIONS] || NAV_DEFINITIONS.borrower;
  // Show items that are always-on OR in the user's visible modules list
  const navItems = allNavItems.filter(item => item.always || visibleModules.includes(item.id));

  const getRoleColor = (role: string) => {
    switch(role) {
      case 'lender': case 'loan_officer': case 'credit_committee': return 'bg-blue-100 text-blue-700';
      case 'insurer': return 'bg-purple-100 text-purple-700';
      case 'admin': return 'bg-red-100 text-red-700';
      default: return 'bg-green-100 text-green-700';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col fixed inset-y-0">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <Shield className="h-7 w-7 text-blue-600 shrink-0"/>
          <span className="ml-2 text-lg font-bold text-gray-900">Heradyne</span>
        </div>

        {/* User info */}
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900 truncate">{user.full_name || user.email}</p>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mt-1 inline-block ${getRoleColor(user.role)}`}>
            {getRoleLabel(user.role)}
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link key={item.id} href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-0.5 transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}>
                <Icon className="h-4 w-4 shrink-0"/>
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-gray-100">
          <button onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors">
            <LogOut className="h-4 w-4"/>
            Sign Out
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="ml-64 flex-1 flex flex-col min-h-screen">
        <main className="flex-1 p-6 md:p-8">
          {children}
        </main>
        <footer className="px-8 py-3 text-xs text-gray-400 border-t border-gray-100">
          {DISCLAIMER}
        </footer>
      </div>
    </div>
  );
}
