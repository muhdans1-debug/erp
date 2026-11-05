// pos-mvp/middleware/auth.js

export const managerAuth = (request, reply, done) => {
  const pin = request.headers['x-manager-pin'];

  // Fail-closed: Deny access if the header is missing or incorrect
  if (!pin || pin !== (process.env.MANAGER_PIN || '9999')) {
    reply.code(403).send({ error: 'Unauthorized. Valid Manager PIN required.' });
    return;
  }

  // PIN is valid, proceed to the route handler
  done();
};

