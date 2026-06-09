import React from 'react';
import { Auth as SupabaseAuth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '../lib/supabaseClient';
import { BookOpen } from 'lucide-react';

export default function Auth() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: 'var(--bg-primary)',
      padding: '1.5rem'
    }}>
      <div style={{
        maxWidth: '420px',
        width: '100%',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        padding: '2.5rem 2rem',
        boxShadow: 'var(--shadow-lg)'
      }}>
        {/* Header Logo & Branding */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: '2rem'
        }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            backgroundColor: 'var(--accent-gold-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '0.75rem'
          }}>
            <BookOpen size={30} style={{ color: 'var(--accent-gold)' }} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)', marginBottom: '0.25rem', fontWeight: 'bold' }}>CB Students Portal</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
            Charleston Baptist Church Youth Small Groups
          </p>
        </div>

        {/* Supabase Pre-built Auth Form */}
        <SupabaseAuth 
          supabaseClient={supabase} 
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: 'var(--accent-gold)',
                  brandAccent: 'var(--accent-gold-hover)',
                  inputBackground: 'var(--bg-tertiary)',
                  inputText: 'var(--text-primary)',
                  inputBorder: 'var(--border-color)',
                  inputPlaceholder: 'var(--text-muted)'
                },
                radii: {
                  buttonRadius: '8px',
                  inputRadius: '8px',
                }
              }
            }
          }}
          theme="default"
          providers={[]} // Exclude third party OAuth providers for simple email/password
        />
      </div>
    </div>
  );
}
