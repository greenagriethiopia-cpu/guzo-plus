const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("==================================");
console.log("🚗 እንኳን ወደ ጉዞ ፕላስ (Guzo Plus) በደህና መጡ!");
console.log("==================================");

function startApp() {
    rl.question('\nሚናዎን ይምረጡ (1: ተሳፋሪ, 2: ሾፌር, 3: ውጣ): ', (answer) => {
        if (answer.trim() === '1') {
            rl.close();
            require('./passenger.js');
        } else if (answer.trim() === '2') {
            rl.close();
            require('./driver.js');
        } else if (answer.trim() === '3') {
            console.log("\n🙏 ሰላም ይሁኑ!");
            rl.close();
        } else {
            console.log("❌ ትክክለኛ ያልሆነ ምርጫ! እባክዎ 1፣ 2 ወይም 3 ይምረጡ።");
            startApp();
        }
    });
}

startApp();
