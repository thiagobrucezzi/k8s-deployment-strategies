import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

const activeResponseTime = new Trend('active_service_response_time');
const previewResponseTime = new Trend('preview_service_response_time');
const errorRate = new Rate('errors');
const successCount = new Counter('successes');

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 20 },
    { duration: '20s', target: 30 },
    { duration: '30s', target: 10 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<2000', 'p(99)<3000'],
    'errors': ['rate<0.10'],
    'active_service_response_time': ['p(95)<2000'],
    'preview_service_response_time': ['p(95)<2000'],
  },
};

function parseResponse(res) {
  const contentType = res.headers['Content-Type'] || '';

  if (contentType.includes('application/json')) {
    try {
      return {
        type: 'json',
        data: res.json(),
        color: res.json('color'),
        version: res.json('version')
      };
    } catch (e) {
      return { type: 'error', error: 'Invalid JSON' };
    }
  } else if (contentType.includes('text/html')) {
    const html = res.body;
    const colorMatch = html.match(/Color:\s*(\w+)/) || html.match(/color.*?(\w+)(?=\s|"|')/i);
    const versionMatch = html.match(/Versión\s*([^\s<]+)/) || html.match(/v[\d\.]+/);

    return {
      type: 'html',
      data: {
        color: colorMatch ? colorMatch[1] : null,
        version: versionMatch ? versionMatch[0] : null,
      },
      color: colorMatch ? colorMatch[1] : null,
      version: versionMatch ? versionMatch[0] : null
    };
  } else {
    return { type: 'unknown', data: null };
  }
}

function checkServiceResponse(res, serviceName) {
  const parsed = parseResponse(res);

  const checks = {
    'status is 200': (r) => r.status === 200,
    'response time OK': (r) => r.timings.duration < 3000,
  };

  if (parsed.type === 'json') {
    checks['has version info'] = (r) => parsed.version !== undefined;
    checks['has color info'] = (r) => parsed.color !== undefined;
    checks['has message'] = (r) => parsed.data.message !== undefined;

    if (serviceName === 'active') {
      checks['active service response structure'] = (r) =>
        parsed.data.message !== undefined && parsed.color !== undefined;
    } else if (serviceName === 'preview') {
      checks['preview service response structure'] = (r) =>
        parsed.data.message !== undefined && parsed.color !== undefined;
    }
  } else if (parsed.type === 'html') {
    checks['has HTML content'] = (r) => r.body.length > 0;
    checks['has color in HTML'] = (r) => parsed.color !== null;
    checks['has version in HTML'] = (r) => parsed.version !== null;

    if (serviceName === 'active') {
      checks['active service HTML structure'] = (r) =>
        r.body.includes('Cotizaciones') && parsed.color !== null;
    } else if (serviceName === 'preview') {
      checks['preview service HTML structure'] = (r) =>
        r.body.includes('Cotizaciones') && parsed.color !== null;
    }
  }

  const result = check(res, checks);

  if (serviceName === 'active') {
    activeResponseTime.add(res.timings.duration);
  } else {
    previewResponseTime.add(res.timings.duration);
  }

  if (result) {
    successCount.add(1);
    errorRate.add(0);
  } else {
    errorRate.add(1);
    if (res.status !== 200) {
      console.error(`Error in ${serviceName}: Status ${res.status}`);
    }
  }

  return { result, parsed };
}

export default function () {
  group('Active Service Tests', () => {
    const activeRes = http.get('http://blue-green-active');
    const { result: activeResult, parsed: activeParsed } = checkServiceResponse(activeRes, 'active');

    if (activeResult) {
      check(activeRes, {
        'active service consistent color': (r) => {
          const color = activeParsed.color;
          return color === 'blue' || color === 'green';
        }
      });
    }

    sleep(0.5);
  });

  group('Preview Service Tests', () => {
    const previewRes = http.get('http://blue-green-preview');
    const { result: previewResult, parsed: previewParsed } = checkServiceResponse(previewRes, 'preview');

    if (previewResult && previewRes.status === 200) {
      check(previewRes, {
        'preview service has valid response': (r) =>
          previewParsed.color !== undefined && previewParsed.color !== null
      });
    }

    sleep(0.5);
  });

  group('Comparison Tests', () => {
    const [activeRes, previewRes] = http.batch([
      ['GET', 'http://blue-green-active'],
      ['GET', 'http://blue-green-preview']
    ]);

    const activeParsed = parseResponse(activeRes);
    const previewParsed = parseResponse(previewRes);

    if (activeRes.status === 200 && previewRes.status === 200) {
      const activeColor = activeParsed.color;
      const previewColor = previewParsed.color;

      check(null, {
        'services have different versions during deployment': () =>
          activeColor !== previewColor,
        'both services healthy': () => true
      });

      console.log(`🔵 Active Color: ${activeColor}, 🟢 Preview Color: ${previewColor}`);
    }

    sleep(1);
  });
}

export function handleSummary(data) {
  const activeAvg = data.metrics.active_service_response_time ? data.metrics.active_service_response_time.values.avg : 0;
  const previewAvg = data.metrics.preview_service_response_time ? data.metrics.preview_service_response_time.values.avg : 0;
  const errorPercentage = data.metrics.errors ? data.metrics.errors.values.rate * 100 : 0;
  const successes = data.metrics.successes ? data.metrics.successes.values.count : 0;

  console.log(`\n📊 BLUE-GREEN TEST SUMMARY:`);
  console.log(`✅ Successes: ${successes}`);
  console.log(`❌ Error Rate: ${errorPercentage.toFixed(2)}%`);
  console.log(`⏱️  Active Service Avg: ${activeAvg.toFixed(2)}ms`);
  console.log(`⏱️  Preview Service Avg: ${previewAvg.toFixed(2)}ms`);

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
  };
}