'use client';

import { useEffect, useState, useRef } from 'react';
import { Bell, X, Check, CheckCheck, AlertTriangle, FileText, DollarSign, Package, TrendingUp, Shield } from 'lucide-react';
import { api } from '@/lib/api';

const TYPE_ICON: Record<string, React.ReactNode> = {
  covenant_breach:          <AlertTriangle className="h-4 w-4 text-red-500" />,
  collateral_expiry:        <Shield className="h-4 w-4 text-orange-500" />,
  proposal_received:        <DollarSign className="h-4 w-4 text-green-500" />,
  contract_ready:           <FileText className="h-4 w-4 text-blue-500" />,
  ai_evaluation_complete:   <TrendingUp className="h-4 w-4 text-purple-500" />,
  qbr_ready:                <TrendingUp className="h-4 w-4 text-blue-500" />,
  crisis_update:            <AlertTriangle className="h-4 w-4 text-red-600" />,
  review_decision:          <Check className="h-4 w-4 text-green-600" />,
  asset_evaluated:          <Package className="h-4 w-4 text-blue-500" />,
  system:                   <Bell className="h-4 w-4 text-gray-500" />,
  general:                  <Bell className="h-4 w-4 text-gray-500" />,
};

const TYPE_BG: Record<string, string> = {
  covenant_breach:   'bg-red-50',
  collateral_expiry: 'bg-orange-50',
  proposal_received: 'bg-green-50',
  contract_ready:    'bg-blue-50',
  crisis_update:     'bg-red-50',
  review_decision:   'bg-green-50',
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadNotifications();
    // Poll every 60 seconds
    const interval = setInterval(loadNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const loadNotifications = async () => {
    try {
      const data = await api.getNotifications();
      setNotifications(data.notifications || []);
      setUnread(data.unread_count || 0);
    } catch { /* silent fail */ }
  };

  const markRead = async (id: number) => {
    try {
      await api.markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? {...n, is_read: true} : n));
      setUnread(prev => Math.max(0, prev - 1));
    } catch { /* silent */ }
  };

  const markAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({...n, is_read: true})));
      setUnread(0);
    } catch { /* silent */ }
  };

  const handleNotificationClick = (n: any) => {
    if (!n.is_read) markRead(n.id);
    if (n.link) window.location.href = n.link;
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5 text-gray-600" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 text-sm">Notifications</h3>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button onClick={markAllRead} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  <CheckCheck className="h-3 w-3" /> Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="text-center py-10">
                <Bell className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No notifications yet</p>
              </div>
            ) : notifications.map(n => (
              <button
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                  !n.is_read ? (TYPE_BG[n.type] || 'bg-blue-50') : 'bg-white'
                }`}
              >
                <div className="shrink-0 mt-0.5 w-6 h-6 flex items-center justify-center">
                  {TYPE_ICON[n.type] || TYPE_ICON.general}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${!n.is_read ? 'text-gray-900' : 'text-gray-600'}`}>
                    {n.title}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{n.time_ago}</p>
                </div>
                {!n.is_read && <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
