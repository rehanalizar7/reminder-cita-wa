const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  // Fail loud at boot rather than silently signing tokens with `undefined`.
  throw new Error('JWT_SECRET belum di-set di .env');
}

function signSession(ree) {
  return jwt.sign({ sub: ree.id, email: ree.email, name: ree.name }, SECRET, {
    expiresIn: '30d',
  });
}

function verifySession(token) {
  return jwt.verify(token, SECRET); // throws if invalid/expired
}

module.exports = { signSession, verifySession };
