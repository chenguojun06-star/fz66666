const axios = require('axios');
async function main() {
  try {
    const loginRes = await axios.post('http://127.0.0.1:8088/api/system/user/login', {
      username: 'factory_meimei',
      password: '123'
    });
    console.log("Login:", loginRes.data);
    const token = loginRes.data.data.token;
    
    const meRes = await axios.get('http://127.0.0.1:8088/api/system/user/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("Me:", meRes.data);
  } catch (e) {
    console.error(e.response?.data || e.message);
  }
}
main();
