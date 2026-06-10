const CANVA_AUTH_URL = 'https://www.canva.com/api/oauth/authorize';
const CONSTANT_CONTACT_AUTH_URL = 'https://authz.constantcontact.com/oauth2/default/v1/authorize';

const canvaScopes = [
  'design:meta:read',
  'design:content:read',
  'design:content:write',
  'asset:read',
  'asset:write',
  'profile:read',
];

const constantContactScopes = [
  'contact_data',
  'campaign_data',
  'offline_access',
];

const base64UrlEncode = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const createRandomString = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
};

const createCodeChallenge = async (verifier) => {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
};

const buildUrl = (baseUrl, params) => {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  return url.toString();
};

export const integrations = {
  canva: {
    name: 'Canva',
    clientId: import.meta.env.VITE_CANVA_CLIENT_ID || '',
    redirectUri: import.meta.env.VITE_CANVA_REDIRECT_URI || `${window.location.origin}/?integration=canva`,
    scopes: canvaScopes,
  },
  constantContact: {
    name: 'Constant Contact',
    clientId: import.meta.env.VITE_CONSTANT_CONTACT_CLIENT_ID || '',
    redirectUri: import.meta.env.VITE_CONSTANT_CONTACT_REDIRECT_URI || `${window.location.origin}/?integration=constant-contact`,
    scopes: constantContactScopes,
  },
};

export const getIntegrationStatus = (provider) => {
  const integration = integrations[provider];
  return {
    configured: Boolean(integration.clientId && integration.redirectUri),
    redirectUri: integration.redirectUri,
    scopes: integration.scopes.join(' '),
  };
};

export const createCanvaAuthUrl = async () => {
  const state = createRandomString();
  const verifier = createRandomString();
  const challenge = await createCodeChallenge(verifier);

  sessionStorage.setItem('canva_oauth_state', state);
  sessionStorage.setItem('canva_code_verifier', verifier);

  return buildUrl(CANVA_AUTH_URL, {
    client_id: integrations.canva.clientId,
    redirect_uri: integrations.canva.redirectUri,
    response_type: 'code',
    scope: integrations.canva.scopes.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
};

export const createConstantContactAuthUrl = () => {
  const state = createRandomString();
  sessionStorage.setItem('constant_contact_oauth_state', state);

  return buildUrl(CONSTANT_CONTACT_AUTH_URL, {
    client_id: integrations.constantContact.clientId,
    redirect_uri: integrations.constantContact.redirectUri,
    response_type: 'code',
    scope: integrations.constantContact.scopes.join(' '),
    state,
  });
};
