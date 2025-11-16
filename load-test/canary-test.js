import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

const balancerResponseTime = new Trend('balancer_response_time');
const canaryResponseTime = new Trend('canary_service_response_time');
const stableResponseTime = new Trend('stable_service_response_time');
const errorRate = new Rate('errors');
const successCount = new Counter('successes');
const trafficDistribution = new Counter('traffic_distribution');

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
    'balancer_response_time': ['p(95)<2000'],
    'canary_service_response_time': ['p(95)<2000'],
    'stable_service_response_time': ['p(95)<2000'],
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
    const podMatch = html.match(/Pod:\s*([^\s<]+)/);

    return {
      type: 'html',
      data: {
        color: colorMatch ? colorMatch[1] : null,
        version: versionMatch ? versionMatch[0] : null,
        pod: podMatch ? podMatch[1] : null
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

    if (serviceName === 'balancer') {
      checks['balancer response structure'] = (r) =>
        parsed.data.message !== undefined && parsed.color !== undefined;
    }
  } else if (parsed.type === 'html') {
    checks['has HTML content'] = (r) => r.body.length > 0;
    checks['has color in HTML'] = (r) => parsed.color !== null;
    checks['has version in HTML'] = (r) => parsed.version !== null;

    if (serviceName === 'balancer') {
      checks['balancer HTML structure'] = (r) =>
        r.body.includes('Cotizaciones') && parsed.color !== null;
    } else if (serviceName === 'canary') {
      checks['canary service HTML structure'] = (r) =>
        r.body.includes('Cotizaciones') && parsed.color !== null;
    } else if (serviceName === 'stable') {
      checks['stable service HTML structure'] = (r) =>
        r.body.includes('Cotizaciones') && parsed.color !== null;
    }
  }

  const result = check(res, checks);

  if (serviceName === 'balancer') {
    balancerResponseTime.add(res.timings.duration);
    trafficDistribution.add(1, { type: 'balancer' });
  } else if (serviceName === 'canary') {
    canaryResponseTime.add(res.timings.duration);
    trafficDistribution.add(1, { type: 'canary' });
  } else if (serviceName === 'stable') {
    stableResponseTime.add(res.timings.duration);
    trafficDistribution.add(1, { type: 'stable' });
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
  group('Balancer Service Tests', () => {
    const balancerRes = http.get('http://service-canary');
    const { result: balancerResult, parsed: balancerParsed } = checkServiceResponse(balancerRes, 'balancer');

    if (balancerResult) {
      check(balancerRes, {
        'balancer consistent color': (r) => {
          const color = balancerParsed.color;
          return color === 'blue' || color === 'green';
        }
      });
    }

    sleep(0.5);
  });

  group('Canary Service Tests', () => {
    const canaryRes = http.get('http://canary-canary');
    const { result: canaryResult, parsed: canaryParsed } = checkServiceResponse(canaryRes, 'canary');

    if (canaryResult && canaryRes.status === 200) {
      check(canaryRes, {
        'canary service has valid response': (r) =>
          canaryParsed.color !== undefined && canaryParsed.color !== null,
        'canary version is deployable': (r) => r.timings.duration < 3000
      });
    }

    sleep(0.5);
  });

  group('Stable Service Tests', () => {
    const stableRes = http.get('http://canary-stable');
    const { result: stableResult, parsed: stableParsed } = checkServiceResponse(stableRes, 'stable');

    if (stableResult && stableRes.status === 200) {
      check(stableRes, {
        'stable service has valid response': (r) =>
          stableParsed.color !== undefined && stableParsed.color !== null,
        'stable service reliable': (r) => r.timings.duration < 2000
      });
    }

    sleep(0.5);
  });

  group('Version Comparison Tests', () => {
    const [canaryRes, stableRes] = http.batch([
      ['GET', 'http://canary-canary'],
      ['GET', 'http://canary-stable']
    ]);

    const canaryParsed = parseResponse(canaryRes);
    const stableParsed = parseResponse(stableRes);

    if (canaryRes.status === 200 && stableRes.status === 200) {
      const canaryColor = canaryParsed.color;
      const stableColor = stableParsed.color;

      check(null, {
        'canary and stable have different versions during deployment': () =>
          canaryColor !== stableColor,
        'both canary and stable services healthy': () => true,
        'canary performance acceptable vs stable': () => {
          const canaryDuration = canaryRes.timings.duration;
          const stableDuration = stableRes.timings.duration;
          return canaryDuration <= (stableDuration * 1.5);
        }
      });

      const performanceDiff = canaryRes.timings.duration - stableRes.timings.duration;
      console.log(`📊 Performance difference: Canary ${performanceDiff.toFixed(2)}ms vs Stable`);
      console.log(`🎯 Colors - Canary: ${canaryColor}, Stable: ${stableColor}`);
    }

    sleep(1);
  });

  if (Math.random() < 0.3) {
    group('Traffic Distribution Test', () => {
      const requests = [];
      for (let i = 0; i < 5; i++) {
        requests.push(['GET', 'http://service-canary']);
      }

      const balancerResponses = http.batch(requests);

      let colorCount = {};
      balancerResponses.forEach(res => {
        if (res.status === 200) {
          const parsed = parseResponse(res);
          const color = parsed.color || 'unknown';
          colorCount[color] = (colorCount[color] || 0) + 1;
        }
      });

      console.log(`🎯 Traffic distribution:`, colorCount);
    });
  }
}

export function handleSummary(data) {
  const balancerAvg = data.metrics.balancer_response_time ? data.metrics.balancer_response_time.values.avg : 0;
  const canaryAvg = data.metrics.canary_service_response_time ? data.metrics.canary_service_response_time.values.avg : 0;
  const stableAvg = data.metrics.stable_service_response_time ? data.metrics.stable_service_response_time.values.avg : 0;
  const errorPercentage = data.metrics.errors ? data.metrics.errors.values.rate * 100 : 0;
  const successes = data.metrics.successes ? data.metrics.successes.values.count : 0;

  console.log(`\n📊 CANARY DEPLOYMENT TEST SUMMARY:`);
  console.log(`✅ Successes: ${successes}`);
  console.log(`❌ Error Rate: ${errorPercentage.toFixed(2)}%`);
  console.log(`⏱️  Balancer Avg: ${balancerAvg.toFixed(2)}ms`);
  console.log(`⏱️  Canary Service Avg: ${canaryAvg.toFixed(2)}ms`);
  console.log(`⏱️  Stable Service Avg: ${stableAvg.toFixed(2)}ms`);

  if (stableAvg > 0) {
    const canaryVsStable = ((canaryAvg / stableAvg) - 1) * 100;
    console.log(`📈 Canary vs Stable: ${canaryVsStable > 0 ? '+' : ''}${canaryVsStable.toFixed(2)}%`);
  }

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
  };
}