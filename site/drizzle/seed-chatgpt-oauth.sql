INSERT OR IGNORE INTO oauth_clients
  (client_id, client_name, client_type, client_secret_hash, redirect_uris, allowed_scopes, token_endpoint_auth_method, enabled)
VALUES (
  'chatgpt-xingyu',
  'ChatGPT · XINGYU',
  'public',
  NULL,
  '["https://chatgpt.com/connector_platform_oauth_redirect","https://chatgpt.com/oauth/callback","https://chat.openai.com/oauth/callback"]',
  'xingyu.read xingyu.draft xingyu.publish offline_access',
  'none',
  1
);
