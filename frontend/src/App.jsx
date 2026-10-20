import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowDownToLine, BarChart3, Check, ChevronDown, Copy,
  ExternalLink, FileSpreadsheet, FolderKanban, Globe, Link2, LockKeyhole, LogOut,
  Menu, Pencil, Plus, QrCode, RefreshCw, Search, ShieldCheck, Tag, Users, X, Crown, CreditCard,
  ArrowRight, Zap, MousePointerClick, Sparkles, Clock3, ExternalLink as ExternalLinkIcon
} from 'lucide-react';
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const PAGES = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'links', label: 'Links', icon: Link2 },
  { id: 'campaigns', label: 'Campaigns', icon: FolderKanban },
  { id: 'tags', label: 'Tags', icon: Tag },
  { id: 'qr', label: 'QR codes', icon: QrCode },
  { id: 'import', label: 'Bulk import', icon: FileSpreadsheet },
  { id: 'activity', label: 'Activity history', icon: Activity },
  { id: 'plans', label: 'Plans & billing', icon: Crown },
  { id: 'settings', label: 'Settings', icon: Globe },
];

const PLAN_CARDS = [
  {
    name: 'Free', price: '₹0', period: 'forever', description: 'Start shortening links and understanding your traffic.',
    button: 'Free plan', featured: false,
    features: [
      { label: '25 new short links per month', included: true },
      { label: '1,000 tracked clicks per month', included: true },
      { label: 'Basic click analytics', included: true },
      { label: '30-day analytics history', included: true },
      { label: 'Custom short aliases', included: true },
      { label: 'Basic QR code generation', included: true },
      { label: 'Tags and link management', included: true },
      { label: 'Link expiry and click limits', included: true },
      { label: 'Password-protected links', tier: 'PRO' },
      { label: 'Custom domains and branded QR codes', tier: 'PRO' },
      { label: 'Bulk CSV import', tier: 'GROWTH' },
      { label: 'Unlimited tracked clicks', tier: 'GROWTH' },
    ],
  },
  {
    name: 'Pro', price: '₹199', period: '/ month', description: 'For creators, freelancers and individual marketers.',
    button: 'Upgrade to Pro', featured: true,
    features: [
      { label: '500 new short links per month', included: true },
      { label: '25,000 tracked clicks per month', included: true },
      { label: '90-day analytics history', included: true, tier: 'PRO' },
      { label: 'One custom domain', included: true, tier: 'PRO' },
      { label: 'Advanced device, browser and referrer analytics', included: true, tier: 'PRO' },
      { label: 'Password-protected links', included: true, tier: 'PRO' },
      { label: 'Branded QR codes, CSV analytics export and UTM builder', included: true, tier: 'PRO' },
      { label: 'Bulk CSV import', tier: 'GROWTH' },
      { label: 'Unlimited tracked clicks', tier: 'GROWTH' },
    ],
  },
  {
    name: 'Growth', price: '₹599', period: '/ month', description: 'For businesses, agencies and high-traffic campaigns.',
    button: 'Upgrade to Growth', featured: false,
    features: [
      { label: '2,000 new short links per month', included: true },
      { label: 'Unlimited tracked clicks', included: true, tier: 'GROWTH' },
      { label: 'One-year analytics history', included: true, tier: 'GROWTH' },
      { label: 'Up to 3 custom domains', included: true, tier: 'PRO' },
      { label: 'Bulk CSV link import', included: true, tier: 'GROWTH' },
      { label: 'Geographic analytics and smart routing', included: true, tier: 'GROWTH' },
      { label: 'A/B destination testing', included: true, tier: 'GROWTH' },
      { label: 'API access and webhooks', included: true, tier: 'GROWTH' },
      { label: 'Up to 3 team members', included: true, tier: 'GROWTH' },
      { label: 'Advanced audit history and campaign comparisons', included: true, tier: 'GROWTH' },
    ],
  },
];

async function api(path, { token, ...options } = {}) {
  const headers = { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers };
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const type = response.headers.get('content-type') || '';
  const payload = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
  return payload;
}

function Button({ children, variant = 'primary', ...props }) { return <button className={`button ${variant}`} {...props}>{children}</button>; }
function Metric({ label, value, hint, icon: Icon }) {
  return <div className="metric card"><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={18} /></span></div><strong>{value ?? '—'}</strong><small>{hint}</small></div>;
}
function Badge({ children, tone = 'neutral' }) { return <span className={`badge ${tone}`}>{children}</span>; }
function PremiumBadge({ tier = 'PRO' }) { return <span className={`premium-badge ${tier.toLowerCase()}`} title={`Available from the ${tier} plan`}><Crown size={10} strokeWidth={2.5}/>{tier}</span>; }
function UsageMeter({ label, used = 0, limit = null }) {
  const unlimited = limit === null || limit === undefined || !Number.isFinite(Number(limit));
  const numericLimit = unlimited ? null : Number(limit);
  const percent = unlimited || numericLimit <= 0 ? 0 : Math.min(100, Math.round((Number(used || 0) / numericLimit) * 100));
  const isReached = !unlimited && Number(used || 0) >= numericLimit;
  return <div className="usage-meter">
    <div className="usage-meter-heading"><span>{label}</span><strong>{Number(used || 0).toLocaleString()} <small>{unlimited ? '/ unlimited' : `/ ${numericLimit.toLocaleString()}`}</small></strong></div>
    {!unlimited && <div className="usage-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={numericLimit} aria-valuenow={Math.min(Number(used || 0), numericLimit)}><span className={isReached ? 'reached' : ''} style={{ width: `${percent}%` }} /></div>}
  </div>;
}
function Empty({ title, body }) { return <div className="empty"><div className="empty-icon"><Link2 size={22}/></div><strong>{title}</strong><p>{body}</p></div>; }

function ClickActivityTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="chart-tooltip">
      <span>{point.fullDate}</span>
      <strong>{Number(point.clicks || 0).toLocaleString()}</strong>
      <small>human-qualified clicks</small>
    </div>
  );
}


export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('lp_token') || '');
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('lp_user') || 'null'); } catch { return null; } });
  const [page, setPage] = useState('overview');
  const [authView, setAuthView] = useState(false);
  const [billingSuccess, setBillingSuccess] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [data, setData] = useState({ links: [], campaigns: [], tags: [], activity: [], analytics: null, campaignAnalytics: [], blockedDomains: [], users: [], pendingVersions: [], usage: null, billingConfig: null, paymentHistory: [] });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [search, setSearch] = useState('');
  const [linkFormOpen, setLinkFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [linkForm, setLinkForm] = useState({ title: '', originalUrl: '', code: '', expiresAt: '', clickLimit: '', password: '', campaignId: '', folder: '', tagIds: [] });
  const [campaignName, setCampaignName] = useState('');
  const [campaignDescription, setCampaignDescription] = useState('');
  const [tagName, setTagName] = useState('');
  const [csvFile, setCsvFile] = useState(null);
  const [qrResult, setQrResult] = useState(null);
  const [domainForm, setDomainForm] = useState({ domain: '', reason: '' });
  const [reviewReason, setReviewReason] = useState('');
  const [checkoutPlan, setCheckoutPlan] = useState(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState(null);

  const flash = useCallback((message, type = 'success') => {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 4500);
  }, []);

  const refresh = useCallback(async (authToken = token, currentUser = user) => {
    if (!authToken) return;
    try {
      const [links, campaigns, tags, analytics, campaignAnalytics, activity, usage, billingConfig, paymentHistory] = await Promise.all([
        api('/api/links', { token: authToken }), api('/api/campaigns', { token: authToken }),
        api('/api/tags', { token: authToken }), api('/api/analytics/overview', { token: authToken }),
        api('/api/analytics/campaigns', { token: authToken }),
        api('/api/activity', { token: authToken }),
        api('/api/billing/usage', { token: authToken }).catch(() => null),
        api('/api/billing/config', { token: authToken }).catch(() => null),
        api('/api/billing/history', { token: authToken }).catch(() => ({ transactions: [] }))
      ]);
      setData(prev => ({ ...prev, links: links.links || [], campaigns: campaigns.campaigns || [], tags: tags.tags || [], analytics, campaignAnalytics: campaignAnalytics.campaigns || [], activity: activity.activity || [], usage, billingConfig, paymentHistory: paymentHistory?.transactions || [] }));
      if (currentUser?.role === 'admin') {
        const [blocked, users, versions] = await Promise.all([
          api('/api/admin/blocked-domains', { token: authToken }), api('/api/admin/users', { token: authToken }),
          api('/api/admin/link-versions?status=pending', { token: authToken }).catch(() => ({ versions: [] }))
        ]);
        setData(prev => ({ ...prev, blockedDomains: blocked.blockedDomains || [], users: users.users || [], pendingVersions: versions.versions || [] }));
      }
    } catch (err) { flash(err.message, 'error'); }
  }, [token, user, flash]);

  useEffect(() => { if (token && user) refresh(token, user); }, [token, user, refresh]);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api('/api/auth/me', { token }).then(result => { if (!cancelled) { setUser(result.user); localStorage.setItem('lp_user', JSON.stringify(result.user)); } }).catch(() => { if (!cancelled) { localStorage.removeItem('lp_token'); localStorage.removeItem('lp_user'); setToken(''); setUser(null); } });
    return () => { cancelled = true; };
  }, []);

  async function submitAuth(e) {
    e.preventDefault(); setBusy(true);
    try {
      const result = await api(`/api/auth/${authMode === 'login' ? 'login' : 'register'}`, { method: 'POST', body: JSON.stringify(authForm) });
      localStorage.setItem('lp_token', result.token); localStorage.setItem('lp_user', JSON.stringify(result.user));
      setToken(result.token); setUser(result.user); setPage('overview'); flash(`Welcome${result.user.name ? `, ${result.user.name}` : ''}!`);
    } catch (err) { flash(err.message, 'error'); }
    finally { setBusy(false); }
  }
  function logout() { localStorage.removeItem('lp_token'); localStorage.removeItem('lp_user'); setToken(''); setUser(null); setAuthView(false); setPage('overview'); setData({ links: [], campaigns: [], tags: [], activity: [], analytics: null, campaignAnalytics: [], blockedDomains: [], users: [], pendingVersions: [], usage: null, billingConfig: null, paymentHistory: [] }); }

  async function createLink(e) {
    e.preventDefault();
    const currentPlan = String(data.usage?.plan || user?.plan || 'free').toLowerCase();
    const currentLimit = currentPlan === 'growth' ? 2000 : currentPlan === 'pro' ? 500 : 25;
    if (user?.role !== 'admin' && currentPlan === 'free' && linkForm.password.trim()) {
      setPage('plans');
      flash('Password-protected links are a Pro feature. Choose Pro or Growth to unlock it.', 'warning');
      return;
    }
    const linksUsed = Number(data.usage?.usage?.linksCreated || 0);
    if (!editingId && user?.role !== 'admin' && linksUsed >= currentLimit) {
      setPage('plans');
      flash(`You’ve reached your ${currentPlan === 'growth' ? 'Growth' : currentPlan === 'pro' ? 'Pro' : 'Free'} monthly link-creation limit. Compare plans to upgrade.`, 'warning');
      return;
    }
    setBusy(true);
    try {
      const payload = { ...linkForm, expiresAt: linkForm.expiresAt ? new Date(linkForm.expiresAt).toISOString() : null, clickLimit: linkForm.clickLimit ? Number(linkForm.clickLimit) : null, campaignId: linkForm.campaignId || null, tagIds: linkForm.tagIds || [] };
      let result;
      if (editingId) {
        delete payload.code;
        if (!linkForm.password) delete payload.password;
        else payload.password = linkForm.password;
        result = await api(`/api/links/${editingId}`, { token, method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        if (!payload.code) delete payload.code;
        payload.password = linkForm.password || null;
        result = await api('/api/links', { token, method: 'POST', body: JSON.stringify(payload) });
      }
      setLinkFormOpen(false); setEditingId(null); setLinkForm({ title: '', originalUrl: '', code: '', expiresAt: '', clickLimit: '', password: '', campaignId: '', folder: '', tagIds: [] });
      await refresh();
      if (result.pendingDestinationChange) flash('Destination change submitted for admin review', 'warning');
      else flash(editingId ? 'Link updated' : `Created ${result.shortUrl}`);
    } catch (err) { flash(err.message, 'error'); }
    finally { setBusy(false); }
  }
  function startEdit(link) {
    setEditingId(link._id);
    setLinkForm({ title: link.title || '', originalUrl: link.originalUrl, code: link.code, expiresAt: link.expiresAt ? new Date(new Date(link.expiresAt).getTime() - new Date(link.expiresAt).getTimezoneOffset()*60000).toISOString().slice(0,16) : '', clickLimit: link.clickLimit ?? '', password: '', campaignId: link.campaignId?._id || link.campaignId || '', folder: link.folder || '', tagIds: (link.tagIds || []).map(t => String(t._id || t)) });
    setLinkFormOpen(true);
  }
  async function toggleLink(link) {
    try { await api(`/api/links/${link._id}`, { token, method: 'PATCH', body: JSON.stringify({ status: link.status === 'active' ? 'disabled' : 'active' }) }); await refresh(); flash(`Link ${link.status === 'active' ? 'disabled' : 'activated'}`); }
    catch (err) { flash(err.message, 'error'); }
  }
  async function archiveLink(link) {
    if (!confirm(`Archive ${link.code}? Historical analytics will be retained.`)) return;
    try { await api(`/api/links/${link._id}`, { token, method: 'DELETE' }); await refresh(); flash('Link archived; analytics retained'); }
    catch (err) { flash(err.message, 'error'); }
  }
  async function createCampaign(e) {
    e.preventDefault(); try { await api('/api/campaigns', { token, method: 'POST', body: JSON.stringify({ name: campaignName, description: campaignDescription }) }); setCampaignName(''); setCampaignDescription(''); await refresh(); flash('Campaign created'); }
    catch (err) { flash(err.message, 'error'); }
  }
  async function createTag(e) {
    e.preventDefault(); try { await api('/api/tags', { token, method: 'POST', body: JSON.stringify({ name: tagName }) }); setTagName(''); await refresh(); flash('Tag created'); }
    catch (err) { flash(err.message, 'error'); }
  }
  async function generateQr(link) {
    try { const result = await api(`/api/links/${link._id}/qr`, { token, method: 'POST', body: JSON.stringify({ name: `QR for ${link.code}` }) }); setQrResult(result); setPage('qr'); flash('QR code generated'); }
    catch (err) { flash(err.message, 'error'); }
  }
  async function doImport(e) {
    e.preventDefault(); if (!csvFile) return;
    const form = new FormData(); form.append('file', csvFile);
    try { const result = await api('/api/links/bulk-import', { token, method: 'POST', body: form }); await refresh(); flash(`Imported ${result.imported} rows; ${result.errors} errors`, result.errors ? 'warning' : 'success'); }
    catch (err) {
      if (String(err.message).toLowerCase().includes('growth plan') || String(err.message).toLowerCase().includes('monthly limit')) { setPage('plans'); flash(err.message, 'warning'); }
      else flash(err.message, 'error');
    }
  }
  async function addBlockedDomain(e) {
    e.preventDefault(); try { await api('/api/admin/blocked-domains', { token, method: 'POST', body: JSON.stringify(domainForm) }); setDomainForm({ domain: '', reason: '' }); await refresh(); flash('Domain added to blocklist'); }
    catch (err) { flash(err.message, 'error'); }
  }
  async function deleteBlocked(id) {
    try { await api(`/api/admin/blocked-domains/${id}`, { token, method: 'DELETE' }); await refresh(); flash('Domain removed from blocklist'); }
    catch (err) { flash(err.message, 'error'); }
  }
  async function reviewVersion(id, decision) {
    try { await api(`/api/admin/link-versions/${id}/review`, { token, method: 'POST', body: JSON.stringify({ decision, reason: reviewReason }) }); setReviewReason(''); await refresh(); flash(`Destination change ${decision === 'approve' ? 'approved' : 'rejected'}`); }
    catch (err) { flash(err.message, 'error'); }
  }

  function openCheckout(planKey) {
    if (!['pro', 'growth'].includes(planKey)) return;
    setCheckoutMessage(null);
    setCheckoutPlan(planKey);
  }

  async function runMockCheckout() {
    if (!checkoutPlan || checkoutBusy) return;
    setCheckoutBusy(true);
    setCheckoutMessage(null);
    try {
      // The backend always simulates a successful demo payment for the signed-in account.
      // Account identity comes from the authenticated token, never from a client-supplied user ID.
      const result = await api('/api/billing/mock-checkout', {
        token,
        method: 'POST',
        body: JSON.stringify({ plan: checkoutPlan })
      });
      if (result.success && result.outcome === 'succeeded') {
        const account = await api('/api/auth/me', { token });
        localStorage.setItem('lp_user', JSON.stringify(account.user));
        setUser(account.user);
        await refresh(token, account.user);
        setBillingSuccess({ plan: checkoutPlan, email: account.user.email, expiresAt: result.subscription?.expiresAt || null });
        setCheckoutMessage({ type: 'success', text: `${account.user.email}: ${checkoutPlan === 'pro' ? 'Pro' : 'Growth'} is now active for 30 days on this account. No real money was charged.` });
        flash(`${checkoutPlan === 'pro' ? 'Pro' : 'Growth'} activated for ${account.user.email}. Demo only; no real payment was made.`);
        setCheckoutPlan(null);
      } else {
        throw new Error(result.message || 'The demo activation could not be confirmed.');
      }
    } catch (err) {
      setCheckoutMessage({ type: 'error', text: err.message || 'The demo checkout could not be completed.' });
    } finally {
      setCheckoutBusy(false);
    }
  }

  const filteredLinks = useMemo(() => data.links.filter(l => `${l.code} ${l.title} ${l.originalUrl}`.toLowerCase().includes(search.toLowerCase())), [data.links, search]);
  if ((!token || !user) && !authView) return <div className="public-shell">
    <header className="marketing-nav">
      <a href="#home" className="marketing-brand" aria-label="LinkPulse home"><span className="brand-mark">LP</span><strong>LinkPulse</strong></a>
      <nav className="marketing-links"><a href="#features">Features</a><a href="#public-pricing">Pricing</a><a href="#how-it-works">How it works</a><a href="#resources">Resources</a></nav>
      <div className="marketing-nav-actions"><button className="marketing-login" onClick={()=>{setAuthMode('login');setAuthView(true)}}>Log in</button><button className="marketing-cta" onClick={()=>{setAuthMode('register');setAuthView(true)}}>Get started free <ArrowRight size={15}/></button></div>
    </header>
    <main>
      <section className="public-top-layout" id="home">
        <div className="marketing-hero-panel">
          <div className="marketing-hero-copy">
            <span className="marketing-eyebrow"><span className="status-pulse"/> SMARTER LINKS · CLEARER SIGNALS</span>
            <h1>Short links.<br/><span>Stronger insights.</span></h1>
            <p className="marketing-lede">Create short links, track performance, and grow your audience with powerful analytics. Simple, secure, and built for creators, marketers, and businesses.</p>
            <div className="marketing-hero-actions"><button className="marketing-cta big" onClick={()=>{setAuthMode('register');setAuthView(true)}}>Get started free <ArrowRight size={17}/></button><a className="marketing-secondary" href="#public-pricing">View pricing</a></div>
            <div className="marketing-trust"><span><Check size={15}/> No credit card required</span><span><Check size={15}/> Start in seconds</span><span><Check size={15}/> Built for growing teams</span></div>
          </div>
          <div className="marketing-visual" aria-label="LinkPulse analytics preview">
            <div className="mock-floating-pill fast-pill"><Zap size={15} fill="currentColor"/> Fast redirects</div>
            <div className="mock-floating-pill secure-pill"><ShieldCheck size={15}/> Safe by design</div>
            <div className="mock-short-link"><span>linkpulse.to/summer</span><button onClick={()=>navigator.clipboard?.writeText('https://linkpulse.to/summer')}>Copy</button></div>
            <div className="mock-click-card"><div className="mock-card-kicker">Total clicks <span className="mini-growth">↗ 32%</span></div><strong>12.4K</strong><small>Clicks this week</small><svg viewBox="0 0 220 66" role="img" aria-label="Illustrative clicks trend"><defs><linearGradient id="lpChartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6855ff" stopOpacity=".22"/><stop offset="1" stopColor="#6855ff" stopOpacity="0"/></linearGradient></defs><path d="M0 58 C25 49 30 54 50 43 S78 46 94 36 S120 44 140 25 S164 31 181 13 S204 19 220 4 L220 66 L0 66Z" fill="url(#lpChartFill)"/><path d="M0 58 C25 49 30 54 50 43 S78 46 94 36 S120 44 140 25 S164 31 181 13 S204 19 220 4" fill="none" stroke="#604cff" strokeWidth="3" strokeLinecap="round"/></svg></div>
            <div className="mock-source-card"><div className="mock-card-title">Top sources <span>Last 7 days</span></div><div className="mock-source-row"><i className="source-dot purple"/><span>Direct</span><div><b style={{width:'82%'}}/></div><strong>42%</strong></div><div className="mock-source-row"><i className="source-dot teal"/><span>Instagram</span><div><b style={{width:'54%'}}/></div><strong>28%</strong></div><div className="mock-source-row"><i className="source-dot coral"/><span>YouTube</span><div><b style={{width:'34%'}}/></div><strong>18%</strong></div><div className="mock-source-row"><i className="source-dot blue"/><span>Twitter</span><div><b style={{width:'16%'}}/></div><strong>8%</strong></div></div>
            <div className="mock-qr-card"><span className="mock-qr" aria-hidden="true"/><strong>Your QR code</strong><small>Ready to share</small><span className="mock-qr-download"><ArrowRight size={12}/> Download</span></div>
            <div className="mock-visual-orbit orbit-a"/><div className="mock-visual-orbit orbit-b"/>
          </div>
        </div>
        <section className="marketing-pricing-panel" id="public-pricing">
          <div className="marketing-pricing-heading"><span className="section-label">PRICING</span><h2>Simple, transparent pricing</h2><p>Choose the plan that fits your goals. Upgrade anytime.</p></div>
          <div className="landing-plan-grid">
            {PLAN_CARDS.map(plan=>{const key=plan.name.toLowerCase();return <article key={plan.name} className={`landing-plan-card ${key==='pro'?'landing-plan-pro':''} ${key==='growth'?'landing-plan-growth':''}`}>
              <div className="landing-plan-top"><h3>{plan.name}</h3>{key==='free'?<span className="plan-pill starter-pill">Starter</span>:key==='pro'?<span className="plan-pill pro-pill">Popular</span>:<span className="plan-pill growth-pill">Best value</span>}</div>
              <div className="landing-plan-price"><strong>{plan.price}</strong><span>{plan.period}</span></div><p className="landing-plan-description">{key==='free'?'For beginners and casual users':key==='pro'?'For creators and marketers':'For businesses and high-traffic teams'}</p>
              <div className="landing-plan-features">{plan.features.slice(0, key==='growth'?8:7).map(feature=><div key={feature.label} className={`landing-plan-feature ${feature.included?'':'not-included'}`}><Check size={12}/><span>{feature.label}</span>{feature.tier&&<PremiumBadge tier={feature.tier}/>}</div>)}</div>
              <button className={`landing-plan-button ${key}`} onClick={()=>{setAuthMode(key==='free'?'register':'login');setAuthView(true)}}>{key==='free'?'Get started free':`Choose ${plan.name}`} <ArrowRight size={13}/></button>
            </article>})}
          </div>
          <div className="pricing-trust-note"><ShieldCheck size={15}/><span>Transparent limits. No surprise fees. Change plans anytime.</span></div>
        </section>
      </section>
      <section className="marketing-feature-section" id="features"><div className="marketing-section-heading"><span className="section-label">BUILT FOR YOUR NEXT CLICK</span><h2>Everything your links need.<br/><span>All in one workspace.</span></h2><p>From short links to campaign insights, LinkPulse keeps every destination measurable and manageable.</p></div><div className="marketing-feature-grid"><article><span className="marketing-feature-icon violet"><Link2 size={19}/></span><h3>Branded short links <PremiumBadge tier="PRO"/></h3><p>Custom domains and memorable URLs that reinforce your brand.</p></article><article><span className="marketing-feature-icon blue"><BarChart3 size={19}/></span><h3>Advanced analytics <PremiumBadge tier="PRO"/></h3><p>Explore click trends, referrers, devices, and campaign performance.</p></article><article><span className="marketing-feature-icon teal"><MousePointerClick size={19}/></span><h3>Unlimited tracked clicks <PremiumBadge tier="GROWTH"/></h3><p>Track high-traffic campaigns without a monthly click quota.</p></article><article><span className="marketing-feature-icon amber"><Sparkles size={19}/></span><h3>Smart routing & A/B tests <PremiumBadge tier="GROWTH"/></h3><p>Test destinations and learn what performs best.</p></article></div></section>
      <section className="marketing-how-section" id="how-it-works"><div><span className="section-label">HOW IT WORKS</span><h2>From link to insight<br/>in three steps.</h2></div><div className="how-steps"><article><span>01</span><h3>Create</h3><p>Turn long destinations into easy-to-share short links.</p></article><article><span>02</span><h3>Share</h3><p>Use them across campaigns, profiles, QR codes, and channels.</p></article><article><span>03</span><h3>Understand</h3><p>See clicks, spot traffic patterns, and improve your next campaign.</p></article></div></section>
      <section className="marketing-bottom-cta" id="resources"><div><span className="section-label">READY WHEN YOU ARE</span><h2>Make every click count.</h2><p>Start free, then unlock more as your audience grows.</p></div><button className="marketing-cta big" onClick={()=>{setAuthMode('register');setAuthView(true)}}>Create your free account <ArrowRight size={17}/></button></section>
    </main>
    <footer className="marketing-footer"><a href="#home" className="marketing-brand"><span className="brand-mark">LP</span><strong>LinkPulse</strong></a><span>Short links. Stronger insights.</span><span>© {new Date().getFullYear()} LinkPulse</span></footer>
  </div>;

  if (!token || !user) return <div className="auth-page"><div className="auth-art"><div className="brand-lockup"><div className="brand-mark">LP</div><span>LinkPulse</span></div><p className="eyebrow">LINK MANAGEMENT, REIMAGINED</p><h1>Every link.<br/><span>One pulse.</span></h1><p className="muted-hero">Create. Control. Measure. LinkPulse brings shortening, brand safety, and campaign analytics into one connected workspace.</p><div className="auth-visual"><div className="visual-node">Create</div><div className="visual-line"/><div className="visual-node active">Redirect</div><div className="visual-line"/><div className="visual-node">Insights</div></div><div className="auth-feature-panel"><div className="auth-feature-heading"><span>LEVEL UP YOUR LINKS</span><small>Premium features</small></div><div className="auth-feature-grid"><div className="auth-feature-item"><span className="auth-feature-icon"><Globe size={16}/></span><div><strong>Branded domains</strong><small>Use your own brand <PremiumBadge tier="PRO"/></small></div></div><div className="auth-feature-item"><span className="auth-feature-icon"><BarChart3 size={16}/></span><div><strong>Advanced analytics</strong><small>Understand every campaign <PremiumBadge tier="PRO"/></small></div></div><div className="auth-feature-item"><span className="auth-feature-icon"><Activity size={16}/></span><div><strong>Unlimited tracked clicks</strong><small>Scale without a click quota <PremiumBadge tier="GROWTH"/></small></div></div><div className="auth-feature-item"><span className="auth-feature-icon"><RefreshCw size={16}/></span><div><strong>Smart routing & A/B tests</strong><small>Optimize destination performance <PremiumBadge tier="GROWTH"/></small></div></div></div><div className="auth-pricing-strip"><span><small>FREE</small><strong>₹0</strong></span><span><small>PRO</small><strong>₹199<em>/mo</em></strong></span><span><small>GROWTH</small><strong>₹599<em>/mo</em></strong></span></div><p className="auth-free-note">Start on Free. Upgrade only when you need more.</p></div></div><div className="auth-panel"><button className="auth-back-link" type="button" onClick={()=>setAuthView(false)}>← Back to homepage</button><div className="auth-form-wrap"><div className="mobile-brand"><span className="brand-mark">LP</span><strong>LinkPulse</strong></div><p className="eyebrow">WORKSPACE ACCESS</p><h2>{authMode === 'login' ? 'Welcome back' : 'Create your workspace account'}</h2><p className="muted">{authMode === 'login' ? 'Sign in to manage your links and view analytics.' : 'Start managing links, campaigns and click insights.'}</p><form onSubmit={submitAuth} className="stack-form">
    {authMode === 'register' && <label>Full name<input autoComplete="name" required value={authForm.name} onChange={e=>setAuthForm({ ...authForm, name: e.target.value })} placeholder="Your name"/></label>}
    <label>Email address<input type="email" autoComplete="email" required value={authForm.email} onChange={e=>setAuthForm({ ...authForm, email: e.target.value })} placeholder="you@company.com"/></label>
    <label>Password<input type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} minLength={authMode === 'register' ? 10 : 1} required value={authForm.password} onChange={e=>setAuthForm({ ...authForm, password: e.target.value })} placeholder={authMode === 'register' ? 'At least 10 characters' : 'Your password'}/></label>
    <Button disabled={busy}>{busy ? 'Please wait…' : authMode === 'login' ? 'Sign in' : 'Create account'} <ExternalLink size={16}/></Button></form><p className="switch-auth">{authMode === 'login' ? 'New to LinkPulse?' : 'Already have an account?'} <button onClick={()=>setAuthMode(authMode === 'login' ? 'register' : 'login')}>{authMode === 'login' ? 'Create an account' : 'Sign in'}</button></p><p className="security-note"><ShieldCheck size={15}/> Admin accounts are provisioned separately by the deployment owner.</p></div></div>{notice && <div className={`toast ${notice.type}`}>{notice.message}</div>}</div>;

  const pages = user.role === 'admin' ? [...PAGES, { id: 'admin', label: 'Admin controls', icon: ShieldCheck }] : PAGES;
  const title = pages.find(p => p.id === page)?.label || 'Overview';
  const overview = data.analytics || {};
  // Normalize analytics to a complete 30-day UTC series so quiet days appear as zero.
  const rawDaily = Array.isArray(overview.daily) ? overview.daily : [];
  const dailyByDate = new Map(rawDaily.map(item => [String(item._id).slice(0, 10), Number(item.clicks) || 0]));
  const utcToday = new Date();
  utcToday.setUTCHours(0, 0, 0, 0);
  const clickData = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(utcToday);
    date.setUTCDate(utcToday.getUTCDate() - 29 + index);
    const dateKey = date.toISOString().slice(0, 10);
    return {
      date: dateKey,
      label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }),
      fullDate: date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }),
      clicks: dailyByDate.get(dateKey) || 0,
    };
  });
  const hasClickData = clickData.some(day => day.clicks > 0);
  const qualifiedClickTotal = clickData.reduce((sum, day) => sum + day.clicks, 0);
  const averageDailyClicks = qualifiedClickTotal / clickData.length;
  const peakClickDay = clickData.reduce((peak, day) => day.clicks > peak.clicks ? day : peak, clickData[0]);
  const planKey = String(data.usage?.plan || user?.plan || 'free').toLowerCase();
  const planLabel = planKey === 'growth' ? 'Growth' : planKey === 'pro' ? 'Pro' : planKey === 'admin' || user.role === 'admin' ? 'Admin' : 'Free';
  const usageValues = data.usage?.usage || {};
  const usageLimits = data.usage?.limits || {};
  const linksCreatedThisMonth = Number(usageValues.linksCreated || 0);
  const trackedClicksThisMonth = Number(usageValues.trackedClicks || 0);
  const linksMonthlyLimit = usageLimits.linksPerMonth ?? (planKey === 'growth' ? 2000 : planKey === 'pro' ? 500 : 25);
  const clicksMonthlyLimit = Object.prototype.hasOwnProperty.call(usageLimits, 'trackedClicksPerMonth')
    ? usageLimits.trackedClicksPerMonth
    : planKey === 'growth' ? null : planKey === 'pro' ? 25000 : 1000;
  const usageHasLimits = user.role !== 'admin' && planKey !== 'admin';
  const linksUsageRatio = Number(linksMonthlyLimit) > 0 ? linksCreatedThisMonth / Number(linksMonthlyLimit) : 0;
  const clicksUsageRatio = clicksMonthlyLimit !== null && Number(clicksMonthlyLimit) > 0 ? trackedClicksThisMonth / Number(clicksMonthlyLimit) : 0;
  const usageLimitReached = usageHasLimits && (linksUsageRatio >= 1 || (clicksMonthlyLimit !== null && clicksUsageRatio >= 1));
  const usageNearLimit = usageHasLimits && (linksUsageRatio >= 0.8 || (clicksMonthlyLimit !== null && clicksUsageRatio >= 0.8));
  const upgradePlanName = planKey === 'free' ? 'Pro' : 'Growth';
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">LP</span><div><strong>LinkPulse</strong><small>LINK INTELLIGENCE</small></div></div><div className="workspace-pill"><div className="workspace-avatar">{user.name?.slice(0,1)?.toUpperCase() || 'L'}</div><div className="workspace-copy"><strong>{user.role === 'admin' ? 'Platform admin' : user.name}</strong><small>{user.role === 'admin' ? 'Administrator' : 'Personal workspace'}</small></div><ChevronDown size={15}/></div><p className="nav-label">WORKSPACE</p><nav>{pages.map(item => <button key={item.id} className={`nav-item ${page === item.id ? 'selected' : ''}`} onClick={()=>{setPage(item.id);if(item.id==='plans' && !billingSuccess && planKey==='free' && !checkoutPlan) setCheckoutPlan('pro')}}><item.icon size={18}/><span>{item.label}</span>{item.id === 'import' && <PremiumBadge tier="GROWTH"/>}{item.id === 'plans' && <span className="nav-dot plan-nav-dot"/>}{item.id === 'admin' && <span className="nav-dot"/>}</button>)}</nav><div className="sidebar-bottom"><div className="pro-card"><div className="pro-icon"><ShieldCheck size={17}/></div><strong>Built for trustworthy links</strong><p>Rules, event history and destination controls in one place.</p></div><button className="nav-item logout" onClick={logout}><LogOut size={18}/><span>Sign out</span></button><div className="sidebar-footer">LINKPULSE <span>•</span> PLANS PREVIEW</div></div></aside>
    <main className="main-area"><header className="topbar"><div><p className="breadcrumb">WORKSPACE <span>/</span> {title.toUpperCase()}</p><h1>{page === 'overview' ? `Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${user.name?.split(' ')[0] || 'there'}` : title}</h1></div><div className="top-actions"><button className="icon-button" title="Refresh data" onClick={()=>refresh()}><RefreshCw size={17}/></button><div className="user-pill"><div className="user-avatar">{user.name?.slice(0,1)?.toUpperCase() || 'U'}</div><div><strong>{user.name}</strong><small>{user.role === 'admin' ? 'Admin' : 'User'}</small></div></div></div></header>
    {notice && <div className={`toast inline-toast ${notice.type}`}>{notice.message}<button onClick={()=>setNotice(null)}><X size={15}/></button></div>}
    {page === 'overview' && <section className="page-content dashboard-home-page"><div className="hero-card"><div><p className="eyebrow light">LINK PERFORMANCE</p><h2>One place to manage<br/>every destination.</h2><p>Track the links that matter. Keep every redirect accountable.</p><Button variant="white" onClick={()=>{const p=String(data.usage?.plan || user?.plan || 'free').toLowerCase();const limit=p==='growth'?2000:p==='pro'?500:25;const used=Number(data.usage?.usage?.linksCreated||0);if(user.role!=='admin' && used>=limit){setPage('plans');flash('You’ve reached your monthly link-creation limit. Compare plans to upgrade.','warning');return;}setPage('links');setEditingId(null);setLinkForm({ title: '', originalUrl: '', code: '', expiresAt: '', clickLimit: '', password: '', campaignId: '', folder: '', tagIds: [] });setLinkFormOpen(true)}}><Plus size={16}/> Create a link</Button></div><div className="hero-art"><div className="hero-ring ring-one"/><div className="hero-ring ring-two"/><div className="hero-center"><Activity size={33}/></div><span className="floating-chip chip-one"><Link2 size={14}/> Links</span><span className="floating-chip chip-two"><BarChart3 size={14}/> Insights</span></div></div>{user.role !== 'admin' && <section className={`usage-panel ${usageLimitReached ? 'limit-reached' : usageNearLimit ? 'near-limit' : ''}`} aria-live="polite"><div className="usage-panel-copy"><div className="usage-eyebrow"><span className="usage-pulse"/> YOUR MONTHLY PLAN USAGE <Badge tone={planKey === 'growth' ? 'green' : planKey === 'pro' ? 'blue' : 'neutral'}>{planLabel}</Badge></div><h3>{usageLimitReached ? 'You’ve reached a plan limit' : usageNearLimit ? 'You’re getting close to your plan limit' : 'Keep an eye on your monthly usage'}</h3><p>{usageLimitReached ? `You’ve used all or more than your current plan allowance. Upgrade to ${upgradePlanName} for more capacity. Your existing short links remain available.` : usageNearLimit ? `You’re using at least 80% of one of your monthly allowances. Upgrade to ${upgradePlanName} before your next campaign grows.` : 'Your usage refreshes from LinkPulse activity. We’ll highlight your plan limits here before you reach them.'}</p>{!data.usage && <small className="usage-sync-note">Usage details could not be loaded. Refresh to try again.</small>}</div><div className="usage-panel-meters"><UsageMeter label="Short links created this month" used={linksCreatedThisMonth} limit={linksMonthlyLimit}/><UsageMeter label="Tracked clicks this month" used={trackedClicksThisMonth} limit={clicksMonthlyLimit}/></div><div className="usage-panel-action"><Button onClick={()=>{setPage('plans');if(planKey==='free' && !billingSuccess && !checkoutPlan) setCheckoutPlan('pro')}}>{usageLimitReached ? `Upgrade to ${upgradePlanName}` : 'Explore premium plans'} <ExternalLink size={15}/></Button><button className="text-button" onClick={()=>{setPage('plans');if(planKey==='free' && !billingSuccess && !checkoutPlan) setCheckoutPlan('pro')}}>Compare all plans</button></div></section>}<section className="premium-showcase"><div className="premium-showcase-heading"><div><p className="eyebrow">GROW WHEN YOU’RE READY</p><h2>Premium tools for your next stage</h2><p>Unlock deeper insights, stronger branding, and more room to scale.</p></div><Button variant="secondary" onClick={()=>{setPage('plans');if(planKey==='free' && !billingSuccess && !checkoutPlan) setCheckoutPlan('pro')}}>Compare plans <ExternalLink size={14}/></Button></div><div className="premium-showcase-grid"><article className="premium-feature-card"><span className="premium-feature-icon pro"><Globe size={18}/></span><div><div className="premium-feature-title">Branded short links <PremiumBadge tier="PRO"/></div><p>Use your own custom domain and branded QR codes.</p></div></article><article className="premium-feature-card"><span className="premium-feature-icon pro"><BarChart3 size={18}/></span><div><div className="premium-feature-title">Deeper campaign analytics <PremiumBadge tier="PRO"/></div><p>Explore device, browser, referrer and longer-term trends.</p></div></article><article className="premium-feature-card"><span className="premium-feature-icon growth"><Activity size={18}/></span><div><div className="premium-feature-title">Unlimited tracked clicks <PremiumBadge tier="GROWTH"/></div><p>Track high-traffic campaigns without a monthly click cap.</p></div></article><article className="premium-feature-card"><span className="premium-feature-icon growth"><RefreshCw size={18}/></span><div><div className="premium-feature-title">Smart routing & A/B tests <PremiumBadge tier="GROWTH"/></div><p>Compare destinations and improve campaign results.</p></div></article></div></section><div className="section-heading"><div><h2>Overview</h2><p>Performance from persisted click events • last 30 days</p></div><Button variant="secondary" onClick={()=>refresh()}><RefreshCw size={15}/> Refresh</Button></div><div className="metrics-grid"><Metric label="Total clicks" value={overview.clicks?.total ?? 0} hint={`${overview.clicks?.humanQualified || 0} human-qualified`} icon={MousePointerClick}/><Metric label="Active links" value={overview.links?.active ?? 0} hint={`${overview.links?.total || 0} total links`} icon={Link2}/><Metric label="Top country" value={overview.countries?.[0]?._id || "—"} hint={overview.countries?.[0] ? `${Number(overview.countries[0].count).toLocaleString()} clicks` : "Country data when available"} icon={Globe}/><Metric label="Top device" value={overview.devices?.[0]?._id || "—"} hint={overview.devices?.[0] ? `${Number(overview.devices[0].count).toLocaleString()} clicks` : "Device breakdown"} icon={Users}/></div><div className="content-grid"><div className="card chart-card"><div className="card-title-row"><div><h3>Click activity</h3><p>Qualified clicks by day (UTC)</p></div><Badge tone="blue">30 days</Badge></div><div className="chart-wrap">
              {hasClickData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={clickData} margin={{ top: 12, right: 18, left: -12, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8e5f7" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#8b94a7', fontSize: 10 }}
                      minTickGap={20}
                      tickMargin={9}
                    />
                    <YAxis
                      allowDecimals={false}
                      domain={[0, 'auto']}
                      width={38}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#8b94a7', fontSize: 10 }}
                    />
                    <Tooltip
                      content={<ClickActivityTooltip />}
                      cursor={{ stroke: '#cbd4f2', strokeDasharray: '4 4' }}
                    />
                    <ReferenceLine
                      y={averageDailyClicks}
                      stroke="#18b8a4"
                      strokeDasharray="5 4"
                      label={{ value: `Avg ${averageDailyClicks.toFixed(1)}`, position: 'insideTopRight', fill: '#0c8c7d', fontSize: 10 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="clicks"
                      name="Qualified clicks"
                      stroke="#7658ee"
                      strokeWidth={2.7}
                      dot={{ r: 2.5, fill: '#ffffff', stroke: '#7658ee', strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: '#7658ee', stroke: '#ffffff', strokeWidth: 2 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <Empty title="No click data yet" body="Create a link and open it to see real activity here." />
              )}
            </div>
            {hasClickData && (
              <>
                <div className="chart-insights">
                  <div className="chart-insight">
                    <span>Qualified clicks</span>
                    <strong>{qualifiedClickTotal.toLocaleString()}</strong>
                    <small>Last 30 days</small>
                  </div>
                  <div className="chart-insight">
                    <span>Peak day</span>
                    <strong>{peakClickDay.label}</strong>
                    <small>{peakClickDay.clicks.toLocaleString()} clicks</small>
                  </div>
                  <div className="chart-insight">
                    <span>Daily average</span>
                    <strong>{averageDailyClicks.toFixed(1)}</strong>
                    <small>Clicks per day</small>
                  </div>
                </div>
                <div className="chart-legend">
                  <span><i className="legend-line" /> Daily qualified clicks</span>
                  <span><i className="legend-average" /> 30-day daily average</span>
                </div>
              </>
            )}</div><div className="card top-links-card traffic-sources-card"><div className="card-title-row"><div><h3>Traffic sources</h3><p>Where your qualified visits come from</p></div><Badge tone="blue">30 days</Badge></div>{overview.referrers?.length ? <><div className="traffic-sources-layout"><div className="traffic-donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={overview.referrers.slice(0,5)} dataKey="count" nameKey="_id" innerRadius={47} outerRadius={68} paddingAngle={3} stroke="none">{overview.referrers.slice(0,5).map((source,index)=><Cell key={`${source._id}-${index}`} fill={['#6247f5','#22b7a3','#ff9b62','#ed668a','#8ba0ff'][index%5]}/>)}</Pie><Tooltip formatter={(value)=>[Number(value).toLocaleString(),'Clicks']}/></PieChart></ResponsiveContainer><div className="traffic-donut-center"><strong>{overview.referrers.reduce((sum,source)=>sum+Number(source.count||0),0).toLocaleString()}</strong><small>clicks</small></div></div><div className="traffic-source-legend">{overview.referrers.slice(0,5).map((source,index)=>{const total=overview.referrers.reduce((sum,item)=>sum+Number(item.count||0),0)||1;return <div className="traffic-source-row" key={`${source._id}-${index}`}><i style={{background:['#6247f5','#22b7a3','#ff9b62','#ed668a','#8ba0ff'][index%5]}}/><span title={source._id}>{source._id || 'Direct / unknown'}</span><strong>{Math.round(Number(source.count||0)/total*100)}%</strong></div>})}</div></div></> : <Empty title="No source data yet" body="Traffic sources will appear after tracked clicks with referrer information are recorded."/>}</div></div><div className="note-banner"><ShieldCheck size={18}/><div><strong>Analytics with transparent classification</strong><p>Known bots and suspected automation are separated from human-qualified clicks. Unknown traffic remains visible in reports.</p></div></div><div className="classification-strip card"><strong>Traffic classification</strong>{(overview.trafficClassification || []).length ? overview.trafficClassification.map(x=><span key={x._id} className="classification-item"><span>{x._id.replace('_',' ')}</span><b>{x.count}</b></span>) : <span className="muted">No click events recorded yet.</span>}</div><div className="recent-links-preview card table-card"><div className="table-toolbar"><div><h3>Recent links</h3><p>Your latest short links and their performance</p></div><button className="text-button" onClick={()=>setPage('links')}>View all →</button></div>{data.links.length ? <div className="table-scroll"><table><thead><tr><th>Short link</th><th>Destination</th><th>Clicks</th><th>Created</th><th>Status</th></tr></thead><tbody>{[...data.links].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,4).map(link=><tr key={link._id}><td><div className="dashboard-link-cell"><span className="dashboard-link-icon"><Link2 size={13}/></span><div><strong>linkpulse.to/{link.code}</strong><small>{link.title || 'Untitled link'}</small></div></div></td><td><span className="destination" title={link.originalUrl}>{link.originalUrl}</span></td><td><strong>{Number(link.clickCount||0).toLocaleString()}</strong></td><td>{new Date(link.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</td><td><Badge tone={link.status==='active'?'green':'neutral'}>{link.status}</Badge></td></tr>)}</tbody></table></div> : <Empty title="No links yet" body="Create your first short link to see it appear here."/>}</div></section>}

    {page === 'links' && <section className="page-content"><div className="section-heading"><div><h2>Your links</h2><p>Create, manage and control destinations from one place.</p></div><Button onClick={()=>{if(linkFormOpen){setLinkFormOpen(false);setEditingId(null)}else{setEditingId(null);setLinkForm({ title: '', originalUrl: '', code: '', expiresAt: '', clickLimit: '', password: '', campaignId: '', folder: '', tagIds: [] });setLinkFormOpen(true)}}}><Plus size={16}/> New link</Button></div>{linkFormOpen && <div className="card form-card"><div className="card-title-row"><div><h3>{editingId ? 'Edit link' : 'Create a short link'}</h3><p>{editingId ? 'Update the destination, rules and organization. Cross-domain changes may require approval.' : 'Step 1: destination and alias · Step 2: rules and organization'}</p></div><button className="icon-button" onClick={()=>{setLinkFormOpen(false);setEditingId(null)}}><X size={17}/></button></div><form onSubmit={createLink} className="form-grid"><label className="full">Destination URL *<input type="url" required value={linkForm.originalUrl} placeholder="https://example.com/landing-page" onChange={e=>setLinkForm({...linkForm, originalUrl:e.target.value})}/></label><label>Title<input value={linkForm.title} placeholder="Campaign landing page" onChange={e=>setLinkForm({...linkForm,title:e.target.value})}/></label><label>Custom alias (optional)<input value={linkForm.code} placeholder="spring-offer" onChange={e=>setLinkForm({...linkForm,code:e.target.value})}/></label><label>Expires at<input type="datetime-local" value={linkForm.expiresAt} onChange={e=>setLinkForm({...linkForm,expiresAt:e.target.value})}/></label><label>Click limit<input type="number" min="1" value={linkForm.clickLimit} placeholder="No limit" onChange={e=>setLinkForm({...linkForm,clickLimit:e.target.value})}/></label><label><span className="field-label-row">Password protection <PremiumBadge tier="PRO"/></span><input type="password" minLength="4" value={linkForm.password} placeholder="Optional password" onChange={e=>setLinkForm({...linkForm,password:e.target.value})}/></label><label>Campaign<select value={linkForm.campaignId} onChange={e=>setLinkForm({...linkForm,campaignId:e.target.value})}><option value="">No campaign</option>{data.campaigns.map(c=><option key={c._id} value={c._id}>{c.name}</option>)}</select></label><label>Folder label<input value={linkForm.folder} placeholder="e.g. Social" onChange={e=>setLinkForm({...linkForm,folder:e.target.value})}/></label><label>Tags<select multiple value={linkForm.tagIds} onChange={e=>setLinkForm({...linkForm,tagIds:Array.from(e.target.selectedOptions, option=>option.value)})}>{data.tags.map(t=><option key={t._id} value={t._id}>{t.name}</option>)}</select><small className="field-hint">Use Ctrl / Command to select multiple tags.</small></label><div className="form-footer full"><p><ShieldCheck size={14}/> URLs are validated and blocked domains are checked before publishing.</p><Button disabled={busy}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Create link'} <ArrowDownToLine size={15}/></Button></div></form></div>}<div className="card table-card"><div className="table-toolbar"><div><h3>All links <span className="count-pill">{filteredLinks.length}</span></h3><p>Historical analytics remain available for archived links.</p></div><div className="search-box"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search links"/></div></div>{filteredLinks.length ? <div className="table-scroll"><table><thead><tr><th>Link</th><th>Destination</th><th>Status</th><th>Clicks</th><th>Created</th><th>Actions</th></tr></thead><tbody>{filteredLinks.map(l=><tr key={l._id}><td><div className="link-cell"><span className="link-symbol"><Link2 size={15}/></span><div><strong>{l.title || l.code}</strong><small>{l.code}</small></div></div></td><td><span className="destination" title={l.originalUrl}>{l.originalUrl}</span></td><td><Badge tone={l.status==='active'?'green':'neutral'}>{l.status}</Badge>{l.expiresAt && new Date(l.expiresAt)<new Date() && <div><Badge tone="amber">expired</Badge></div>}</td><td>{l.clickCount || 0}</td><td>{new Date(l.createdAt).toLocaleDateString()}</td><td><div className="row-actions"><button title="Copy short URL" className="icon-button small" onClick={()=>navigator.clipboard.writeText(`${API}/r/${l.code}`).then(()=>flash('Short URL copied'))}><Copy size={15}/></button><button title="Edit link" className="icon-button small" onClick={()=>startEdit(l)}><Pencil size={15}/></button><button title="Generate QR" className="icon-button small" onClick={()=>generateQr(l)}><QrCode size={15}/></button><button title={l.status==='active'?'Disable':'Enable'} className="icon-button small" onClick={()=>toggleLink(l)}><LockKeyhole size={15}/></button><button title="Archive" className="icon-button small danger-icon" onClick={()=>archiveLink(l)}><X size={15}/></button></div></td></tr>)}</tbody></table></div> : <Empty title="No links found" body="Create your first short link to start the lifecycle."/>}</div></section>}

    {page === 'campaigns' && <section className="page-content"><div className="section-heading"><div><h2>Campaigns</h2><p>Group links and compare performance by campaign.</p></div></div><div className="content-grid"><div className="card form-card"><h3>Create campaign</h3><form className="stack-form" onSubmit={createCampaign}><label>Campaign name<input required value={campaignName} onChange={e=>setCampaignName(e.target.value)} placeholder="Autumn launch"/></label><label>Description<textarea value={campaignDescription} onChange={e=>setCampaignDescription(e.target.value)} placeholder="What is this campaign for?" rows="3"/></label><Button><Plus size={16}/> Create campaign</Button></form></div><div className="card"><h3>Your campaigns</h3><p className="muted">Campaign metrics are aggregated from persisted click events.</p>{data.campaigns.length ? data.campaigns.map(c=>{const linked=data.links.filter(l=>String(l.campaignId?._id||l.campaignId)===String(c._id));const stats=data.campaignAnalytics.find(x=>String(x.campaignId)===String(c._id));return <div className="campaign-row" key={c._id}><div className="campaign-avatar"><FolderKanban size={18}/></div><div className="campaign-info"><strong>{c.name}</strong><small>{c.description || 'No description'}</small><small>{stats?.humanQualifiedClicks || 0} qualified clicks · {stats?.uniqueVisitors || 0} estimated unique visitors</small></div><div className="campaign-numbers"><strong>{linked.length}</strong><small>links</small></div></div>}) : <Empty title="No campaigns yet" body="Create a campaign, then assign links to it."/>}</div></div></section>}

    {page === 'tags' && <section className="page-content"><div className="section-heading"><div><h2>Tags</h2><p>Use tags to organize and retrieve related links.</p></div></div><div className="card form-card"><form className="inline-form" onSubmit={createTag}><label>New tag<input required value={tagName} onChange={e=>setTagName(e.target.value)} placeholder="e.g. newsletter"/></label><Button><Plus size={16}/> Add tag</Button></form><div className="tag-cloud">{data.tags.map(tag=><span className="tag-chip" key={tag._id}><span className="tag-dot" style={{background:tag.color}}/>{tag.name}</span>)}</div>{!data.tags.length && <Empty title="No tags created" body="Add a tag to make link organization easier."/>}</div></section>}

    {page === 'qr' && <section className="page-content"><div className="section-heading"><div><h2>QR codes</h2><p>Generate downloadable QR codes tied to trackable LinkPulse URLs.</p></div></div>{qrResult ? <div className="card qr-result"><div><Badge tone="green">Generated</Badge><h3>{qrResult.qrCode?.name || 'Link QR code'}</h3><p className="muted">Scan destination includes a QR identifier so visits can be attributed to this code.</p><div className="url-copy">{qrResult.targetUrl}<button className="icon-button small" onClick={()=>navigator.clipboard.writeText(qrResult.targetUrl).then(()=>flash('QR URL copied'))}><Copy size={15}/></button></div><a className="button primary link-button" href={qrResult.dataUrl} download={`linkpulse-${qrResult.qrCode?._id || 'qr'}.png`}><ArrowDownToLine size={16}/> Download PNG</a></div><img className="qr-image" src={qrResult.dataUrl} alt="Generated LinkPulse QR code"/></div> : <Empty title="Generate a QR code from a link" body="Go to Links and select the QR icon next to any link. QR codes stay connected to link analytics."/>}<div className="card"><h3>Available links</h3>{data.links.length ? <div className="simple-list">{data.links.map(l=><div key={l._id} className="simple-row"><div><strong>{l.title || l.code}</strong><small>/{l.code}</small></div><Button variant="secondary" onClick={()=>generateQr(l)}><QrCode size={15}/> Generate QR</Button></div>)}</div> : <p className="muted">Create a link first.</p>}</div></section>}

    {page === 'import' && <section className="page-content"><div className="section-heading"><div><h2 className="heading-with-badge">Bulk import <PremiumBadge tier="GROWTH"/></h2><p>Validate CSV rows and import valid links without stopping on every row-level error.</p></div></div><div className="content-grid"><div className="card form-card"><div className="file-icon"><FileSpreadsheet size={25}/></div><h3>Import links from CSV</h3><p className="muted">Maximum 500 rows and 1 MB per file. Required column: <code>originalUrl</code> or <code>url</code>.</p><p className="muted">Optional columns: <code>code</code>, <code>alias</code>, <code>title</code>, <code>expiresAt</code>, <code>clickLimit</code>.</p><form className="stack-form" onSubmit={doImport}><label>CSV file<input type="file" accept=".csv,text/csv" required onChange={e=>setCsvFile(e.target.files?.[0] || null)}/></label><Button disabled={!csvFile}><ArrowDownToLine size={16}/> Validate and import</Button></form><a className="text-button template-link" href={`data:text/csv;charset=utf-8,originalUrl%2Ccode%2Ctitle%2CexpiresAt%2CclickLimit%0Ahttps%3A%2F%2Fexample.com%2Foffer%2Coffer26%2CSample%20offer%2C%2C1000`} download="linkpulse-import-template.csv">Download sample CSV</a></div><div className="card"><h3>Import safeguards</h3><ul className="check-list"><li><Check size={16}/> URL scheme and destination policy checks</li><li><Check size={16}/> Duplicate alias checks, including within this file</li><li><Check size={16}/> Row-level success and error report</li><li><Check size={16}/> Imported links use the same redirect rules</li></ul></div></div></section>}

    {page === 'plans' && <section className="page-content plans-page reference-billing-page">
      <div className="section-heading"><div><h2>Plans & billing</h2><p>Manage your subscription and unlock more ways to grow your links.</p></div><Badge tone="blue">3 plans</Badge></div>
      <div className="billing-page-grid">
        <div className="billing-primary-column">
          <div className="current-plan-strip reference-current-plan"><div className="current-plan-illustration"><Crown size={23}/></div><div className="current-plan-copy"><span className="current-plan-kicker">YOUR CURRENT PLAN</span><strong>{planLabel}</strong><small>{planKey === 'free' ? 'You are on the Free plan. Upgrade to unlock powerful features.' : data.usage?.subscription?.expiresAt ? `Active until ${new Date(data.usage.subscription.expiresAt).toLocaleDateString()}` : 'Premium features are enabled on this account.'}</small></div><Button variant="secondary" onClick={()=>setBillingSuccess(null)}>View plan details</Button></div>
          <div className="card plan-comparison-card"><div className="card-title-row"><div><h3>Plan comparison</h3><p>Find the features and limits that suit your needs.</p></div><span className="comparison-period">Billed monthly</span></div>
            <div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th>Feature</th><th><span className="comparison-free">Free</span><strong>₹0</strong></th><th><span className="comparison-pro">Pro</span><strong>₹199<small>/mo</small></strong></th><th><span className="comparison-growth">Growth</span><strong>₹599<small>/mo</small></strong></th></tr></thead><tbody>
              {[
                {name:'New links per month',free:'25',pro:'500',growth:'2,000'},
                {name:'Tracked clicks per month',free:'1,000',pro:'25,000',growth:'Unlimited',tier:'GROWTH'},
                {name:'Custom domains',free:'—',pro:'1',growth:'3',tier:'PRO'},
                {name:'Analytics history',free:'30 days',pro:'90 days',growth:'1 year',tier:'PRO'},
                {name:'Advanced analytics',free:'—',pro:'Included',growth:'Included',tier:'PRO'},
                {name:'Branded QR codes',free:'Basic',pro:'Included',growth:'Included',tier:'PRO'},
                {name:'CSV analytics export',free:'—',pro:'Included',growth:'Included',tier:'PRO'},
                {name:'Password-protected links',free:'—',pro:'Included',growth:'Included',tier:'PRO'},
                {name:'Bulk CSV import',free:'—',pro:'—',growth:'Included',tier:'GROWTH'},
                {name:'Geographic analytics & smart routing',free:'—',pro:'—',growth:'Included',tier:'GROWTH'},
                {name:'A/B destination testing',free:'—',pro:'—',growth:'Included',tier:'GROWTH'},
                {name:'API access & webhooks',free:'—',pro:'—',growth:'Included',tier:'GROWTH'},
                {name:'Team members',free:'1',pro:'1',growth:'3'}
              ].map(row=><tr key={row.name}><td><span>{row.name}</span>{row.tier&&<PremiumBadge tier={row.tier}/>}</td><td>{row.free==='—'?<span className="comparison-na">—</span>:row.free==='Included'?<Check className="comparison-check" size={14}/>:row.free}</td><td>{row.pro==='—'?<span className="comparison-na">—</span>:row.pro==='Included'?<Check className="comparison-check" size={14}/>:row.pro}</td><td>{row.growth==='—'?<span className="comparison-na">—</span>:row.growth==='Included'||row.growth==='Unlimited'?<span className="comparison-included">{row.growth==='Unlimited'?'Unlimited':<Check size={13}/>}</span>:row.growth}</td></tr>)}
            </tbody></table></div>
          </div>
          <div className="billing-demo-note"><ShieldCheck size={16}/><div><strong>Demo checkout · no real money</strong><p>The demo payment always simulates success and activates the chosen plan for 30 days on the signed-in account. No payment details are collected.</p></div></div>
          {data.paymentHistory?.length > 0 && <div className="card mock-payment-history"><div className="card-title-row"><div><h3>Recent demo payments</h3><p>Transactions associated with this account.</p></div><Badge>Demo history</Badge></div><div className="table-scroll"><table><thead><tr><th>Transaction</th><th>Plan</th><th>Amount</th><th>Result</th><th>Date</th></tr></thead><tbody>{data.paymentHistory.slice(0,5).map(tx=><tr key={tx._id}><td><code>{tx.transactionId}</code></td><td>{tx.plan==='growth'?'Growth':'Pro'}</td><td>₹{(Number(tx.amountPaise||0)/100).toLocaleString('en-IN')}</td><td><Badge tone={tx.outcome==='succeeded'?'green':tx.outcome==='failed'?'red':'neutral'}>{tx.outcome}</Badge></td><td>{new Date(tx.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div></div>}
        </div>
        <aside className="billing-side-column">
          {billingSuccess ? <div className="payment-success-card"><button className="billing-dismiss" aria-label="Dismiss payment confirmation" onClick={()=>setBillingSuccess(null)}><X size={14}/></button><div className="success-confetti">✦ ✦ · ✦</div><div className="payment-success-icon"><Check size={25}/></div><span className="section-label">PAYMENT SUCCESSFUL</span><h3>Your plan is now active!</h3><p>{billingSuccess.plan==='pro'?'Pro':'Growth'} is active for <strong>{billingSuccess.email}</strong> for 30 days.</p><div className="success-plan-pill"><Crown size={14}/>{billingSuccess.plan==='pro'?'PRO PLAN · ₹199/MONTH':'GROWTH PLAN · ₹599/MONTH'}</div><Button onClick={()=>{setPage('overview');setBillingSuccess(null)}}>Go to dashboard <ArrowRight size={15}/></Button><small><ShieldCheck size={12}/> Demo payment only. No real money was charged.</small></div> : checkoutPlan ? <div className="billing-checkout-card"><div className="billing-checkout-head"><div className={`checkout-plan-symbol ${checkoutPlan}`}><CreditCard size={20}/></div><button className="billing-dismiss" aria-label="Close checkout panel" onClick={()=>{setCheckoutPlan(null);setCheckoutMessage(null)}}><X size={14}/></button></div><span className="mock-mode-label"><span/> MOCK GATEWAY · DEMO ONLY</span><h3>Upgrade to {checkoutPlan==='pro'?'Pro':'Growth'}</h3><p className="billing-checkout-subtitle">Complete the demo checkout to unlock all {checkoutPlan==='pro'?'Pro':'Growth'} features.</p><div className="mock-order-summary"><div><strong>LinkPulse {checkoutPlan==='pro'?'Pro':'Growth'}</strong><small>Account: {user.email}<br/>30 days · No automatic renewal</small></div><strong>{checkoutPlan==='pro'?'₹199':'₹599'}</strong></div><div className="billing-checkout-featurelist">{(checkoutPlan==='pro'?['500 new links per month','25,000 tracked clicks per month','One custom domain','Advanced analytics','Branded QR codes','Password protection']:['2,000 new links per month','Unlimited tracked clicks','Up to 3 custom domains','Bulk CSV import','Smart routing & A/B tests','API access & webhooks']).map(f=><span key={f}><Check size={13}/>{f}</span>)}</div><div className="mock-payment-method"><ShieldCheck size={17}/><div><strong>Simulated test payment</strong><small>No card, UPI or bank information required.</small></div><Badge tone="blue">TEST</Badge></div>{data.billingConfig?.mockBillingEnabled===false?<div className="checkout-result error"><ShieldCheck size={15}/><span>Demo checkout is disabled by the backend.</span></div>:<Button disabled={checkoutBusy} onClick={runMockCheckout}>{checkoutBusy?'Activating premium…':`Pay ${checkoutPlan==='pro'?'₹199':'₹599'} · Activate ${checkoutPlan==='pro'?'Pro':'Growth'}`} <ArrowRight size={15}/></Button>}{checkoutMessage&&<div className={`checkout-result ${checkoutMessage.type}`} role="status"><ShieldCheck size={15}/><span>{checkoutMessage.text}</span></div>}<small className="mock-safety-copy"><LockKeyhole size={12}/> Demo billing simulator · no actual charge.</small><button className="billing-switch-plan" onClick={()=>{setCheckoutMessage(null);setCheckoutPlan(checkoutPlan==='pro'?'growth':'pro')}}>Switch to {checkoutPlan==='pro'?'Growth':'Pro'} instead</button></div> : <div className="billing-upgrade-card"><div className="billing-upgrade-icon"><Sparkles size={22}/></div><span className="section-label">UNLOCK MORE</span><h3>Ready to level up?</h3><p>Choose a plan to unlock more capacity, deeper insights, and premium tools.</p><button className="billing-plan-option pro" onClick={()=>openCheckout('pro')}><span><strong>Pro</strong><small>For creators and marketers</small></span><b>₹199<small>/mo</small></b><ArrowRight size={15}/></button><button className="billing-plan-option growth" onClick={()=>openCheckout('growth')}><span><strong>Growth <PremiumBadge tier="GROWTH"/></strong><small>For businesses and high-traffic teams</small></span><b>₹599<small>/mo</small></b><ArrowRight size={15}/></button><div className="billing-upgrade-foot"><ShieldCheck size={14}/> Instant demo activation for this account</div></div>}
          <div className="billing-sidebar-helper"><div className="billing-helper-icon"><Zap size={15}/></div><div><strong>More power, same workflow</strong><p>Your existing short links keep working when you change plans.</p></div></div>
        </aside>
      </div>
    </section>}

    {page === 'settings' && <section className="page-content"><div className="section-heading"><div><h2>Settings</h2><p>Account and workspace configuration.</p></div></div><div className="content-grid"><div className="card form-card"><h3>Account</h3><div className="settings-row"><span>Name</span><strong>{user.name}</strong></div><div className="settings-row"><span>Email</span><strong>{user.email}</strong></div><div className="settings-row"><span>Role</span><Badge tone={user.role === 'admin' ? 'blue' : 'neutral'}>{user.role}</Badge></div><div className="settings-row"><span>Access token</span><strong>Stored for this MVP session</strong></div><Button variant="secondary" onClick={logout}><LogOut size={15}/> Sign out</Button></div><div className="card form-card"><h3>LinkPulse policies</h3><ul className="check-list"><li><Check size={16}/> Public registration creates regular users only.</li><li><Check size={16}/> Redirect rules are evaluated by the backend.</li><li><Check size={16}/> Cross-domain destination changes can require admin review.</li><li><Check size={16}/> Expired and disabled links retain historical events.</li><li><Check size={16}/> Bot filtering uses rules; classifications are estimates.</li></ul><p className="muted">Production deployment should use secure HttpOnly sessions or a reviewed token strategy, HTTPS, secret rotation and a security review.</p></div></div></section>}

    {page === 'activity' && <section className="page-content"><div className="section-heading"><div><h2>Activity history</h2><p>Audit entries for changes made through LinkPulse.</p></div><Button variant="secondary" onClick={()=>refresh()}><RefreshCw size={15}/> Refresh</Button></div><div className="card table-card"><div className="table-scroll"><table><thead><tr><th>Action</th><th>Resource</th><th>Resource ID</th><th>When</th></tr></thead><tbody>{data.activity.map(row=><tr key={row._id}><td><Badge tone="blue">{row.action}</Badge></td><td>{row.resourceType}</td><td><code>{row.resourceId || '—'}</code></td><td>{new Date(row.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div>{!data.activity.length && <Empty title="No recorded actions yet" body="Create links or campaigns and their changes will appear here."/>}</div></section>}

    {page === 'admin' && user.role === 'admin' && <section className="page-content"><div className="section-heading"><div><h2>Admin controls</h2><p>Manage destination safety, sensitive changes, and platform users.</p></div><Badge tone="amber">Admin</Badge></div><div className="content-grid"><div className="card form-card"><h3>Blocked domains</h3><form className="stack-form" onSubmit={addBlockedDomain}><label>Domain<input required value={domainForm.domain} onChange={e=>setDomainForm({...domainForm,domain:e.target.value})} placeholder="malicious.example"/></label><label>Reason<input value={domainForm.reason} onChange={e=>setDomainForm({...domainForm,reason:e.target.value})} placeholder="Reported phishing domain"/></label><Button><Plus size={16}/> Block domain</Button></form><div className="simple-list">{data.blockedDomains.map(d=><div key={d._id} className="simple-row"><div><strong>{d.domain}</strong><small>{d.reason || 'No reason recorded'}</small></div><Button variant="secondary" onClick={()=>deleteBlocked(d._id)}><X size={15}/> Remove</Button></div>)}</div></div><div className="card"><h3>Users</h3><p className="muted">Registration creates regular users only. Admin privileges are provisioned separately.</p><div className="simple-list">{data.users.map(u=><div key={u._id} className="simple-row"><div><strong>{u.name}</strong><small>{u.email}</small></div><Badge tone={u.role==='admin'?'blue':'neutral'}>{u.role}</Badge></div>)}</div></div></div><div className="card table-card"><div className="card-title-row"><div><h3>Pending destination changes</h3><p>Cross-domain destination changes are held until an administrator reviews them.</p></div></div><div className="review-input"><label>Review note<input value={reviewReason} onChange={e=>setReviewReason(e.target.value)} placeholder="Reason for approval or rejection"/></label></div>{data.pendingVersions.length ? data.pendingVersions.map(v=><div key={v._id} className="review-row"><div><strong>{v.proposedUrl}</strong><small>Link: {v.linkId?.code || String(v.linkId?._id || v.linkId)} · Requested by {v.requestedBy?.name || String(v.requestedBy)}</small></div><div className="row-actions"><Button variant="secondary" onClick={()=>reviewVersion(v._id,'reject')}>Reject</Button><Button onClick={()=>reviewVersion(v._id,'approve')}><Check size={15}/> Approve</Button></div></div>) : <Empty title="No pending changes" body="Destination changes requiring review will appear here."/>}</div><div className="card table-card"><h3>Platform links</h3><p className="muted">Disable a link immediately if it is abusive. Historical analytics remain stored.</p><div className="simple-list">{data.links.map(l=><div key={l._id} className="simple-row"><div><strong>{l.title || l.code}</strong><small>/{l.code} · {l.status}</small></div><Button variant="secondary" onClick={async()=>{try{await api(`/api/admin/links/${l._id}/disable`,{token,method:'POST',body:JSON.stringify({reason:'Admin action'})});await refresh();flash('Link disabled')}catch(err){flash(err.message,'error')}}}><ShieldCheck size={15}/> Disable</Button></div>)}</div></div></section>}
    <footer className="main-footer"><span>LinkPulse</span><span>Connected link management · Real-data analytics</span><span>© {new Date().getFullYear()}</span></footer>
    </main>
  </div>;
}
