'use client';

import { createClient, type Session } from '@supabase/supabase-js';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Row = Record<string, unknown> & { id?: string };
type Field = { name: string; label: string; type?: 'text' | 'textarea' | 'number' | 'checkbox' | 'experience' };
type Definition = { key: string; label: string; columns: string[]; fields: Field[]; readOnly?: boolean };

const definitions: Definition[] = [
  { key: 'social-links', label: 'Social Links', columns: ['type', 'label', 'href'], fields: [
    { name: 'type', label: 'Type' }, { name: 'label', label: 'Label' }, { name: 'href', label: 'URL / Address' },
    { name: 'icon', label: 'Bootstrap Icon Class' }, { name: 'sort_order', label: 'Sort Order', type: 'number' },
  ] },
  { key: 'skills', label: 'Skills', columns: ['name', 'percentage', 'category'], fields: [
    { name: 'name', label: 'Skill' }, { name: 'percentage', label: 'Percentage', type: 'number' }, { name: 'category', label: 'Category' },
    { name: 'sort_order', label: 'Sort Order', type: 'number' },
  ] },
  { key: 'education', label: 'Education', columns: ['degree', 'school', 'start_year', 'end_year'], fields: [
    { name: 'degree', label: 'Degree' }, { name: 'short_degree', label: 'Short Degree' }, { name: 'field', label: 'Field' },
    { name: 'school', label: 'School' }, { name: 'thesis', label: 'Thesis', type: 'textarea' },
    { name: 'start_year', label: 'Start Year' }, { name: 'end_year', label: 'End Year' },
    { name: 'sort_order', label: 'Sort Order', type: 'number' },
  ] },
  { key: 'experiences', label: 'Experience', columns: ['role', 'company', 'start_label', 'end_label'], fields: [
    { name: 'company', label: 'Company' }, { name: 'role', label: 'Role' }, { name: 'location', label: 'Location' },
    { name: 'start_label', label: 'Start' }, { name: 'end_label', label: 'End' },
    { name: 'is_current', label: 'Current Position', type: 'checkbox' }, { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'sort_order', label: 'Sort Order', type: 'number' },
  ] },
  { key: 'projects', label: 'Projects', columns: ['project_location', 'start_label', 'end_label'], fields: [
    { name: 'experience_id', label: 'Experience', type: 'experience' }, { name: 'project_location', label: 'Project / Location' },
    { name: 'start_label', label: 'Start' }, { name: 'end_label', label: 'End' },
    { name: 'description', label: 'Description', type: 'textarea' }, { name: 'sort_order', label: 'Sort Order', type: 'number' },
  ] },
  { key: 'contact-messages', label: 'Contact Inbox', columns: ['name', 'email', 'subject', 'message'], fields: [], readOnly: true },
];

const profileFields: Field[] = [
  { name: 'name', label: 'Name' }, { name: 'role', label: 'Role' }, { name: 'phone', label: 'Phone' },
  { name: 'email', label: 'Email' }, { name: 'date_of_birth', label: 'Date of Birth' }, { name: 'website', label: 'Website' },
  { name: 'city', label: 'City' }, { name: 'summary_en', label: 'Summary (English)', type: 'textarea' },
  { name: 'summary_id', label: 'Summary (Indonesian)', type: 'textarea' }, { name: 'bio_en', label: 'About Bio (English)', type: 'textarea' },
  { name: 'bio_id', label: 'About Bio (Indonesian)', type: 'textarea' }, { name: 'about_intro', label: 'About Intro', type: 'textarea' },
  { name: 'resume_intro', label: 'Resume Intro', type: 'textarea' }, { name: 'footer_tagline', label: 'Footer Tagline' },
  { name: 'avatar_url', label: 'Avatar URL' }, { name: 'cv_url', label: 'CV URL' },
];

function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'missing-anon-key';
  return createClient(url, key);
}

function formatRemaining(seconds: number | null) {
  if (seconds === null) return 'Checking…';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m remaining`;
}

export default function AdminPage() {
  const supabase = useMemo(createSupabaseBrowserClient, []);
  const signingIn = useRef(false);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [sessionCheck, setSessionCheck] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [active, setActive] = useState('profile');
  const [data, setData] = useState<Record<string, Row | Row[]>>({});
  const [editor, setEditor] = useState<{ definition: Definition; row: Row; creating: boolean } | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const signOut = useCallback(async (message = 'Signed out') => {
    await fetch('/api/admin/session', { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
    await supabase.auth.signOut();
    setSession(null);
    setSessionExpiresAt(null);
    setRemainingSeconds(null);
    setData({});
    setEditor(null);
    setStatus(message);
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: authData }) => setSession(authData.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!signingIn.current) setSession(nextSession);
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!session || signingIn.current) return;
    const accessToken = session.access_token;
    let cancelled = false;

    async function checkAdminSession() {
      try {
        const response = await fetch('/api/admin/session', {
          credentials: 'same-origin',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const payload = response.status === 204 ? {} : await response.json();
        if (!response.ok) throw new Error(payload.error || 'Your admin session has expired. Please sign in again.');
        if (!cancelled) setSessionExpiresAt(payload.expiresAt);
      } catch (error) {
        if (!cancelled) await signOut(error instanceof Error ? error.message : 'Your admin session has expired. Please sign in again.');
      }
    }

    void checkAdminSession();
    return () => { cancelled = true; };
  }, [session, sessionCheck, signOut]);

  useEffect(() => {
    if (!sessionExpiresAt) return;
    const updateRemaining = () => {
      const seconds = Math.max(0, Math.ceil((new Date(sessionExpiresAt).getTime() - Date.now()) / 1000));
      setRemainingSeconds(seconds);
      if (seconds === 0) void signOut('Your six-hour admin session has expired. Please sign in again.');
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 30_000);
    return () => window.clearInterval(timer);
  }, [sessionExpiresAt, signOut]);

  const adminFetch = useCallback(async (path: string, options: RequestInit = {}) => {
    if (!session) throw new Error('Authentication required');
    const response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      headers: { Authorization: `Bearer ${session.access_token}`, ...options.headers },
    });
    const payload = response.status === 204 ? {} : await response.json();
    if (!response.ok) {
      if (response.status === 401) void signOut(payload.error || 'Your six-hour admin session has expired. Please sign in again.');
      throw new Error(payload.error || 'Admin request failed');
    }
    return payload;
  }, [session, signOut]);

  const loadAll = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    setStatus('Loading content…');
    try {
      const keys = ['profile', ...definitions.map((definition) => definition.key)];
      const results = await Promise.all(keys.map((key) => adminFetch(`/api/admin/${key}`)));
      setData(Object.fromEntries(keys.map((key, index) => [key, results[index].data])));
      setStatus('Content is up to date');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to load admin data');
    } finally {
      setBusy(false);
    }
  }, [adminFetch, session]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus('Signing in…');
    signingIn.current = true;
    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !authData.session) throw new Error(error?.message || 'Unable to sign in');

      const response = await fetch('/api/admin/session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Authorization: `Bearer ${authData.session.access_token}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'This account is not authorized to access the CMS.');

      setSession(authData.session);
      setSessionExpiresAt(payload.expiresAt);
      setSessionCheck((value) => value + 1);
      setPassword('');
      setStatus('Signed in. Your admin session expires in 6 hours.');
    } catch (error) {
      await supabase.auth.signOut();
      setSession(null);
      setStatus(error instanceof Error ? error.message : 'Unable to sign in');
    } finally {
      signingIn.current = false;
      setBusy(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    setBusy(true);
    try {
      const result = await adminFetch('/api/admin/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      setData((current) => ({ ...current, profile: result.data }));
      setStatus('Profile saved');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to save profile');
    } finally {
      setBusy(false);
    }
  }

  async function saveEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const form = new FormData(event.currentTarget);
    const values: Row = {};
    editor.definition.fields.forEach((field) => {
      if (field.type === 'checkbox') values[field.name] = form.has(field.name);
      else if (field.type === 'number') {
        const raw = form.get(field.name);
        if (raw !== null && raw !== '') values[field.name] = Number(raw);
      } else values[field.name] = form.get(field.name) || null;
    });
    const path = editor.creating ? `/api/admin/${editor.definition.key}` : `/api/admin/${editor.definition.key}/${editor.row.id}`;
    setBusy(true);
    try {
      await adminFetch(path, { method: editor.creating ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      setEditor(null);
      setStatus(`${editor.definition.label} saved`);
      await loadAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to save record');
    } finally {
      setBusy(false);
    }
  }

  async function remove(definition: Definition, row: Row) {
    if (!row.id || !window.confirm(`Delete this ${definition.label.toLowerCase()} record?`)) return;
    setBusy(true);
    try {
      await adminFetch(`/api/admin/${definition.key}/${row.id}`, { method: 'DELETE' });
      setStatus('Record deleted');
      await loadAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to delete record');
    } finally {
      setBusy(false);
    }
  }

  async function upload(kind: 'avatar' | 'cv', file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', file);
    setBusy(true);
    try {
      const result = await adminFetch('/api/admin/upload', { method: 'POST', body: form });
      const key = kind === 'avatar' ? 'avatar_url' : 'cv_url';
      setData((current) => ({ ...current, profile: { ...(current.profile as Row), [key]: result.url } }));
      setStatus('File uploaded. Save the profile to publish the new URL.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return <main className="admin-login">
      <section className="login-intro">
        <span className="eyebrow">REGINA RESUME</span>
        <h1>Control your resume, without touching code.</h1>
        <p>Update profile, experience, projects, skills, and incoming messages from one protected workspace.</p>
        <ul><li>Changes appear through the public resume API</li><li>Only allowlisted Supabase accounts can enter</li><li>Every admin session ends after six hours</li></ul>
      </section>
      <form className="login-card" onSubmit={login}>
        <span className="eyebrow">ADMIN SIGN IN</span><h2>Welcome back</h2><p>Use your authorized Supabase account to continue.</p>
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label>
        <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in to CMS'}</button>
        <output aria-live="polite">{status}</output>
      </form>
    </main>;
  }

  const profile = (data.profile || {}) as Row;
  const definition = definitions.find((item) => item.key === active);
  const rows = definition ? (data[definition.key] as Row[] || []) : [];

  return <main className="admin-shell">
    <aside className="admin-sidebar">
      <div className="brand"><span className="brand-mark">R</span><div><strong>Resume CMS</strong><small>Content workspace</small></div></div>
      <div className="account-card"><span>Signed in as</span><strong>{session.user.email}</strong><small className="session-badge">◷ {formatRemaining(remainingSeconds)}</small></div>
      <nav aria-label="CMS sections"><span className="nav-label">MANAGE CONTENT</span>
        <button type="button" className={active === 'profile' ? 'active' : ''} onClick={() => setActive('profile')}>Profile</button>
        {definitions.map((item) => <button type="button" key={item.key} className={active === item.key ? 'active' : ''} onClick={() => setActive(item.key)}>{item.label}</button>)}
      </nav>
      <button type="button" className="secondary sign-out" onClick={() => void signOut()}>Sign out</button>
    </aside>
    <section className="admin-content">
      <header className="content-header"><div><span className="eyebrow">CONTENT WORKSPACE</span><h2>{active === 'profile' ? 'Profile' : definition?.label}</h2><p>Saved changes publish through the public resume API immediately.</p></div>
        <output className={status.toLowerCase().includes('unable') || status.toLowerCase().includes('error') || status.toLowerCase().includes('expired') ? 'status error' : 'status'} aria-live="polite">{busy ? 'Working…' : status}</output>
      </header>
      {active === 'profile' ? <form className="admin-form profile-form" onSubmit={saveProfile}>
        {profileFields.map((field) => <FieldControl key={field.name} field={field} value={profile[field.name]} />)}
        <div className="upload-row"><label>Upload avatar<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void upload('avatar', event.target.files?.[0])} /></label>
          <label>Upload PDF<input type="file" accept="application/pdf" onChange={(event) => void upload('cv', event.target.files?.[0])} /></label></div>
        <button disabled={busy}>Save profile changes</button>
      </form> : definition && <div className="resource-panel">
        {!definition.readOnly && <button type="button" onClick={() => setEditor({ definition, row: {}, creating: true })}>Add new {definition.label.toLowerCase()}</button>}
        <div className="table-wrap"><table><thead><tr>{definition.columns.map((column) => <th key={column}>{column.replaceAll('_', ' ')}</th>)}<th>Actions</th></tr></thead>
          <tbody>{rows.length > 0 ? rows.map((row) => <tr key={row.id}>{definition.columns.map((column) => <td key={column}>{String(row[column] ?? '')}</td>)}
            <td className="actions">{!definition.readOnly && <><button type="button" className="secondary" onClick={() => setEditor({ definition, row, creating: false })}>Edit</button><button type="button" className="danger" onClick={() => void remove(definition, row)}>Delete</button></>}</td></tr>) : <tr><td colSpan={definition.columns.length + 1} className="empty-state">No {definition.label.toLowerCase()} records yet.</td></tr>}</tbody>
        </table></div>
      </div>}
    </section>
    {editor && <div className="modal-backdrop" role="presentation"><form className="admin-form modal-card" onSubmit={saveEditor}><span className="eyebrow">{editor.creating ? 'NEW RECORD' : 'EDIT RECORD'}</span><h2>{editor.creating ? 'Add' : 'Edit'} {editor.definition.label}</h2>
      {editor.definition.fields.map((field) => <FieldControl key={field.name} field={field} value={editor.row[field.name]} experiences={(data.experiences as Row[]) || []} />)}
      <div className="modal-actions"><button type="button" className="secondary" onClick={() => setEditor(null)}>Cancel</button><button disabled={busy}>Save changes</button></div>
    </form></div>}
  </main>;
}

function FieldControl({ field, value, experiences = [] }: { field: Field; value: unknown; experiences?: Row[] }) {
  const stringValue = value === null || value === undefined ? '' : String(value);
  if (field.type === 'textarea') return <label className="wide">{field.label}<textarea name={field.name} defaultValue={stringValue} rows={4} /></label>;
  if (field.type === 'checkbox') return <label className="checkbox"><input type="checkbox" name={field.name} defaultChecked={Boolean(value)} />{field.label}</label>;
  if (field.type === 'experience') return <label>{field.label}<select name={field.name} defaultValue={stringValue} required><option value="">Select experience</option>{experiences.map((item) => <option key={item.id} value={item.id}>{String(item.role || item.company)}</option>)}</select></label>;
  return <label>{field.label}<input name={field.name} type={field.type || 'text'} defaultValue={stringValue} /></label>;
}
