const express = require('express');
const { startBot } = require('./bot');

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.status(200).send('Guzo Plus server is running!');
});

app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, service: 'guzo-plus' });
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`📱 የጉዞ ፕላስ ሰርቨር በ port ${PORT} ላይ ተከፍቷል!`);
  await startBot();
});

