const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("\n🚗 --- የሾፌር ምናሌ (Driver Menu) ---");
rl.question('የመኪናዎን ታርጋ (Plate Number) ያስገቡ: ', (plate) => {
    console.log(`\n✅ ሾፌር ተመዝግቧል! ታርጋ ቁጥር: ${plate}። አሁን የጉዞ ጥያቄዎችን እየጠበቀ ነው...`);
    rl.close();
});
