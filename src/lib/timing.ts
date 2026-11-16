export function makeTimer() {
  const start = performance.now();
  let _auth = 0; let _db = 0;
  return {
    endAuth() { _auth = performance.now() - start; },
    endDb()   { _db   = performance.now() - start - _auth; },
    header(): string { const total = performance.now() - start; return `auth;dur=${_auth.toFixed(0)},db;dur=${_db.toFixed(0)},total;dur=${total.toFixed(0)}`; },
    log(route: string): void { const total = performance.now() - start; console.log(`[timing] ${route} auth=${_auth.toFixed(0)}ms db=${_db.toFixed(0)}ms total=${total.toFixed(0)}ms`); },
  };
}
