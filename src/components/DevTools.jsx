import { useState, useEffect } from 'react';
import { supabase, hasSupabaseConfig } from '../lib/supabaseClient';
import { Code2 } from 'lucide-react';

export default function DevTools() {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setLoading(false);
      return;
    }

    const load = async () => {
      const { data } = await supabase
        .from('organizations')
        .select('id, name, slug, invite_code, primary_color, secondary_color, created_at')
        .order('created_at', { ascending: true });

      setOrganizations(data || []);
      setLoading(false);
    };

    load();
  }, []);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '12px',
          background: 'var(--developer-bg)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Code2 size={24} color="var(--developer-text)" />
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>DevTools</h1>
      </div>

      <section className="card" style={{ padding: '1.25rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>Organizations</h2>

        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
        ) : organizations.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No organizations found.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem 0.75rem', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name</th>
                  <th style={{ padding: '0.5rem 0.75rem', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Slug</th>
                  <th style={{ padding: '0.5rem 0.75rem', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Invite Code</th>
                  <th style={{ padding: '0.5rem 0.75rem', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Colors</th>
                  <th style={{ padding: '0.5rem 0.75rem', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((org) => (
                  <tr key={org.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.6rem 0.75rem', fontWeight: 600 }}>{org.name}</td>
                    <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-secondary)' }}>{org.slug}</td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <code style={{ background: 'var(--bg-tertiary)', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem' }}>
                        {org.invite_code}
                      </code>
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <span style={{ width: 20, height: 20, borderRadius: 4, background: org.primary_color, border: '1px solid var(--border-color)' }} title={org.primary_color} />
                        <span style={{ width: 20, height: 20, borderRadius: 4, background: org.secondary_color, border: '1px solid var(--border-color)' }} title={org.secondary_color} />
                      </div>
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(org.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
