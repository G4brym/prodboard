export const STYLES = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8f9fa; color: #1a1a2e; line-height: 1.5; }
nav { background: #1a1a2e; color: #fff; padding: 0.75rem 1.5rem; }
.nav-inner { max-width: 1200px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; }
.logo { color: #fff; text-decoration: none; font-weight: 700; font-size: 1.1rem; }
.nav-links a { color: #cbd5e1; text-decoration: none; margin-left: 1.5rem; font-size: 0.9rem; }
.nav-links a:hover { color: #fff; }
main { max-width: 1200px; margin: 1.5rem auto; padding: 0 1.5rem; }
h1 { margin-bottom: 1rem; font-size: 1.5rem; }
h2 { margin-bottom: 0.75rem; font-size: 1.25rem; }
h3 { margin-bottom: 0.5rem; font-size: 1rem; text-transform: capitalize; }
.board { display: flex; gap: 1rem; overflow-x: auto; }
.board-column { flex: 1; min-width: 200px; background: #e9ecef; border-radius: 8px; padding: 0.75rem; }
.board-column h3 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: #495057; }
.count { font-weight: 400; color: #868e96; }
.card { display: block; background: #fff; border-radius: 6px; padding: 0.75rem; margin-top: 0.5rem; text-decoration: none; color: inherit; box-shadow: 0 1px 2px rgba(0,0,0,0.06); transition: box-shadow 0.15s; }
.card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
.card-title { font-weight: 500; font-size: 0.9rem; }
.card-meta { font-size: 0.75rem; color: #868e96; margin-top: 0.25rem; }
.badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 999px; color: #fff; font-size: 0.75rem; font-weight: 500; }
table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #dee2e6; font-size: 0.9rem; }
th { background: #e9ecef; font-weight: 600; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; }
tr:hover td { background: #f1f3f5; }
.detail { background: #fff; border-radius: 8px; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 1rem; }
.detail h1 { display: flex; align-items: center; gap: 0.75rem; }
.detail-meta { color: #868e96; font-size: 0.85rem; margin-bottom: 1rem; }
.description { white-space: pre-wrap; margin: 1rem 0; padding: 1rem; background: #f8f9fa; border-radius: 6px; }
.comment { border-left: 3px solid #dee2e6; padding: 0.5rem 0.75rem; margin: 0.75rem 0; }
.comment-author { font-weight: 600; font-size: 0.85rem; }
.comment-date { color: #868e96; font-size: 0.75rem; }
form { margin: 1rem 0; }
label { display: block; font-weight: 500; margin-bottom: 0.25rem; font-size: 0.9rem; }
input[type="text"], input[type="password"], textarea, select { width: 100%; padding: 0.5rem; border: 1px solid #ced4da; border-radius: 4px; font-size: 0.9rem; font-family: inherit; }
textarea { min-height: 80px; resize: vertical; }
.form-row { margin-bottom: 0.75rem; }
button, .btn { display: inline-block; padding: 0.5rem 1rem; border: none; border-radius: 4px; font-size: 0.9rem; cursor: pointer; text-decoration: none; font-family: inherit; }
.btn-primary { background: #3b82f6; color: #fff; }
.btn-primary:hover { background: #2563eb; }
.btn-danger { background: #ef4444; color: #fff; }
.btn-danger:hover { background: #dc2626; }
.btn-sm { padding: 0.25rem 0.5rem; font-size: 0.8rem; }
.actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
.login-box { max-width: 360px; margin: 4rem auto; }
.flash { padding: 0.75rem 1rem; border-radius: 4px; margin-bottom: 1rem; background: #fef3cd; color: #856404; }
`;
