import { request } from '@playwright/test';
import { API_URL } from './support/run';

/**
 * The suite runs against a locally running API; Playwright only starts `ng serve` itself.
 * Fail early with instructions instead of letting every test time out.
 */
export default async function globalSetup(): Promise<void> {
  const http = await request.newContext({ ignoreHTTPSErrors: true });
  try {
    const response = await http.get(`${API_URL}/Boards`, { timeout: 10_000 }).catch(() => null);
    if (response?.status() !== 401) {
      throw new Error(
        `The ClefCraft API isn't answering at ${API_URL} (expected 401 from GET /Boards, got ${response?.status() ?? 'no response'}). ` +
          'Start it first, in ClefCraft-Backend: dotnet run --project ClefCraft.Api --launch-profile https'
      );
    }
  } finally {
    await http.dispose();
  }
}
