import { ownerLogin } from '../../server/auth.ts';

export function POST(request: Request): Promise<Response> {
  return ownerLogin(request);
}
