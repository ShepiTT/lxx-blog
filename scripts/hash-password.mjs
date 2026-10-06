// Turns an admin password into the hash stored in ADMIN_PASSWORD_HASH.
// Usage: npm run admin:password   (then type the password and press Enter)
import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline';

const readPassword = async () => {
  if (!process.stdin.isTTY) {
    let data = '';
    for await (const chunk of process.stdin) data += chunk;
    return data.replace(/\r?\n$/, '');
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question('输入新的后台密码：', resolve));
  rl.close();
  return answer;
};

const password = await readPassword();
if (password.length < 8) {
  console.error('密码至少 8 位');
  process.exit(1);
}
const salt = randomBytes(16);
const key = scryptSync(password, salt, 64);
console.log(`ADMIN_PASSWORD_HASH=scrypt:${salt.toString('hex')}:${key.toString('hex')}`);
if (process.argv.includes('--with-secret')) console.log(`ADMIN_SESSION_SECRET=${randomBytes(32).toString('hex')}`);
