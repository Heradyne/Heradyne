'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Shield, Home, FileText, Users, Settings, LogOut,
  Building2, ShieldCheck, BarChart3, DollarSign, TrendingUp, CreditCard, FileSignature, ShieldAlert,
  ClipboardCheck, Brain, Scale, Calculator, Activity, PieChart, Send, Lock, MapPin, ClipboardList, FileBarChart
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn, getRoleLabel, DISCLAIMER } from '@/lib/utils';
import IdleWarning from '@/components/IdleWarning';

const NAV_DEFINITIONS = {
  borrower: [
    { id: 'home',          name: 'Dashboard',         href: '/dashboard',              icon: Home,        always: true },
    { id: 'deals',         name: 'My Deals',           href: '/dashboard/deals',        icon: FileText,    always: true },
    { id: 'loan-health',   name: 'Business Dashboard', href: '/dashboard/loan-health',  icon: Activity,    always: false },
    { id: 'get-valuation', name: 'Get a Valuation',    href: '/dashboard/get-valuation',icon: DollarSign,  always: false },
    { id: 'collateral',    name: 'Collateral',         href: '/dashboard/collateral',   icon: Building2,   always: false },
    { id: 'signatures',    name: 'Signatures',         href: '/dashboard/signatures',   icon: FileSignature,always: false },
    { id: 'protection',    name: 'Default Protection', href: '/dashboard/protection',   icon: ShieldAlert, always: false },
    { id: 'employee-kpi',  name: 'Employee Program',  href: '/dashboard/employee-kpi', icon: Users,       always: false },
    { id: 'security',      name: 'Security',             href: '/dashboard/security',     icon: Lock,        always: true  },
  ],
  lender: [
    { id: 'home',            name: 'Dashboard',        href: '/dashboard',                  icon: Home,        always: true },
    { id: 'matches',         name: 'Matched Deals',    href: '/dashboard/matches',           icon: FileText,    always: true },
    { id: 'term-sheets',     name: 'Term Sheets',      href: '/dashboard/term-sheets',       icon: Send,        always: false },
    { id: 'collateral',      name: 'Collateral & LTV', href: '/dashboard/collateral',        icon: Building2,   always: false },
    { id: 'monitoring',      name: 'Portfolio',        href: '/dashboard/monitoring',        icon: Activity,    always: false },
    { id: 'covenant-monitoring', name: 'Covenants',      href: '/dashboard/covenant-monitoring', icon: Shield,      always: false },
    { id: 'annual-reviews',  name: 'Annual Reviews',   href: '/dashboard/annual-reviews',    icon: ClipboardList, always: false },
    { id: 'site-visits',     name: 'Site Visits',      href: '/dashboard/site-visits',       icon: MapPin,      always: false },
    { id: 'sba-1502',        name: '1502 Reporting',   href: '/dashboard/sba-1502',          icon: FileBarChart, always: false },
    { id: 'audit-prep',      name: 'Audit Prep',       href: '/dashboard/audit-prep',        icon: Shield,      always: false },
    { id: 'collateral-monitoring', name: 'Collateral Monitor', href: '/dashboard/collateral-monitoring', icon: Building2, always: false },
    { id: 'origination',     name: 'Origination',      href: '/dashboard/origination',       icon: CreditCard,  always: false },
    { id: 'sba-compliance',  name: 'SBA Compliance',   href: '/dashboard/sba-compliance',    icon: Scale,       always: false },
    { id: 'ai-agent',        name: 'AI Underwriter',   href: '/dashboard/ai-agent',          icon: Brain,       always: false },
    { id: 'financials',      name: 'Financials',       href: '/dashboard/financials',        icon: DollarSign,  always: false },
    { id: 'secondary-market',name: 'Secondary Market', href: '/dashboard/secondary-market',  icon: TrendingUp,  always: false },
    { id: 'signatures',      name: 'Signatures',       href: '/dashboard/signatures',        icon: FileSignature,always: false },
    { id: 'appetite',        name: 'My Preferences',   href: '/dashboard/appetite',          icon: Settings,    always: true },
    { id: 'security',        name: 'Security',          href: '/dashboard/security',          icon: Lock,        always: true },
  ],
  loan_officer: [
    { id: 'home',          name: 'Dashboard',      href: '/dashboard',              icon: Home,         always: true },
    { id: 'matches',       name: 'Matched Deals',  href: '/dashboard/matches',      icon: FileText,     always: true },
    { id: 'sba-compliance',name: 'SBA Compliance', href: '/dashboard/sba-compliance',icon: Scale,       always: false },
    { id: 'verification',  name: 'Verification',   href: '/dashboard/verification', icon: ClipboardCheck,always: false },
    { id: 'signatures',    name: 'Signatures',     href: '/dashboard/signatures',   icon: FileSignature, always: false },
    { id: 'security',      name: 'Security',        href: '/dashboard/security',     icon: Lock,         always: true },
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
    { id: 'security',      name: 'Security',        href: '/dashboard/security',      icon: Lock,         always: true },
  ],
  insurer: [
    { id: 'home',               name: 'Dashboard',          href: '/dashboard',                    icon: Home,        always: true },
    { id: 'matches',            name: 'Deal Pipeline',       href: '/dashboard/matches',             icon: FileText,    always: true },
    { id: 'policies',           name: 'My Policies',           href: '/dashboard/policies',              icon: ShieldCheck, always: true },
    { id: 'insurer-term-sheets',name: 'Coverage Term Sheets',  href: '/dashboard/insurer-term-sheets',   icon: Send,        always: true },
    { id: 'actuarial-pricing',  name: 'Actuarial Pricing',   href: '/dashboard/actuarial-pricing',   icon: Calculator,  always: false },
    { id: 'portfolio-exposure', name: 'Portfolio Exposure',  href: '/dashboard/portfolio-exposure',  icon: PieChart,    always: false },
    { id: 'collateral',         name: 'Collateral & Recovery',href: '/dashboard/collateral',         icon: Building2,   always: false },
    { id: 'monitoring',         name: 'Claims & Monitoring', href: '/dashboard/monitoring',          icon: Activity,    always: false },
    { id: 'ai-agent',           name: 'AI Actuary Advisor',  href: '/dashboard/ai-agent',            icon: Brain,       always: false },
    { id: 'financials',         name: 'Financials',          href: '/dashboard/financials',          icon: DollarSign,  always: false },
    { id: 'secondary-market',   name: 'Reinsurance',         href: '/dashboard/secondary-market',   icon: TrendingUp,  always: false },
    { id: 'signatures',         name: 'Signatures',          href: '/dashboard/signatures',         icon: FileSignature,always: false },
    { id: 'appetite',           name: 'My Preferences',      href: '/dashboard/appetite',            icon: Settings,    always: true },
    { id: 'security',           name: 'Security',             href: '/dashboard/security',           icon: Lock,        always: true },
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
    { id: 'security',        name: 'Security',        href: '/dashboard/security',      icon: Lock,        always: true },
  ],
  employee: [
    { id: 'home',          name: 'Dashboard',         href: '/dashboard',                    icon: Home,        always: true },
    { id: 'my-contributions', name: 'My Contributions', href: '/dashboard/my-contributions', icon: TrendingUp,  always: true },
    { id: 'security',      name: 'Security',           href: '/dashboard/security',           icon: Lock,        always: true },
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
    <div className="min-h-screen flex items-center justify-center" style={{background:'var(--surface)'}}>
      <div className="animate-spin rounded-full h-8 w-8" style={{border:'2px solid var(--gold-light)',borderTopColor:'var(--navy)'}}/>
    </div>
  );

  if (!isAuthenticated || !user) return null;

  const allNavItems = NAV_DEFINITIONS[user.role as keyof typeof NAV_DEFINITIONS] || NAV_DEFINITIONS.borrower;
  const navItems = allNavItems.filter(item => item.always || visibleModules.includes(item.id));

  const getRoleBadge = (role: string) => {
    switch(role) {
      case 'lender': case 'loan_officer': case 'credit_committee': return 'badge badge-navy';
      case 'insurer': return 'badge badge-purple';
      case 'admin':   return 'badge badge-red';
      default:        return 'badge badge-green';
    }
  };

  return (
    <div className="min-h-screen flex" style={{background:'var(--surface)'}}>
      {/* Sidebar */}
      <div className="w-64 flex flex-col fixed inset-y-0" style={{background:'var(--navy)',borderRight:'1px solid rgba(255,255,255,0.06)'}}>

        {/* Logo */}
        <div className="h-16 flex items-center px-6" style={{borderBottom:'1px solid rgba(255,255,255,0.07)'}}>
          <div style={{display:'flex',flexDirection:'column',gap:'1px'}}>
            <span style={{fontFamily:'"DM Serif Display",serif',fontSize:'1.1rem',color:'#fff',letterSpacing:'0.08em',fontWeight:400,lineHeight:1}}>
              HERADYNE
            </span>
            <span style={{fontSize:'0.55rem',letterSpacing:'0.2em',color:'rgba(196,165,90,0.7)',textTransform:'uppercase',fontFamily:'"DM Sans",sans-serif'}}>
              Risk Infrastructure
            </span>
          </div>
        </div>

        {/* User */}
        <div className="px-4 py-3" style={{borderBottom:'1px solid rgba(255,255,255,0.07)'}}>
          <p className="text-sm font-medium truncate" style={{color:'rgba(255,255,255,0.88)',marginBottom:'4px'}}>{user.full_name || user.email}</p>
          <span className={`${getRoleBadge(user.role)} mt-1`} style={{opacity:0.8}}>
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
                className={cn('flex items-center gap-3 px-3 py-2.5 mb-0.5 transition-all text-sm')}
                style={{
                  borderRadius: '4px',
                  fontFamily: '"DM Sans",sans-serif',
                  fontWeight: isActive ? 500 : 400,
                  background: isActive ? 'rgba(196,165,90,0.15)' : 'transparent',
                  color: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.55)',
                  borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                  paddingLeft: isActive ? '10px' : '12px',
                }}>
                <Icon className="h-4 w-4 shrink-0"/>
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Sign out */}
        <div className="p-3" style={{borderTop:'1px solid rgba(255,255,255,0.07)'}}>
          <button onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 w-full text-sm transition-all"
            style={{borderRadius:'4px',color:'rgba(255,255,255,0.35)',fontFamily:'"DM Sans",sans-serif'}}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.7)';(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.05)'}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.35)';(e.currentTarget as HTMLElement).style.background='transparent'}}>
            <LogOut className="h-4 w-4"/>
            Sign Out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="ml-64 flex-1 flex flex-col min-h-screen">
        <main className="flex-1 p-6 md:p-8">
          {children}
        </main>
        <footer className="px-8 py-3" style={{fontSize:'0.7rem',color:'var(--ink-faint)',borderTop:'1px solid var(--border)',fontFamily:'"DM Sans",sans-serif'}}>
          {DISCLAIMER}
        </footer>
      </div>

      {/* Idle session timeout warning */}
      <IdleWarning />
    </div>
  );
}
