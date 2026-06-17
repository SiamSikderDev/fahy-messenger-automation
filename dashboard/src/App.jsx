import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, Users, CheckCircle2, Clock, LogOut, 
  Bot, HelpCircle, UserCheck, ShieldAlert, ArrowRight,
  Edit, Trash2, Plus, Upload, X, Loader2
} from 'lucide-react';

function App() {
  const [auth, setAuth] = useState(() => localStorage.getItem('dashboard_auth') || '');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');

  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [leads, setLeads] = useState([]);
  const [faqs, setFaqs] = useState([]);

  const [selectedConvId, setSelectedConvId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const chatEndRef = useRef(null);

  // Set up auto-refresh polling
  useEffect(() => {
    if (!auth) return;

    const fetchData = async () => {
      try {
        const headers = { 'Authorization': `Basic ${auth}` };
        
        // Stats
        const statsRes = await fetch('/api/dashboard/stats', { headers });
        if (statsRes.status === 401) { handleLogout(); return; }
        const statsData = await statsRes.json();
        setStats(statsData);

        // Conversations
        const convsRes = await fetch('/api/dashboard/conversations', { headers });
        const convsData = await convsRes.json();
        setConversations(convsData);

        // Leads
        const leadsRes = await fetch('/api/dashboard/leads', { headers });
        const leadsData = await leadsRes.json();
        setLeads(leadsData);

        // FAQs
        const faqsRes = await fetch('/api/dashboard/faqs', { headers });
        const faqsData = await faqsRes.json();
        setFaqs(faqsData);
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 8000); // Poll every 8 seconds
    return () => clearInterval(interval);
  }, [auth]);

  // Scroll to bottom of active chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConvId, conversations]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    
    const token = btoa(`${usernameInput}:${passwordInput}`);
    try {
      const res = await fetch('/api/dashboard/login', {
        method: 'POST',
        headers: { 'Authorization': `Basic ${token}` }
      });
      
      if (res.ok) {
        localStorage.setItem('dashboard_auth', token);
        setAuth(token);
      } else {
        setLoginError('Invalid username or password');
      }
    } catch (err) {
      setLoginError('Failed to connect to backend server');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('dashboard_auth');
    setAuth('');
    setStats(null);
    setConversations([]);
    setLeads([]);
  };

  const toggleHandoff = async (senderId) => {
    try {
      const res = await fetch(`/api/dashboard/conversations/${senderId}/toggle-handoff`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}` }
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(prev => prev.map(c => {
          if (c.senderId === senderId) {
            return { ...c, isHandedOver: data.isHandedOver };
          }
          return c;
        }));
      }
    } catch (err) {
      console.error("Failed to toggle handoff status", err);
    }
  };

  // FAQ CRUD States
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [editingFaqId, setEditingFaqId] = useState(null);
  const [editQuestion, setEditQuestion] = useState('');
  const [editAnswer, setEditAnswer] = useState('');
  
  const [isAddingFaq, setIsAddingFaq] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isSavingFaq, setIsSavingFaq] = useState(false);

  // File Importer States
  const [importStatus, setImportStatus] = useState({ loading: false, error: '', success: '' });

  const handleCreateFaq = async (e) => {
    e.preventDefault();
    if (!newQuestion.trim() || !newAnswer.trim()) return;
    setIsSavingFaq(true);
    try {
      const res = await fetch('/api/dashboard/faqs', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`
        },
        body: JSON.stringify({ question: newQuestion, answer: newAnswer })
      });
      if (res.ok) {
        const newFaq = await res.json();
        setFaqs(prev => [...prev, newFaq]);
        setNewQuestion('');
        setNewAnswer('');
        setIsAddingFaq(false);
      } else {
        const err = await res.json();
        alert(`Error saving FAQ: ${err.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Network error while saving FAQ.');
    } finally {
      setIsSavingFaq(false);
    }
  };

  const handleUpdateFaq = async (id) => {
    if (!editQuestion.trim() || !editAnswer.trim()) return;
    setIsSavingFaq(true);
    try {
      const res = await fetch(`/api/dashboard/faqs/${id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`
        },
        body: JSON.stringify({ question: editQuestion, answer: editAnswer })
      });
      if (res.ok) {
        const updated = await res.json();
        setFaqs(prev => prev.map(f => f._id === id ? updated : f));
        setEditingFaqId(null);
      } else {
        const err = await res.json();
        alert(`Error updating FAQ: ${err.error}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingFaq(false);
    }
  };

  const handleDeleteFaq = async (id) => {
    if (!confirm('Are you sure you want to delete this FAQ?')) return;
    try {
      const res = await fetch(`/api/dashboard/faqs/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Basic ${auth}` }
      });
      if (res.ok) {
        setFaqs(prev => prev.filter(f => f._id !== id));
      } else {
        const err = await res.json();
        alert(`Error deleting FAQ: ${err.error}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus({ loading: true, error: '', success: '' });

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target.result;
      try {
        const res = await fetch('/api/dashboard/faqs/import', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Basic ${auth}`
          },
          body: JSON.stringify({ fileName: file.name, content })
        });
        const data = await res.json();
        if (res.ok) {
          setImportStatus({ loading: false, error: '', success: `Successfully imported ${data.count} FAQs from "${file.name}"!` });
          
          const faqsRes = await fetch('/api/dashboard/faqs', { headers: { 'Authorization': `Basic ${auth}` } });
          const faqsData = await faqsRes.json();
          setFaqs(faqsData);
        } else {
          setImportStatus({ loading: false, error: data.error || 'Import failed', success: '' });
        }
      } catch (err) {
        setImportStatus({ loading: false, error: err.message || 'Import failed due to network error', success: '' });
      }
    };
    reader.readAsText(file);
  };

  // Login Screen
  if (!auth) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '20px' }}>
        <form onSubmit={handleLogin} className="glass-card animate-fade-in" style={{ padding: '40px', width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center', marginBottom: '10px' }}>
            <div style={{ background: 'hsla(var(--accent-purple) / 0.2)', padding: '10px', borderRadius: '12px', border: '1px solid hsla(var(--accent-purple) / 0.4)' }}>
              <Bot size={28} style={{ color: 'hsl(var(--accent-purple))' }} />
            </div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: '800', background: 'linear-gradient(to right, #fff, hsla(var(--accent-purple)))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Fahy Portal</h2>
          </div>
          
          <p style={{ textAlign: 'center', color: 'hsla(var(--text-muted))', fontSize: '0.9rem', marginTop: '-10px' }}>
            Sign in to access your AI automation dashboard.
          </p>

          {loginError && (
            <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#f87171', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', textAlign: 'center' }}>
              {loginError}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'hsla(var(--text-muted))' }}>Username</label>
            <input 
              type="text" 
              className="glass-input" 
              placeholder="Enter username" 
              value={usernameInput} 
              onChange={e => setUsernameInput(e.target.value)} 
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'hsla(var(--text-muted))' }}>Password</label>
            <input 
              type="password" 
              className="glass-input" 
              placeholder="Enter password" 
              value={passwordInput} 
              onChange={e => setPasswordInput(e.target.value)} 
              required
            />
          </div>

          <button type="submit" className="glass-btn" style={{ justifyContent: 'center', marginTop: '10px' }}>
            Access Dashboard <ArrowRight size={18} />
          </button>
        </form>
      </div>
    );
  }

  const selectedConv = conversations.find(c => c.senderId === selectedConvId);
  const filteredConversations = conversations.filter(c => 
    c.senderId.includes(searchQuery) || 
    (c.leadDetails?.name && c.leadDetails.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Header */}
      <header className="glass-card" style={{ margin: '16px', borderRadius: '16px', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Bot size={24} style={{ color: 'hsl(var(--accent-purple))' }} />
          <h1 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#fff' }}>FAHY <span style={{ color: 'hsla(var(--accent-purple))', fontWeight: '500' }}>AI</span></h1>
        </div>

        {/* Tabs */}
        <nav style={{ display: 'flex', gap: '8px' }}>
          <div className={`nav-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
            Overview
          </div>
          <div className={`nav-tab ${activeTab === 'conversations' ? 'active' : ''}`} onClick={() => setActiveTab('conversations')}>
            Conversations
          </div>
          <div className={`nav-tab ${activeTab === 'leads' ? 'active' : ''}`} onClick={() => setActiveTab('leads')}>
            Leads Generated
          </div>
          <div className={`nav-tab ${activeTab === 'faqs' ? 'active' : ''}`} onClick={() => setActiveTab('faqs')}>
            FAQ Database
          </div>
        </nav>

        <button onClick={handleLogout} className="glass-btn glass-btn-secondary" style={{ padding: '8px 14px', fontSize: '0.85rem' }}>
          <LogOut size={16} /> Logout
        </button>
      </header>

      {/* Main Panel */}
      <main style={{ flex: 1, padding: '0 16px 16px 16px', display: 'flex', flexDirection: 'column' }}>
        
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
              <div className="glass-card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ background: 'hsla(var(--accent-purple) / 0.15)', padding: '12px', borderRadius: '12px' }}>
                  <MessageSquare size={24} style={{ color: 'hsl(var(--accent-purple))' }} />
                </div>
                <div>
                  <div style={{ color: 'hsla(var(--text-muted))', fontSize: '0.85rem', fontWeight: '600' }}>Conversations</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: '800', marginTop: '2px' }}>{stats?.totalConversations ?? '-'}</div>
                </div>
              </div>

              <div className="glass-card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ background: 'hsla(var(--accent-cyan) / 0.15)', padding: '12px', borderRadius: '12px' }}>
                  <Users size={24} style={{ color: 'hsl(var(--accent-cyan))' }} />
                </div>
                <div>
                  <div style={{ color: 'hsla(var(--text-muted))', fontSize: '0.85rem', fontWeight: '600' }}>Active Leads</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: '800', marginTop: '2px' }}>{stats?.activeLeads ?? '-'}</div>
                </div>
              </div>

              <div className="glass-card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ background: 'hsla(var(--accent-emerald) / 0.15)', padding: '12px', borderRadius: '12px' }}>
                  <CheckCircle2 size={24} style={{ color: 'hsl(var(--accent-emerald))' }} />
                </div>
                <div>
                  <div style={{ color: 'hsla(var(--text-muted))', fontSize: '0.85rem', fontWeight: '600' }}>Leads Completed</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: '800', marginTop: '2px' }}>{stats?.completedLeads ?? '-'}</div>
                </div>
              </div>

              <div className="glass-card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ background: 'hsla(var(--accent-rose) / 0.15)', padding: '12px', borderRadius: '12px' }}>
                  <Clock size={24} style={{ color: 'hsl(var(--accent-rose))' }} />
                </div>
                <div>
                  <div style={{ color: 'hsla(var(--text-muted))', fontSize: '0.85rem', fontWeight: '600' }}>Avg Response Time</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: '800', marginTop: '2px' }}>
                    {stats?.avgResponseTimeMs ? `${(stats.avgResponseTimeMs / 1000).toFixed(2)}s` : '-'}
                  </div>
                </div>
              </div>
            </div>

            {/* Visual SVGs and Top Questions */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
              {/* SVG Performance Chart */}
              <div className="glass-card" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  AI Automation Efficacy
                </h3>
                <div style={{ width: '100%', height: '200px', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                  {/* Clean SVG visual bar/ring visualization */}
                  <svg width="180" height="180" viewBox="0 0 36 36">
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="hsla(var(--border-glass))"
                      strokeWidth="3.5"
                    />
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="hsl(var(--accent-purple))"
                      strokeWidth="3.5"
                      strokeDasharray="85, 100"
                    />
                  </svg>
                  <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ fontSize: '1.8rem', fontWeight: '800' }}>85%</span>
                    <span style={{ fontSize: '0.75rem', color: 'hsla(var(--text-muted))' }}>Auto Resolved</span>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '16px', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: 'hsl(var(--accent-purple))' }}></span>
                    Automated (85%)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: 'hsla(var(--border-glass))' }}></span>
                    Handoff Needed (15%)
                  </div>
                </div>
              </div>

              {/* Top Questions Table */}
              <div className="glass-card" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '16px' }}>Top Customer Questions</h3>
                {stats?.topQuestions && stats.topQuestions.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {stats.topQuestions.map((q, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid hsla(var(--border-glass))', borderRadius: '8px' }}>
                        <span style={{ fontSize: '0.9rem', color: '#fff', textTransform: 'capitalize' }}>"{q.question}"</span>
                        <span style={{ background: 'hsla(var(--accent-purple) / 0.15)', color: 'hsl(var(--accent-purple))', padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '700' }}>
                          {q.count} times
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: 'hsla(var(--text-muted))', textAlign: 'center', padding: '40px 0' }}>No question statistics logged yet.</div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: CONVERSATIONS INBOX */}
        {activeTab === 'conversations' && (
          <div className="glass-card animate-fade-in" style={{ flex: 1, display: 'flex', overflow: 'hidden', height: 'calc(100vh - 120px)' }}>
            
            {/* Left Column: List */}
            <div style={{ width: '320px', borderRight: '1px solid hsla(var(--border-glass))', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '16px', borderBottom: '1px solid hsla(var(--border-glass))' }}>
                <input 
                  type="text" 
                  className="glass-input" 
                  placeholder="Search PSID or name..." 
                  style={{ width: '100%' }}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              <div style={{ flex: 1, overflowY: 'auto' }}>
                {filteredConversations.map(c => {
                  const hasLead = c.leadDetails?.name;
                  const isSelected = c.senderId === selectedConvId;
                  const lastMsg = c.messages[c.messages.length - 1];
                  
                  return (
                    <div 
                      key={c.senderId} 
                      onClick={() => setSelectedConvId(c.senderId)}
                      style={{ 
                        padding: '16px', 
                        cursor: 'pointer', 
                        borderBottom: '1px solid hsla(var(--border-glass))',
                        background: isSelected ? 'hsla(var(--accent-purple) / 0.1)' : 'transparent',
                        borderLeft: isSelected ? '4px solid hsl(var(--accent-purple))' : 'none',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#fff' }}>
                          {hasLead ? c.leadDetails.name : `User: ${c.senderId.slice(-6)}`}
                        </span>
                        
                        {c.isHandedOver && (
                          <span style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600' }}>
                            Muted
                          </span>
                        )}
                      </div>
                      
                      <div style={{ fontSize: '0.8rem', color: 'hsla(var(--text-muted))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {lastMsg ? lastMsg.userMessage : 'No messages'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Center Column: Chat Messages */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.1)' }}>
              {selectedConv ? (
                <>
                  {/* Chat Header */}
                  <div style={{ padding: '16px 24px', borderBottom: '1px solid hsla(var(--border-glass))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.1)' }}>
                    <div>
                      <h4 style={{ fontWeight: '700', fontSize: '1rem' }}>
                        {selectedConv.leadDetails?.name ? selectedConv.leadDetails.name : `User (PSID: ${selectedConv.senderId})`}
                      </h4>
                      <span style={{ fontSize: '0.75rem', color: 'hsla(var(--text-muted))' }}>Active Chat Stream</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.85rem', color: 'hsla(var(--text-muted))' }}>Mute Bot:</span>
                      <label className="switch">
                        <input 
                          type="checkbox" 
                          checked={selectedConv.isHandedOver} 
                          onChange={() => toggleHandoff(selectedConv.senderId)}
                        />
                        <span className="slider"></span>
                      </label>
                    </div>
                  </div>

                  {/* Chat Flow */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {selectedConv.messages.map((m, idx) => (
                      <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        
                        {/* User Message Bubble */}
                        <div style={{ alignSelf: 'flex-end', maxWidth: '70%' }}>
                          <div style={{ background: 'hsl(var(--accent-purple))', padding: '10px 16px', borderRadius: '16px 16px 0 16px', color: '#fff', fontSize: '0.92rem' }}>
                            {m.userMessage}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'hsla(var(--text-muted))', textAlign: 'right', marginTop: '2px' }}>
                            {new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </div>
                        </div>

                        {/* Bot Message Bubble */}
                        <div style={{ alignSelf: 'flex-start', maxWidth: '70%' }}>
                          <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid hsla(var(--border-glass))', padding: '10px 16px', borderRadius: '16px 16px 16px 0', color: '#f3f4f6', fontSize: '0.92rem' }}>
                            {m.aiResponse}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', fontSize: '0.7rem', color: 'hsla(var(--text-muted))', marginTop: '2px' }}>
                            <span>{new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            {m.responseTimeMs && (
                              <span style={{ color: 'hsla(var(--accent-cyan) / 0.8)' }}>
                                ({ (m.responseTimeMs / 1000).toFixed(2) }s response)
                              </span>
                            )}
                          </div>
                        </div>

                      </div>
                    ))}
                    <div ref={chatEndRef}></div>
                  </div>
                </>
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'hsla(var(--text-muted))', gap: '12px' }}>
                  <MessageSquare size={48} style={{ opacity: 0.3 }} />
                  <span>Select a conversation from the sidebar to read logs</span>
                </div>
              )}
            </div>

            {/* Right Column: Customer Details */}
            {selectedConv && (
              <div style={{ width: '280px', borderLeft: '1px solid hsla(var(--border-glass))', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div>
                  <h5 style={{ fontSize: '0.8rem', color: 'hsla(var(--text-muted))', textTransform: 'uppercase', marginBottom: '8px' }}>User Details</h5>
                  <div style={{ wordBreak: 'break-all', fontSize: '0.85rem', padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid hsla(var(--border-glass))', borderRadius: '8px' }}>
                    <strong>PSID:</strong><br />{selectedConv.senderId}
                  </div>
                </div>

                <div>
                  <h5 style={{ fontSize: '0.8rem', color: 'hsla(var(--text-muted))', textTransform: 'uppercase', marginBottom: '8px' }}>Lead Flow Status</h5>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {selectedConv.leadStatus === 'completed' ? (
                      <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <UserCheck size={14} /> Completed
                      </span>
                    ) : selectedConv.leadStatus !== 'none' ? (
                      <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '700' }}>
                        Collecting Info
                      </span>
                    ) : (
                      <span style={{ color: 'hsla(var(--text-muted))', fontSize: '0.85rem' }}>No lead session active</span>
                    )}
                  </div>
                </div>

                {selectedConv.leadDetails?.name && (
                  <div>
                    <h5 style={{ fontSize: '0.8rem', color: 'hsla(var(--text-muted))', textTransform: 'uppercase', marginBottom: '8px' }}>Contact Information</h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                      <div><strong>Name:</strong> {selectedConv.leadDetails.name}</div>
                      <div><strong>Phone:</strong> {selectedConv.leadDetails.phone}</div>
                      <div><strong>Email:</strong> {selectedConv.leadDetails.email}</div>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {selectedConv.isHandedOver ? (
                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', padding: '12px', borderRadius: '8px', display: 'flex', gap: '8px', color: '#f87171' }}>
                      <ShieldAlert size={20} style={{ flexShrink: 0 }} />
                      <div style={{ fontSize: '0.75rem' }}>
                        <strong>Bot Muted:</strong> The automated assistant is paused. You can answer this customer manually via the Page Inbox.
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '12px', borderRadius: '8px', display: 'flex', gap: '8px', color: '#34d399' }}>
                      <Bot size={20} style={{ flexShrink: 0 }} />
                      <div style={{ fontSize: '0.75rem' }}>
                        <strong>Bot Active:</strong> Automated RAG queries and lead captures are handling messages automatically.
                      </div>
                    </div>
                  )}
                </div>

              </div>
            )}

          </div>
        )}

        {/* TAB 3: LEADS LIST */}
        {activeTab === 'leads' && (
          <div className="glass-card animate-fade-in" style={{ padding: '24px', overflowX: 'auto' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '20px' }}>Generated Leads List</h3>
            {leads.length > 0 ? (
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>Customer Name</th>
                    <th>Phone Number</th>
                    <th>Email Address</th>
                    <th>Status</th>
                    <th>Captured On</th>
                    <th>Sender PSID</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map(l => (
                    <tr key={l._id}>
                      <td style={{ fontWeight: '700', color: '#fff' }}>{l.name || '—'}</td>
                      <td>{l.phone || '—'}</td>
                      <td>{l.email || '—'}</td>
                      <td>
                        <span style={{ 
                          background: l.status === 'completed' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(251, 191, 36, 0.15)',
                          color: l.status === 'completed' ? '#34d399' : '#fbbf24',
                          border: l.status === 'completed' ? '1px solid rgba(52, 211, 153, 0.3)' : '1px solid rgba(251, 191, 36, 0.3)',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '0.8rem',
                          fontWeight: '600'
                        }}>
                          {l.status}
                        </span>
                      </td>
                      <td>{new Date(l.updatedAt).toLocaleDateString()}</td>
                      <td style={{ fontSize: '0.8rem', color: 'hsla(var(--text-muted))', fontFamily: 'monospace' }}>{l.senderId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ textAlign: 'center', color: 'hsla(var(--text-muted))', padding: '60px 0' }}>No leads captured in the database yet.</div>
            )}
          </div>
        )}

        {/* TAB 4: FAQ DATABASE */}
        {activeTab === 'faqs' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Header controls */}
            <div className="glass-card" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#fff' }}>FAQ Database & RAG Context</h3>
                <p style={{ fontSize: '0.82rem', color: 'hsla(var(--text-muted))', marginTop: '2px' }}>
                  Manage the Q&A context the AI bot uses to answer user questions.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={() => { setIsAddingFaq(!isAddingFaq); setIsImportOpen(false); }} 
                  className="glass-btn" 
                  style={{ fontSize: '0.85rem', padding: '8px 16px' }}
                >
                  <Plus size={16} /> Add FAQ
                </button>
                <button 
                  onClick={() => { setIsImportOpen(!isImportOpen); setIsAddingFaq(false); setImportStatus({ loading: false, error: '', success: '' }); }} 
                  className="glass-btn glass-btn-secondary" 
                  style={{ fontSize: '0.85rem', padding: '8px 16px' }}
                >
                  <Upload size={16} /> Import Documents
                </button>
              </div>
            </div>

            {/* AI Document Importer panel */}
            {isImportOpen && (
              <div className="glass-card animate-fade-in" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ fontWeight: '700', fontSize: '1rem' }}>Business File Import</h4>
                  <button onClick={() => setIsImportOpen(false)} style={{ background: 'none', border: 'none', color: 'hsla(var(--text-muted))', cursor: 'pointer' }}><X size={20} /></button>
                </div>
                
                <p style={{ fontSize: '0.85rem', color: 'hsla(var(--text-muted))' }}>
                  Upload a <strong>.json</strong> file containing FAQ arrays, or a raw <strong>.txt</strong> file with your business policies. Text files will be processed by **Gemini AI** to extract relevant Q&A pairs automatically!
                </p>

                {/* Drag-drop or File Input */}
                <div style={{ 
                  border: '2px dashed hsla(var(--border-glass))', 
                  borderRadius: '12px', 
                  padding: '40px 20px', 
                  textAlign: 'center', 
                  cursor: 'pointer',
                  background: 'rgba(255,255,255,0.01)',
                  position: 'relative'
                }}>
                  <input 
                    type="file" 
                    accept=".json,.txt"
                    onChange={handleImportFile}
                    disabled={importStatus.loading}
                    style={{ 
                      position: 'absolute', 
                      top: 0, left: 0, width: '100%', height: '100%', 
                      opacity: 0, cursor: 'pointer' 
                    }}
                  />
                  {importStatus.loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                      <Loader2 size={36} className="animate-spin" style={{ color: 'hsl(var(--accent-purple))' }} />
                      <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>Extracting and Vectorizing with Gemini AI...</span>
                      <span style={{ fontSize: '0.75rem', color: 'hsla(var(--text-muted))' }}>This may take up to 15 seconds. Please don't close this tab.</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                      <Upload size={36} style={{ color: 'hsla(var(--text-muted))' }} />
                      <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>Click to select a .txt or .json file</span>
                      <span style={{ fontSize: '0.75rem', color: 'hsla(var(--text-muted))' }}>Max size 1MB</span>
                    </div>
                  )}
                </div>

                {importStatus.error && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', gap: '8px' }}>
                    <ShieldAlert size={18} style={{ flexShrink: 0 }} />
                    <span>{importStatus.error}</span>
                  </div>
                )}

                {importStatus.success && (
                  <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', padding: '12px', borderRadius: '8px', fontSize: '0.85rem' }}>
                    {importStatus.success}
                  </div>
                )}
              </div>
            )}

            {/* Add FAQ form panel */}
            {isAddingFaq && (
              <form onSubmit={handleCreateFaq} className="glass-card animate-fade-in" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ fontWeight: '700', fontSize: '1rem' }}>Add New FAQ Document</h4>
                  <button type="button" onClick={() => setIsAddingFaq(false)} style={{ background: 'none', border: 'none', color: 'hsla(var(--text-muted))', cursor: 'pointer' }}><X size={20} /></button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'hsla(var(--text-muted))' }}>Question / Prompt</label>
                  <input 
                    type="text" 
                    className="glass-input" 
                    placeholder="e.g. What are your business hours?" 
                    value={newQuestion}
                    onChange={e => setNewQuestion(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'hsla(var(--text-muted))' }}>Answer Context</label>
                  <textarea 
                    className="glass-input" 
                    rows="3"
                    style={{ resize: 'vertical' }}
                    placeholder="e.g. We are open from Monday to Friday, 9:00 AM to 6:00 PM." 
                    value={newAnswer}
                    onChange={e => setNewAnswer(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                  <button type="button" onClick={() => setIsAddingFaq(false)} className="glass-btn glass-btn-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>Cancel</button>
                  <button type="submit" className="glass-btn" disabled={isSavingFaq} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                    {isSavingFaq ? 'Saving...' : 'Add FAQ'}
                  </button>
                </div>
              </form>
            )}

            {/* FAQ Table List */}
            <div className="glass-card" style={{ padding: '24px', overflowX: 'auto' }}>
              {faqs.length > 0 ? (
                <table className="glass-table">
                  <thead>
                    <tr>
                      <th style={{ width: '30%' }}>Question</th>
                      <th style={{ width: '55%' }}>Answer Context</th>
                      <th style={{ width: '15%', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faqs.map((f) => {
                      const isEditing = editingFaqId === f._id;
                      return (
                        <tr key={f._id}>
                          {isEditing ? (
                            <>
                              <td>
                                <input 
                                  type="text" 
                                  className="glass-input" 
                                  style={{ width: '100%' }}
                                  value={editQuestion}
                                  onChange={e => setEditQuestion(e.target.value)}
                                />
                              </td>
                              <td>
                                <textarea 
                                  className="glass-input" 
                                  rows="2"
                                  style={{ width: '100%', resize: 'vertical' }}
                                  value={editAnswer}
                                  onChange={e => setEditAnswer(e.target.value)}
                                />
                              </td>
                              <td style={{ textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center', padding: '22px 16px' }}>
                                <button 
                                  type="button"
                                  onClick={() => handleUpdateFaq(f._id)}
                                  className="glass-btn"
                                  style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                                  disabled={isSavingFaq}
                                >
                                  Save
                                </button>
                                <button 
                                  type="button"
                                  onClick={() => setEditingFaqId(null)}
                                  className="glass-btn glass-btn-secondary"
                                  style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                                >
                                  Cancel
                                </button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td style={{ fontWeight: '700', color: '#fff' }}>{f.question}</td>
                              <td style={{ color: 'hsla(var(--text-muted))', fontSize: '0.9rem', lineHeight: '1.4' }}>{f.answer}</td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                  <button 
                                    type="button"
                                    onClick={() => { setEditingFaqId(f._id); setEditQuestion(f.question); setEditAnswer(f.answer); }}
                                    className="glass-btn glass-btn-secondary" 
                                    style={{ padding: '6px', borderRadius: '6px' }}
                                    title="Edit FAQ"
                                  >
                                    <Edit size={14} />
                                  </button>
                                  <button 
                                    type="button"
                                    onClick={() => handleDeleteFaq(f._id)}
                                    className="glass-btn glass-btn-secondary" 
                                    style={{ padding: '6px', borderRadius: '6px', borderColor: 'rgba(239, 68, 68, 0.25)', color: '#f87171' }}
                                    title="Delete FAQ"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div style={{ textAlign: 'center', color: 'hsla(var(--text-muted))', padding: '60px 0' }}>No FAQ context has been seeded yet.</div>
              )}
            </div>

          </div>
        )}

      </main>
    </div>
  );
}

export default App;
