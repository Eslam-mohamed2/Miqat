const https = require('https');

const data = JSON.stringify({
  fullName: "Eslam Mohamed",
  email: "eslamtest123@example.com",
  password: "SecurePass123!",
  phoneNumber: "1234567890",
  country: "Egypt",
  timeZone: "UTC+2"
});

const options = {
  hostname: 'miqatapi-production-ed29.up.railway.app',
  port: 443,
  path: '/api/Auth/register',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, res => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', d => {
    process.stdout.write(d);
  });
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();
