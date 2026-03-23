import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  createClimateServiceRoutes,
  type ClimateServiceHandler,
} from '../src/generated/server/worldmonitor/climate/v1/service_server';

test('proto climate route maps query params into typed request payload', async () => {
  let receivedReq = null;
  const handler: ClimateServiceHandler = {
    async listClimateAnomalies(_ctx, req) {
      receivedReq = req;
      return { anomalies: [], pagination: { nextCursor: '', totalCount: 0 } };
    },
  };

  const [route] = createClimateServiceRoutes(handler);
  const response = await route.handler(new Request(
    'https://worldmonitor.app/api/climate/v1/list-climate-anomalies?page_size=25&cursor=abc&min_severity=ANOMALY_SEVERITY_EXTREME',
  ));

  assert.equal(response.status, 200);
  assert.deepEqual(receivedReq, {
    pageSize: 25,
    cursor: 'abc',
    minSeverity: 'ANOMALY_SEVERITY_EXTREME',
  });
});

test('proto climate route returns validation errors as 400 responses', async () => {
  const handler: ClimateServiceHandler = {
    async listClimateAnomalies() {
      throw new Error('should not be called');
    },
  };

  const [route] = createClimateServiceRoutes(handler, {
    validateRequest(methodName, body) {
      assert.equal(methodName, 'listClimateAnomalies');
      assert.equal(body.pageSize, 0);
      return [{ field: 'page_size', description: 'page_size must be positive' }];
    },
  });

  const response = await route.handler(new Request(
    'https://worldmonitor.app/api/climate/v1/list-climate-anomalies?page_size=0',
  ));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    violations: [{ field: 'page_size', description: 'page_size must be positive' }],
  });
});

test('proto climate route delegates unexpected errors to onError mapper', async () => {
  const handler: ClimateServiceHandler = {
    async listClimateAnomalies() {
      throw new Error('upstream unavailable');
    },
  };

  const [route] = createClimateServiceRoutes(handler, {
    onError(error) {
      return new Response(JSON.stringify({ message: error instanceof Error ? error.message : 'unknown' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  const response = await route.handler(new Request(
    'https://worldmonitor.app/api/climate/v1/list-climate-anomalies?page_size=5',
  ));

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { message: 'upstream unavailable' });
});
