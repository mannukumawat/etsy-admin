// Shown instead of the admin app when VITE_API_BASE_URL is not set. There is no mock-data fallback
// in the running app any more — mock data only exists behind the vitest test harness.
export function ConfigurationRequired() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif', background: '#faf7f2' }}>
      <div style={{ maxWidth: 560, background: '#fff', border: '1px solid #e7decb', borderRadius: 12, padding: '28px 32px' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Admin is not configured</h1>
        <p style={{ marginTop: 12, color: '#55504a', lineHeight: 1.55 }}>
          <code>VITE_API_BASE_URL</code> is not set, so this app has no backend to connect to. To avoid showing fake store data, it will not start.
        </p>
        <p style={{ marginTop: 12, color: '#55504a', lineHeight: 1.55 }}>
          Create <code>admin/.env.local</code> and set <code>VITE_API_BASE_URL</code> to the backend's address (the dev backend listens on port 4000 by default), then restart the dev server.
        </p>
      </div>
    </div>
  );
}
