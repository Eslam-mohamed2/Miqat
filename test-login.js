const https = require('https');

const data = JSON.stringify({
  email: "eslamtest123@example.com",
  password: "SecurePass123!"
});

const options = {
  hostname: 'miqatapi-production-ed29.up.railway.app',
  port: 443,
  path: '/api/Auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, res => {
  console.log(`STATUS: ${res.statusCode}`);
  let body = '';
  res.on('data', d => {
    body += d;
  });
  res.on('end', () => {
    console.log('BODY:', body);
  });
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();
