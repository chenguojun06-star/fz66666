const http = require('http');

const loginOptions = {
  hostname: 'localhost',
  port: 8088,
  path: '/api/system/user/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};

const loginReq = http.request(loginOptions, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const response = JSON.parse(data);
    if (!response.data || !response.data.token) {
      console.error('Login failed:', data);
      return;
    }
    const token = response.data.token;

    const scanOptions = {
      hostname: 'localhost',
      port: 8088,
      path: '/api/production/scan/list?orderId=82b3b87b564aa9e89df80ec0d03b1f6f&page=1&pageSize=10',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      }
    };

    const scanReq = http.request(scanOptions, (scanRes) => {
      let scanData = '';
      scanRes.on('data', (chunk) => scanData += chunk);
      scanRes.on('end', () => {
        console.log('Status:', scanRes.statusCode);
        console.log('Body:', scanData);
      });
    });

    scanReq.end();
  });
});

loginReq.write(JSON.stringify({
  username: 'lilb',
  password: 'admin123'
}));
loginReq.end();
