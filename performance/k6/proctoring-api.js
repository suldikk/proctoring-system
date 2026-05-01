import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<750'],
  },
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 5),
      duration: __ENV.DURATION || '30s',
    },
  },
};

const baseUrl = __ENV.BASE_URL || 'http://localhost:8080';

export default function () {
  const health = http.get(`${baseUrl}/actuator/health`);
  check(health, {
    'health is available': (response) => response.status === 200,
  });

  const login = http.post(
    `${baseUrl}/api/auth/login`,
    JSON.stringify({
      email: __ENV.PROCTOR_EMAIL || 'proctor@example.com',
      password: __ENV.PROCTOR_PASSWORD || 'password123',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
  check(login, {
    'login succeeds': (response) => response.status === 200,
  });

  if (login.status === 200) {
    const token = login.json('token');
    const sessions = http.get(`${baseUrl}/api/sessions`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    check(sessions, {
      'sessions are readable': (response) => response.status === 200,
    });
  }

  sleep(1);
}
