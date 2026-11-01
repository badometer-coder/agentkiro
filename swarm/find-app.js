import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export function findAppRoot() {
  const candidates = [
    process.env.PROJECT_PATH,
    '/Users/owner/proximity-app-final',
    '/Users/owner/proximity-social-app',
    '/app',
    '/app/proximity-app-final',
    '/app/proximity-app',
    '/workspace/proximity-app-final',
    '/workspace/proximity-app',
    '/var/lib/test/proximity-app-final',
    '/var/lib/test/proximity-app',
    '/opt/render/project/src',
    '/opt/render/project/proximity-app',
    process.cwd(),
    process.cwd().replace('/swarm',''),
  ].filter(Boolean);
  
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      if (fs.existsSync(path.join(c, 'src/screens/auth/LoginScreen.tsx')) && fs.existsSync(path.join(c, 'src/context/AuthContext.tsx'))) return c;
      if (fs.existsSync(path.join(c, 'package.json'))) {
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(c, 'package.json'), 'utf8'));
          if (pkg.name && (pkg.name.includes('proximity') || pkg.name.includes('badometer'))) {
            if (fs.existsSync(path.join(c, 'src'))) return c;
          }
        } catch(e) {}
      }
    }
  }
  
  // Search broadly
  try {
    const out = execSync('find / -name "LoginScreen.tsx" 2>&1 | head -10', { encoding: 'utf8', timeout: 8000 });
    const lines = out.split('\n').filter(l => l.includes('LoginScreen.tsx') && !l.includes('Permission denied'));
    for (const line of lines) {
      // go up to find root with src/context/AuthContext.tsx
      let dir = path.dirname(line);
      for (let i = 0; i < 6; i++) {
        dir = path.dirname(dir);
        if (fs.existsSync(path.join(dir, 'src/context/AuthContext.tsx'))) return dir;
        if (fs.existsSync(path.join(dir, 'package.json'))) {
          try {
            const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
            if (pkg.name && pkg.name.includes('proximity')) return dir;
          } catch(e) {}
        }
      }
    }
  } catch(e) {}
  
  return '/Users/owner/proximity-app-final';
}
