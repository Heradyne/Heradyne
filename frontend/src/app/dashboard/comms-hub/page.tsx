'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { MessageSquare, RefreshCw, Plus, X, Send, CheckCircle, FileText, Bell, ChevronRight, Loader } from 'lucide-react';
import { api } from '@/lib/api';

const THREAD_TYPE_STYLE: Record<string, string> = {
  general:          'bg-gray-100 text-gray-600',
  document_request: 'bg-blue-100 text-blue-700',
  condition:        'bg-yellow-100 text-yellow-700',
  question:         'bg-purple-100 text-purple-700',
};

export default function CommsHubPage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [threads, setThreads] = useState<any[]>([]);
  const [activeThread, setActiveThread] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [docRequest, setDocRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [newMsg, setNewMsg] = useState('');
  const [showNewThread, setShowNewThread] = useState(false);
  const [showDocRequest, setShowDocRequest] = useState(false);
  const [newThread, setNewThread] = useState({ subject: '', thread_type: 'general', initial_message: '' });
  const [activeTab, setActiveTab] = useState<'messages' | 'documents'>('messages');

  useEffect(() => {
    api.getDeals().then(d => {
      const ds = (Array.isArray(d) ? d : (d?.deals || [])).filter((x: any) => x.status !== 'draft');
      setDeals(ds);
      if (ds.length > 0) selectDeal(ds[0]);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const selectDeal = async (deal: any) => {
    setSelectedDeal(deal);
    setActiveThread(null);
    setMessages([]);
    const [threadData, docData] = await Promise.all([
      api.getDealThreads(deal.id).catch(() => ({ threads: [], total_unread: 0 })),
      api.getDocRequest(deal.id).catch(() => ({ exists: false })),
    ]);
    setThreads(threadData.threads || []);
    setDocRequest(docData);
  };

  const openThread = async (thread: any) => {
    setActiveThread(thread);
    const data = await api.getThreadMessages(thread.id);
    setMessages(data.messages || []);
    // Refresh thread list to clear unread
    const updated = await api.getDealThreads(selectedDeal.id);
    setThreads(updated.threads || []);
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || !activeThread) return;
    setSendingMsg(true);
    try {
      await api.sendMessage(activeThread.id, newMsg);
      setNewMsg('');
      const data = await api.getThreadMessages(activeThread.id);
      setMessages(data.messages || []);
    } catch { /* silent */ }
    finally { setSendingMsg(false); }
  };

  const createThread = async () => {
    if (!newThread.subject) return;
    await api.createThread(selectedDeal.id, newThread);
    setShowNewThread(false);
    setNewThread({ subject: '', thread_type: 'general', initial_message: '' });
    const data = await api.getDealThreads(selectedDeal.id);
    setThreads(data.threads || []);
  };

  const sendDocRequest = async () => {
    await api.createDocRequest(selectedDeal.id, { items: [] });
    const data = await api.getDocRequest(selectedDeal.id);
    setDocRequest(data);
    setShowDocRequest(false);
  };

  const toggleDocItem = async (itemIndex: number, completed: boolean) => {
    if (!docRequest?.request_id) return;
    const updated = await api.updateDocItem(docRequest.request_id, itemIndex, completed);
    const refreshed = await api.getDocRequest(selectedDeal.id);
    setDocRequest(refreshed);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="h-screen flex flex-col" style={{ height: 'calc(100vh - 80px)' }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><MessageSquare className="h-7 w-7 text-blue-600" />Comms Hub</h1>
          <p className="text-gray-500">Threaded deal messaging and document tracking</p>
        </div>
      </div>

      <div className="flex flex-1 gap-4 min-h-0">
        {/* Deal list */}
        <div className="w-48 flex-shrink-0 space-y-1">
          <p className="text-xs font-bold text-gray-400 uppercase mb-2">Deals</p>
          {(deals || []).map(deal => (
            <button key={deal.id} onClick={() => selectDeal(deal)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${selectedDeal?.id === deal.id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              <p className="font-medium truncate">{deal.name}</p>
              <p className={`text-xs truncate ${selectedDeal?.id === deal.id ? 'text-blue-200' : 'text-gray-400'}`}>{deal.industry}</p>
            </button>
          ))}
        </div>

        {selectedDeal && (
          <>
            {/* Thread list */}
            <div className="w-64 flex-shrink-0 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <div className="flex gap-2">
                  <button onClick={() => setActiveTab('messages')} className={`text-xs px-3 py-1 rounded-full font-medium ${activeTab === 'messages' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Messages</button>
                  <button onClick={() => setActiveTab('documents')} className={`text-xs px-3 py-1 rounded-full font-medium ${activeTab === 'documents' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    Docs {docRequest?.exists && docRequest.pct_complete < 100 && <span className="ml-1 text-yellow-400">●</span>}
                  </button>
                </div>
                {activeTab === 'messages' && (
                  <button onClick={() => setShowNewThread(true)} className="text-blue-600 hover:text-blue-700"><Plus className="h-4 w-4" /></button>
                )}
              </div>

              {activeTab === 'messages' && (
                <div className="flex-1 overflow-y-auto space-y-1">
                  {threads.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-xs text-gray-400">No messages yet</p>
                      <button onClick={() => setShowNewThread(true)} className="text-xs text-blue-600 underline mt-1">Start a thread</button>
                    </div>
                  )}
                  {(threads || []).map(thread => (
                    <button key={thread.id} onClick={() => openThread(thread)}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${activeThread?.id === thread.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="flex items-start justify-between">
                        <p className={`text-sm font-medium truncate ${thread.unread_count > 0 ? 'text-gray-900' : 'text-gray-600'}`}>{thread.subject}</p>
                        {thread.unread_count > 0 && (
                          <span className="ml-2 h-5 w-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center shrink-0">{thread.unread_count}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${THREAD_TYPE_STYLE[thread.thread_type] || 'bg-gray-100 text-gray-500'}`}>{thread.thread_type.replace('_', ' ')}</span>
                        {thread.is_resolved && <CheckCircle className="h-3 w-3 text-green-500" />}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {activeTab === 'documents' && (
                <div className="flex-1 overflow-y-auto">
                  {!docRequest?.exists ? (
                    <div className="text-center py-8">
                      <FileText className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                      <p className="text-xs text-gray-400 mb-2">No checklist sent yet</p>
                      <button onClick={sendDocRequest} className="text-xs text-blue-600 underline">Send SBA checklist</button>
                    </div>
                  ) : (
                    <div>
                      <div className="mb-2 p-2 bg-gray-50 rounded-lg">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>{docRequest.completed}/{docRequest.total} complete</span>
                          <span>{docRequest.pct_complete}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${docRequest.pct_complete}%` }} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        {(docRequest.items || []).map((item: any, i: number) => (
                          <label key={i} className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer hover:bg-gray-50 ${item.completed ? 'opacity-60' : ''}`}>
                            <input type="checkbox" checked={item.completed} onChange={e => toggleDocItem(i, e.target.checked)} className="h-4 w-4 mt-0.5 rounded text-blue-600 shrink-0" />
                            <div>
                              <p className={`text-xs font-medium ${item.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>{item.name}</p>
                              {item.required && !item.completed && <span className="text-xs text-red-500">Required</span>}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Message view */}
            {activeTab === 'messages' && (
              <div className="flex-1 flex flex-col min-w-0">
                {!activeThread ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <MessageSquare className="h-12 w-12 text-gray-200 mx-auto mb-2" />
                      <p className="text-gray-400">Select a thread to read messages</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-200">
                      <div>
                        <h3 className="font-semibold text-gray-900">{activeThread.subject}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${THREAD_TYPE_STYLE[activeThread.thread_type] || 'bg-gray-100'}`}>{activeThread.thread_type.replace('_', ' ')}</span>
                      </div>
                      {!activeThread.is_resolved && (
                        <button onClick={async () => { await api.resolveThread(activeThread.id); const data = await api.getDealThreads(selectedDeal.id); setThreads(data.threads || []); setActiveThread(null); }}
                          className="btn btn-secondary text-xs">Mark Resolved</button>
                      )}
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-3 mb-3">
                      {(messages || []).map(msg => (
                        <div key={msg.id} className={`flex ${msg.is_mine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${msg.is_mine ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
                            {!msg.is_mine && <p className="text-xs font-bold mb-1 opacity-70">{msg.sender_name} · {msg.sender_role}</p>}
                            <p className="text-sm">{msg.body}</p>
                            <p className={`text-xs mt-1 ${msg.is_mine ? 'text-blue-200' : 'text-gray-400'}`}>{new Date(msg.created_at).toLocaleTimeString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <input value={newMsg} onChange={e => setNewMsg(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                        className="input flex-1 text-sm" placeholder="Type a message..." />
                      <button onClick={sendMessage} disabled={sendingMsg || !newMsg.trim()} className="btn btn-primary px-4">
                        {sendingMsg ? <Loader className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* New thread modal */}
      {showNewThread && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50" onClick={() => setShowNewThread(false)}>
          <div className="bg-white rounded-2xl p-6 w-96 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">New Thread</h3>
              <button onClick={() => setShowNewThread(false)}><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label text-xs">Subject</label>
                <input value={newThread.subject} onChange={e => setNewThread({...newThread, subject: e.target.value})}
                  className="input w-full" placeholder="e.g. Missing documents, Rate question..." />
              </div>
              <div>
                <label className="label text-xs">Type</label>
                <select value={newThread.thread_type} onChange={e => setNewThread({...newThread, thread_type: e.target.value})} className="input w-full">
                  <option value="general">General</option>
                  <option value="document_request">Document Request</option>
                  <option value="condition">Loan Condition</option>
                  <option value="question">Question</option>
                </select>
              </div>
              <div>
                <label className="label text-xs">Initial Message</label>
                <textarea value={newThread.initial_message} onChange={e => setNewThread({...newThread, initial_message: e.target.value})}
                  className="input w-full min-h-20 text-sm" placeholder="Your first message..." />
              </div>
              <button onClick={createThread} className="btn btn-primary w-full">Create Thread</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
