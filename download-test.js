const http = require('http');
const req = http.request('http://localhost:8088/api/intelligence/professional-report/download?type=daily&token=admin', (res) => {
  console.log('STATUS: ' + res.statusCode);
  console.log('HEADERS: ' + JSON.stringify(res.headers));
  let size = 0;
  let body = '';
  res.on('data', (chunk) => { size += chunk.length; body += chunk.toString('utf8'); });
  res.on('end', () => { 
    console.log('SIZE: ' + size); 
    if (size < 500) console.log('BODY: ' + body);
  });
});
req.end();
