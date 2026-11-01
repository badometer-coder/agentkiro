import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export function findAppRoot() {
  const candidates = [
    process.env.PROJECT_PATH,
    '/Users/owner/proximity-app-final',
    '/app',
    '/app/proximity-app-final',
    '/app/proximity-app',
    '/workspace/proximity-app-final',
    '/workspace/proximity-app',
    '/var/lib/test/proximity-app-final',
    '/var/lib/test/proximity-app',
  ].filter(Boolean);
  
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      // Check if it has src/screens/auth/LoginScreen.tsx
      if (fs.existsSync(path.join(c, 'src/screens/auth/LoginScreen.tsx'))) return c;
      if (fs.existsSync(path.join(c, 'package.json'))) {
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(c, 'package.json'), 'utf8'));
          if (pkg.name && (pkg.name.includes('proximity') || pkg.name.includes('badometer'))) return c;
        } catch(e) {}
      }
    }
  }
  
  // Search broadly
  try {
    const out = execSync('find / -name "LoginScreen.tsx" 2>&1 | head -5', { encoding: 'utf8', timeout: 5000 });
    const lines = out.split('\n').filter(l => l.includes('LoginScreen.tsx') && !l.includes('Permission denied'));
    for (const line of lines) {
      const dir = path.dirname(path.dirname(path.dirname(line)));
      if (fs.existsSync(path.join(dir, 'src/context/AuthContext.tsx'))) return dir;
    }
  } catch(e) {}
  
  return candidates[0] || '/Users/owner/proximity-app-final';
}
