// Public Q&R guest surface: scan a QR code, read the session's question list,
// submit a question, upvote. No account required.
//
// This is the only writer for guest traffic. Guests are never given database
// credentials — the qa_guest_* RPCs are revoked from anon/authenticated and
// reachable only through the service-role client held here.
//
// The browser sends a random device token it generated and stored locally; we
// hash it before it touches the database so a leaked table never exposes a
// token that could be replayed as someone else's device.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const MAX_TITLE = 300;
const MAX_BODY = 2000;
const MAX_NAME = 60;

async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(`qa-guest:${token}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Postgres error codes the RPCs raise deliberately, mapped to HTTP so the
// client can tell "you're going too fast" from "something broke".
const ERROR_STATUS: Record<string, number> = {
  P0002: 404, // not found
  '42501': 403, // not accepting / voting closed
  '22023': 400, // validation
  '53400': 429, // rate limited
  '23505': 409, // duplicate
};

const rpcError = (error: { code?: string; message?: string }) =>
  jsonResponse(
    { error: error.message || 'Something went wrong.' },
    ERROR_STATUS[error.code ?? ''] ?? 500,
  );

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400);
  }

  const action = String(payload.action || '');
  const code = String(payload.code || '').trim().toUpperCase();
  const deviceToken = String(payload.deviceToken || '');

  if (!code) {
    return jsonResponse({ error: 'Missing session code.' }, 400);
  }
  if (!deviceToken || deviceToken.length < 16 || deviceToken.length > 200) {
    return jsonResponse({ error: 'Missing or invalid device token.' }, 400);
  }

  const voterHash = await hashToken(deviceToken);

  if (action === 'load') {
    const { data, error } = await admin.rpc('qa_guest_session', {
      code,
      voter_hash: voterHash,
    });
    if (error) return rpcError(error);
    if (!data?.found) return jsonResponse({ error: 'That code did not match a session.' }, 404);
    return jsonResponse(data);
  }

  if (action === 'submit') {
    const title = String(payload.title || '').trim().slice(0, MAX_TITLE);
    const body = String(payload.body || '').trim().slice(0, MAX_BODY);
    const name = String(payload.name || '').trim().slice(0, MAX_NAME);

    if (!title) {
      return jsonResponse({ error: 'Please enter a question.' }, 400);
    }

    const { data, error } = await admin.rpc('qa_guest_submit', {
      code,
      q_title: title,
      q_body: body || null,
      q_name: name || null,
      voter_hash: voterHash,
    });
    if (error) return rpcError(error);

    // Return the refreshed board so the guest immediately sees their question
    // (or the "waiting for approval" state) without a second round trip.
    const { data: board } = await admin.rpc('qa_guest_session', {
      code,
      voter_hash: voterHash,
    });

    return jsonResponse({ submitted: data, ...(board || {}) });
  }

  if (action === 'vote') {
    const questionId = String(payload.questionId || '');
    if (!questionId) {
      return jsonResponse({ error: 'Missing question.' }, 400);
    }

    const { data, error } = await admin.rpc('qa_guest_vote', {
      code,
      target_question_id: questionId,
      voter_hash: voterHash,
    });
    if (error) return rpcError(error);
    return jsonResponse(data);
  }

  return jsonResponse({ error: 'Unknown action.' }, 400);
});
