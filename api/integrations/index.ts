import { hasOwnerSession } from '../../server/auth.ts';
import { getIntegrationStatuses } from '../../server/integrations.ts';
import { json } from '../../server/runtime.ts';

export async function GET(request: Request): Promise<Response> {
  if (!await hasOwnerSession(request)) {
    return json({ error: 'unauthorized', message: 'مركز التكاملات متاح للمالك بعد تسجيل الدخول.' }, 401);
  }
  return json({ integrations: getIntegrationStatuses() });
}
