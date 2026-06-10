import { hasSupabaseConfig, supabase } from './supabaseClient';

export const canUseIntegrationApi = Boolean(hasSupabaseConfig && supabase);

export const getSavedConnections = async () => {
  if (!canUseIntegrationApi) return [];

  const { data, error } = await supabase.functions.invoke('integrations-manage', {
    body: { action: 'list' },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data?.connections || [];
};

export const exchangeIntegrationCode = async ({ provider, code, redirectUri, codeVerifier, scopes }) => {
  if (!canUseIntegrationApi) {
    throw new Error('Supabase must be configured before connecting integrations.');
  }

  const { data, error } = await supabase.functions.invoke('integrations-oauth', {
    body: {
      provider,
      code,
      redirectUri,
      codeVerifier,
      scopes,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
};

export const removeIntegrationConnection = async (provider) => {
  if (!canUseIntegrationApi) return;

  const { data, error } = await supabase.functions.invoke('integrations-manage', {
    body: {
      action: 'disconnect',
      provider,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data?.error) {
    throw new Error(data.error);
  }
};

export const runIntegrationAction = async ({ provider, action }) => {
  if (!canUseIntegrationApi) {
    throw new Error('Supabase must be configured before using integrations.');
  }

  const { data, error } = await supabase.functions.invoke('integrations-proxy', {
    body: {
      provider,
      action,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
};

export const getAnnouncementDraft = async () => {
  if (!canUseIntegrationApi) return null;

  const { data, error } = await supabase
    .from('announcement_drafts')
    .select('title, audience, channel, canva_url, body, updated_at')
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

export const saveAnnouncementDraft = async (draft) => {
  if (!canUseIntegrationApi) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    throw new Error(userError?.message || 'Missing Supabase user session.');
  }

  const { data, error } = await supabase
    .from('announcement_drafts')
    .upsert({
      user_id: userData.user.id,
      title: draft.title,
      audience: draft.audience,
      channel: draft.channel,
      canva_url: draft.canvaUrl || null,
      body: draft.body,
      updated_at: new Date().toISOString(),
    })
    .select('title, audience, channel, canva_url, body, updated_at')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};
