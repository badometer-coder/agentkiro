import Groq from 'groq-sdk';
import https from 'https';

console.log('Testing Groq connection...\n');

// Test 1: Basic HTTPS connection
console.log('1. Testing HTTPS to api.groq.com...');
https.get('https://api.groq.com/', (res) => {
  console.log(`   ✅ Connection successful (Status: ${res.statusCode})`);
  res.on('data', () => {});
  res.on('end', () => testGroqSDK());
}).on('error', (err) => {
  console.log(`   ❌ Connection failed: ${err.message}`);
  testGroqSDK();
});

// Test 2: Groq SDK
function testGroqSDK() {
  console.log('\n2. Testing Groq SDK...');
  
  const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
    timeout: 5 * 60 * 1000,
  });

  groq.chat.completions.create({
    model: 'openai/gpt-oss-20b',
    messages: [{ role: 'user', content: 'hello' }],
    max_tokens: 10,
  })
    .then((res) => {
      console.log(`   ✅ SDK call successful!`);
      console.log(`   Response: ${res.choices[0]?.message?.content}`);
    })
    .catch((err) => {
      console.log(`   ❌ SDK call failed: ${err.message}`);
      console.log(`   Full error:`, err);
    });
}
