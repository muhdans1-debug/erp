const urls = [
  'https://askar-khata-pwa.vercel.app/',
  'https://askar-khata-pwa.vercel.app/index.html',
  'https://askar-khata-pwa.vercel.app/manifest.json',
  'https://askar-khata-pwa.vercel.app/favicon.svg',
  'https://askar-khata-pwa.vercel.app/pwa-192x192.png',
  'https://askar-khata-pwa.vercel.app/pwa-512x512.png',
  'https://askar-khata-pwa.vercel.app/assets/index-DCExTELn.js',
  'https://askar-khata-pwa.vercel.app/assets/BenefitPayModal-Bfxcmpjw.js',
  'https://askar-khata-pwa.vercel.app/assets/CustomerTab-Bh4d6hR_.js',
  'https://askar-khata-pwa.vercel.app/assets/CustomerTabPreview-BozJHJtC.js',
  'https://askar-khata-pwa.vercel.app/assets/DevPortal-CaT3VclL.js',
  'https://askar-khata-pwa.vercel.app/assets/HamburgerDrawer-BnCpe6Yn.js',
  'https://askar-khata-pwa.vercel.app/assets/HomeLookup-DaSkmVAL.js',
  'https://askar-khata-pwa.vercel.app/assets/KhataStatement-DVCB6ZCK.js',
  'https://askar-khata-pwa.vercel.app/assets/ReceiptModal-C5IgB9o0.js',
  'https://askar-khata-pwa.vercel.app/assets/TransactionItemCard-aXmqEFVl.js',
  'https://askar-khata-pwa.vercel.app/assets/icons-B1mGrFB5.js',
  'https://askar-khata-pwa.vercel.app/assets/phoneLockAuth-BtCQ8baj.js',
  'https://askar-khata-pwa.vercel.app/assets/rolldown-runtime-WkwZ5CU-.js',
  'https://askar-khata-pwa.vercel.app/assets/vendor-D2P1Glj1.js',
  'https://askar-khata-pwa.vercel.app/assets/index-C-UT28iS.css'
];

async function check() {
  for (const u of urls) {
    try {
      const res = await fetch(u);
      console.log(res.status, u);
    } catch (e) {
      console.error('FAIL', u, e.message);
    }
  }
}
check();
