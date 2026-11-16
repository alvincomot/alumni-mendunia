
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3000';
const PROFILE = __ENV.PROFILE || 'smoke';

// Pengaman: jangan izinkan tes ini menargetkan Vercel produksi.
if (!/^http:\/\/(localhost|127\.0\.0\.1):3000$/.test(BASE_URL)) {
  throw new Error('Spike test hanya boleh dijalankan pada localhost:3000');
}

if (!['smoke', 'spike'].includes(PROFILE)) {
  throw new Error('PROFILE harus smoke atau spike');
}

const smokeStages = [
  { duration: '10s', target: 2 },
  { duration: '10s', target: 2 },
  { duration: '5s', target: 0 },
];

const spikeStages = [
  { duration: '10s', target: 2 },
  { duration: '1s', target: 15 },  // Lonjakan mendadak
  { duration: '15s', target: 15 }, // Pertahankan lonjakan
  { duration: '10s', target: 2 },  // Pemulihan
  { duration: '10s', target: 0 },
];

export const options = {
  discardResponseBodies: true,

  scenarios: {
    login_page: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: PROFILE === 'spike' ? spikeStages : smokeStages,
      gracefulRampDown: '5s',
    },
  },

  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
    checks: ['rate>0.99'],
  },
};

export default function spikeLogin() {
  const response = http.get(`${BASE_URL}/auth/login`, {
    timeout: '10s',
    tags: { endpoint: 'login_page' },
  });

  check(response, {
    'HTTP 200': (r) => r.status === 200,
  });

  // Simulasikan jeda sebelum pengguna melakukan permintaan berikutnya.
  sleep(1 + Math.random() * 2);
}
