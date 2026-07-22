import { Router } from 'express';
import { validateBody } from '../middleware/validate';
import { loginRequestSchema, type LoginRequestBody } from '../validation/auth.schema';
import { signToken } from '../services/auth.service';

const router = Router();

// No password by design (see README assumptions) — userId is self-declared, same as before this
// bonus was added. What login provides is a signed token so later requests can prove they're
// still that same identity, rather than the server trusting a bare body field every time.
router.post('/login', validateBody(loginRequestSchema), (req, res) => {
  const { userId } = req.body as LoginRequestBody;
  const token = signToken(userId);
  res.status(200).json({ token, userId });
});

export default router;
