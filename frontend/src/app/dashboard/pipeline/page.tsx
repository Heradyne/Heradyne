'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useRef } from 'react';
import { RefreshCw, Plus, X, Clock, AlertTriangle, Flag, ChevronDown, Bell, DollarSign, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';

const fmt = (n: number) => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${n || 0}`;

const STAGE_LABELS: Record<string, string> = {
  prospect:     'Prospect',
  application:  'Application',
  underwriting: 'Underwriting',
  approved:     'Approved',
  closed:       'Closed',
  servicing:    'Servicing',
  rejected:     'Rejected',
};

const STAGE_COLORS: Record<string, string> = {
  prospect:     '#6366f1',
  application:  '#f59e0b',
  underwriting: '#3b82f6',
  approved:     '#10b981',
  closed:       '#059669',
  servicing:    '#8b5cf6',
  rejected:     '#ef4444',
};

const PRIORITY_STYLE: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high:   'bg-orange-100 text-orange-700 border-orange-200',
  normal: 'bg-gray-100 text-gray-600 border-gray-200',
  low:    'bg-blue-50 text-blue-600 border-blue-200',
};

const STAGES = ['prospect', 'application', 'underwriting', 'approved', 'closed', 'servicing'];

export default function PipelinePage() {
  const [pipeline, setPipeline] = useState<any>({});
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState<any>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [showReminder, setShowReminder] = useState(false);
  const [reminder, setReminder] = useState({ next_action: '', next_action_date: '', notes: '' });
  const [savingReminder, setSavingReminder] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const data = await api.getPipeline();
      setPipeline(data.pipeline || {});
      setStats(data.stats || {});
    } catch { setError('Failed to load pipeline'); }
    finally { setLoading(false); }
  };

  const moveStage = async (dealId: number, newStage: string) => {
    try {
      await api.updatePipelineStage(dealId, { stage: newStage });
      await load();
    } catch { setError('Failed to move deal'); }
  };

  const saveReminder = async () => {
    if (!selectedDeal || !reminder.next_action) return;
    setSavingReminder(true);
    try {
      await api.setPipelineReminder(selectedDeal.deal_id, reminder);
      setShowReminder(false);
      setReminder({ next_action: '', next_action_date: '', notes: '' });
      await load();
    } catch { setError('Failed to save reminder'); }
    finally { setSavingReminder(false); }
  };

  const onDragStart = (e: React.DragEvent, deal: any) => {
    setDragging(deal);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDrop = async (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    if (dragging && dragging.stage !== stage) {
      await moveStage(dragging.deal_id, stage);
    }
    setDragging(null);
    setDragOver(null);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="h-8 w-8 animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Deal Pipeline</h1>
          <p className="text-gray-500">Drag deals between stages to track progress</p>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="text-center"><p className="text-2xl font-bold text-gray-900">{stats.total || 0}</p><p className="text-gray-400">Total</p></div>
          {stats.overdue_reminders > 0 && <div className="text-center"><p className="text-2xl font-bold text-red-600">{stats.overdue_reminders}</p><p className="text-gray-400">Overdue</p></div>}
          {stats.stuck_deals > 0 && <div className="text-center"><p className="text-2xl font-bold text-orange-600">{stats.stuck_deals}</p><p className="text-gray-400">Stuck</p></div>}
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 flex justify-between">{error}<button onClick={() => setError('')}><X className="h-4 w-4" /></button></div>}

      {/* Kanban board */}
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '600px' }}>
        {STAGES.map(stage => {
          const deals = (pipeline[stage] || []) as any[];
          const isDragTarget = dragOver === stage;
          return (
            <div key={stage}
              className={`flex-shrink-0 w-64 rounded-2xl transition-all ${isDragTarget ? 'ring-2 ring-blue-400' : ''}`}
              style={{ background: '#f8fafc', border: `1px solid ${STAGE_COLORS[stage]}30` }}
              onDragOver={e => { e.preventDefault(); setDragOver(stage); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => onDrop(e, stage)}>

              {/* Column header */}
              <div className="px-3 py-3 flex items-center justify-between" style={{ borderBottom: `2px solid ${STAGE_COLORS[stage]}` }}>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: STAGE_COLORS[stage] }} />
                  <span className="font-semibold text-gray-800 text-sm">{STAGE_LABELS[stage]}</span>
                </div>
                <span className="text-xs bg-gray-200 text-gray-600 font-bold px-2 py-0.5 rounded-full">{deals.length}</span>
              </div>

              {/* Cards */}
              <div className="p-2 space-y-2 min-h-48">
                {deals.length === 0 && (
                  <div className={`rounded-xl p-4 text-center text-xs text-gray-400 border-2 border-dashed ${isDragTarget ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}>
                    Drop here
                  </div>
                )}
                {deals.map((deal: any) => (
                  <div key={deal.deal_id}
                    draggable
                    onDragStart={e => onDragStart(e, deal)}
                    className="bg-white rounded-xl p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm cursor-grab active:cursor-grabbing transition-all"
                    onClick={() => setSelectedDeal(deal)}>

                    {/* Flags */}
                    <div className="flex items-center gap-1 mb-1">
                      {deal.is_stuck && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">Stuck {deal.days_in_stage}d</span>}
                      {deal.is_overdue && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><AlertTriangle className="h-3 w-3" />Overdue</span>}
                      {deal.priority !== 'normal' && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full border ${PRIORITY_STYLE[deal.priority]}`}>{deal.priority}</span>
                      )}
                    </div>

                    <p className="font-semibold text-gray-900 text-sm leading-tight">{deal.deal_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{deal.industry}</p>

                    <div className="flex items-center justify-between mt-2">
                      <span className="text-sm font-bold text-blue-700">{fmt(deal.loan_amount)}</span>
                      <span className="text-xs text-gray-400 flex items-center gap-1"><Clock className="h-3 w-3" />{deal.days_in_stage}d</span>
                    </div>

                    {deal.next_action && (
                      <div className="mt-2 text-xs bg-blue-50 text-blue-700 rounded-lg px-2 py-1 flex items-start gap-1">
                        <Bell className="h-3 w-3 shrink-0 mt-0.5" />
                        <span className="truncate">{deal.next_action}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Deal detail panel */}
      {selectedDeal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50" onClick={() => setSelectedDeal(null)}>
          <div className="bg-white rounded-2xl p-6 w-96 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-bold text-gray-900 text-lg">{selectedDeal.deal_name}</h2>
                <p className="text-gray-500 text-sm">{selectedDeal.industry} · {fmt(selectedDeal.loan_amount)}</p>
              </div>
              <button onClick={() => setSelectedDeal(null)}><X className="h-5 w-5 text-gray-400" /></button>
            </div>

            <div className="mb-4">
              <p className="text-xs font-bold text-gray-400 uppercase mb-2">Move to Stage</p>
              <div className="flex flex-wrap gap-2">
                {STAGES.map(s => (
                  <button key={s} onClick={() => { moveStage(selectedDeal.deal_id, s); setSelectedDeal(null); }}
                    className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${selectedDeal.stage === s ? 'text-white border-transparent' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'}`}
                    style={selectedDeal.stage === s ? { background: STAGE_COLORS[s] } : {}}>
                    {STAGE_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <p className="text-xs font-bold text-gray-400 uppercase mb-2">Priority</p>
              <div className="flex gap-2">
                {['low', 'normal', 'high', 'urgent'].map(p => (
                  <button key={p} onClick={() => api.updatePipelineStage(selectedDeal.deal_id, { stage: selectedDeal.stage, priority: p }).then(load)}
                    className={`text-xs px-3 py-1 rounded-full border capitalize transition-all ${selectedDeal.priority === p ? PRIORITY_STYLE[p] : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {!showReminder ? (
              <button onClick={() => setShowReminder(true)} className="btn btn-secondary w-full text-sm flex items-center justify-center gap-2">
                <Bell className="h-4 w-4" /> Set Next Action Reminder
              </button>
            ) : (
              <div className="space-y-2">
                <div>
                  <label className="label text-xs">Next Action</label>
                  <input value={reminder.next_action} onChange={e => setReminder({...reminder, next_action: e.target.value})}
                    className="input w-full text-sm" placeholder="Send term sheet, Schedule call..." />
                </div>
                <div>
                  <label className="label text-xs">Due Date</label>
                  <input type="date" value={reminder.next_action_date} onChange={e => setReminder({...reminder, next_action_date: e.target.value})}
                    className="input w-full text-sm" />
                </div>
                <div>
                  <label className="label text-xs">Notes</label>
                  <textarea value={reminder.notes} onChange={e => setReminder({...reminder, notes: e.target.value})}
                    className="input w-full text-sm min-h-16" placeholder="Context for this action..." />
                </div>
                <div className="flex gap-2">
                  <button onClick={saveReminder} disabled={savingReminder} className="btn btn-primary flex-1 text-sm">Save</button>
                  <button onClick={() => setShowReminder(false)} className="btn btn-secondary text-sm">Cancel</button>
                </div>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-gray-100">
              <a href={`/dashboard/deals/${selectedDeal.deal_id}`} className="text-sm text-blue-600 hover:underline">Open full deal →</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
