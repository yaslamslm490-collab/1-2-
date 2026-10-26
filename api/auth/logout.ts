import { ownerLogout } from '../../server/auth.ts';

export function POST(request: Request): Response {
  return ownerLogout(request);
}
