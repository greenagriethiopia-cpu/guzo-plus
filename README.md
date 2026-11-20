const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.send('🚗 ጉዞ ፕላስ (Guzo Plus) ሰርቨር በመስመር ላይ ነው!');
});

app.listen(PORT, () => {
  console.log(`📱 የጉዞ ፕላስ ሰርቨር በ port ${PORT} ላይ ተከፍቷል!`);
});
require('./bot');
