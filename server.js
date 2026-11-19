const express = require('express');
const app = express();
app.use(express.static('public'));

app.listen(3000, () => {
    console.log('📱 የጉዞ ፕላስ ሞባይል ገጽ በ http://localhost:3000 ላይ ተከፍቷል!');
});
