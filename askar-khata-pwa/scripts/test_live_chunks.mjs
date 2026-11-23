async function main() {
  const res = await fetch("https://askar-khata-pwa.vercel.app/assets/index-DCExTELn.js");
  const code = await res.text();
  console.log("Status:", res.status);
  console.log("Includes lazyWithRetry:", code.includes("khata_chunk_retry"));
  console.log("Includes auto_healed:", code.includes("khata_auto_healed"));
  console.log("Includes 'A cache refresh is required':", code.includes("A cache refresh is required"));
  console.log("Includes 'Updating Application...':", code.includes("Updating Application..."));

  // Find all js imports in index-DCExTELn.js
  const re = /[a-zA-Z0-9_\-]+\.js/g;
  const matches = [...new Set(code.match(re))];
  console.log("JS matches in index:", matches);

  // Check which chunk CustomerTab is
  for (const chunk of matches) {
    if (chunk.includes("CustomerTab") || chunk.includes("Customer")) {
      const cRes = await fetch("https://askar-khata-pwa.vercel.app/assets/" + chunk);
      console.log("Chunk", chunk, "status:", cRes.status);
    }
  }
}
main();
