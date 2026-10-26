import { ownerSessionStatus } from '../../server/auth.ts';

export function GET(request: Request): Promise<Response> {
  return ownerSessionStatus(request);
}
