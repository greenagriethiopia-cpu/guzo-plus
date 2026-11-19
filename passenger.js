const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("\n👤 --- የተሳፋሪ ምናሌ (Passenger Menu) ---");
rl.question('የመነሻ ቦታዎን ያስገቡ: ', (pickup) => {
    rl.question('የመድረሻ ቦታዎን ያስገቡ: ', (destination) => {
        console.log(`\n🚗 ፍለጋ ተጀምሯል! ከ ${pickup} ወደ ${destination} ጉዞ ተጠይቋል።`);
        rl.close();
    });
});
